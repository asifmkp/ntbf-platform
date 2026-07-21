#!/usr/bin/env node
// AI Operations Center — foundation test suite (zero dependencies).
//
// Run from the repo root:   node foundation/ai-ops-center/tests/run-tests.mjs
//
// Two families of checks:
//   A. ISOLATION — proves the foundation cannot affect live production paths:
//      nothing in backend/src or apps/ references it, the Docker image never
//      contains it, and the foundation itself performs no I/O.
//   B. CONTRACTS — proves the mock adapter honours the typed contracts:
//      enum drift guard, referential integrity, determinism, defensive copies.
//
// Style follows backend/tools/test-live-standard.mjs: named checks, PASS/FAIL
// tally, non-zero exit on any failure.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..');
const FOUNDATION = path.join(REPO, 'foundation');

let pass = 0;
let fail = 0;
const failures = [];

async function check(name, fn) {
  try {
    await fn();
    pass += 1;
    console.log(`  PASS  ${name}`);
  } catch (err) {
    fail += 1;
    failures.push({ name, err });
    console.log(`  FAIL  ${name} — ${err.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '.git') continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else yield full;
  }
}

function filesReferencing(rootDir, needles) {
  const hits = [];
  for (const file of walk(rootDir)) {
    if (!/\.(ts|js|mjs|cjs|json|html|css|yaml|yml)$/.test(file)) continue;
    const text = readFileSync(file, 'utf8');
    for (const needle of needles) {
      if (text.includes(needle)) hits.push(`${path.relative(REPO, file)} → "${needle}"`);
    }
  }
  return hits;
}

// ════════════════════════════════ A. ISOLATION ═══════════════════════════
console.log('\nA. Isolation — no effect on live production paths');

await check('backend/src contains no reference to the foundation', () => {
  const hits = filesReferencing(path.join(REPO, 'backend', 'src'), ['ai-ops-center', 'foundation/']);
  assert(hits.length === 0, `found: ${hits.join('; ')}`);
});

await check('apps/ (production-served static frontends) contains no reference to the foundation', () => {
  const hits = filesReferencing(path.join(REPO, 'apps'), ['ai-ops-center', 'foundation/']);
  assert(hits.length === 0, `found: ${hits.join('; ')}`);
});

await check('Dockerfile never copies foundation/ into the production image', () => {
  const docker = readFileSync(path.join(REPO, 'Dockerfile'), 'utf8');
  assert(!docker.includes('foundation'), 'Dockerfile mentions foundation');
  const copies = docker.split('\n').filter((l) => l.trim().startsWith('COPY'));
  assert(copies.length > 0, 'no COPY lines found — Dockerfile shape changed, re-verify isolation');
  for (const line of copies) {
    const src = line.trim().split(/\s+/)[1] || '';
    assert(
      src.startsWith('backend') || src.startsWith('apps') || src.startsWith('--from'),
      `unexpected COPY source "${src}" — re-verify the image cannot include foundation/`,
    );
  }
});

await check('render.yaml deployment config does not reference the foundation', () => {
  const text = readFileSync(path.join(REPO, 'render.yaml'), 'utf8');
  assert(!text.includes('foundation') && !text.includes('ai-ops-center'), 'render.yaml references foundation');
});

await check('app.module.ts registers no foundation module', () => {
  const text = readFileSync(path.join(REPO, 'backend', 'src', 'app.module.ts'), 'utf8');
  assert(!/ops/i.test(text) || !text.toLowerCase().includes('ai-ops'), 'app.module.ts mentions ai-ops');
  assert(!text.includes('foundation'), 'app.module.ts mentions foundation');
});

await check('foundation code performs no I/O (no fetch/XHR/fs/child_process/timers) outside its test suite', () => {
  const banned = ['fetch(', 'XMLHttpRequest', "require('fs", 'node:fs', 'node:child_process', 'child_process', 'setInterval(', 'WebSocket'];
  const hits = [];
  for (const file of walk(FOUNDATION)) {
    if (!/\.(ts|mjs|js)$/.test(file)) continue;
    if (file.includes(`${path.sep}tests${path.sep}`)) continue; // the suite itself reads files to verify isolation
    const text = readFileSync(file, 'utf8');
    for (const needle of banned) if (text.includes(needle)) hits.push(`${path.relative(REPO, file)} → ${needle}`);
  }
  assert(hits.length === 0, `found: ${hits.join('; ')}`);
});

await check('foundation modules import only from within foundation/', () => {
  const hits = [];
  for (const file of walk(FOUNDATION)) {
    if (!/\.(ts|mjs)$/.test(file)) continue;
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      const spec = match[1];
      if (spec.startsWith('node:')) {
        if (!file.includes(`${path.sep}tests${path.sep}`)) hits.push(`${path.relative(REPO, file)} → ${spec}`);
        continue;
      }
      assert(spec.startsWith('.'), `${path.relative(REPO, file)} imports bare specifier "${spec}" (external dependency)`);
      const resolved = path.resolve(path.dirname(file), spec);
      if (!resolved.startsWith(FOUNDATION)) hits.push(`${path.relative(REPO, file)} → ${spec} escapes foundation/`);
    }
  }
  assert(hits.length === 0, `found: ${hits.join('; ')}`);
});

// ════════════════════════════════ B. CONTRACTS ═══════════════════════════
console.log('\nB. Contracts — mock adapter honours the typed shapes');

const constants = await import('../contracts/constants.mjs');
const { MockAiOpsAdapter } = await import('../mock/mock-adapter.mjs');
const adapter = new MockAiOpsAdapter();

await check('TypeScript contract files parse under Node type-stripping', async () => {
  await import('../contracts/ops-contracts.ts');
  await import('../contracts/adapter.ts');
});

await check('TS unions and runtime constants do not drift', () => {
  const tsSource = readFileSync(path.join(FOUNDATION, 'ai-ops-center', 'contracts', 'ops-contracts.ts'), 'utf8');
  const vocabularies = {
    AGENT_VENDORS: constants.AGENT_VENDORS,
    WORKSTREAM_LANES: constants.WORKSTREAM_LANES,
    WORKSTREAM_STATUSES: constants.WORKSTREAM_STATUSES,
    AI_TASK_STATUSES: constants.AI_TASK_STATUSES,
    TASK_PRIORITIES: constants.TASK_PRIORITIES,
    TASK_EFFORTS: constants.TASK_EFFORTS,
    APPROVAL_STATUSES: constants.APPROVAL_STATUSES,
    APPROVAL_SUBJECT_TYPES: constants.APPROVAL_SUBJECT_TYPES,
    RISK_LEVELS: constants.RISK_LEVELS,
    DELIVERABLE_TYPES: constants.DELIVERABLE_TYPES,
    DELIVERABLE_STATUSES: constants.DELIVERABLE_STATUSES,
    AI_EVENT_KINDS: constants.AI_EVENT_KINDS,
  };
  for (const [name, values] of Object.entries(vocabularies)) {
    for (const value of values) {
      assert(tsSource.includes(`'${value}'`), `${name} value "${value}" missing from ops-contracts.ts unions`);
    }
  }
});

await check('every mock record id carries the MOCK- prefix', async () => {
  const collections = [
    await adapter.listAgents(),
    await adapter.listWorkstreams(),
    await adapter.listTasks(),
    await adapter.listApprovals(),
    await adapter.listDeliverables(),
    await adapter.listEvents(),
  ];
  for (const rows of collections) {
    for (const row of rows) {
      assert(row.id.startsWith(constants.MOCK_ID_PREFIX), `id "${row.id}" lacks ${constants.MOCK_ID_PREFIX} prefix`);
    }
  }
});

await check('mock records use only vocabulary values from the contracts', async () => {
  for (const a of await adapter.listAgents()) assert(constants.AGENT_VENDORS.includes(a.vendor), `bad vendor ${a.vendor}`);
  for (const w of await adapter.listWorkstreams()) {
    assert(constants.WORKSTREAM_LANES.includes(w.lane), `bad lane ${w.lane}`);
    assert(constants.WORKSTREAM_STATUSES.includes(w.status), `bad workstream status ${w.status}`);
  }
  for (const t of await adapter.listTasks()) {
    assert(constants.AI_TASK_STATUSES.includes(t.status), `bad task status ${t.status}`);
    assert(constants.TASK_PRIORITIES.includes(t.priority), `bad priority ${t.priority}`);
    assert(constants.TASK_EFFORTS.includes(t.effort), `bad effort ${t.effort}`);
  }
  for (const a of await adapter.listApprovals()) {
    assert(constants.APPROVAL_STATUSES.includes(a.status), `bad approval status ${a.status}`);
    assert(constants.APPROVAL_SUBJECT_TYPES.includes(a.subjectType), `bad subject type ${a.subjectType}`);
    assert(constants.RISK_LEVELS.includes(a.riskLevel), `bad risk ${a.riskLevel}`);
  }
  for (const d of await adapter.listDeliverables()) {
    assert(constants.DELIVERABLE_TYPES.includes(d.type), `bad deliverable type ${d.type}`);
    assert(constants.DELIVERABLE_STATUSES.includes(d.status), `bad deliverable status ${d.status}`);
  }
  for (const e of await adapter.listEvents()) assert(constants.AI_EVENT_KINDS.includes(e.kind), `bad event kind ${e.kind}`);
});

await check('referential integrity across collections', async () => {
  const agentIds = new Set((await adapter.listAgents()).map((a) => a.id));
  const wsIds = new Set((await adapter.listWorkstreams()).map((w) => w.id));
  const tasks = await adapter.listTasks();
  const taskIds = new Set(tasks.map((t) => t.id));
  const deliverables = await adapter.listDeliverables();
  const knownSubjects = new Set([
    ...taskIds,
    ...deliverables.map((d) => d.id),
    ...(await adapter.listApprovals()).map((a) => a.id),
    ...wsIds,
  ]);

  for (const w of await adapter.listWorkstreams()) assert(agentIds.has(w.ownerId), `workstream ${w.id} owner missing`);
  for (const t of tasks) {
    assert(wsIds.has(t.workstreamId), `task ${t.id} workstream missing`);
    if (t.assigneeId) assert(agentIds.has(t.assigneeId), `task ${t.id} assignee missing`);
    for (const dep of t.dependsOn) assert(taskIds.has(dep), `task ${t.id} depends on missing ${dep}`);
  }
  for (const a of await adapter.listApprovals()) {
    assert(agentIds.has(a.requestedById), `approval ${a.id} requester missing`);
    assert(agentIds.has(a.approverId), `approval ${a.id} approver missing`);
    assert(knownSubjects.has(a.subjectId), `approval ${a.id} subject ${a.subjectId} missing`);
    if (a.status === 'pending') assert(a.decidedAt === null, `pending approval ${a.id} has decidedAt`);
    else assert(typeof a.decidedAt === 'string', `decided approval ${a.id} lacks decidedAt`);
  }
  for (const d of deliverables) assert(taskIds.has(d.taskId), `deliverable ${d.id} task missing`);
  for (const e of await adapter.listEvents()) {
    assert(agentIds.has(e.actorId), `event ${e.id} actor missing`);
    if (e.subjectId !== null) assert(knownSubjects.has(e.subjectId), `event ${e.id} subject ${e.subjectId} missing`);
  }
});

await check('snapshot aggregates agree with the underlying lists', async () => {
  const snapshot = await adapter.getSnapshot();
  const tasks = await adapter.listTasks();
  const approvals = await adapter.listApprovals();
  const taskTotal = Object.values(snapshot.taskCountsByStatus).reduce((a, b) => a + b, 0);
  const apprTotal = Object.values(snapshot.approvalCountsByStatus).reduce((a, b) => a + b, 0);
  assert(taskTotal === tasks.length, `task counts ${taskTotal} ≠ ${tasks.length}`);
  assert(apprTotal === approvals.length, `approval counts ${apprTotal} ≠ ${approvals.length}`);
  assert(snapshot.activeAgentCount === (await adapter.listAgents()).length, 'agent count mismatch');
  assert(snapshot.workstreamCount === (await adapter.listWorkstreams()).length, 'workstream count mismatch');
  for (const kpi of snapshot.kpis) assert(typeof kpi.value === 'number', `KPI ${kpi.label} not numeric`);
});

await check('adapter filters narrow correctly', async () => {
  const blocked = await adapter.listTasks({ status: 'blocked' });
  assert(blocked.length > 0 && blocked.every((t) => t.status === 'blocked'), 'status filter broken');
  const pending = await adapter.listApprovals({ status: 'pending' });
  assert(pending.length > 0 && pending.every((a) => a.status === 'pending'), 'approval filter broken');
  const limited = await adapter.listEvents(3);
  assert(limited.length === 3, `event limit broken (${limited.length})`);
  const all = await adapter.listEvents();
  for (let i = 1; i < all.length; i += 1) assert(all[i - 1].at >= all[i].at, 'events not newest-first');
});

await check('adapter is deterministic and hands out defensive copies', async () => {
  const first = await adapter.listTasks();
  first[0].title = 'MUTATED BY CALLER';
  first[0].status = 'cancelled';
  const second = await adapter.listTasks();
  assert(second[0].title !== 'MUTATED BY CALLER', 'caller mutation leaked into adapter state');
  const third = await adapter.listTasks();
  assert(JSON.stringify(second) === JSON.stringify(third), 'repeated reads differ');
  const snapA = await adapter.getSnapshot();
  const snapB = await adapter.getSnapshot();
  assert(JSON.stringify(snapA) === JSON.stringify(snapB), 'snapshot not deterministic');
});

await check('mock data contains no live business identifiers', async () => {
  // Live id shapes (ORD-####, RCPT-####, stf-###…) and live hostnames must
  // never appear in mock content. MOCK-task-… etc. are exempt by prefix.
  const text = JSON.stringify({
    a: await adapter.listAgents(),
    w: await adapter.listWorkstreams(),
    t: await adapter.listTasks(),
    p: await adapter.listApprovals(),
    d: await adapter.listDeliverables(),
    e: await adapter.listEvents(),
  });
  const livePatterns = [/\bORD-\d/, /\bRCPT-\d/, /\bEXP-\d/, /\bADV-\d/, /\bTRF-\d/, /\bPAY-\d/, /\bstf-\d/, /ntbfllc\.com/, /928751913/, /supabase/i, /\bTASK-\d{3}\b/];
  for (const pattern of livePatterns) assert(!pattern.test(text), `live identifier pattern ${pattern} found in mock data`);
});

// ════════════════════════════════ summary ════════════════════════════════
console.log(`\n${pass + fail} checks · ${pass} PASS · ${fail} FAIL`);
if (fail > 0) {
  console.error('\nFailures:');
  for (const f of failures) console.error(` - ${f.name}: ${f.err.message}`);
  process.exit(1);
}
