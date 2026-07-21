// AI Operations Center — canonical enum values (runtime source of truth).
// These arrays are the ONE runtime home of every status/kind vocabulary; the
// TypeScript unions in ops-contracts.ts mirror them literal-for-literal and
// tests/run-tests.mjs fails if the two ever drift.
// Task statuses deliberately mirror the /ai file protocol lifecycle
// (TASK_QUEUE.md: queued → CLAIMED → IN_PROGRESS → done) so a future live
// adapter can map 1:1 without translation tables.

export const AGENT_VENDORS = ['claude', 'codex', 'gemini', 'human'];

export const WORKSTREAM_LANES = ['A', 'B'];

export const WORKSTREAM_STATUSES = ['active', 'paused', 'blocked', 'done'];

export const AI_TASK_STATUSES = [
  'queued',
  'claimed',
  'in_progress',
  'blocked',
  'awaiting_approval',
  'done',
  'cancelled',
];

export const TASK_PRIORITIES = ['p0', 'p1', 'p2', 'p3'];

export const TASK_EFFORTS = ['S', 'M', 'L'];

export const APPROVAL_STATUSES = ['pending', 'approved', 'rejected', 'withdrawn'];

// Mirrors the real owner-gate classes in /ai/ROADMAP.md §4 (Zoho writes,
// money postings, credentials, data leaving the box, deploys).
export const APPROVAL_SUBJECT_TYPES = [
  'task',
  'deliverable',
  'zoho_write',
  'financial_posting',
  'deployment',
  'credential',
  'data_export',
];

export const RISK_LEVELS = ['low', 'medium', 'high', 'critical'];

export const DELIVERABLE_TYPES = ['pull_request', 'document', 'report', 'design', 'dataset'];

export const DELIVERABLE_STATUSES = [
  'draft',
  'in_review',
  'approved',
  'merged',
  'delivered',
  'rejected',
];

export const AI_EVENT_KINDS = [
  'task_created',
  'task_claimed',
  'status_changed',
  'approval_requested',
  'approval_decided',
  'deliverable_created',
  'comment',
  'heartbeat',
];

// Every mock record id starts with this prefix so mock data can never be
// mistaken for (or collide with) live ids like TASK-012 / ORD-1023 / RCPT-4001.
export const MOCK_ID_PREFIX = 'MOCK-';
