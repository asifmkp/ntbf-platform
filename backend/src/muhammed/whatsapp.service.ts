import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StaffStore } from '../staff-auth/staff-auth.module';
import { MuhammedService } from './muhammed.service';

/**
 * WhatsApp (360dialog) front door for Muhammed.
 *
 * Because Muhammed shares the customer bot's number, this backend is the single
 * inbound webhook: staff senders are answered by Muhammed; every other sender is
 * forwarded UNCHANGED to the existing customer bot (WA_CUSTOMER_BOT_URL), so its
 * ingest contract is preserved. Inert until the WA_* env vars are set.
 *
 * Env:
 *   WA_360_API_URL       send endpoint (default https://waba-v2.360dialog.io/messages; on-prem uses /v1/messages)
 *   WA_360_API_KEY       D360-API-KEY for sending replies
 *   WA_VERIFY_TOKEN      token echoed during webhook verification (GET)
 *   WA_WEBHOOK_SECRET    optional shared secret required as ?token= on the webhook
 *   WA_CUSTOMER_BOT_URL  where to forward non-staff inbound messages (empty = don't forward)
 */
@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  /** De-dupe: WhatsApp re-delivers on slow 200s; never answer the same message id twice. */
  private readonly seen = new Set<string>();

  constructor(
    private readonly config: ConfigService,
    private readonly staff: StaffStore,
    private readonly muhammed: MuhammedService,
  ) {}

  get configured(): boolean {
    return Boolean(this.config.get('WA_360_API_KEY'));
  }

  /** GET webhook verification (Meta/360dialog style): echo hub.challenge if the token matches. */
  verify(query: Record<string, any>): string | null {
    const token = this.config.get<string>('WA_VERIFY_TOKEN');
    if (query['hub.mode'] === 'subscribe' && token && query['hub.verify_token'] === token) {
      return String(query['hub.challenge'] ?? '');
    }
    return null;
  }

  /** Optional shared-secret gate on the inbound webhook. */
  secretOk(token?: string): boolean {
    const secret = this.config.get<string>('WA_WEBHOOK_SECRET');
    return !secret || token === secret;
  }

  /**
   * Process an inbound webhook payload. Returns immediately-safe (never throws);
   * the controller acknowledges 200 first and calls this without awaiting.
   */
  async process(body: any): Promise<void> {
    try {
      const messages = this.extractMessages(body);
      for (const m of messages) {
        if (m.id && this.seen.has(m.id)) continue;
        if (m.id) { this.seen.add(m.id); if (this.seen.size > 5000) this.seen.clear(); }

        const staff = this.staff.byPhone(m.from);
        if (staff) {
          await this.handleStaff(staff, m);
        } else {
          await this.forwardToCustomerBot(body);
          // one forward per payload is enough (the whole payload is passed on)
          return;
        }
      }
    } catch (e) {
      this.logger.error(`WhatsApp process failed: ${(e as Error).message}`);
    }
  }

  /** Pull text messages out of the standard WhatsApp Cloud webhook shape. Ignores status callbacks. */
  private extractMessages(body: any): Array<{ from: string; id: string; type: string; text: string }> {
    const out: Array<{ from: string; id: string; type: string; text: string }> = [];
    const entries = Array.isArray(body?.entry) ? body.entry : [];
    for (const entry of entries) {
      const changes = Array.isArray(entry?.changes) ? entry.changes : [];
      for (const ch of changes) {
        const msgs = Array.isArray(ch?.value?.messages) ? ch.value.messages : [];
        for (const msg of msgs) {
          out.push({ from: String(msg.from || ''), id: String(msg.id || ''), type: String(msg.type || ''), text: msg?.text?.body || '' });
        }
      }
    }
    return out;
  }

  private async handleStaff(staff: any, m: { from: string; text: string; type: string }) {
    if (m.type !== 'text' || !m.text.trim()) {
      await this.send(m.from, `Hello ${staff.name}! I can read text messages for now — please type your question.`);
      return;
    }
    const res = await this.muhammed.handle({ id: staff.id, name: staff.name, roles: staff.roles || [] }, m.text);
    await this.send(m.from, res.answer);
  }

  /** Send a text reply via 360dialog. Cloud API needs messaging_product; on-prem (/v1/) does not. */
  private async send(to: string, body: string): Promise<void> {
    const url = this.config.get<string>('WA_360_API_URL') || 'https://waba-v2.360dialog.io/messages';
    const key = this.config.get<string>('WA_360_API_KEY');
    if (!key) { this.logger.warn('WA_360_API_KEY not set — reply not sent'); return; }
    const onPrem = url.includes('/v1/');
    const payload: Record<string, unknown> = onPrem
      ? { to, type: 'text', text: { body: body.slice(0, 4096) } }
      : { messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'text', text: { preview_url: false, body: body.slice(0, 4096) } };
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'D360-API-KEY': key, 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) this.logger.error(`360dialog send ${res.status}: ${(await res.text()).slice(0, 300)}`);
    } catch (e) {
      this.logger.error(`360dialog send failed: ${(e as Error).message}`);
    }
  }

  /** Forward a non-staff (customer) payload to the existing bot, unchanged. Best-effort. */
  private async forwardToCustomerBot(body: any): Promise<void> {
    const url = this.config.get<string>('WA_CUSTOMER_BOT_URL');
    if (!url) { this.logger.warn('Customer message received but WA_CUSTOMER_BOT_URL not set — not forwarded'); return; }
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) this.logger.error(`Customer-bot forward ${res.status}`);
    } catch (e) {
      this.logger.error(`Customer-bot forward failed: ${(e as Error).message}`);
    }
  }
}
