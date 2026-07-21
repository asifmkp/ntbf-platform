// AI Operations Center — mock data adapter (Lane B foundation).
//
// Implements the AiOpsDataAdapter contract (contracts/adapter.ts) over the
// fixed dataset in mock-data.mjs. Strictly read-only and side-effect free:
// no network, no filesystem, no timers, no globals. Internal data is deep-
// frozen and every method returns a structuredClone, so callers can mutate
// results without corrupting later reads (tests assert this).
//
// A future live adapter implements the same methods over real sources; the
// UI shell never knows the difference.

/** @typedef {import('../contracts/adapter.ts').AiOpsDataAdapter} AiOpsDataAdapter */

import {
  MOCK_AGENTS,
  MOCK_APPROVALS,
  MOCK_DELIVERABLES,
  MOCK_EVENTS,
  MOCK_GENERATED_AT,
  MOCK_TASKS,
  MOCK_WORKSTREAMS,
} from './mock-data.mjs';
import { AI_TASK_STATUSES, APPROVAL_STATUSES } from '../contracts/constants.mjs';

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) deepFreeze(value[key]);
  }
  return value;
}

const DATA = deepFreeze({
  agents: MOCK_AGENTS,
  workstreams: MOCK_WORKSTREAMS,
  tasks: MOCK_TASKS,
  approvals: MOCK_APPROVALS,
  deliverables: MOCK_DELIVERABLES,
  events: MOCK_EVENTS,
});

const clone = (value) => structuredClone(value);

const DEFAULT_EVENT_LIMIT = 50;

/** @implements {AiOpsDataAdapter} */
export class MockAiOpsAdapter {
  async getSnapshot() {
    const taskCountsByStatus = Object.fromEntries(AI_TASK_STATUSES.map((s) => [s, 0]));
    for (const t of DATA.tasks) taskCountsByStatus[t.status] += 1;

    const approvalCountsByStatus = Object.fromEntries(APPROVAL_STATUSES.map((s) => [s, 0]));
    for (const a of DATA.approvals) approvalCountsByStatus[a.status] += 1;

    const openTasks = DATA.tasks.filter((t) => t.status !== 'done' && t.status !== 'cancelled');
    return {
      generatedAt: MOCK_GENERATED_AT,
      kpis: [
        { label: 'Open tasks', value: openTasks.length, unit: 'tasks', delta: 1 },
        { label: 'Pending approvals', value: approvalCountsByStatus.pending, unit: 'gates', delta: 0 },
        { label: 'Blocked', value: taskCountsByStatus.blocked, unit: 'tasks', delta: 0 },
        { label: 'Done this week', value: taskCountsByStatus.done, unit: 'tasks', delta: 1 },
      ],
      taskCountsByStatus,
      approvalCountsByStatus,
      activeAgentCount: DATA.agents.length,
      workstreamCount: DATA.workstreams.length,
    };
  }

  async listWorkstreams() {
    return clone(DATA.workstreams);
  }

  async listTasks(filter = {}) {
    let tasks = DATA.tasks;
    if (filter.status) tasks = tasks.filter((t) => t.status === filter.status);
    if (filter.workstreamId) tasks = tasks.filter((t) => t.workstreamId === filter.workstreamId);
    if (filter.assigneeId) tasks = tasks.filter((t) => t.assigneeId === filter.assigneeId);
    return clone(tasks);
  }

  async listApprovals(filter = {}) {
    let approvals = DATA.approvals;
    if (filter.status) approvals = approvals.filter((a) => a.status === filter.status);
    if (filter.approverId) approvals = approvals.filter((a) => a.approverId === filter.approverId);
    return clone(approvals);
  }

  async listDeliverables(taskId) {
    const rows = taskId ? DATA.deliverables.filter((d) => d.taskId === taskId) : DATA.deliverables;
    return clone(rows);
  }

  async listEvents(limit = DEFAULT_EVENT_LIMIT) {
    const sorted = [...DATA.events].sort((a, b) => (a.at < b.at ? 1 : -1));
    return clone(sorted.slice(0, limit));
  }

  async listAgents() {
    return clone(DATA.agents);
  }
}
