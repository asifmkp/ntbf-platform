import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { SupabaseService } from './supabase/supabase.service';

export interface SendResult {
  ok: boolean;
  messageId?: string;
  skipped?: 'duplicate' | 'quiet_hours' | 'disabled';
  error?: string;
}

interface SendOptions {
  /** Skip quiet-hours and dedupe checks for genuinely urgent messages (approvals, escalations). */
  urgent?: boolean;
  /** Stable key to avoid sending the same thing twice (e.g. `reminder:order:<id>:<day>`). */
  dedupeKey?: string;
  relatedType?: string;
  relatedId?: string;
}

/**
 * WhatsappService
 * ---------------
 * Thin send layer over the 360dialog WhatsApp Cloud API. Responsibilities:
 *  - send free-form text and template messages,
 *  - de-duplicate sends via notification_log.dedupe_key,
 *  - respect quiet hours for non-urgent messages,
 *  - honour the AGENT_ENABLED master switch (dry-run when off),
 *  - log every attempt (in and out) to notification_log for the audit trail.
 */
@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private http: AxiosInstance;

  constructor(
    private readonly config: ConfigService,
    private readonly supabase: SupabaseService,
  ) {
    this.http = axios.create({
      baseURL: this.config.get<string>('DIALOG360_BASE_URL', 'https://waba-v2.360dialog.io'),
      timeout: 15_000,
      headers: {
        'D360-API-KEY': this.config.get<string>('DIALOG360_API_KEY', ''),
        'Content-Type': 'application/json',
      },
    });
  }

  /** Send a plain text (free-form) WhatsApp message. */
  async sendText(to: string, body: string, opts: SendOptions = {}): Promise<SendResult> {
    const number = this.supabase.normalizeNumber(to);
    if (!number) return { ok: false, error: 'empty recipient number' };

    // 1. Master switch — dry run.
    const enabled = await this.supabase.getConfig<boolean>('agent_enabled', true);
    if (!enabled) {
      this.logger.warn(`[DRY-RUN] would send to ${number}: ${this.preview(body)}`);
      await this.log('outbound', number, body, { ...opts, status: 'queued', note: 'dry-run' });
      return { ok: true, skipped: 'disabled' };
    }

    // 2. Quiet hours (skip for urgent).
    if (!opts.urgent && (await this.inQuietHours())) {
      this.logger.log(`Quiet hours — deferring non-urgent message to ${number}`);
      return { ok: true, skipped: 'quiet_hours' };
    }

    // 3. Dedupe.
    if (opts.dedupeKey && (await this.alreadySent(opts.dedupeKey))) {
      this.logger.log(`Dedupe hit for key ${opts.dedupeKey} — not resending`);
      return { ok: true, skipped: 'duplicate' };
    }

    // 4. Send.
    try {
      const res = await this.http.post('/messages', {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: number,
        type: 'text',
        text: { body },
      });
      const messageId = res.data?.messages?.[0]?.id;
      await this.log('outbound', number, body, {
        ...opts,
        status: 'sent',
        waMessageId: messageId,
      });
      this.logger.log(`Sent to ${number} (id=${messageId ?? 'n/a'})`);
      return { ok: true, messageId };
    } catch (err) {
      const error = this.errMsg(err);
      this.logger.error(`Send to ${number} failed: ${error}`);
      await this.log('outbound', number, body, { ...opts, status: 'failed', error });
      return { ok: false, error };
    }
  }

  /**
   * Send an approved WhatsApp template (required for messages outside the 24h
   * customer-care window). `components` follows the 360dialog/Cloud API shape.
   */
  async sendTemplate(
    to: string,
    templateName: string,
    languageCode = 'en',
    components: unknown[] = [],
    opts: SendOptions = {},
  ): Promise<SendResult> {
    const number = this.supabase.normalizeNumber(to);
    const enabled = await this.supabase.getConfig<boolean>('agent_enabled', true);
    if (!enabled) {
      this.logger.warn(`[DRY-RUN] would send template '${templateName}' to ${number}`);
      return { ok: true, skipped: 'disabled' };
    }
    if (opts.dedupeKey && (await this.alreadySent(opts.dedupeKey))) {
      return { ok: true, skipped: 'duplicate' };
    }
    try {
      const res = await this.http.post('/messages', {
        messaging_product: 'whatsapp',
        to: number,
        type: 'template',
        template: {
          name: templateName,
          language: { code: languageCode },
          components,
        },
      });
      const messageId = res.data?.messages?.[0]?.id;
      await this.log('outbound', number, `[template:${templateName}]`, {
        ...opts,
        status: 'sent',
        waMessageId: messageId,
        template: templateName,
      });
      return { ok: true, messageId };
    } catch (err) {
      const error = this.errMsg(err);
      this.logger.error(`Template '${templateName}' to ${number} failed: ${error}`);
      await this.log('outbound', number, `[template:${templateName}]`, {
        ...opts,
        status: 'failed',
        error,
        template: templateName,
      });
      return { ok: false, error };
    }
  }

  /** Record an inbound message to the audit log. */
  async logInbound(from: string, body: string, waMessageId?: string): Promise<void> {
    await this.log('inbound', this.supabase.normalizeNumber(from), body, {
      status: 'received',
      waMessageId,
    });
  }

  // -------------------------------------------------------------------------
  // internals
  // -------------------------------------------------------------------------

  private async inQuietHours(): Promise<boolean> {
    const start = Number(await this.supabase.getConfig('quiet_hours_start', 22));
    const end = Number(await this.supabase.getConfig('quiet_hours_end', 6));
    const tz = this.config.get<string>('AGENT_TIMEZONE', 'Asia/Dubai');
    const hour = Number(
      new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: tz }).format(
        new Date(),
      ),
    );
    // Window may wrap midnight (e.g. 22 -> 6).
    return start <= end ? hour >= start && hour < end : hour >= start || hour < end;
  }

  private async alreadySent(dedupeKey: string): Promise<boolean> {
    const { data } = await this.supabase
      .from('notification_log')
      .select('id')
      .eq('dedupe_key', dedupeKey)
      .maybeSingle();
    return !!data;
  }

  private async log(
    direction: 'outbound' | 'inbound',
    number: string,
    body: string,
    extra: {
      status: string;
      waMessageId?: string;
      dedupeKey?: string;
      template?: string;
      relatedType?: string;
      relatedId?: string;
      error?: string;
      note?: string;
    },
  ): Promise<void> {
    try {
      await this.supabase.from('notification_log').insert({
        direction,
        channel: 'whatsapp',
        to_number: direction === 'outbound' ? number : null,
        from_number: direction === 'inbound' ? number : this.config.get('DIALOG360_FROM_NUMBER'),
        template: extra.template ?? null,
        body,
        wa_message_id: extra.waMessageId ?? null,
        status: extra.status,
        related_type: extra.relatedType ?? null,
        related_id: extra.relatedId ?? null,
        dedupe_key: extra.dedupeKey ?? null,
        error: extra.error ?? null,
      });
    } catch (err) {
      // A logging failure must never crash a send. Dedupe collisions land here too.
      this.logger.warn(`notification_log insert failed: ${this.errMsg(err)}`);
    }
  }

  private preview(s: string): string {
    return s.length > 80 ? `${s.slice(0, 77)}...` : s;
  }

  private errMsg(err: unknown): string {
    if (axios.isAxiosError(err)) {
      return `${err.response?.status ?? ''} ${JSON.stringify(err.response?.data ?? err.message)}`;
    }
    return err instanceof Error ? err.message : String(err);
  }
}
