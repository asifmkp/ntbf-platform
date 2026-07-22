import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export interface BackupRun {
  at: string; // ISO
  trigger: 'cron' | 'manual';
  ok: boolean;
  sizeBytes: number | null;
  objectPath: string | null;
  durationMs: number;
  error: string | null;
}

const MAX_ROWS = 200; // status history only — retention of the actual backups lives in Supabase Storage

/**
 * File-backed run-status log for the backup job (data/backups.json). Same
 * atomic temp-write + rename pattern as AuditStore, but this is structured
 * status data (last-N runs) for a "last successful backup: <date>" surface —
 * not the tamper-evident audit trail, which stays in AuditStore/AuditService.
 */
@Injectable()
export class BackupStore {
  private readonly file = path.join(process.env.STATE_DIR || process.cwd(), 'data', 'backups.json');
  private rows: BackupRun[] = [];

  constructor() {
    try {
      if (fs.existsSync(this.file)) this.rows = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch (e) { /* start empty */ }
    if (!Array.isArray(this.rows)) this.rows = [];
  }

  private save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.rows));
      fs.renameSync(tmp, this.file);
    } catch (e) { /* memory-only fallback */ }
  }

  record(run: BackupRun): BackupRun {
    this.rows.push(run);
    if (this.rows.length > MAX_ROWS) this.rows.splice(0, this.rows.length - MAX_ROWS);
    this.save();
    return run;
  }

  /** Newest-first page of run records. */
  list(limit = 30): BackupRun[] {
    return this.rows.slice().reverse().slice(0, limit);
  }

  lastSuccessful(): BackupRun | null {
    for (let i = this.rows.length - 1; i >= 0; i--) if (this.rows[i].ok) return this.rows[i];
    return null;
  }
}
