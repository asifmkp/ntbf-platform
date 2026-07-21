// AI Operations Center — shell bootstrap (Lane B foundation).
// Hash-based router over the four example views; the ONLY data source is the
// injected adapter. Swapping MockAiOpsAdapter for a future live adapter is
// the single line marked below.

import { MockAiOpsAdapter } from '../mock/mock-adapter.mjs';
import { agentActivity, approvalQueue, executiveOverview, workQueue } from './views.mjs';

const adapter = new MockAiOpsAdapter(); // ← future integration point: live adapter goes here

const ROUTES = {
  '#/overview': { label: 'Executive overview', view: executiveOverview },
  '#/queue': { label: 'Work queue', view: workQueue },
  '#/approvals': { label: 'Approval queue', view: approvalQueue },
  '#/activity': { label: 'Agent activity', view: agentActivity },
};
const DEFAULT_ROUTE = '#/overview';

const contentEl = document.getElementById('content');
const navEl = document.getElementById('nav');

function buildNav() {
  for (const [hash, route] of Object.entries(ROUTES)) {
    const link = document.createElement('a');
    link.href = hash;
    link.textContent = route.label;
    link.dataset.route = hash;
    navEl.appendChild(link);
  }
}

async function render() {
  const hash = ROUTES[location.hash] ? location.hash : DEFAULT_ROUTE;
  for (const link of navEl.querySelectorAll('a')) {
    link.classList.toggle('active', link.dataset.route === hash);
  }
  contentEl.replaceChildren();
  try {
    contentEl.appendChild(await ROUTES[hash].view(adapter));
  } catch (err) {
    const msg = document.createElement('div');
    msg.className = 'empty';
    msg.textContent = `View failed to render: ${err && err.message ? err.message : err}`;
    contentEl.appendChild(msg);
  }
}

// Theme toggle: stamps data-theme on <html>; wins over the OS setting both ways.
document.getElementById('themeToggle').addEventListener('click', () => {
  const root = document.documentElement;
  const dark = root.dataset.theme === 'dark' ||
    (!root.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
  root.dataset.theme = dark ? 'light' : 'dark';
});

window.addEventListener('hashchange', render);
buildNav();
render();
