import { Injectable } from '@nestjs/common';
import { AuditStore } from './audit.store';
import { AuditEntry, AuditRecordInput } from './audit.types';

/**
 * Assembles an AuditEntry from what the interceptor resolved and appends it to
 * the store. Fully FAIL-OPEN: every path is wrapped in try/catch and never
 * throws, so a broken audit write can never break the business request.
 */
@Injectable()
export class AuditService {
  constructor(private readonly store: AuditStore) {}

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
      this.store.append(partial);
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
