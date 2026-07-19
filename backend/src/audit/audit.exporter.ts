import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { AuditEntry } from './audit.types';

// Off-box copy target: Supabase PostgREST endpoint for public.audit_log.
const TABLE_PATH = '/rest/v1/audit_log';
const REQUEST_TIMEOUT_MS = 8000; // per-POST AbortController timeout
const MAX_QUEUE = 5000; // cap the in-memory backlog so a long outage can't grow unbounded

/**
 * Stage 3 — gated, append-only external exporter.
 *
 * Ships each new AuditEntry to an external Supabase table so the hash-chained
 * log keeps an off-box, tamper-evident copy. It is:
 *   - GATED / fail-closed by default: OFF unless AUDIT_EXPORT_ENABLED === 'true'
 *     AND both the Supabase URL and key are configured.
 *   - FULLY FAIL-OPEN: export() and flush() never throw into the request path;
 *     every error is swallowed and recorded (lastError + a counter) for the
 *     status endpoint only.
 *   - IDEMPOTENT: the table's `hash` column is UNIQUE and we send
 *     `Prefer: resolution=ignore-duplicates`, so re-sending an entry is a no-op.
 *   - LIGHTWEIGHT RETRY: unconfirmed entries are held in a capped in-memory queue
 *     and retried on the next entry (or via flush()); the last confirmed seq is a
 *     high-water mark persisted with the same atomic temp-write+rename pattern as
 *     AuditStore.
 */
@Injectable()
export class AuditExporter {
  private readonly url: string;
  private readonly key: string;
  private readonly enabledFlag: boolean;

  // Sidecar high-water mark: the highest seq confirmed exported to Supabase.
  private readonly file = path.join(process.env.STATE_DIR || process.cwd(), 'data', 'audit-export.json');
  private exportedSeq = 0;

  // In-memory backlog of entries not yet confirmed exported (FIFO, capped).
  private queue: AuditEntry[] = [];
  private flushing = false;

  // Status counters (reporting only — never gate behaviour).
  private okCount = 0;
  private failCount = 0;
  private lastError: string | null = null;

  constructor(private readonly config: ConfigService) {
    this.url = (this.config.get<string>('AUDIT_SUPABASE_URL') || '').replace(/\/+$/, '');
    this.key = this.config.get<string>('AUDIT_SUPABASE_KEY') || '';
    this.enabledFlag = this.config.get<string>('AUDIT_EXPORT_ENABLED') === 'true';
    try {
      if (fs.existsSync(this.file)) {
        const parsed = JSON.parse(fs.readFileSync(this.file, 'utf8'));
        if (parsed && typeof parsed.exportedSeq === 'number') this.exportedSeq = parsed.exportedSeq;
      }
    } catch (e) { /* start at 0 */ }
  }

  /** All three settings present AND the flag is exactly the string 'true'. */
  get enabled(): boolean {
    return this.enabledFlag && !!this.url && !!this.key;
  }

  /** Snapshot for the status endpoint (never throws). */
  status(): { enabled: boolean; exportedSeq: number; queued: number; okCount: number; failCount: number; lastError: string | null } {
    return {
      enabled: this.enabled,
      exportedSeq: this.exportedSeq,
      queued: this.queue.length,
      okCount: this.okCount,
      failCount: this.failCount,
      lastError: this.lastError,
    };
  }

  private save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify({ exportedSeq: this.exportedSeq }));
      fs.renameSync(tmp, this.file);
    } catch (e) { /* memory-only fallback */ }
  }

  /** Map an AuditEntry to the Supabase column layout (camel → snake). */
  private toRow(entry: AuditEntry): Record<string, any> {
    return {
      id: entry.id,
      seq: entry.seq,
      at: entry.at,
      actor: entry.actor,
      action: entry.action,
      entity: entry.entity,
      outcome: entry.outcome,
      meta: entry.meta,
      prev_hash: entry.prevHash,
      hash: entry.hash,
      source: 'ntbf-platform',
    };
  }

  /** Enqueue (capped) then attempt to drain the backlog. Fire-and-forget. */
  async export(entry: AuditEntry): Promise<void> {
    try {
      if (!this.enabled) return; // fail-closed: OFF by default
      if (!entry || typeof entry.seq !== 'number') return;
      if (entry.seq <= this.exportedSeq) return; // already confirmed
      if (this.queue.length >= MAX_QUEUE) this.queue.shift(); // drop oldest, stay memory-safe
      this.queue.push(entry);
      await this.flush();
    } catch (e) {
      // Fail-open: auditing/export must never surface an error into the request path.
      this.note(e);
    }
  }

  /** Retry the whole backlog, oldest first. Never throws. */
  async flush(): Promise<void> {
    if (!this.enabled || this.flushing) return;
    this.flushing = true;
    try {
      // Drain in order; stop on the first failure so ordering + retry stay simple.
      while (this.queue.length > 0) {
        const entry = this.queue[0];
        const sent = await this.postOne(entry);
        if (!sent) break; // keep it (and the rest) queued for the next attempt
        this.queue.shift();
        if (entry.seq > this.exportedSeq) {
          this.exportedSeq = entry.seq;
          this.save();
        }
        this.okCount += 1;
      }
    } catch (e) {
      this.note(e);
    } finally {
      this.flushing = false;
    }
  }

  /** POST a single entry. Returns true on a 2xx (or ignored-duplicate), else false. */
  private async postOne(entry: AuditEntry): Promise<boolean> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(this.url + TABLE_PATH, {
        method: 'POST',
        headers: {
          apikey: this.key,
          Authorization: 'Bearer ' + this.key,
          'Content-Type': 'application/json',
          Prefer: 'resolution=ignore-duplicates,return=minimal',
        },
        body: JSON.stringify(this.toRow(entry)),
        signal: controller.signal,
      });
      if (res.ok) return true;
      // Non-2xx: capture a short reason and count a failure; keep the entry queued.
      let detail = '';
      try { detail = (await res.text()).slice(0, 200); } catch (e) { /* ignore */ }
      this.failCount += 1;
      this.lastError = 'export HTTP ' + res.status + (detail ? ': ' + detail : '');
      return false;
    } catch (e) {
      this.failCount += 1;
      this.note(e);
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  private note(e: any) {
    try {
      this.lastError = (e && (e.message || String(e))) || 'unknown error';
    } catch (_) { /* ignore */ }
  }
}
