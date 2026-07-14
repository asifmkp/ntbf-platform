import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

/** One logged Muhammed Q&A turn (the owner's team-report layer). */
export interface MuhammedLogRow {
  id: string;
  ts: string; // ISO, UTC
  staffId: string;
  staffName: string;
  roles: string[];
  question: string;
  answer: string;
  lang: string;
  toolsUsed: string[];
  toolCalls: number;
  answered: boolean;
  gapReason: string | null;
  ms: number;
}

/**
 * File-backed conversation log (data/muhammed-log.json), same durable-write
 * pattern as StaffStore / AppStateService. Only admin (owner) tools read it.
 */
@Injectable()
export class MuhammedLog {
  private readonly file = path.join(process.env.STATE_DIR || process.cwd(), 'data', 'muhammed-log.json');
  private data: { seq: number; rows: MuhammedLogRow[] } = { seq: 0, rows: [] };

  constructor() {
    try {
      if (fs.existsSync(this.file)) this.data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch (e) { /* start empty */ }
  }

  private save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.data));
      fs.renameSync(tmp, this.file);
    } catch (e) { /* memory-only fallback */ }
  }

  append(row: Omit<MuhammedLogRow, 'id' | 'ts'> & { ts?: string }): MuhammedLogRow {
    this.data.seq += 1;
    const rec: MuhammedLogRow = { id: 'mlog-' + this.data.seq, ts: row.ts || new Date().toISOString(), ...row } as MuhammedLogRow;
    this.data.rows.unshift(rec);
    if (this.data.rows.length > 5000) this.data.rows.length = 5000; // safety cap
    this.save();
    return rec;
  }

  /** Newest-first, optionally filtered. Used by the admin team-report tools. */
  query(opts: { unansweredOnly?: boolean; staff?: string; sinceIso?: string } = {}): MuhammedLogRow[] {
    let rows = this.data.rows;
    if (opts.unansweredOnly) rows = rows.filter((r) => !r.answered);
    if (opts.staff) { const s = opts.staff.toLowerCase(); rows = rows.filter((r) => r.staffName.toLowerCase().includes(s)); }
    if (opts.sinceIso) rows = rows.filter((r) => r.ts >= opts.sinceIso!);
    return rows;
  }
}
