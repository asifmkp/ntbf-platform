// ---------------------------------------------------------------------------
// Audit-log types (Stage 1).
//
// Additive, visual-invisible, fail-open feature. Every write request (POST /
// PATCH / PUT / DELETE) is recorded as a tamper-evident, hash-chained AuditEntry
// in a local append-only file (data/audit-log.json). Nothing here touches
// business logic — the audit path is a passive observer.
// ---------------------------------------------------------------------------

/** Who performed the action, resolved from whichever identity the request carried. */
export interface AuditActor {
  id: string | null;
  name: string | null;
  role: string | null;
  system: 'staff' | 'user' | 'customer' | 'ingest' | 'anonymous';
}

/** One durable, hash-chained audit record. */
export interface AuditEntry {
  seq: number;
  id: string;
  at: string; // ISO, UTC
  actor: AuditActor;
  action: {
    method: string;
    route: string;
    module: string | null;
    summary: string; // redacted, capped shallow view of the request body
  };
  entity: {
    type: string | null;
    id: string | null;
  };
  outcome: {
    status: number | null;
    ok: boolean;
  };
  meta: {
    ip: string | null;
    requestId: string | null;
  };
  prevHash: string; // hash of the previous entry (chain linkage)
  hash: string; // sha256( canonicalJSON(entryWithoutHash) + prevHash )
}

/** Shape assembled by the interceptor and handed to AuditService.record(). */
export interface AuditRecordInput {
  actor: AuditActor;
  action: AuditEntry['action'];
  entity: AuditEntry['entity'];
  outcome: AuditEntry['outcome'];
  meta: AuditEntry['meta'];
}
