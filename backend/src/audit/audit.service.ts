import { Injectable } from '@nestjs/common';
import { AuditExporter } from './audit.exporter';
import { AuditStore } from './audit.store';
import { AuditEntry, AuditRecordInput } from './audit.types';

/**
 * Assembles an AuditEntry from what the interceptor resolved and appends it to
 * the store. Fully FAIL-OPEN: every path is wrapped in try/catch and never
 * throws, so a broken audit write can never break the business request.
 */
@Injectable()
export class AuditService {
  constructor(
    private readonly store: AuditStore,
    private readonly exporter: AuditExporter,
  ) {}

  record(input: AuditRecordInput): void {
    try {
      const partial: Omit<AuditEntry, 'seq' | 'hash' | 'prevHash'> = {
        id: 'aud-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8),
        at: new Date().toISOString(),
        actor: input.actor,
        action: input.action,
        entity: input.entity,
        outcome: input.outcome,
        meta: input.meta,
      };
      const entry = this.store.append(partial);
      // Stage 3: fire-and-forget off-box export. Gated + fully fail-open, so it
      // can never delay or break the request even if the network/Supabase is down.
      try {
        this.exporter.export(entry).catch(() => { /* swallow — export never affects the request */ });
      } catch (e) { /* swallow — export never affects the request */ }
    } catch (e) {
      // Fail-open: swallow everything — auditing must never surface an error.
    }
  }

  /** Newest-first page of audit entries (admin read surface). */
  list(limit = 100, offset = 0): AuditEntry[] {
    try {
      return this.store.list(limit, offset);
    } catch (e) {
      return [];
    }
  }
}
