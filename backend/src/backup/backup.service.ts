import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { AuditService } from '../audit/audit.service';
import { AuditActor } from '../audit/audit.types';
import { BackupStore } from './backup.store';
import { SupabaseStorageClient, StorageObject } from './supabase-storage.client';

const execFileAsync = promisify(execFile);

const CRON_ACTOR: AuditActor = { id: 'backup-cron', name: 'system', role: null, system: 'ingest' };
const RETENTION = { daily: 14, weekly: 8, monthly: 6 } as const;
const IV_LENGTH = 12; // AES-GCM standard nonce size
const AUTH_TAG_LENGTH = 16;

/**
 * Nightly backup of STATE_DIR/data -> Supabase Storage (DEC-019, ai/BACKUP_DESIGN.md).
 * Fail-safe by design (mirrors ZohoService.configured): if BACKUP_ENCRYPTION_KEY or
 * the Supabase env vars are missing, runs log "not configured" and return cleanly —
 * this never throws, never blocks app boot, and is safe to deploy before the owner
 * provisions the Supabase-side bucket/service key.
 */
@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly storage: SupabaseStorageClient,
    private readonly store: BackupStore,
    private readonly audit: AuditService,
  ) {}

  get configured(): boolean {
    return Boolean(this.encryptionKey) && this.storage.configured;
  }

  private get encryptionKey(): Buffer | null {
    const hex = this.config.get<string>('BACKUP_ENCRYPTION_KEY') || '';
    if (hex.length !== 64) return null; // 32 bytes hex-encoded
    try { return Buffer.from(hex, 'hex'); } catch { return null; }
  }

  private get stateDataDir(): string {
    return path.join(process.env.STATE_DIR || process.cwd(), 'data');
  }

  @Cron('0 2 * * *', { timeZone: 'Asia/Dubai' })
  async nightly(): Promise<void> {
    await this.runBackup('cron', CRON_ACTOR);
  }

  async runBackup(trigger: 'cron' | 'manual', actor: AuditActor): Promise<{ ok: boolean; objectPath: string | null; error?: string }> {
    const start = Date.now();
    if (!this.configured) {
      const msg = 'backup skipped: not configured (BACKUP_ENCRYPTION_KEY / SUPABASE_URL / SUPABASE_SERVICE_KEY / SUPABASE_BACKUP_BUCKET)';
      this.logger.warn(msg);
      this.recordOutcome({ trigger, ok: false, sizeBytes: null, objectPath: null, durationMs: Date.now() - start, error: msg }, actor);
      return { ok: false, objectPath: null, error: msg };
    }

    let scratchTar = '';
    try {
      const now = new Date();
      const stamp = now.toISOString().replace(/[:.]/g, '-');
      scratchTar = path.join(os.tmpdir(), `ntbf-backup-${stamp}.tar.gz`);

      await execFileAsync('tar', ['-czf', scratchTar, '-C', path.dirname(this.stateDataDir), path.basename(this.stateDataDir)]);
      const plaintext = fs.readFileSync(scratchTar);
      const encrypted = this.encrypt(plaintext);

      const objectPath = `daily/${stamp}.tar.gz.enc`;
      await this.storage.upload(objectPath, encrypted);
      await this.promote(objectPath, now);
      await this.applyRetention();

      this.recordOutcome({ trigger, ok: true, sizeBytes: encrypted.length, objectPath, durationMs: Date.now() - start, error: null }, actor);
      return { ok: true, objectPath };
    } catch (e) {
      const error = (e as Error).message;
      this.logger.error(`backup failed: ${error}`);
      this.recordOutcome({ trigger, ok: false, sizeBytes: null, objectPath: null, durationMs: Date.now() - start, error }, actor);
      return { ok: false, objectPath: null, error };
    } finally {
      if (scratchTar) { try { fs.unlinkSync(scratchTar); } catch { /* best-effort cleanup */ } }
    }
  }

  private encrypt(plaintext: Buffer): Buffer {
    return encryptBackup(this.encryptionKey!, plaintext);
  }

  /**
   * Moves (not copies) the just-uploaded daily object into weekly/monthly on the
   * right days, so it isn't double-counted against storage/retention. Uses
   * Dubai-LOCAL day-of-week/date-of-month, not UTC — the cron fires at 02:00
   * Asia/Dubai (UTC+4), which is still the previous UTC calendar day, so a plain
   * `.getUTCDay()` would promote on the wrong day. UAE has no DST, so a fixed
   * +4h shift is safe (no need for full Intl timezone conversion).
   */
  private async promote(dailyObjectPath: string, at: Date): Promise<void> {
    const fileName = dailyObjectPath.split('/').pop()!;
    if (isDubaiSunday(at)) await this.storage.move(dailyObjectPath, `weekly/${fileName}`);
    if (isDubaiFirstOfMonth(at)) await this.storage.move(dailyObjectPath, `monthly/${fileName}`);
  }

  private async applyRetention(): Promise<void> {
    const [daily, weekly, monthly] = await Promise.all([
      this.storage.list('daily/'),
      this.storage.list('weekly/'),
      this.storage.list('monthly/'),
    ]);
    const newest = newestName([...daily, ...weekly, ...monthly]);

    const toDelete = [
      ...selectExpired(daily, RETENTION.daily),
      ...selectExpired(weekly, RETENTION.weekly),
      ...selectExpired(monthly, RETENTION.monthly),
    ].filter((name) => name !== newest);

    if (toDelete.length) await this.storage.remove(toDelete);
  }

  private recordOutcome(run: { trigger: 'cron' | 'manual'; ok: boolean; sizeBytes: number | null; objectPath: string | null; durationMs: number; error: string | null }, actor: AuditActor): void {
    this.store.record({ at: new Date().toISOString(), ...run });
    // Manual (HTTP) runs are already captured by the global AuditInterceptor; only
    // the cron trigger needs an explicit audit record (it never passes through HTTP).
    if (run.trigger === 'cron') {
      this.audit.record({
        actor,
        action: { method: 'CRON', route: 'backup.nightly', module: 'backup', summary: run.ok ? `backup ok, ${run.sizeBytes}B -> ${run.objectPath}` : `backup failed: ${run.error}` },
        entity: { type: 'backup', id: run.objectPath },
        outcome: { status: run.ok ? 200 : 500, ok: run.ok },
        meta: { ip: null, requestId: null },
      });
    }
  }
}

/**
 * Dubai-LOCAL day-of-week/date-of-month, not UTC. The cron fires at 02:00
 * Asia/Dubai (UTC+4), which is still the previous UTC calendar day — a plain
 * `.getUTCDay()` on the raw Date would promote on the wrong day. UAE has no
 * DST, so a fixed +4h shift is safe (no need for full Intl timezone conversion).
 * Exported for unit testing across the UTC day-boundary case.
 */
export function isDubaiSunday(at: Date): boolean {
  return new Date(at.getTime() + 4 * 60 * 60 * 1000).getUTCDay() === 0;
}

export function isDubaiFirstOfMonth(at: Date): boolean {
  return new Date(at.getTime() + 4 * 60 * 60 * 1000).getUTCDate() === 1;
}

/** Objects are named with a lexicographically-sortable ISO timestamp, so string sort == chronological sort. */
function newestName(objects: StorageObject[]): string | null {
  if (!objects.length) return null;
  return objects.slice().sort((a, b) => (a.name < b.name ? 1 : -1))[0].name;
}

/** Pure retention-window logic: given a prefix's objects (any order) and how many to keep, returns the object names to delete. Exported for unit testing without live Supabase credentials. */
export function selectExpired(objects: StorageObject[], keep: number): string[] {
  const newestFirst = objects.slice().sort((a, b) => (a.name < b.name ? 1 : -1));
  return newestFirst.slice(keep).map((o) => o.name);
}

/**
 * AES-256-GCM encrypt. Layout: [iv (12B)][authTag (16B)][ciphertext] — everything
 * a future restore script needs. Exported as a pure function (key + plaintext in,
 * blob out) so it's unit-testable without NestJS DI, and reusable by a restore
 * script later without re-deriving the format.
 */
export function encryptBackup(key: Buffer, plaintext: Buffer): Buffer {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]);
}

export function decryptBackup(key: Buffer, blob: Buffer): Buffer {
  const iv = blob.subarray(0, IV_LENGTH);
  const authTag = blob.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = blob.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
