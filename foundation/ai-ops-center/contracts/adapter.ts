/**
 * AI Operations Center — data-adapter contract (Lane B foundation).
 *
 * The UI shell talks ONLY to this interface. Today the sole implementation is
 * the mock adapter (mock/mock-adapter.mjs). A future live adapter would
 * implement the same interface over read-only sources (the /ai files or a
 * dedicated backend module) — see README.md "Future integration points".
 *
 * Every method is read-only and async (Promise-returning) so swapping in an
 * HTTP-backed implementation later changes no call sites.
 */

import type {
  AgentActor,
  AiEvent,
  AiTask,
  AiTaskStatus,
  Approval,
  ApprovalStatus,
  Deliverable,
  OpsSnapshot,
  Workstream,
} from './ops-contracts.ts';

export interface TaskFilter {
  status?: AiTaskStatus;
  workstreamId?: string;
  assigneeId?: string;
}

export interface ApprovalFilter {
  status?: ApprovalStatus;
  approverId?: string;
}

export interface AiOpsDataAdapter {
  /** Aggregated executive-overview numbers. */
  getSnapshot(): Promise<OpsSnapshot>;
  listWorkstreams(): Promise<Workstream[]>;
  listTasks(filter?: TaskFilter): Promise<AiTask[]>;
  listApprovals(filter?: ApprovalFilter): Promise<Approval[]>;
  /** Deliverables, optionally narrowed to one task. */
  listDeliverables(taskId?: string): Promise<Deliverable[]>;
  /** Newest-first activity feed, capped at `limit` (default: adapter-defined). */
  listEvents(limit?: number): Promise<AiEvent[]>;
  listAgents(): Promise<AgentActor[]>;
}
