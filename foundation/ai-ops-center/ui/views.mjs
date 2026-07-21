// AI Operations Center — example view layouts (Lane B foundation).
// Four example screens composed from the widget library, fed exclusively by
// the injected AiOpsDataAdapter (mock today). Each view is a pure function:
// (adapter) → Promise<DocumentFragment>.

import { dataTable, distributionBar, el, panel, statCard, statusBadge, timeline } from './components.mjs';

function heading(fragment, title, subtitle) {
  fragment.appendChild(el('h1', null, title));
  fragment.appendChild(el('p', 'subtitle', subtitle));
}

async function actorResolver(adapter) {
  const agents = await adapter.listAgents();
  const byId = new Map(agents.map((a) => [a.id, a.name]));
  return (id) => byId.get(id) || id || 'system';
}

// ── 1 · Executive overview ────────────────────────────────────────────────
export async function executiveOverview(adapter) {
  const frag = document.createDocumentFragment();
  heading(frag, 'Executive overview', 'One screen: load, gates, blockers, momentum.');

  const [snapshot, workstreams, events] = await Promise.all([
    adapter.getSnapshot(),
    adapter.listWorkstreams(),
    adapter.listEvents(5),
  ]);
  const resolve = await actorResolver(adapter);

  const kpiRow = el('div', 'kpi-row');
  for (const kpi of snapshot.kpis) kpiRow.appendChild(statCard(kpi));
  frag.appendChild(kpiRow);

  const distPanel = panel('Task pipeline', 'all workstreams');
  const distBody = el('div', 'body');
  distBody.appendChild(distributionBar(snapshot.taskCountsByStatus));
  distPanel.appendChild(distBody);
  frag.appendChild(distPanel);

  const grid = el('div', 'grid-2');

  const wsPanel = panel('Workstreams', `${workstreams.length} total`);
  wsPanel.appendChild(
    dataTable(
      [
        { key: 'name', label: 'Workstream' },
        { key: 'lane', label: 'Lane' },
        { key: 'status', label: 'Status', render: (w) => statusBadge(w.status) },
        { key: 'decisionRefs', label: 'Decisions', render: (w) => w.decisionRefs.join(', ') || '—' },
      ],
      workstreams,
    ),
  );
  grid.appendChild(wsPanel);

  const recentPanel = panel('Latest activity', 'top 5');
  const recentBody = el('div', 'body');
  recentBody.appendChild(timeline(events, resolve));
  recentPanel.appendChild(recentBody);
  grid.appendChild(recentPanel);

  frag.appendChild(grid);
  frag.appendChild(el('p', 'footnote', `Snapshot generated ${snapshot.generatedAt} · ${snapshot.activeAgentCount} agents registered`));
  return frag;
}

// ── 2 · Work queue ────────────────────────────────────────────────────────
export async function workQueue(adapter) {
  const frag = document.createDocumentFragment();
  heading(frag, 'Work queue', 'Every task, mirror of the /ai queue lifecycle: queued → claimed → in progress → done.');

  const [tasks, workstreams] = await Promise.all([adapter.listTasks(), adapter.listWorkstreams()]);
  const resolve = await actorResolver(adapter);
  const wsById = new Map(workstreams.map((w) => [w.id, w.name]));

  const open = tasks.filter((t) => !['done', 'cancelled'].includes(t.status));
  const closed = tasks.filter((t) => ['done', 'cancelled'].includes(t.status));

  const columns = [
    { key: 'title', label: 'Task', wrap: true },
    { key: 'status', label: 'Status', render: (t) => statusBadge(t.status) },
    { key: 'priority', label: 'Priority', render: (t) => t.priority.toUpperCase() },
    { key: 'effort', label: 'Effort' },
    { key: 'assigneeId', label: 'Assignee', render: (t) => (t.assigneeId ? resolve(t.assigneeId) : 'unassigned') },
    { key: 'workstreamId', label: 'Workstream', render: (t) => wsById.get(t.workstreamId) || t.workstreamId },
    { key: 'dependsOn', label: 'Depends on', render: (t) => (t.dependsOn.length ? t.dependsOn.join(', ') : '—') },
  ];

  const openPanel = panel('Open tasks', `${open.length} open`);
  openPanel.appendChild(dataTable(columns, open));
  frag.appendChild(openPanel);

  const closedPanel = panel('Recently closed', `${closed.length} closed`);
  closedPanel.appendChild(dataTable(columns, closed));
  frag.appendChild(closedPanel);
  return frag;
}

// ── 3 · Approval queue ────────────────────────────────────────────────────
export async function approvalQueue(adapter) {
  const frag = document.createDocumentFragment();
  heading(frag, 'Approval queue', 'Owner gates: nothing risky proceeds without an explicit yes.');

  const approvals = await adapter.listApprovals();
  const resolve = await actorResolver(adapter);

  const pending = approvals.filter((a) => a.status === 'pending');
  const decided = approvals.filter((a) => a.status !== 'pending');

  const columns = [
    { key: 'title', label: 'Request', wrap: true },
    { key: 'subjectType', label: 'Gate type', render: (a) => a.subjectType.replace(/_/g, ' ') },
    { key: 'riskLevel', label: 'Risk', render: (a) => statusBadge(a.riskLevel) },
    { key: 'requestedById', label: 'Requested by', render: (a) => resolve(a.requestedById) },
    { key: 'status', label: 'Status', render: (a) => statusBadge(a.status) },
    { key: 'note', label: 'Note', wrap: true },
  ];

  const pendingPanel = panel('Awaiting the owner', `${pending.length} pending`);
  pendingPanel.appendChild(dataTable(columns, pending));
  frag.appendChild(pendingPanel);

  const decidedPanel = panel('Decided', `${decided.length} resolved`);
  decidedPanel.appendChild(dataTable(columns, decided));
  frag.appendChild(decidedPanel);

  frag.appendChild(el('p', 'footnote', 'Foundation shell is read-only: approve/reject actions are a future integration point (see README).'));
  return frag;
}

// ── 4 · Agent activity ────────────────────────────────────────────────────
export async function agentActivity(adapter) {
  const frag = document.createDocumentFragment();
  heading(frag, 'Agent activity', 'Who is doing what, and the full event feed.');

  const [agents, events, tasks] = await Promise.all([
    adapter.listAgents(),
    adapter.listEvents(),
    adapter.listTasks(),
  ]);
  const resolve = await actorResolver(adapter);

  const agentPanel = panel('Registered agents', `${agents.length} actors`);
  agentPanel.appendChild(
    dataTable(
      [
        { key: 'name', label: 'Agent' },
        { key: 'vendor', label: 'Vendor' },
        { key: 'role', label: 'Role', wrap: true },
        {
          key: 'id',
          label: 'Active tasks',
          render: (a) => tasks.filter((t) => t.assigneeId === a.id && !['done', 'cancelled'].includes(t.status)).length,
        },
        { key: 'lastSeenAt', label: 'Last seen', render: (a) => a.lastSeenAt.slice(0, 16).replace('T', ' ') },
      ],
      agents,
    ),
  );
  frag.appendChild(agentPanel);

  const feedPanel = panel('Event feed', 'newest first');
  const feedBody = el('div', 'body');
  feedBody.appendChild(timeline(events, resolve));
  feedPanel.appendChild(feedBody);
  frag.appendChild(feedPanel);
  return frag;
}
