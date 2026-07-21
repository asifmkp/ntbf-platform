// AI Operations Center — reusable dashboard/widget components.
// Framework-free DOM builders (matches the repo's vanilla-JS idiom). Every
// component escapes text via textContent — no innerHTML with data, ever
// (the live app's stored-XSS lesson, PROJECT_KNOWLEDGE §10.8, applied here
// from day one).

/** Create an element with class, text and children. */
export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

/** Map a domain status to a visual tone. Meaning is always carried by the
 *  label text as well — the colored dot is reinforcement, not the message. */
const STATUS_TONES = {
  // task statuses
  queued: '', claimed: 'accent', in_progress: 'accent', blocked: 'serious',
  awaiting_approval: 'warning', done: 'good', cancelled: '',
  // approval statuses
  pending: 'warning', approved: 'good', rejected: 'critical', withdrawn: '',
  // workstream statuses
  active: 'good', paused: '',
  // deliverable statuses
  draft: '', in_review: 'warning', merged: 'good', delivered: 'good',
  // risk levels
  low: '', medium: 'accent', high: 'serious', critical: 'critical',
};

export function statusBadge(status) {
  const badge = el('span', `badge ${STATUS_TONES[status] || ''}`.trim());
  badge.appendChild(el('span', 'dot'));
  badge.appendChild(el('span', null, String(status).replace(/_/g, ' ')));
  return badge;
}

export function statCard({ label, value, unit, delta }) {
  const card = el('div', 'stat-card');
  card.appendChild(el('div', 'label', label));
  card.appendChild(el('div', 'value', value));
  const meta = [];
  if (unit) meta.push(unit);
  if (typeof delta === 'number' && delta !== 0) meta.push(`${delta > 0 ? '▲' : '▼'} ${Math.abs(delta)} vs last period`);
  if (meta.length) card.appendChild(el('div', 'meta', meta.join(' · ')));
  return card;
}

export function panel(title, hint) {
  const box = el('section', 'panel');
  const header = el('header');
  header.appendChild(el('span', null, title));
  if (hint) header.appendChild(el('span', 'hint', hint));
  box.appendChild(header);
  return box;
}

/**
 * Data table. columns: [{key, label, render?}] — render(row) may return a Node.
 */
export function dataTable(columns, rows) {
  const wrap = el('div', 'table-wrap');
  if (!rows.length) {
    wrap.appendChild(el('div', 'empty', 'Nothing here — mock filter returned no rows.'));
    return wrap;
  }
  const table = el('table', 'data');
  const thead = el('thead');
  const headRow = el('tr');
  for (const col of columns) headRow.appendChild(el('th', null, col.label));
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = el('tbody');
  for (const row of rows) {
    const tr = el('tr');
    for (const col of columns) {
      const td = el('td', col.wrap ? 'wrap' : null);
      const rendered = col.render ? col.render(row) : row[col.key];
      if (rendered instanceof Node) td.appendChild(rendered);
      else td.textContent = rendered === null || rendered === undefined ? '—' : String(rendered);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  wrap.appendChild(table);
  return wrap;
}

/** Fixed status→color assignment for the distribution bar (color follows the
 *  entity — a status keeps its color regardless of which statuses are present). */
const DIST_COLORS = {
  queued: 'var(--text-muted)',
  claimed: 'var(--accent)',
  in_progress: 'var(--accent)',
  blocked: 'var(--status-serious)',
  awaiting_approval: 'var(--status-warning)',
  done: 'var(--status-good)',
  cancelled: 'var(--border)',
};

/** Single stacked distribution bar with a labeled legend (counts ≥1 only). */
export function distributionBar(countsByStatus) {
  const container = el('div');
  const bar = el('div', 'dist-bar');
  const legend = el('div', 'dist-legend');
  const entries = Object.entries(countsByStatus).filter(([, n]) => n > 0);
  const total = entries.reduce((sum, [, n]) => sum + n, 0) || 1;
  for (const [status, count] of entries) {
    const seg = el('div', 'seg');
    seg.style.flexGrow = String(count);
    seg.style.flexBasis = '0';
    seg.style.background = DIST_COLORS[status] || 'var(--text-muted)';
    seg.title = `${status.replace(/_/g, ' ')}: ${count}`;
    bar.appendChild(seg);

    const item = el('span', 'item');
    const swatch = el('span', 'swatch');
    swatch.style.background = DIST_COLORS[status] || 'var(--text-muted)';
    item.appendChild(swatch);
    item.appendChild(el('span', null, `${status.replace(/_/g, ' ')} · ${count}`));
    legend.appendChild(item);
  }
  container.appendChild(bar);
  container.appendChild(legend);
  container.appendChild(el('div', 'footnote', `${total} tasks total`));
  return container;
}

/** Newest-first activity feed. resolveActor: id → display name. */
export function timeline(events, resolveActor) {
  const list = el('ul', 'timeline');
  if (!events.length) {
    list.appendChild(el('div', 'empty', 'No activity yet.'));
    return list;
  }
  for (const evt of events) {
    const li = el('li');
    li.appendChild(el('span', 'when', formatWhen(evt.at)));
    const what = el('div', 'what');
    const line = el('div');
    line.appendChild(el('span', 'actor', resolveActor(evt.actorId)));
    line.appendChild(el('span', null, ` · ${evt.kind.replace(/_/g, ' ')}`));
    what.appendChild(line);
    what.appendChild(el('div', 'msg', evt.message));
    li.appendChild(what);
    list.appendChild(li);
  }
  return list;
}

export function formatWhen(iso) {
  // Keep the mock's fixed timestamps readable without locale surprises.
  return iso.slice(0, 16).replace('T', ' ');
}
