import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Logger,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SupabaseService } from './supabase/supabase.service';
import { WhatsappService } from './whatsapp.service';
import { ApprovalService } from './approval.service';

/**
 * WhatsappWebhookController
 * -------------------------
 * Inbound endpoint for 360dialog. Routes each message by sender:
 *   - OWNER  -> YES/NO drives ApprovalService (approve/reject + advance the ref)
 *   - STAFF  -> "done"/"collected" marks their latest task / order complete
 *   - OTHER  -> treated as a customer message: logged and queued for Phase 2
 *              (Claude order-parsing). No auto-reply that could create a
 *              binding commitment — that stays behind an owner approval.
 *
 * SECURITY: every inbound is untrusted content. We authenticate the webhook
 * itself (shared secret) and NEVER execute instructions found inside a message
 * body — a customer text is data, not a command.
 */
@Controller('webhooks/whatsapp')
export class WhatsappWebhookController {
  private readonly logger = new Logger(WhatsappWebhookController.name);

  constructor(
    private readonly config: ConfigService,
    private readonly supabase: SupabaseService,
    private readonly whatsapp: WhatsappService,
    private readonly approvals: ApprovalService,
  ) {}

  /**
   * Optional verification handshake (some setups use a GET challenge).
   * Returns the challenge only when the verify token matches.
   */
  @Get()
  verify(
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ): string {
    const expected = this.config.get<string>('WHATSAPP_WEBHOOK_SECRET', '');
    if (expected && token === expected) return challenge ?? 'ok';
    throw new UnauthorizedException('bad verify token');
  }

  @Post()
  @HttpCode(200) // always 200 quickly so 360dialog does not retry-storm us
  async receive(
    @Body() payload: any,
    @Headers('d360-api-key') apiKey?: string,
    @Query('secret') querySecret?: string,
  ): Promise<{ status: string }> {
    // 1. Authenticate the webhook (header secret, or ?secret= fallback).
    const expected = this.config.get<string>('WHATSAPP_WEBHOOK_SECRET', '');
    if (expected) {
      const presented = apiKey || querySecret;
      if (presented !== expected) {
        this.logger.warn('Rejected inbound webhook: bad secret');
        throw new UnauthorizedException('bad webhook secret');
      }
    }

    // 2. Parse messages defensively — never assume the shape.
    const messages = this.extractMessages(payload);
    if (!messages.length) {
      // Status callbacks (delivered/read) also arrive here; ack and move on.
      return { status: 'ignored' };
    }

    for (const m of messages) {
      try {
        await this.handleOne(m.from, m.text, m.id);
      } catch (err) {
        this.logger.error(`Failed handling inbound from ${m.from}: ${this.msg(err)}`);
      }
    }
    return { status: 'ok' };
  }

  // -------------------------------------------------------------------------

  private async handleOne(from: string, text: string, waId?: string): Promise<void> {
    const number = this.supabase.normalizeNumber(from);
    await this.whatsapp.logInbound(number, text ?? '', waId);
    this.logger.log(`Inbound from ${number}: ${this.preview(text)}`);

    const owner = this.supabase.normalizeNumber(this.config.get('OWNER_WHATSAPP', ''));

    // A) Owner approval reply
    if (number === owner) {
      const result = await this.approvals.handleOwnerReply(number, text);
      if (result.handled && result.refTable === 'orders' && result.refId) {
        await this.advanceOrderAfterApproval(result.refId, result.decision!);
      }
      return;
    }

    // B) Staff completion reply
    const staff = await this.supabase.getStaffByWhatsapp(number);
    if (staff) {
      await this.handleStaffReply(staff, text);
      return;
    }

    // C) Customer message -> log + queue for Phase 2 parsing. No binding reply.
    await this.queueCustomerMessage(number, text, waId);
  }

  /** When the owner approves an order, move it forward; if rejected, cancel. */
  private async advanceOrderAfterApproval(
    orderId: string,
    decision: 'approved' | 'rejected',
  ): Promise<void> {
    if (decision === 'approved') {
      // Back to 'pending' so the loop's autoInvoice picks it up (approval now
      // recorded), or straight to 'approved' — we use 'approved' then invoice.
      await this.supabase.update(
        'orders',
        { id: orderId },
        { status: 'invoiced', needs_approval: false, invoiced_at: new Date().toISOString() },
      );
      this.logger.log(`Order ${orderId} approved -> invoiced (delivery assignment next loop)`);
    } else {
      await this.supabase.update(
        'orders',
        { id: orderId },
        { status: 'rejected', needs_approval: false },
      );
      this.logger.log(`Order ${orderId} rejected by owner`);
    }
  }

  private async handleStaffReply(staff: any, text: string): Promise<void> {
    const t = (text ?? '').trim().toLowerCase();

    // "collected" closes the cash loop on their most recent delivered order.
    if (/\bcollected\b|\bcash (done|received)\b/.test(t)) {
      const { data: order } = await this.supabase
        .from('orders')
        .select('id')
        .eq('assigned_delivery', staff.id)
        .eq('status', 'delivered')
        .is('collected_at', null)
        .order('delivered_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (order) {
        await this.supabase.update(
          'orders',
          { id: order.id },
          { status: 'collected', collected_at: new Date().toISOString() },
        );
        this.logger.log(`${staff.name} collected order ${order.id}`);
        await this.whatsapp.sendText(staff.whatsapp, `👍 Marked collected. Thank you ${staff.name}.`);
      }
      return;
    }

    // "done" marks the newest assigned order delivered OR the newest open task complete.
    if (/\bdone\b|\bdelivered\b|\bfinished\b/.test(t)) {
      const { data: order } = await this.supabase
        .from('orders')
        .select('id')
        .eq('assigned_delivery', staff.id)
        .eq('status', 'assigned')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (order) {
        await this.supabase.update(
          'orders',
          { id: order.id },
          { status: 'delivered', delivered_at: new Date().toISOString() },
        );
        await this.whatsapp.sendText(staff.whatsapp, `✅ Delivery logged. Reply *collected* once cash is in.`);
        this.logger.log(`${staff.name} delivered order ${order.id}`);
        return;
      }
      // Otherwise close their latest sent task instance.
      const { data: task } = await this.supabase
        .from('task_instances')
        .select('id')
        .eq('assigned_staff', staff.id)
        .eq('status', 'sent')
        .order('sent_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (task) {
        await this.supabase.update(
          'task_instances',
          { id: task.id },
          { status: 'done', completed_at: new Date().toISOString() },
        );
        await this.whatsapp.sendText(staff.whatsapp, `✅ Task marked done. Thanks ${staff.name}.`);
        this.logger.log(`${staff.name} completed task ${task.id}`);
      }
      return;
    }

    // Anything else from staff: just acknowledge; a human/owner can follow up.
    this.logger.log(`Unrecognised staff reply from ${staff.name}: ${this.preview(text)}`);
  }

  /** Store a customer message for later Claude parsing (Phase 2). No side effects. */
  private async queueCustomerMessage(number: string, text: string, waId?: string): Promise<void> {
    try {
      await this.supabase.from('notification_log').insert({
        direction: 'inbound',
        channel: 'whatsapp',
        from_number: number,
        body: text,
        wa_message_id: waId ?? null,
        status: 'received',
        related_type: 'customer',
      });
      this.logger.log(`Queued customer message from ${number} for Phase 2 parsing`);
    } catch (err) {
      this.logger.warn(`Could not queue customer message: ${this.msg(err)}`);
    }
  }

  /** Pull message tuples out of the 360dialog / WhatsApp Cloud payload shape. */
  private extractMessages(payload: any): Array<{ from: string; text: string; id?: string }> {
    const out: Array<{ from: string; text: string; id?: string }> = [];
    try {
      const entries = payload?.entry ?? [];
      for (const entry of entries) {
        for (const change of entry?.changes ?? []) {
          for (const msg of change?.value?.messages ?? []) {
            const text =
              msg?.text?.body ??
              msg?.button?.text ??
              msg?.interactive?.button_reply?.title ??
              msg?.interactive?.list_reply?.title ??
              '';
            out.push({ from: msg?.from, text, id: msg?.id });
          }
        }
      }
      // Some 360dialog setups post a flatter shape:
      if (!out.length && Array.isArray(payload?.messages)) {
        for (const msg of payload.messages) {
          out.push({ from: msg?.from, text: msg?.text?.body ?? '', id: msg?.id });
        }
      }
    } catch (err) {
      this.logger.warn(`Could not parse inbound payload: ${this.msg(err)}`);
    }
    return out.filter((m) => m.from);
  }

  private preview(s?: string): string {
    const t = s ?? '';
    return t.length > 60 ? `${t.slice(0, 57)}...` : t;
  }

  private msg(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }
}
