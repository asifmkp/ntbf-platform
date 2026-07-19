import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { AuditEntry } from './audit.types';

const MAX_ROWS = 10000; // keep the newest N rows on disk (safety cap)

/**
 * File-backed, hash-chained audit log (data/audit-log.json). Same durable-write
 * pattern as MuhammedLog / StaffStore (atomic temp-write + rename, try/catch
 * swallow, monotonic seq). Each row carries prevHash + hash so the chain is
 * tamper-evident: rewriting any past row breaks verifyChain() from that row on.
 */
@Injectable()
export class AuditStore {
  private readonly file = path.join(process.env.STATE_DIR || process.cwd(), 'data', 'audit-log.json');
  private data: { seq: number; headHash: string; rows: AuditEntry[] } = { seq: 0, headHash: '', rows: [] };

  constructor() {
    try {
      if (fs.existsSync(this.file)) this.data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch (e) { /* start empty */ }
    if (typeof this.data.seq !== 'number') this.data.seq = 0;
    if (typeof this.data.headHash !== 'string') this.data.headHash = '';
    if (!Array.isArray(this.data.rows)) this.data.rows = [];
  }

  private save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.data));
      fs.renameSync(tmp, this.file);
    } catch (e) { /* memory-only fallback */ }
  }

  /** Stable, key-sorted JSON so the hash is independent of property insertion order. */
  private canonicalJSON(value: any): string {
    return JSON.stringify(value, (_key, val) => {
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        return Object.keys(val).sort().reduce((acc: any, k) => { acc[k] = val[k]; return acc; }, {});
      }
      return val;
    });
  }

  /** hash = sha256( canonicalJSON(entryWithoutHash) + prevHash ). */
  private hashEntry(entryWithoutHash: Omit<AuditEntry, 'hash'>, prevHash: string): string {
    return createHash('sha256').update(this.canonicalJSON(entryWithoutHash) + prevHash).digest('hex');
  }

  /** Assign seq + chain hashes, append, cap, persist, and return the full entry. */
  append(partial: Omit<AuditEntry, 'seq' | 'hash' | 'prevHash'>): AuditEntry {
    this.data.seq += 1;
    const prevHash = this.data.headHash;
    const withoutHash: Omit<AuditEntry, 'hash'> = { ...partial, seq: this.data.seq, prevHash };
    const hash = this.hashEntry(withoutHash, prevHash);
    const entry: AuditEntry = { ...withoutHash, hash };
    this.data.rows.push(entry);
    if (this.data.rows.length > MAX_ROWS) this.data.rows.splice(0, this.data.rows.length - MAX_ROWS);
    this.data.headHash = hash;
    this.save();
    return entry;
  }

  /** Newest-first page of entries. */
  list(limit = 100, offset = 0): AuditEntry[] {
    const newestFirst = this.data.rows.slice().reverse();
    return newestFirst.slice(offset, offset + limit);
  }

  /**
   * Recompute every retained row's hash in order and confirm prevHash linkage.
   * Cap-safe: the first retained row's prevHash may point at an already-evicted
   * row, so linkage is only asserted between consecutive retained rows.
   */
  verifyChain(): { ok: boolean; count: number; brokenAtSeq: number | null } {
    const rows = this.data.rows;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const { hash, ...withoutHash } = row;
      const expected = this.hashEntry(withoutHash, row.prevHash);
      const linkOk = i === 0 ? true : row.prevHash === rows[i - 1].hash;
      if (expected !== hash || !linkOk) {
        return { ok: false, count: rows.length, brokenAtSeq: row.seq };
      }
    }
    return { ok: true, count: rows.length, brokenAtSeq: null };
  }
}
