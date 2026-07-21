/**
 * AI Operations Center — typed domain contracts (Lane B foundation).
 *
 * PURE TYPES ONLY. This file has zero runtime behaviour, zero imports from
 * the live backend, and is NOT part of the production build (it lives under
 * foundation/, which the Dockerfile never copies). The string-literal unions
 * below mirror contracts/constants.mjs literal-for-literal; the test suite
 * (tests/run-tests.mjs) fails on any drift between the two.
 *
 * Vocabulary intentionally maps onto the existing /ai coordination protocol
 * (TASK_QUEUE.md task lifecycle, ROADMAP.md owner-gate classes, AGENT_LOG.md
 * actor ids) so that a future live adapter is a mapping, not a redesign.
 */

// ── Actors ────────────────────────────────────────────────────────────────

export type AgentVendor = 'claude' | 'codex' | 'gemini' | 'human';

export interface AgentActor {
  /** Stable actor id, e.g. "MOCK-agent-claude-build". Live ids would follow HANDOFF.md §1 ("claude-muhammed", "codex-1"…). */
  id: string;
  name: string;
  vendor: AgentVendor;
  /** Free-text role line, e.g. "architecture & risky builds" (ROADMAP.md §4 role model). */
  role: string;
  /** ISO 8601 with +04:00 offset (house convention, HANDOFF.md §1). */
  lastSeenAt: string;
}

// ── Workstreams ───────────────────────────────────────────────────────────

/** Lane A = production/business delivery · Lane B = isolated foundation work (this shell). */
export type WorkstreamLane = 'A' | 'B';

export type WorkstreamStatus = 'active' | 'paused' | 'blocked' | 'done';

export interface Workstream {
  id: string;
  name: string;
  description: string;
  lane: WorkstreamLane;
  status: WorkstreamStatus;
  /** Actor id of the accountable owner (human or agent). */
  ownerId: string;
  /** Governing decision ids, e.g. "DEC-014" — link targets into /ai/DECISIONS.md. */
  decisionRefs: string[];
}

// ── Tasks ─────────────────────────────────────────────────────────────────

/** Mirrors the /ai TASK_QUEUE lifecycle: queued → claimed → in_progress → (blocked|awaiting_approval) → done|cancelled. */
export type AiTaskStatus =
  | 'queued'
  | 'claimed'
  | 'in_progress'
  | 'blocked'
  | 'awaiting_approval'
  | 'done'
  | 'cancelled';

export type TaskPriority = 'p0' | 'p1' | 'p2' | 'p3';

/** S ≤ half day · M 1–2 days · L multi-day (ROADMAP.md effort scale). */
export type TaskEffort = 'S' | 'M' | 'L';

export interface AiTask {
  id: string;
  workstreamId: string;
  title: string;
  summary: string;
  status: AiTaskStatus;
  priority: TaskPriority;
  effort: TaskEffort;
  /** Actor id, or null while unassigned in the queue. */
  assigneeId: string | null;
  /** Task ids this task cannot start before. */
  dependsOn: string[];
  /** Trace/decision link targets ("TRACE-001", "DEC-017") per DEC-016 traceability. */
  traceRefs: string[];
  createdAt: string;
  updatedAt: string;
}

// ── Approvals ─────────────────────────────────────────────────────────────

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'withdrawn';

/** Mirrors the real owner-gate classes (ROADMAP.md §4: Zoho writes, money postings, credentials, data leaving the box, deploys). */
export type ApprovalSubjectType =
  | 'task'
  | 'deliverable'
  | 'zoho_write'
  | 'financial_posting'
  | 'deployment'
  | 'credential'
  | 'data_export';

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface Approval {
  id: string;
  subjectType: ApprovalSubjectType;
  /** Id of the task/deliverable (or synthetic subject id) awaiting the gate. */
  subjectId: string;
  title: string;
  /** Actor id of the requesting agent. */
  requestedById: string;
  /** Actor id of the approver — in this business always the owner (HANDOFF.md §2.7). */
  approverId: string;
  status: ApprovalStatus;
  riskLevel: RiskLevel;
  requestedAt: string;
  /** null while pending. */
  decidedAt: string | null;
  note: string;
}

// ── Deliverables ──────────────────────────────────────────────────────────

export type DeliverableType = 'pull_request' | 'document' | 'report' | 'design' | 'dataset';

export type DeliverableStatus =
  | 'draft'
  | 'in_review'
  | 'approved'
  | 'merged'
  | 'delivered'
  | 'rejected';

export interface Deliverable {
  id: string;
  taskId: string;
  type: DeliverableType;
  title: string;
  /** Human-readable locator (PR number, doc path). Never a live production URL in mock data. */
  ref: string;
  status: DeliverableStatus;
  createdAt: string;
  updatedAt: string;
}

// ── Events ────────────────────────────────────────────────────────────────

export type AiEventKind =
  | 'task_created'
  | 'task_claimed'
  | 'status_changed'
  | 'approval_requested'
  | 'approval_decided'
  | 'deliverable_created'
  | 'comment'
  | 'heartbeat';

export interface AiEvent {
  id: string;
  kind: AiEventKind;
  /** Actor id that produced the event. */
  actorId: string;
  /** Id of the task/approval/deliverable/workstream the event concerns, or null for heartbeats. */
  subjectId: string | null;
  message: string;
  at: string;
}

// ── Executive snapshot ────────────────────────────────────────────────────

export interface OpsKpi {
  label: string;
  value: number;
  /** Optional unit/qualifier, e.g. "tasks", "pending". */
  unit: string;
  /** Signed delta vs previous period; 0 when flat/unknown. */
  delta: number;
}

export interface OpsSnapshot {
  generatedAt: string;
  kpis: OpsKpi[];
  taskCountsByStatus: Record<AiTaskStatus, number>;
  approvalCountsByStatus: Record<ApprovalStatus, number>;
  activeAgentCount: number;
  workstreamCount: number;
}
