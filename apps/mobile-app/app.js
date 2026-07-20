// ---------------------------------------------------------------------------
// National Trading mobile app — views + working actions for every role.
// ---------------------------------------------------------------------------
const S = window.Store;
const $ = (sel) => document.querySelector(sel);
function buzz(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {} }

const ROLES = {
  salesman: { name: 'Tahir', sub: 'Sales', pic: 'T', status: 'On field',
    tabs: [{ id: 'home', label: 'Home', i: '▦' }, { id: 'online', label: 'Online', i: '🌐' }, { id: 'customers', label: 'Customers', i: '◍' }, { id: 'orders', label: 'Orders', i: '▣' }, { id: 'visits', label: 'Visits', i: '◎' }] },
  driver: { name: 'Musthafa', sub: 'Delivery · Van DXB-4471', pic: 'M', status: 'On route',
    tabs: [{ id: 'route', label: 'Route', i: '◎' }, { id: 'collect', label: 'Collect', i: '＄' }, { id: 'custody', label: 'Cash', i: '💵' }, { id: 'eod', label: 'EOD', i: '▰' }] },
  warehouse: { name: 'Haris', sub: 'Purchasing & Warehouse', pic: 'H', status: 'In warehouse',
    tabs: [{ id: 'stock', label: 'Stock', i: '▤' }, { id: 'moves', label: 'Moves', i: '⇅' }, { id: 'dispatch', label: 'Dispatch', i: '⬆' }, { id: 'receive', label: 'Receive', i: '⬇' }] },
  purchase: { name: 'Haris', sub: 'Purchasing', pic: 'H', status: 'Active',
    tabs: [{ id: 'cash', label: 'Cash', i: '💵' }, { id: 'capture', label: 'Capture', i: '📸' }, { id: 'replenish', label: 'Forecast', i: '📈' }, { id: 'reqs', label: 'Reqs', i: '⇄' }, { id: 'pos', label: 'POs', i: '▣' }] },
  finance: { name: 'Sara Iqbal', sub: 'Finance admin', pic: 'SI', status: 'Active',
    tabs: [{ id: 'fhome', label: 'Overview', i: '▦' }, { id: 'collections', label: 'Collections', i: '📨' }, { id: 'assets', label: 'Assets', i: '🏢' }, { id: 'cheques', label: 'Cheques', i: '▤' }, { id: 'fapprovals', label: 'Approvals', i: '✓' }] },
  admin: { name: 'Asif', sub: 'Owner · full access', pic: 'A', status: 'Full access',
    tabs: [{ id: 'ahome', label: 'Overview', i: '▦' }, { id: 'acash', label: 'Cash', i: '💵' }, { id: 'docs', label: 'Docs', i: '📄' }, { id: 'renewals', label: 'Renewals', i: '⏰' }, { id: 'astock', label: 'Stock', i: '▤' }, { id: 'approvals', label: 'Approvals', i: '✓' }] },
  customer: { name: 'Customer', sub: 'Customer portal', pic: 'C', status: 'Shopping',
    tabs: [{ id: 'shop', label: 'Shop', i: '🛒' }, { id: 'myorders', label: 'Orders', i: '▣' }, { id: 'payments', label: 'Bills', i: '＄' }, { id: 'support', label: 'Support', i: '🎧' }, { id: 'profile', label: 'Profile', i: '👤' }] },
  service: { name: 'Layla Hassan', sub: 'Customer Service', pic: 'LH', status: 'Online',
    tabs: [{ id: 'queue', label: 'Tickets', i: '🎧' }, { id: 'resolved', label: 'Resolved', i: '✓' }] },
};
// Muhammed — the AI colleague — gets a tab on every staff role (not the customer portal).
Object.keys(ROLES).forEach((r) => { if (r !== 'customer') ROLES[r].tabs.push({ id: 'muhammed', label: 'Muhammed', i: '✦' }); });
let shopCart = {}; let shopMethod = 'CASH_ON_DELIVERY';
let onlineOrders = []; let onlineLoaded = false;
// Which tabs, per role, show the real online-order queue (loaded from /api/portal/orders/all).
const ONLINE_TABS = { salesman: ['online'], warehouse: ['dispatch'], driver: ['route', 'collect'] };
let capDraft = {};
const RENEWAL_KINDS = {
  visa: { label: 'Residence visa', icon: '🛂' },
  labor_card: { label: 'Labour card', icon: '🪪' },
  emirates_id: { label: 'Emirates ID', icon: '🪪' },
  passport: { label: 'Passport', icon: '📘' },
  insurance: { label: 'Vehicle insurance', icon: '🚗' },
  registration: { label: 'Vehicle registration (Mulkiya)', icon: '📋' },
  service: { label: 'Vehicle service', icon: '🔧' },
  loan: { label: 'Loan payment', icon: '🏦' },
};
const DOC_TYPES = {
  supplier_bill: { label: 'Supplier bill / tax invoice', icon: '🧾', zoho: 'Vendor Bill → COGS / Inventory Asset', extract: true,
    fields: [{ key: 'vendor', label: 'Supplier' }, { key: 'invoiceNo', label: 'Invoice no' }, { key: 'date', label: 'Date' }, { key: 'total', label: 'Total (AED)' }] },
  purchase_order: { label: 'Purchase order / packing list', icon: '📦', zoho: 'Purchase Order',
    fields: [{ key: 'vendor', label: 'Supplier' }, { key: 'ref', label: 'PO / ref no' }, { key: 'total', label: 'Total (AED)' }] },
  delivery_note: { label: 'Delivery note / POD', icon: '🚚', zoho: 'Attach to Sales Order / Invoice',
    fields: [{ key: 'customer', label: 'Customer' }, { key: 'ref', label: 'Invoice / order ref' }, { key: 'received', label: 'Received by' }] },
  cash_voucher: { label: 'Cash voucher / expense', icon: '🧾', zoho: 'Expense → paid through Cash',
    fields: [{ key: 'paidTo', label: 'Paid to' }, { key: 'category', label: 'Expense type' }, { key: 'amount', label: 'Amount (AED)' }] },
  purchase_voucher: { label: 'Purchase voucher', icon: '💴', zoho: 'Vendor Payment → Cash',
    fields: [{ key: 'vendor', label: 'Supplier' }, { key: 'amount', label: 'Amount (AED)' }, { key: 'ref', label: 'Reference' }] },
};
function curCustomerId() {
  let id = localStorage.getItem('ntbf_customer');
  if (!id || !S.customer(id)) { const c = S.state.customers.find((x) => x.status === 'ACTIVE') || S.state.customers[0]; id = c ? c.id : null; if (id) localStorage.setItem('ntbf_customer', id); }
  return id;
}
window.curCustomer = () => S.customer(curCustomerId());

// ---------------- staff authentication ----------------
let staff = (() => { try { return JSON.parse(localStorage.getItem('ntbf_staff') || 'null'); } catch (e) { return null; } })();
let staffToken = localStorage.getItem('ntbf_stafftoken') || '';
const ALL_ROLES = ['salesman', 'driver', 'warehouse', 'purchase', 'finance', 'admin', 'service', 'customer'];
function allowedRoles() {
  if (!staff) return [];
  if (staff.roles && staff.roles.indexOf('admin') >= 0) return ALL_ROLES.slice(); // admin = full access
  return (staff.roles || []).slice();
}
async function staffApi(path, method, body) {
  const base = localStorage.getItem('ntbf_api') || ((location.protocol.startsWith('http') && location.port !== '8080') ? location.origin : 'http://localhost:3000');
  const headers = { 'content-type': 'application/json' };
  if (staffToken) headers['authorization'] = 'Bearer ' + staffToken;
  const r = await fetch(base + path, { method: method || 'GET', headers, body: body ? JSON.stringify(body) : undefined });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((data && data.message) || ('Error ' + r.status));
  return data;
}

let role = localStorage.getItem('ntbf_role') || '';
let tab = localStorage.getItem('ntbf_tab') || '';

// ---------------- shell ----------------
function render() {
  const app = $('#app');
  if (!staffToken || !staff) { app.innerHTML = loginScreen(); return; }
  const allow = allowedRoles();
  // Enforce that the active role is one this staff is allowed to use.
  if (role && allow.indexOf(role) < 0) { role = ''; localStorage.removeItem('ntbf_role'); }
  if (!role) {
    if (allow.length === 1) { role = allow[0]; localStorage.setItem('ntbf_role', role); }
    else { app.innerHTML = picker(); return; }
  }
  const R = ROLES[role];
  if (!tab || !R.tabs.find((t) => t.id === tab)) tab = R.tabs[0].id;
  let name = staff.name || R.name, pic = (staff.name || R.name).slice(0, 1).toUpperCase(), sub = R.sub;
  if (role === 'customer') { const c = window.curCustomer(); if (c) { name = c.name; pic = c.name.slice(0, 2).toUpperCase(); sub = c.category + ' account'; } }
  const canSwitch = allow.length > 1;
  app.innerHTML = `
    <div class="head">
      <div class="top">
        <div class="pic">${pic}</div>
        <div class="who"><b>${name}</b><span>${sub}</span></div>
        <button class="switch" data-act="settings" style="padding:8px 10px">⚙</button>
        ${canSwitch ? '<button class="switch" data-act="switchRole">⇄</button>' : '<button class="switch" data-act="staffLogout" style="padding:8px 10px">⏻</button>'}
      </div>
      <div class="status"><span class="dot"></span> ${R.status}</div>
    </div>
    <div class="body">${views[tab] ? views[tab]() : ''}</div>
    <div class="bottom-nav">
      ${R.tabs.map((t) => `<button class="bn ${t.id === tab ? 'on' : ''}" data-act="tab" data-id="${t.id}"><span class="i">${t.i}</span>${t.label}</button>`).join('')}
    </div>`;
  mountMaps();
  if (window.applyAttentionBadges) window.applyAttentionBadges(); // additive: tab badges + handover banner
  if ((ONLINE_TABS[role] || []).indexOf(tab) >= 0 && !onlineLoaded) loadOnlineOrders();
}

function loginScreen() {
  return `<div class="picker">
    <div class="pbrand">
      <img src="/icons/icon-staff-192.png" alt="National Trading" />
      <h1>National Trading</h1>
      <p>Staff Sign In · Ajman</p>
    </div>
    <div class="card pad" style="margin-top:4px">
      <label class="fld"><span class="lab">Username</span><input id="lg_user" autocapitalize="none" autocomplete="username" placeholder="e.g. musthafa" /></label>
      <label class="fld"><span class="lab">Password</span><input id="lg_pass" type="password" autocomplete="current-password" placeholder="Your password" /></label>
      <button class="btn primary full" data-act="staffLogin">Sign in</button>
    </div>
    <p class="muted" style="font-size:11.5px;margin-top:16px;text-align:center">Access is limited to your assigned role. Contact your manager if you can't sign in.</p>
  </div>`;
}

function picker() {
  const cards = [
    ['salesman', '◍', 'var(--green)', 'var(--green-bg)', 'Salesman', 'Visits, customers, orders'],
    ['driver', '▣', 'var(--amber)', 'var(--amber-bg)', 'Delivery driver', 'Route, deliveries, collection'],
    ['warehouse', '▤', 'var(--accent)', 'var(--accent-bg)', 'Warehouse', 'Stock, dispatch, receiving'],
    ['purchase', '⇄', 'var(--purple)', 'var(--purple-bg)', 'Purchase', 'Requisitions, POs'],
    ['finance', '＄', 'var(--green)', 'var(--green-bg)', 'Finance', 'Collections, cheques, approvals'],
    ['admin', '★', 'var(--accent)', 'var(--accent-bg)', 'Management', 'Approvals, oversight'],
    ['service', '🎧', 'var(--amber)', 'var(--amber-bg)', 'Customer Service', 'Support tickets & queries'],
    ['staff', '🧾', 'var(--green)', 'var(--green-bg)', 'Staff', 'Tasks, expenses, advances'],
    ['customer', '🛒', 'var(--purple)', 'var(--purple-bg)', 'Customer', 'Shop, orders, support'],
  ];
  const allow = allowedRoles();
  const first = staff && staff.name ? String(staff.name).split(' ')[0] : '';
  return `<div class="picker">
    <div class="pbrand">
      <img src="/icons/icon-staff-192.png" alt="National Trading" />
      <h1>Hi, ${esc(first)}</h1>
      <p>Choose a role to continue</p>
    </div>
    <div class="psub">Your roles</div>
    ${cards.filter(([id]) => allow.indexOf(id) >= 0).map(([id, ic, c, bg, t, s]) => `<div class="role" data-act="pick" data-id="${id}">
      <div class="ri" style="background:${bg};color:${c}">${ic}</div>
      <div><b>${t}</b><span>${s}</span></div><div class="arr">›</div></div>`).join('')}
    <div class="btn full" data-act="staffLogout" style="margin-top:16px;color:var(--red)">Sign out</div>
  </div>`;
}

// ---------------- helpers ----------------
function kpi(l, v, cls) { return `<div class="kpi ${cls || ''}"><div class="l">${l}</div><div class="v">${v}</div></div>`; }
function row(ic, cls, title, sub, end) {
  return `<div class="li"><div class="ic ${cls}">${ic}</div><div class="m"><b>${title}</b><span>${sub}</span></div>${end ? `<div class="end">${end}</div>` : ''}</div>`;
}
function statusTag(s) {
  const map = { PLACED: ['blue', 'Placed'], CONFIRMED: ['blue', 'Confirmed'], PACKED: ['amber', 'Packed'], OUT_FOR_DELIVERY: ['purple', 'Out for delivery'], DELIVERED: ['green', 'Delivered'], FAILED: ['red', 'Failed'], PENDING: ['amber', 'Pending'], ACTIVE: ['green', 'Active'] };
  const [c, t] = map[s] || ['gray', s];
  return `<span class="tag ${c}">${t}</span>`;
}
function toast(msg) {
  let t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(t._tm); t._tm = setTimeout(() => t.classList.remove('show'), 2200);
}
function openSheet(title, body, onMount) {
  $('#scrim').classList.add('show');
  const sh = $('#sheet');
  sh.innerHTML = `<div class="grab"></div><div class="sh-head"><h3>${title}</h3><button class="x" data-act="closeSheet">✕</button></div><div class="sh-body">${body}</div>`;
  sh.classList.add('show');
  if (onMount) onMount(sh);
}
function closeSheet() { $('#scrim').classList.remove('show'); $('#sheet').classList.remove('show'); }
// July 2026 history backfill — renders the server's dry-run/write report inside the sheet.
function julyReportHtml(rep, wrote) {
  const labels = { orders: 'Orders (sales)', receipts: 'Receipts', payments: 'Vendor payments', expenses: 'Expenses', transfers: 'Transfers' };
  const rows = Object.keys(labels).map((t) => {
    const r = (rep.types || {})[t] || {};
    const exp = r.expected || { count: 0, sum: 0 };
    return `<tr><td style="padding:4px 6px">${labels[t]}</td>
      <td style="padding:4px 6px;text-align:right">${r.toImport || 0} · ${aed(r.toImportSum || 0)}</td>
      <td style="padding:4px 6px;text-align:right">${r.alreadyPresent || 0}</td>
      ${wrote ? `<td style="padding:4px 6px;text-align:right">${r.imported || 0}</td>` : ''}
      <td style="padding:4px 6px;text-align:right;color:var(--muted)">${exp.count} · ${aed(exp.sum)}</td></tr>`;
  }).join('');
  const skipped = Object.keys(labels).reduce((a, t) => a.concat(((rep.types || {})[t] || {}).skipped || []), []);
  const skippedHtml = skipped.length
    ? `<div class="sect" style="margin-top:10px">Skipped (${skipped.length})</div>` +
      skipped.map((s) => `<div style="font-size:12px;color:var(--muted)">${esc(s.ref)} — ${esc(s.reason)}</div>`).join('')
    : '';
  const nameOnly = (rep.nameOnlyTransferParties || []).length
    ? `<p class="muted" style="font-size:12px;margin-top:8px">Transfer parties with no app staff account (kept as display names, no accounts created): <b>${(rep.nameOnlyTransferParties || []).map(esc).join(', ')}</b></p>`
    : '';
  const t = rep.totals || {};
  return `
    <p style="font-size:13px;line-height:1.55;color:var(--muted)">History-only import of the July 1–20 2026 books into the app's server stores. <b>July already exists in Zoho</b> — imported records carry origin “july-import” and are never sent to Zoho.</p>
    <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12.5px">
      <tr style="color:var(--muted)"><th style="text-align:left;padding:4px 6px">Type</th><th style="text-align:right;padding:4px 6px">To import</th><th style="text-align:right;padding:4px 6px">Present</th>${wrote ? '<th style="text-align:right;padding:4px 6px">Imported</th>' : ''}<th style="text-align:right;padding:4px 6px">Expected</th></tr>
      ${rows}
    </table></div>
    <p style="font-size:12.5px;margin-top:8px"><b>${wrote ? 'Imported ' + (t.imported || 0) + ' records this run.' : 'Ready to import ' + (t.toImport || 0) + ' records · ' + aed(t.toImportSum || 0) + '.'}</b> Already present: ${t.alreadyPresent || 0} · skipped: ${t.skipped || 0}</p>
    ${skippedHtml}${nameOnly}
    ${wrote ? '' : `<label class="fld" style="margin-top:10px"><span class="lab">Type IMPORT to write</span><input id="jly_confirm" autocomplete="off" autocapitalize="characters" placeholder="IMPORT" /></label>
    <button class="btn primary full" data-act="julyImportGo">Import July history</button>`}
    <div class="btn-row" style="margin-top:10px"><button class="btn danger" data-act="julyImportRemoveForm">Remove July import</button></div>`;
}
function custOptions(onlyActive) {
  return S.state.customers.filter((c) => !onlyActive || c.status === 'ACTIVE').map((c) => `<option value="${c.id}">${c.name}${c.onHold ? ' (ON HOLD)' : ''}</option>`).join('');
}

// ---------------- SALESMAN views ----------------
const views = {
  home() {
    const orders = S.state.orders.filter((o) => o.createdBy === 'sales');
    const salesToday = orders.reduce((s, o) => s + o.total, 0);
    const pend = S.pendingApprovals().length;
    return `
      <div class="mkpis">
        ${kpi('Sales today', aed(salesToday), 'green')}
        ${kpi('Orders', orders.length, 'accent')}
        ${kpi('Visits done', S.state.visits.length)}
        ${kpi('Pending approval', pend, 'amber')}
      </div>
      <div class="sect">Quick actions</div>
      <div class="btn-row"><button class="btn primary" data-act="newOrder">＋ New order</button><button class="btn" data-act="newCustomer">＋ Customer</button></div>
      <div class="btn-row"><button class="btn" data-act="checkin">◎ Check in visit</button><button class="btn" data-act="specialPrice">% Special price</button></div>
      <div class="sect">Recent visits</div>
      <div class="card">${S.state.visits.length ? S.state.visits.slice(0, 5).map((v) => row('✓', 'g', v.name, 'Checked in ' + v.time + (v.note ? ' · ' + v.note : ''), '')).join('') : emptyRow('No visits yet — tap “Check in visit”.')}</div>
      <div class="sect">Awaiting approval</div>
      <div class="card">${S.pendingApprovals().length ? S.pendingApprovals().map((a) => row('!', 'p', a.label, a.type.toLowerCase(), '<span class="tag amber">Pending</span>')).join('') : emptyRow('Nothing pending.')}</div>`;
  },
  customers() {
    return `<div class="sect">Customers (${S.state.customers.length})</div>
      <div class="card">${S.state.customers.length ? S.state.customers.map((c) => row(c.name.slice(0, 2).toUpperCase(), c.onHold ? 'r' : 'g', c.name, c.category + ' · credit ' + aed(c.credit), c.onHold ? '<span class="tag red">On hold</span>' : statusTag(c.status))).join('') : emptyRow('No customers yet — add your first one below.')}</div>
      <button class="btn primary full" data-act="newCustomer">＋ New customer</button>`;
  },
  orders() {
    const orders = S.state.orders;
    return `<div class="sect">Orders (${orders.length})</div>
      <div class="card">${orders.length ? orders.map((o) => { const c = S.customer(o.customerId); return row(o.id.replace('SO-', '#'), 'a', c ? c.name : '—', o.id + ' · ' + o.items.length + ' lines', aed(o.total) + '<br>' + statusTag(o.status)); }).join('') : emptyRow('No orders yet.')}</div>
      <button class="btn primary full" data-act="newOrder">＋ New order</button>`;
  },
  online() {
    if (!onlineLoaded) return loadingCard('Loading online orders…');
    const review = onlineOrders.filter((o) => o.needsReview);
    const active = onlineOrders.filter((o) => !o.needsReview && o.status !== 'DELIVERED' && o.status !== 'CANCELLED');
    const done = onlineOrders.filter((o) => o.status === 'DELIVERED' || o.status === 'CANCELLED');
    return `
      <div class="card pad" style="margin-bottom:13px"><b style="font-size:13.5px">🌐 Online orders</b><div class="muted" style="font-size:12px;margin:4px 0 10px">Website &amp; WhatsApp orders. Tap any order for full details. Customers see the status live.</div><button class="btn sm" data-act="refreshOnline">↻ Refresh</button></div>
      ${review.length ? `<div class="sect">⚠ Needs review (${review.length})</div>${review.map((o) => orderCard(o, 'online')).join('')}` : ''}
      <div class="sect">Incoming (${active.length})</div>
      ${active.length ? active.map((o) => orderCard(o, 'online')).join('') : emptyRow('No open online orders. New website & WhatsApp orders land here.')}
      ${done.length ? `<div class="sect">Completed (${done.length})</div>${done.map((o) => orderCard(o, 'online')).join('')}` : ''}`;
  },
  visits() {
    return `<div class="sect">Visit log</div>
      <div class="card">${S.state.visits.length ? S.state.visits.map((v) => row('◎', 'g', v.name, v.note || 'Visit', v.time)).join('') : emptyRow('No visits logged.')}</div>
      <button class="btn primary full" data-act="checkin">◎ Check in a visit</button>`;
  },

  // ---------------- DRIVER ----------------
  route() {
    if (!onlineLoaded) return loadingCard('Loading deliveries…');
    const stops = onlineByStatus(['OUT_FOR_DELIVERY']).slice().sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    const delivered = onlineByStatus(['DELIVERED']).length;
    const cash = codTotal(stops);
    const addrs = stops.map((o) => o.address).filter(Boolean);
    const navAll = addrs.length ? `<button class="btn sm primary" data-act="navAll" data-addrs="${esc(addrs.join('~|~'))}">🧭 Navigate all stops</button>` : '';
    return `
      <div class="mkpis">
        ${kpi('Stops left', stops.length, 'accent')}
        ${kpi('Delivered', delivered, 'green')}
        ${kpi('Cash to collect', aed(cash), 'green')}
      </div>
      <div class="card pad" style="margin:2px 0 12px"><b style="font-size:13.5px">🚚 Deliveries</b><div class="muted" style="font-size:12px;margin:4px 0 10px">Orders packed and handed to you (website &amp; WhatsApp), earliest first. Tap a stop for details.</div><div class="btn-row">${navAll}<button class="btn sm" data-act="refreshOnline">↻ Refresh</button></div></div>
      <div class="sect">Your stops (${stops.length})</div>
      ${stops.length ? stops.map((o) => orderCard(o, 'route')).join('') : emptyRow('No deliveries out right now. Packed orders handed to you appear here.')}`;
  },
  collect() {
    if (!onlineLoaded) return loadingCard('Loading…');
    const delivered = onlineByStatus(['DELIVERED']);
    const cashDone = delivered.filter(isCash).reduce((s, o) => s + collectedAmount(o), 0);
    const pending = codTotal(onlineByStatus(['OUT_FOR_DELIVERY']));
    return `
      <div class="mkpis">${kpi('Cash collected', aed(cashDone), 'green')}${kpi('Still to collect', aed(pending), pending ? 'amber' : 'green')}</div>
      <div class="card pad" style="margin-bottom:12px"><div class="muted" style="font-size:12px">Actual cash collected on delivered cash-on-delivery orders (website &amp; WhatsApp). Hand this to Haris at end of day.</div></div>
      <div class="sect">Delivered &amp; collected (${delivered.length})</div>
      ${delivered.length ? delivered.map((o) => orderCard(o, 'online')).join('') : emptyRow('No deliveries completed yet today.')}`;
  },
  eod() {
    const last = S.state.eod[0];
    return `<div class="sect">End of day</div>
      <div class="card pad">
        <div class="li"><div class="m"><b>Delivered</b></div><div class="end">${S.state.orders.filter((o) => o.status === 'DELIVERED').length}</div></div>
        <div class="li"><div class="m"><b>Cash collected</b></div><div class="end">${aed(sum('CASH_ON_DELIVERY'))}</div></div>
        <div class="li"><div class="m"><b>Cheques collected</b></div><div class="end">${aed(sum('CHEQUE_ON_DELIVERY'))}</div></div>
        <div class="li"><div class="m"><b>Failed stops</b></div><div class="end">${S.state.orders.filter((o) => o.status === 'FAILED').length}</div></div>
      </div>
      <button class="btn primary full" data-act="submitEod">Submit to Finance</button>
      ${last ? `<div class="card pad" style="margin-top:12px"><b style="color:var(--green)">✓ Submitted ${last.time}</b><div class="muted" style="font-size:12px">Cash ${aed(last.cash)} · Cheque ${aed(last.cheque)} · ${last.delivered} delivered</div></div>` : ''}`;
  },

  // ---- COMPLIANCE & RENEWALS ----
  renewals() {
    const list = S.renewalsDue();
    const cnt = (t) => list.filter((r) => r.tier === t).length;
    const tierLabel = { expired: 'Expired', '30': '≤30 days', '60': '≤60 days', '90': '≤90 days', ok: 'OK' };
    const tierTag = { expired: 'red', '30': 'red', '60': 'amber', '90': 'amber', ok: 'green' };
    return `
      <div class="mkpis">
        ${kpi('Expired', cnt('expired'), cnt('expired') ? 'red' : 'green')}
        ${kpi('≤30 days', cnt('30'), cnt('30') ? 'red' : 'green')}
        ${kpi('≤60 days', cnt('60'), cnt('60') ? 'amber' : 'green')}
        ${kpi('Tracked', list.length)}
      </div>
      <div class="card pad" style="margin-bottom:13px"><b style="font-size:13.5px">⏰ Renewal alerts</b><div class="muted" style="font-size:12px;margin-top:4px">Staff visas, labour cards, Emirates IDs and vehicle documents — flagged at 90 / 60 / 30 days so nothing lapses and you avoid fines.</div></div>
      <div class="sect">By urgency</div>
      <div class="card">${list.length ? list.map((r) => {
      const k = RENEWAL_KINDS[r.kind] || { label: r.kind, icon: '📄' };
      const days = r.days < 0 ? 'expired ' + Math.abs(r.days) + 'd ago' : r.days + ' days left';
      const t = tierTag[r.tier];
      return `<div class="li"><div class="ic ${t === 'red' ? 'r' : t === 'amber' ? 'a' : 'g'}">${k.icon}</div><div class="m"><b>${k.label} — ${r.holder}</b><span>${r.expiry} · ${days}</span></div><div class="end"><span class="tag ${t}">${tierLabel[r.tier]}</span><br><button class="btn sm" data-act="renewItem" data-id="${r.id}" style="margin-top:5px">Renew</button></div></div>`;
    }).join('') : emptyRow('No renewals tracked yet.')}</div>
      <button class="btn primary full" data-act="addRenewal">＋ Add a document / renewal</button>`;
  },

  // ---- DOCUMENT CAPTURE ----
  capture() {
    const docs = S.state.documents || [];
    return `
      <div class="card pad" style="background:var(--amber-bg);border-color:transparent;margin-bottom:13px">
        <b style="color:var(--amber);font-size:12.5px">🔒 Test mode — nothing is written to Zoho yet</b>
        <div class="muted" style="font-size:11.5px;color:var(--amber)">Documents are captured and prepared. They post to Zoho Books only after Asif confirms the details are correct.</div>
      </div>
      <div class="sect">Capture a document</div>
      <div class="card">${Object.entries(DOC_TYPES).map(([t, cfg]) => `<div class="li" data-act="capDoc" data-type="${t}" style="cursor:pointer"><div class="ic">${cfg.icon}</div><div class="m"><b>${cfg.label}</b><span>Tap to photograph</span></div><div class="end">›</div></div>`).join('')}</div>
      <div class="sect">Captured (${docs.length})</div>
      <div class="card">${docs.length ? docs.map((d) => row(d.icon || '📄', d.posted ? 'g' : 'a', d.title, d.typeLabel + ' · ' + d.time, d.posted ? '<span class="tag green">Posted</span>' : '<span class="tag amber">Ready</span>')).join('') : emptyRow('No documents captured yet — tap a type above.')}</div>`;
  },
  docs() {
    const ds = S.state.documents || [];
    const ready = ds.filter((d) => !d.posted);
    return `
      <div class="card pad" style="background:var(--accent-bg);border-color:transparent;margin-bottom:13px"><b style="color:var(--accent);font-size:12.5px">Document review</b><div class="muted" style="font-size:11.5px;color:var(--accent)">Check each captured document is correct, then confirm. Live posting to Zoho activates once the Zoho write connection is switched on.</div></div>
      <div class="mkpis">${kpi('Awaiting review', ready.length, ready.length ? 'amber' : 'green')}${kpi('Confirmed', ds.filter((d) => d.posted).length, 'green')}</div>
      <div class="sect">Captured documents</div>
      <div class="card">${ds.length ? ds.map((d) => `<div class="li"><div class="ic ${d.posted ? 'g' : 'a'}">${d.icon || '📄'}</div><div class="m"><b>${d.title}</b><span>${d.typeLabel} · ${d.time} · → ${d.zoho}</span>${!d.posted ? `<div class="btn-row"><button class="btn sm" data-act="viewDoc" data-id="${d.id}">View</button><button class="btn green sm" data-act="postDoc" data-id="${d.id}">Confirm &amp; post</button></div>` : '<div class="muted" style="font-size:11.5px;margin-top:3px">✓ Confirmed for Zoho</div>'}</div></div>`).join('') : emptyRow('No documents captured yet.')}</div>`;
  },

  // ---- CASH CUSTODY ----
  custody() {
    const holding = S.driverHolding();
    const myH = (S.state.cash || []).filter((e) => e.kind === 'handover');
    return `
      <div class="mkpis">
        ${kpi('Collected (cash)', aed(S.totalCashCollected()), 'green')}
        ${kpi('In my hand', aed(holding), holding > 0 ? 'amber' : 'green')}
        ${kpi('Handovers', myH.length)}
        ${kpi('Flagged', S.cashFlags().length, S.cashFlags().length ? 'red' : 'green')}
      </div>
      <div class="card pad" style="margin-bottom:13px">
        <b style="font-size:13.5px">💵 Hand cash to Haris</b>
        <div class="muted" style="font-size:12px;margin:4px 0 12px">You should be holding <b>${aed(holding)}</b> from today's cash deliveries.</div>
        <button class="btn primary full" data-act="handover"${holding > 0 ? '' : ' style="opacity:.5"'}>Hand over now</button>
      </div>
      <div class="sect">My handovers</div>
      <div class="card">${myH.length ? myH.map((e) => row(e.status === 'confirmed' ? '✓' : '⏳', e.flagged ? 'r' : e.status === 'confirmed' ? 'g' : 'a', aed(e.declared) + ' to Haris', e.time + ' · ' + e.status + (e.variance ? ' · ' + (e.variance > 0 ? 'over ' : 'short ') + aed(Math.abs(e.variance)) : '') + (e.reason ? ' · ' + esc(e.reason) : ''), e.flagged ? '<span class="tag red">Flag</span>' : '')).join('') : emptyRow('No handovers yet.')}</div>`;
  },
  cash() {
    const pend = S.pendingHandovers();
    return `
      <div class="mkpis">
        ${kpi('Cash in hand', aed(S.harisCashInHand()), 'green')}
        ${kpi('Pending handovers', pend.length, pend.length ? 'amber' : 'green')}
        ${kpi('Flagged', S.cashFlags().length, S.cashFlags().length ? 'red' : 'green')}
        ${kpi('Cash out', aed(S.cashOuts().reduce((s, e) => s + e.amount, 0)))}
      </div>
      <div class="sect">Pending handovers from Musthafa</div>
      <div class="card">${pend.length ? pend.map((e) => `<div class="li"><div class="ic a">💵</div><div class="m"><b>${aed(e.declared)} declared</b><span>expected ${aed(e.expected)}${e.variance ? ' · ' + (e.variance < 0 ? 'short ' : 'over ') + aed(Math.abs(e.variance)) : ''}${e.reason ? ' · ' + esc(e.reason) : ''}</span><div class="btn-row"><button class="btn green sm" data-act="confirmHandover" data-id="${e.id}">Count &amp; confirm</button></div></div></div>`).join('') : emptyRow('No pending handovers.')}</div>
      <div class="sect">Cash out (expenses &amp; advances)</div>
      <div class="card">${S.cashOuts().length ? S.cashOuts().map((e) => row(e.kind === 'advance' ? '👤' : '⛽', 'a', aed(e.amount) + ' · ' + e.kind, (e.person || '') + (e.reason ? ' · ' + esc(e.reason) : ''), e.time)).join('') : emptyRow('No cash out logged.')}</div>
      <button class="btn primary full" data-act="logCashOut">＋ Log cash out (expense / advance)</button>`;
  },
  acash() {
    const flags = S.cashFlags();
    return `
      <div class="mkpis">
        ${kpi('Cash in hand (Haris)', aed(S.harisCashInHand()), 'green')}
        ${kpi('Driver holding', aed(S.driverHolding()), S.driverHolding() > 0 ? 'amber' : 'green')}
        ${kpi('Shortages flagged', flags.length, flags.length ? 'red' : 'green')}
        ${kpi('Cash out total', aed(S.cashOuts().reduce((s, e) => s + e.amount, 0)))}
      </div>
      <div class="sect">⚠ Flagged cash variances (same-day)</div>
      <div class="card">${flags.length ? flags.map((e) => row('⚠', 'r', (e.variance < 0 ? 'Short ' : 'Over ') + aed(Math.abs(e.variance)), e.by + ' → ' + e.to + ' · declared ' + aed(e.declared) + (e.reason ? ' · ' + esc(e.reason) : ' · no reason given'), e.time)).join('') : emptyRow('No cash variances — all reconciled.')}</div>
      <div class="sect">Cash out log (expenses &amp; advances)</div>
      <div class="card">${S.cashOuts().length ? S.cashOuts().map((e) => row(e.kind === 'advance' ? '👤' : '⛽', 'a', aed(e.amount) + ' · ' + e.kind, (e.person || '') + (e.reason ? ' · ' + esc(e.reason) : ''), e.time)).join('') : emptyRow('No cash out logged.')}</div>`;
  },

  // ---------------- WAREHOUSE ----------------
  stock() {
    const low = S.lowStock().length;
    const value = S.state.products.reduce((s, p) => s + p.stock * p.cost, 0);
    return `<div class="mkpis">${kpi('Products', S.state.products.length, 'accent')}${kpi('Stock value', aed(value))}${kpi('Below reorder', low, low ? 'amber' : 'green')}${kpi('Total cartons', S.state.products.reduce((s, p) => s + p.stock, 0))}</div>
      <div class="sect">Stock levels</div>
      <div class="card">${S.state.products.slice(0, 80).map((p) => `<div class="li"><div class="ic ${p.stock <= 40 ? 'a' : 'g'}">${p.stock}</div><div class="m"><b>${p.name}</b><span>${p.unit} · reorder 40</span></div><div class="end"><button class="btn sm" data-act="adjust" data-id="${p.id}">Adjust</button></div></div>`).join('')}</div>
      <button class="btn primary full" data-act="receive">⬇ Receive stock (GRN)</button>`;
  },
  moves() {
    const mv = S.stockMoves();
    const sumAbs = (t) => mv.filter((m) => m.type === t).reduce((s, m) => s + Math.abs(m.qty), 0);
    const icon = { in: '⬇', out: '⬆', adjust: '✎' };
    return `
      <div class="mkpis">
        ${kpi('Received (in)', sumAbs('in'), 'green')}
        ${kpi('Sold / out', sumAbs('out'), 'accent')}
        ${kpi('Adjustments', sumAbs('adjust'), 'amber')}
        ${kpi('Movements', mv.length)}
      </div>
      <div class="card pad" style="margin-bottom:13px"><b style="font-size:13.5px">⇅ Stock movement ledger</b><div class="muted" style="font-size:12px;margin-top:4px">Every carton in and out — goods received, sales, and adjustments (damage / expiry / stocktake). Ready to sync to Zoho Inventory.</div></div>
      <div class="sect">Recent movements</div>
      <div class="card">${mv.length ? mv.slice(0, 80).map((m) => `<div class="li"><div class="ic ${m.type === 'in' ? 'g' : m.type === 'out' ? '' : 'a'}">${icon[m.type] || '•'}</div><div class="m"><b>${m.name}</b><span>${esc(m.reason)} · ${m.by} · ${m.time}</span></div><div class="end" style="font-weight:700;color:${m.qty >= 0 ? 'var(--green)' : 'var(--red)'}">${m.qty >= 0 ? '+' : ''}${m.qty}</div></div>`).join('') : emptyRow('No stock movements yet — receive or sell to see the ledger fill.')}</div>`;
  },
  dispatch() {
    if (!onlineLoaded) return loadingCard('Loading orders…');
    const q = onlineByStatus(['CONFIRMED', 'PACKED']);
    const waiting = onlineByStatus(['PLACED']).length;
    return `
      <div class="card pad" style="margin-bottom:13px"><b style="font-size:13.5px">📦 Orders to pack</b><div class="muted" style="font-size:12px;margin:4px 0 10px">Confirmed orders from the website &amp; WhatsApp. Pack each one, then hand it to the driver. Tap for details.</div><button class="btn sm" data-act="refreshOnline">↻ Refresh</button></div>
      ${waiting ? `<div class="muted" style="font-size:12px;margin-bottom:8px">${waiting} order(s) still awaiting sales confirmation.</div>` : ''}
      <div class="sect">To pack (${q.length})</div>
      ${q.length ? q.map((o) => orderCard(o, 'dispatch')).join('') : emptyRow('Nothing to pack right now. Sales-confirmed orders appear here.')}`;
  },
  receive() {
    return `<div class="sect">Recent receipts</div>
      <div class="card">${S.state.grns.length ? S.state.grns.map((g) => { const p = S.product(g.pid); return row('⬇', 'g', p ? p.name : '—', 'GRN ' + g.id + ' · ' + g.time, '+' + g.qty); }).join('') : emptyRow('No goods received yet.')}</div>
      <button class="btn primary full" data-act="receive">⬇ Record goods received</button>`;
  },

  // ---------------- PURCHASE ----------------
  replenish() {
    const f = S.forecast();
    const critical = f.filter((x) => x.status === 'critical');
    const toReorder = f.filter((x) => x.recommend > 0);
    const orderValue = toReorder.reduce((s, x) => s + x.recommend * x.cost, 0);
    const badge = { critical: ['red', 'Critical'], warn: ['amber', 'Reorder soon'], ok: ['green', 'OK'] };
    return `
      <div class="mkpis">
        ${kpi('Stock-out risk', critical.length, critical.length ? 'red' : 'green')}
        ${kpi('To reorder', toReorder.length, toReorder.length ? 'amber' : 'green')}
        ${kpi('Suggested spend', aed(orderValue), 'accent')}
        ${kpi('SKUs tracked', f.length)}
      </div>
      <div class="card pad" style="margin-bottom:13px">
        <b style="font-size:13.5px">🤖 AI demand forecast</b>
        <div class="muted" style="font-size:12px;margin:4px 0 12px">Based on sales velocity &amp; supplier lead time. Reorder before you run dry.</div>
        <button class="btn primary full" data-act="autoReplenish">Auto-draft ${toReorder.length} requisition${toReorder.length === 1 ? '' : 's'}</button>
      </div>
      <div class="sect">By urgency</div>
      <div class="card">${f.slice(0, 80).map((x) => {
      const [c, label] = badge[x.status];
      const days = x.cover >= 999 ? '∞' : x.cover + 'd';
      return `<div class="li"><div class="ic ${x.status === 'critical' ? 'r' : x.status === 'warn' ? 'a' : 'g'}">${x.stock}</div>
        <div class="m"><b>${x.name}</b><span>${x.velocity}/day · ${days} cover · lead ${x.leadDays}d · <span class="tag ${c}">${label}</span></span>
        ${x.recommend > 0 ? `<div class="btn-row"><button class="btn primary sm" data-act="draftReq" data-id="${x.id}">Reorder ${x.recommend}</button></div>` : ''}</div></div>`;
    }).join('')}</div>`;
  },
  pstock() {
    const low = S.lowStock();
    return `<div class="mkpis">${kpi('Below reorder', low.length, low.length ? 'amber' : 'green')}${kpi('Open POs', S.state.pos.length, 'accent')}${kpi('Requisitions', S.state.requisitions.length)}${kpi('Products', S.state.products.length)}</div>
      <div class="sect">Stock checking</div>
      <div class="card">${S.state.products.slice(0, 80).map((p) => `<div class="li"><div class="ic ${p.stock <= 40 ? 'a' : 'g'}">${p.stock}</div><div class="m"><b>${p.name}</b><span>reorder 40 · cost ${aed(p.cost)}</span></div><div class="end">${p.stock <= 40 ? `<button class="btn primary sm" data-act="raiseReq" data-id="${p.id}">Requisition</button>` : '<span class="tag green">OK</span>'}</div></div>`).join('')}</div>`;
  },
  reqs() {
    return `<div class="sect">Requisitions (${S.state.requisitions.length})</div>
      <div class="card">${S.state.requisitions.length ? S.state.requisitions.map((r) => row('⇄', 'p', r.name, r.id + ' · qty ' + r.qty, '<span class="tag amber">' + r.status + '</span>')).join('') : emptyRow('No requisitions. Raise one from Stock.')}</div>`;
  },
  bills() {
    const bills = S.state.bills || [];
    return `<div class="sect">Purchase bills</div>
      <div class="card pad" style="margin-bottom:13px">
        <b style="font-size:13.5px">📷 Snap a supplier bill</b>
        <div class="muted" style="font-size:12px;margin:4px 0 12px">Claude reads it, matches your Zoho vendors &amp; items, then records the bill.</div>
        <button class="btn primary full" data-act="addBill">＋ Add bill from photo</button>
      </div>
      <div class="sect">Recorded (${bills.length})</div>
      <div class="card">${bills.length ? bills.map((b) => row('🧾', b.zoho ? 'g' : 'a', b.supplierName + ' · ' + b.invoiceNumber, b.lineItems.length + ' lines · ' + b.time + (b.zoho ? ' · in Zoho' : ' · local'), aed(b.total))).join('') : emptyRow('No bills yet — add one from a photo.')}</div>`;
  },
  pos() {
    return `<div class="sect">Purchase orders (${S.state.pos.length})</div>
      <div class="card">${S.state.pos.length ? S.state.pos.map((p) => row(p.id.replace('PO-', '#'), 'a', p.supplier, p.id + ' · ' + p.name + ' ×' + p.qty, aed(p.total) + '<br><span class="tag blue">' + p.status + '</span>')).join('') : emptyRow('No POs yet.')}</div>
      <button class="btn primary full" data-act="newPo">＋ New purchase order</button>`;
  },

  // ---------------- FINANCE ----------------
  fhome() {
    const ar = S.state.orders.filter((o) => o.status !== 'DELIVERED').reduce((s, o) => s + o.total, 0);
    const collected = S.state.payments.reduce((s, p) => s + p.amount, 0);
    const bounced = S.state.payments.filter((p) => p.status === 'BOUNCED').length;
    return `<div class="mkpis">${kpi('Collected', aed(collected), 'green')}${kpi('Outstanding A/R', aed(ar), 'accent')}${kpi('Bounced', bounced, bounced ? 'red' : 'green')}${kpi('Approvals', S.pendingApprovals().length, 'amber')}</div>
      <div class="sect">EOD submissions</div>
      <div class="card">${S.state.eod.length ? S.state.eod.map((e) => row('▰', 'g', 'Driver EOD ' + e.time, e.delivered + ' delivered', aed(e.cash + e.cheque))).join('') : emptyRow('No EOD submitted yet.')}</div>`;
  },
  cheques() {
    const ch = S.state.payments.filter((p) => p.method === 'CHEQUE_ON_DELIVERY');
    return `<div class="sect">Cheque control</div>
      <div class="card">${ch.length ? ch.map((p) => { const c = S.customer(p.customerId); const acts = p.status === 'PENDING' ? `<div class="btn-row"><button class="btn green sm" data-act="cheque" data-id="${p.id}" data-ok="1">Cleared</button><button class="btn danger sm" data-act="cheque" data-id="${p.id}" data-ok="0">Bounced</button></div>` : `<span class="tag ${p.status === 'BOUNCED' ? 'red' : 'green'}">${p.status}</span>`; return `<div class="li"><div class="ic ${p.status === 'BOUNCED' ? 'r' : 'g'}">▤</div><div class="m"><b>${c ? c.name : '—'}</b><span>${aed(p.amount)}${p.bounceCharge ? ' · +AED 250 charge' : ''}</span>${acts}</div></div>`; }).join('') : emptyRow('No cheques collected yet.')}</div>`;
  },
  collections() {
    const list = S.collections();
    const total = list.reduce((s, x) => s + x.outstanding, 0);
    return `
      <div class="mkpis">
        ${kpi('Outstanding', aed(total), 'red')}
        ${kpi('Accounts', list.length, list.length ? 'amber' : 'green')}
        ${kpi('On hold', S.state.customers.filter((c) => c.onHold).length)}
        ${kpi('Bounced', S.state.payments.filter((p) => p.status === 'BOUNCED').length)}
      </div>
      <div class="card pad" style="margin-bottom:13px"><b style="font-size:13.5px">🤖 Collections assistant</b>
        <div class="muted" style="font-size:12px;margin-top:4px">Drafts payment reminders and tracks recovery on your receivables.</div></div>
      <div class="sect">Receivables &amp; recovery</div>
      <div class="card">${list.length ? list.map((x) => `<div class="li"><div class="ic ${x.onHold ? 'r' : 'a'}">${x.name.slice(0, 2).toUpperCase()}</div>
        <div class="m"><b>${x.name}</b><span>${aed(x.outstanding)} · ${x.items.slice(0, 2).join(', ')}${x.onHold ? ' · ON HOLD' : ''}</span>
        <div class="btn-row"><button class="btn primary sm" data-act="draftReminder" data-id="${x.id}">Draft reminder</button>${x.onHold ? `<button class="btn green sm" data-act="recover" data-id="${x.id}">Mark recovered</button>` : ''}</div></div></div>`).join('') : emptyRow('No outstanding receivables — all collected.')}</div>`;
  },
  assets() {
    const reg = S.assetRegister(); const t = S.assetTotals();
    return `
      <div class="mkpis">
        ${kpi('Asset cost', aed(t.cost))}
        ${kpi('Book value', aed(t.bookValue), 'green')}
        ${kpi('Monthly dep.', aed(t.monthlyDep), 'amber')}
        ${kpi('Assets', t.count)}
      </div>
      <div class="card pad" style="margin-bottom:13px"><b style="font-size:13.5px">🏢 Fixed asset register</b><div class="muted" style="font-size:12px;margin-top:4px">Straight-line depreciation. Monthly depreciation posts to Accounting; net book value feeds the balance sheet.</div></div>
      <div class="sect">Assets</div>
      <div class="card">${reg.length ? reg.map((a) => row('🏢', 'a', a.name, a.category + ' · cost ' + aed(a.cost) + ' · dep ' + aed(a.monthly) + '/mo · ' + a.months + 'mo', aed(a.bookValue) + '<br><button class="btn sm" data-act="removeAsset" data-id="' + a.id + '" style="margin-top:5px">Remove</button>')).join('') : emptyRow('No assets registered.')}</div>
      <button class="btn primary full" data-act="addAsset">＋ Register an asset</button>`;
  },
  fapprovals() { return approvalsView(); },

  // ---------------- CUSTOMER PORTAL ----------------
  shop() {
    const prods = S.state.products.filter((p) => p.price > 0);
    const total = Object.keys(shopCart).reduce((s, id) => { const p = S.product(id); return s + (p ? p.price * shopCart[id] : 0); }, 0);
    const count = Object.values(shopCart).reduce((s, n) => s + n, 0);
    return `
      <div class="sect">Browse catalog</div>
      <div class="card">${prods.slice(0, 80).map((p) => `<div class="li"><div class="ic ${p.stock > 0 ? '' : 'r'}">${shopCart[p.id] || 0}</div>
        <div class="m"><b>${p.name}</b><span>${aed(p.price)} · ${p.unit} · ${p.stock > 0 ? 'in stock' : 'out of stock'}</span>
        ${p.stock > 0 ? `<div class="btn-row"><button class="btn sm" data-act="shopDec" data-id="${p.id}">−</button><button class="btn sm primary" data-act="shopInc" data-id="${p.id}">＋ Add</button></div>` : ''}</div></div>`).join('')}</div>
      <div class="card pad">
        <div class="seg"><button class="${shopMethod === 'CASH_ON_DELIVERY' ? 'on' : ''}" data-act="shopMethod" data-m="CASH_ON_DELIVERY">Cash on delivery</button><button class="${shopMethod === 'CHEQUE_ON_DELIVERY' ? 'on' : ''}" data-act="shopMethod" data-m="CHEQUE_ON_DELIVERY">Cheque</button></div>
        <div class="li" style="border:none"><div class="m"><b>Cart · ${count} item${count === 1 ? '' : 's'}</b></div><div class="end" style="font-size:17px;font-weight:700">${aed(total)}</div></div>
        <button class="btn primary full" data-act="shopOrder"${count ? '' : ' style="opacity:.5"'}>Place order</button>
      </div>
      <p class="muted" style="font-size:11.5px;text-align:center;margin-top:8px">Tip: tap ✦ and say “order 10 Coca Cola 2 Litre and 5 7Up”.</p>`;
  },
  myorders() {
    const cid = curCustomerId();
    const os = S.state.orders.filter((o) => o.customerId === cid);
    const track = { PLACED: 'Order received', CONFIRMED: 'Confirmed', PACKED: 'Packed — preparing dispatch', OUT_FOR_DELIVERY: 'Out for delivery 🚚', DELIVERED: 'Delivered ✓', FAILED: 'Delivery failed', CANCELLED: 'Cancelled' };
    return `<div class="sect">My orders (${os.length})</div>
      <div class="card">${os.length ? os.map((o) => `<div class="li"><div class="ic ${o.status === 'DELIVERED' ? 'g' : o.status === 'OUT_FOR_DELIVERY' ? 'p' : 'a'}">${o.id.replace('SO-', '#')}</div>
        <div class="m"><b>${o.id} · ${aed(o.total)}</b><span>${track[o.status] || o.status} · ${o.items.length} item(s)</span></div>
        <div class="end">${statusTag(o.status)}</div></div>`).join('') : emptyRow('No orders yet — start shopping.')}</div>`;
  },
  payments() {
    const cid = curCustomerId(); const invs = S.customerInvoices(cid); const c = window.curCustomer();
    const outstanding = invs.filter((i) => i.status === 'outstanding').reduce((s, i) => s + i.amount, 0);
    return `
      <div class="mkpis">
        ${kpi('Outstanding', aed(outstanding), outstanding ? 'amber' : 'green')}
        ${kpi('Credit limit', aed(c ? c.credit : 0))}
        ${kpi('Credit period', (c ? c.creditDays : 0) + ' days')}
        ${kpi('Invoices', invs.length)}
      </div>
      <div class="sect">Invoices &amp; payment status</div>
      <div class="card">${invs.length ? invs.map((i) => row(i.status === 'paid' ? '✓' : '＄', i.status === 'paid' ? 'g' : 'a', i.no, i.orderId, aed(i.amount) + '<br>' + (i.status === 'paid' ? '<span class="tag green">Paid</span>' : '<span class="tag amber">Due</span>'))).join('') : emptyRow('No invoices yet.')}</div>`;
  },
  profile() {
    const c = window.curCustomer();
    if (!c) return emptyRow('No account selected.');
    const loc = c.lat != null ? c.lat.toFixed(4) + ', ' + c.lng.toFixed(4) : 'Not set';
    return `
      <div class="card pad" style="text-align:center;margin-bottom:14px">
        <div style="width:54px;height:54px;border-radius:50%;background:var(--purple);color:#fff;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700;margin:0 auto 10px">${c.name.slice(0, 2).toUpperCase()}</div>
        <b style="font-size:16px">${c.name}</b>
        <div class="muted" style="font-size:12.5px">${c.category} account · ${c.onHold ? '<span style="color:var(--red)">On hold</span>' : 'Active'}</div>
      </div>
      <div class="sect">Business details</div>
      <div class="card">
        ${row('🏢', 'p', 'Business name', c.name, '')}
        ${row('🏷', 'a', 'Customer category', c.category, '')}
        ${row('📞', 'g', 'Contact', c.phone || '—', '')}
      </div>
      <div class="sect">Credit terms</div>
      <div class="card">
        ${row('💳', 'a', 'Credit limit', aed(c.credit), '')}
        ${row('📅', 'a', 'Credit period', c.creditDays + ' days', '')}
        ${row('⚖', c.onHold ? 'r' : 'g', 'Account status', c.onHold ? 'On hold' : 'Active', '')}
      </div>
      <div class="sect">Delivery address</div>
      <div class="card">${row('📍', 'g', c.addressLine || 'Primary delivery location', loc, '')}</div>
      <div class="btn-row"><button class="btn" data-act="editProfile">Edit details</button><button class="btn" data-act="updateCustLoc">📍 Update location</button></div>
      <button class="btn full" data-act="settings" style="margin-top:10px">⚙ Account settings</button>`;
  },
  support() {
    const cid = curCustomerId(); const ts = S.ticketsFor(cid);
    const faq = [['When do you deliver?', 'Same or next day within your delivery zone.'], ['Payment methods?', 'Cash or cheque on delivery, against your agreed credit terms.'], ['Wrong or short delivery?', 'Raise a ticket here — we credit or redeliver.']];
    return `
      <div class="sect">My tickets</div>
      <div class="card">${ts.length ? ts.map((t) => `<div class="li"><div class="ic ${t.status === 'resolved' ? 'g' : 'a'}">🎧</div><div class="m"><b>${t.subject}</b><span>${t.id} · ${t.status}${t.replies.length ? ' · ' + t.replies.length + ' reply' : ''}</span>${t.replies.length ? `<div class="muted" style="font-size:12px;margin-top:4px">↳ ${esc(t.replies[t.replies.length - 1].text)}</div>` : ''}</div></div>`).join('') : emptyRow('No tickets — raise one below if you need help.')}</div>
      <button class="btn primary full" data-act="newTicket">＋ Raise a support ticket</button>
      <div class="sect">FAQ</div>
      <div class="card">${faq.map(([q, a]) => `<div class="li"><div class="m"><b>${q}</b><span>${a}</span></div></div>`).join('')}</div>`;
  },
  queue() {
    const open = S.openTickets();
    return `
      <div class="mkpis">${kpi('Open tickets', open.length, open.length ? 'amber' : 'green')}${kpi('Resolved', (S.state.tickets || []).filter((t) => t.status === 'resolved').length, 'green')}</div>
      <div class="sect">Open tickets</div>
      <div class="card">${open.length ? open.map((t) => `<div class="li"><div class="ic ${t.type === 'refund' ? 'r' : 'a'}">🎧</div><div class="m"><b>${esc(t.customerName)} — ${esc(t.subject)}</b><span>${esc(t.id)} · ${esc(t.type)} · ${esc(t.status)}</span><div class="muted" style="font-size:12px;margin-top:3px">${esc(t.body)}</div>${t.replies.length ? `<div class="muted" style="font-size:12px;margin-top:3px">↳ ${esc(t.replies[t.replies.length - 1].text)}</div>` : ''}<div class="btn-row"><button class="btn primary sm" data-act="reply" data-id="${t.id}">Reply</button><button class="btn green sm" data-act="closeTicket" data-id="${t.id}">Resolve</button></div></div></div>`).join('') : emptyRow('No open tickets — all clear.')}</div>`;
  },
  resolved() {
    const r = (S.state.tickets || []).filter((t) => t.status === 'resolved');
    return `<div class="sect">Resolved (${r.length})</div><div class="card">${r.length ? r.map((t) => row('✓', 'g', esc(t.customerName) + ' — ' + esc(t.subject), esc(t.id), '')).join('') : emptyRow('Nothing resolved yet.')}</div>`;
  },

  // ---------------- ADMIN / SUPER ADMIN ----------------
  ahome() {
    const orders = S.state.orders;
    const rev = orders.filter((o) => o.status !== 'CANCELLED').reduce((s, o) => s + o.total, 0);
    const delivered = orders.filter((o) => o.status === 'DELIVERED').length;
    const inPipe = orders.filter((o) => ['PLACED', 'CONFIRMED', 'PACKED', 'OUT_FOR_DELIVERY'].includes(o.status)).length;
    const collected = S.state.payments.reduce((s, p) => s + p.amount, 0);
    const ar = orders.filter((o) => ['PLACED', 'CONFIRMED', 'PACKED', 'OUT_FOR_DELIVERY'].includes(o.status)).reduce((s, o) => s + o.total, 0);
    const onHold = S.state.customers.filter((c) => c.onHold).length;
    const bounced = S.state.payments.filter((p) => p.status === 'BOUNCED').length;
    const priceIssues = S.state.products.filter((p) => !p.price || !p.cost || p.price < p.cost).length;
    const pend = S.pendingApprovals().length;
    return `
      <div class="mkpis">
        ${kpi('Revenue', aed(rev), 'green')}
        ${kpi('Collected', aed(collected), 'accent')}
        ${kpi('Outstanding A/R', aed(ar))}
        ${kpi('Orders in pipeline', inPipe)}
      </div>
      <div class="sect">Needs attention</div>
      <div class="card">
        ${row('✓', pend ? 'a' : 'g', pend + ' pending approvals', 'across all departments', pend ? '<button class="btn primary sm" data-act="tab" data-id="approvals">Review</button>' : '<span class="tag green">Clear</span>')}
        ${row('⏸', onHold ? 'r' : 'g', onHold + ' accounts on hold', 'bounced cheque recovery', onHold ? '<button class="btn sm" data-act="tab" data-id="acustomers">Manage</button>' : '<span class="tag green">None</span>')}
        ${row('%', priceIssues ? 'a' : 'g', priceIssues + ' pricing issues', 'below cost / missing price', priceIssues ? '<button class="btn sm" data-act="tab" data-id="astock">Fix</button>' : '<span class="tag green">OK</span>')}
        ${row('▤', S.lowStock().length ? 'a' : 'g', S.lowStock().length + ' items below reorder', 'replenishment needed', '')}
        ${(() => { const rn = S.renewalsDue().filter((r) => r.tier === 'expired' || r.tier === '30').length; return row('⏰', rn ? 'r' : 'g', rn + ' documents expiring soon', 'visas, IDs & vehicle papers', rn ? '<button class="btn sm" data-act="tab" data-id="renewals">Review</button>' : '<span class="tag green">OK</span>'); })()}
      </div>
      <div class="sect">Business at a glance</div>
      <div class="card">
        ${row('▣', 'a', orders.length + ' orders', delivered + ' delivered · ' + bounced + ' bounced cheques', '')}
        ${row('◍', 'g', S.state.customers.filter((c) => c.status === 'ACTIVE').length + ' active customers', S.state.customers.filter((c) => c.status === 'PENDING').length + ' pending', '')}
        ${row('⇄', 'p', S.state.pos.length + ' purchase orders', S.state.requisitions.length + ' requisitions', '')}
      </div>`;
  },
  aorders() {
    const orders = S.state.orders;
    const advanceLabel = { PLACED: 'Confirm', CONFIRMED: 'Pack', PACKED: 'Dispatch', OUT_FOR_DELIVERY: 'Mark delivered' };
    return `<div class="sect">All orders (${orders.length}) · override</div>
      <div class="card">${orders.length ? orders.map((o) => {
      const c = S.customer(o.customerId);
      const canAdvance = advanceLabel[o.status];
      const canCancel = !['DELIVERED', 'CANCELLED'].includes(o.status);
      return `<div class="li"><div class="ic a">${o.id.replace('SO-', '#')}</div><div class="m"><b>${c ? c.name : '—'}</b><span>${o.id} · ${aed(o.total)} · ${o.method === 'CASH_ON_DELIVERY' ? 'Cash' : 'Cheque'}</span>
        <div style="margin-top:4px">${statusTag(o.status)}</div>
        <div class="btn-row">${canAdvance ? `<button class="btn primary sm" data-act="advanceOrder" data-id="${o.id}">${canAdvance}</button>` : ''}${canCancel ? `<button class="btn danger sm" data-act="cancelOrder" data-id="${o.id}">Cancel</button>` : ''}</div></div></div>`;
    }).join('') : emptyRow('No orders yet.')}</div>`;
  },
  acustomers() {
    return `<div class="sect">Customers (${S.state.customers.length}) · manage</div>
      <div class="card">${S.state.customers.length ? S.state.customers.map((c) => {
      const out = S.state.orders.filter((o) => o.customerId === c.id && o.status !== 'DELIVERED' && o.status !== 'CANCELLED').reduce((s, o) => s + o.total, 0);
      const act = c.status === 'PENDING'
        ? `<button class="btn green sm" data-act="approveCustomer" data-id="${c.id}">Approve</button>`
        : c.onHold ? `<button class="btn green sm" data-act="release" data-id="${c.id}">Release hold</button>`
          : `<button class="btn danger sm" data-act="hold" data-id="${c.id}">Hold</button>`;
      return `<div class="li"><div class="ic ${c.onHold ? 'r' : 'g'}">${c.name.slice(0, 2).toUpperCase()}</div><div class="m"><b>${c.name}</b><span>${c.category} · A/R ${aed(out)} · credit ${aed(c.credit)}</span>
        <div class="btn-row">${c.onHold ? '<span class="tag red" style="align-self:center">On hold</span>' : statusTag(c.status)} ${act}</div></div></div>`;
    }).join('') : emptyRow('No customers yet.')}</div>`;
  },
  astock() {
    const cls = (p) => (!p.price ? ['missing', 'No sale price'] : !p.cost ? ['missing', 'No cost'] : p.price < p.cost ? ['loss', 'Below cost'] : ['ok', 'Healthy']);
    return `<div class="sect">Catalog &amp; pricing health</div>
      <div class="card">${S.state.products.slice(0, 80).map((p) => {
      const [k, label] = cls(p);
      const margin = p.price && p.cost ? (p.price - p.cost).toFixed(2) : '—';
      const tagc = k === 'ok' ? 'green' : k === 'loss' ? 'red' : 'amber';
      return `<div class="li"><div class="ic ${p.stock <= 40 ? 'a' : 'g'}">${p.stock}</div><div class="m"><b>${p.name}</b><span>${aed(p.price)} · margin ${margin} · <span class="tag ${tagc}">${label}</span></span></div><div class="end"><button class="btn sm" data-act="adjust" data-id="${p.id}">Stock</button></div></div>`;
    }).join('')}</div>`;
  },
  approvals() {
    const n = S.pendingApprovals().length;
    return (n > 1 ? `<button class="btn primary full" data-act="approveAll" style="margin-bottom:6px">Approve all ${n}</button>` : '') + approvalsView();
  },
};

function approvalsView() {
  const items = S.pendingApprovals();
  return `<div class="sect">Pending approvals (${items.length})</div>
    <div class="card">${items.length ? items.map((a) => `<div class="li"><div class="ic p">!</div><div class="m"><b>${a.label}</b><span>${a.type.toLowerCase()}</span><div class="btn-row"><button class="btn green sm" data-act="approve" data-id="${a.id}">Approve</button><button class="btn danger sm" data-act="reject" data-id="${a.id}">Reject</button></div></div></div>`).join('') : emptyRow('All clear — nothing pending.')}</div>`;
}
function emptyRow(msg) { return `<div class="empty"><div class="ei">◌</div>${msg}</div>`; }
function sum(method) { return S.state.payments.filter((p) => p.method === method).reduce((s, p) => s + p.amount, 0); }

// -------- bill capture: backend API + offline fallback --------
const API = localStorage.getItem('ntbf_api') || ((location.protocol.startsWith('http') && location.port !== '8080') ? location.origin : 'http://localhost:3000');
function authHeaders(extra) {
  const tok = localStorage.getItem('ntbf_token');
  // Signed-in staff already hold a JWT; send it so the gated endpoints (bill
  // capture, Muhammed) authorize via the staff session — no shared secret needed.
  const staffTok = localStorage.getItem('ntbf_stafftoken');
  return Object.assign(
    { 'content-type': 'application/json' },
    tok ? { 'x-api-key': tok } : {},
    staffTok ? { authorization: 'Bearer ' + staffTok } : {},
    extra || {},
  );
}
// Logged-in-staff headers (used for reading customer online orders + updating their status).
function staffHeaders(extra) {
  const t = localStorage.getItem('ntbf_stafftoken');
  return Object.assign({ 'content-type': 'application/json' }, t ? { 'authorization': 'Bearer ' + t } : {}, extra || {});
}
async function apiPost(path, body) {
  const r = await fetch(API + path, { method: 'POST', headers: authHeaders(), body: JSON.stringify(body) });
  if (!r.ok) throw new Error('http ' + r.status);
  return r.json();
}
// Order status workflow (shared with the customer portal).
const ORDER_FLOW = ['PLACED', 'CONFIRMED', 'PACKED', 'OUT_FOR_DELIVERY', 'DELIVERED'];
const ORDER_NEXT_ACTION = { PLACED: 'Confirm order', CONFIRMED: 'Mark preparing', PACKED: 'Out for delivery', OUT_FOR_DELIVERY: 'Mark delivered' };
function nextOrderStatus(s) { const i = ORDER_FLOW.indexOf(s); return i >= 0 && i < ORDER_FLOW.length - 1 ? ORDER_FLOW[i + 1] : null; }
async function loadOnlineOrders() {
  try {
    const r = await fetch(API + '/api/portal/orders/all', { headers: staffHeaders(), cache: 'no-store' });
    onlineOrders = r.ok ? await r.json() : [];
  } catch (e) { onlineOrders = []; }
  onlineLoaded = true;
  if ((ONLINE_TABS[role] || []).indexOf(tab) >= 0) render();
}
// ---- shared helpers for the real online-order queue (app + WhatsApp) ----
function srcBadge(o) { return o && o.source === 'whatsapp' ? '<span class="tag green">WhatsApp</span>' : '<span class="tag blue">App</span>'; }
function reviewNote(o) {
  if (!o || !o.needsReview) return '';
  const r = (o.reviewReasons && o.reviewReasons.length) ? ': ' + o.reviewReasons.map(esc).join('; ') : '';
  return `<div class="muted" style="font-size:11.5px;color:var(--amber);margin-top:4px">⚠ Needs review${r}</div>`;
}
function onlineByStatus(sts) { return onlineOrders.filter((o) => sts.indexOf(o.status) >= 0); }
function orderLinesText(o) { return (o.items || []).map((l) => esc((l.qty || 1) + '× ' + (l.name || '') + (l.unmatched ? ' ⚠' : ''))).join(', '); }
function isCash(o) { return (o.method || 'CASH_ON_DELIVERY') === 'CASH_ON_DELIVERY'; }
function collectedAmount(o) { return o.collected && o.collected.amount != null ? Number(o.collected.amount) : Number(o.total) || 0; }
function codTotal(list) { return list.filter(isCash).reduce((s, o) => s + (Number(o.total) || 0), 0); }
function loadingCard(t) { return `<div class="card">${emptyRow(t)}</div>`; }
function onlineById(id) { return onlineOrders.find((o) => o.id === id); }
// Timestamps in UAE time (Asia/Dubai), 24h.
function uaeTime(iso) { if (!iso) return ''; try { return new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Dubai', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }); } catch (e) { return ''; } }
// Aging signal (additive): a PLACED order waiting more than 60 minutes gets a visible
// "waiting" tag — amber past 1h, red past 3h — computed from the order's createdAt.
function agingTag(o) {
  if (!o || o.status !== 'PLACED' || !o.createdAt) return '';
  const mins = Math.floor((Date.now() - new Date(o.createdAt).getTime()) / 60000);
  if (!isFinite(mins) || mins <= 60) return '';
  const h = Math.floor(mins / 60), m = mins % 60;
  const label = h >= 1 ? h + 'h' + (m ? ' ' + m + 'm' : '') : m + 'm';
  return `<div style="margin-top:6px"><span class="tag ${mins > 180 ? 'red' : 'amber'}">⏱ waiting ${label}</span></div>`;
}
const STATUS_LABEL = { PLACED: 'Order placed', CONFIRMED: 'Confirmed', PACKED: 'Packed', OUT_FOR_DELIVERY: 'Out for delivery', DELIVERED: 'Delivered', CANCELLED: 'Cancelled', FAILED: 'Failed' };
function statusLabel(s) { return STATUS_LABEL[s] || s; }
function phoneDigits(p) { return String(p || '').replace(/[^0-9]/g, ''); }
function waLink(p) { const d = phoneDigits(p); return d ? 'https://wa.me/' + d : ''; }
function telLink(p) { const d = phoneDigits(p); return d ? 'tel:+' + d : ''; }
// Actions the CURRENT role may take on an order — mirrors the server rules so no dead buttons.
function nextActionsFor(o) {
  const isAdmin = role === 'admin';
  const can = (roles) => isAdmin || roles.indexOf(role) >= 0;
  const s = o.status; const out = [];
  if (o.needsReview) {
    if (can(['salesman'])) out.push({ act: 'oResolve', label: 'Resolve review', cls: 'primary' });
  } else {
    if (s === 'PLACED' && can(['salesman'])) out.push({ status: 'CONFIRMED', label: 'Confirm order', cls: 'primary' });
    if (s === 'CONFIRMED' && can(['warehouse'])) out.push({ status: 'PACKED', label: 'Mark packed', cls: 'primary' });
    if (s === 'PACKED' && can(['warehouse', 'driver'])) out.push({ status: 'OUT_FOR_DELIVERY', label: 'Hand to driver', cls: 'primary' });
    if (s === 'OUT_FOR_DELIVERY' && can(['driver'])) out.push({ act: 'deliverOrder', label: 'Delivered + cash', cls: 'green' });
  }
  const beforePacked = s === 'PLACED' || s === 'CONFIRMED';
  if ((beforePacked && can(['salesman'])) || (isAdmin && s !== 'DELIVERED' && s !== 'CANCELLED')) out.push({ act: 'oCancel', label: 'Cancel', cls: 'danger' });
  return out;
}
function actionButtons(o, size) {
  const sz = size ? ' sm' : '';
  return nextActionsFor(o).map((a) => a.status
    ? `<button class="btn ${a.cls}${sz}" data-act="setOrderStatus" data-id="${esc(o.id)}" data-status="${a.status}">${a.label}</button>`
    : `<button class="btn ${a.cls}${sz}" data-act="${a.act}" data-id="${esc(o.id)}">${a.label}</button>`).join('');
}
// One consistent order card, used across every role's queue. mode 'route' adds address + navigate.
function orderCard(o, mode) {
  const btns = actionButtons(o, true);
  const nav = mode === 'route' && o.address ? `<button class="btn sm" data-act="navAddr" data-addr="${esc(o.address)}">Navigate</button>` : '';
  const meta = mode === 'route' ? ` · ${isCash(o) ? 'Cash' : 'Cheque'}${o.customerPhone ? ' · ' + esc(o.customerPhone) : ''}` : '';
  const addr = mode === 'route'
    ? (o.address ? `<div class="muted" style="font-size:12px;margin-top:6px">📍 ${esc(o.address)}</div>` : '<div class="muted" style="font-size:12px;margin-top:6px;color:var(--amber)">⚠ No address on file</div>')
    : '';
  return `<div class="card pad" style="margin-bottom:10px;cursor:pointer" data-act="openOrder" data-id="${esc(o.id)}">
    <div class="li" style="padding:0"><div class="m"><b>${esc(o.customerName || '—')} ${srcBadge(o)}</b><span>${esc(o.id)} · ${aed(o.total)} · ${(o.items || []).length} line(s)${meta}</span></div><div class="end">${statusTag(o.status)}</div></div>
    <div class="muted" style="font-size:12px;margin-top:6px">${orderLinesText(o)}</div>
    ${addr}${agingTag(o)}${reviewNote(o)}
    ${(nav || btns) ? `<div class="btn-row" style="margin-top:10px">${nav}${btns}</div>` : ''}
  </div>`;
}
function timelineHtml(o) {
  const h = o.statusHistory || [];
  if (!h.length) return '';
  return `<div class="sect">Status timeline</div><div class="card">${h.map((e) => `<div class="li" style="padding:8px 13px"><div class="ic ${e.to === 'DELIVERED' ? 'g' : e.to === 'CANCELLED' ? 'r' : 'a'}">${e.note ? '✔' : '•'}</div><div class="m"><b>${e.note ? esc(e.note.charAt(0).toUpperCase() + e.note.slice(1)) : esc(statusLabel(e.to))}</b><span>${esc(e.by || '')}${e.role ? ' (' + esc(e.role) + ')' : ''}${e.override ? ' · override' : ''} · ${uaeTime(e.at)}</span></div></div>`).join('')}</div>`;
}
function orderDetailsHtml(o) {
  const itemRows = (o.items || []).map((it) => {
    const line = (Number(it.price) || 0) * (Number(it.qty) || 0);
    return `<div class="li"><div class="m"><b>${esc(it.name || '')}${it.unmatched ? ' <span class="tag red">unmatched</span>' : ''}</b><span>${it.qty} × ${aed(it.price)}${it.unit ? ' · ' + esc(it.unit) : ''}</span></div><div class="end">${aed(line)}</div></div>`;
  }).join('');
  const phoneRow = o.customerPhone
    ? `<div class="btn-row" style="margin-top:8px"><a class="btn sm" href="${waLink(o.customerPhone)}" target="_blank" rel="noopener">💬 WhatsApp</a><a class="btn sm" href="${telLink(o.customerPhone)}">📞 Call</a></div><div class="muted" style="font-size:12px;margin-top:4px">${esc(o.customerPhone)}</div>`
    : '';
  const review = o.needsReview
    ? `<div class="card pad" style="background:var(--amber-bg);border-color:transparent;margin-top:12px"><b style="color:var(--amber);font-size:12.5px">⚠ Needs review before confirming</b><ul style="margin:6px 0 0 16px;font-size:12px;color:var(--amber)">${(o.reviewReasons || []).map((r) => '<li>' + esc(r) + '</li>').join('')}</ul></div>` : '';
  const collected = o.collected
    ? `<div class="card pad" style="margin-top:12px"><div class="li" style="padding:0"><div class="m"><b>Cash collected</b><span>${o.collected.method === 'CASH_ON_DELIVERY' ? 'Cash' : 'Cheque'}${o.collected.by ? ' · by ' + esc(o.collected.by) : ''} · ${uaeTime(o.collected.at)}</span></div><div class="end"><b>${aed(o.collected.amount)}</b></div></div></div>` : '';
  const btns = actionButtons(o, false);
  return `
    <div style="margin-bottom:10px">${statusTag(o.status)} ${srcBadge(o)}${o.needsReview ? ' <span class="tag amber">review</span>' : ''}</div>
    <div class="card pad">
      <div><b>${esc(o.customerName || '—')}</b></div>
      ${phoneRow}
      <div class="muted" style="font-size:12px;margin-top:8px">📍 ${o.address ? esc(o.address) : '<span style="color:var(--amber)">No address on file</span>'}</div>
    </div>
    ${review}
    <div class="sect">Items</div>
    <div class="card">${itemRows}<div class="li"><div class="m"><b>Total</b></div><div class="end"><b>${aed(o.total)}</b></div></div></div>
    ${collected}
    ${timelineHtml(o)}
    ${btns ? `<div class="btn-row" style="margin-top:14px">${btns}</div>` : ''}`;
}
async function postStatus(id, status, extra) {
  const r = await fetch(API + '/api/portal/orders/status', { method: 'POST', headers: staffHeaders(), body: JSON.stringify(Object.assign({ id, status }, extra || {})) });
  if (!r.ok) { let m = 'Update failed'; try { m = (await r.json()).message || m; } catch (e) { /* ignore */ } throw new Error(m); }
  return r.json();
}
function simTokens(a, b) {
  const n = (s) => (s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  const A = new Set(n(a)), B = new Set(n(b)); if (!A.size || !B.size) return 0;
  let i = 0; A.forEach((t) => { if (B.has(t)) i++; });
  return Math.round((i / (A.size + B.size - i)) * 100) / 100;
}
// Demo extraction when the backend / Claude key isn't available.
function mockExtract() {
  const picks = S.state.products.slice(2, 5);
  const lines = picks.map((p) => { const qty = 50 + Math.round(p.stock / 10); return { description: p.name, quantity: qty, unitPrice: p.cost, amount: round(qty * p.cost) }; });
  const subtotal = round(lines.reduce((s, l) => s + l.amount, 0));
  const tax = round(subtotal * 0.05);
  return { supplierName: 'Gulf Beverages Trading', invoiceNumber: 'GBT-' + (4000 + (S.state.bills.length || 0)), invoiceDate: new Date().toISOString().slice(0, 10), currency: 'AED', subtotal, taxAmount: tax, total: round(subtotal + tax), lineItems: lines, _demo: true };
}
function localMatch(bill) {
  const suppliers = ['Gulf Beverages Trading', 'Emirates Cola Distributors', 'Al Ain Drinks Supply'];
  let sName = null, sConf = 0; suppliers.forEach((s) => { const c = simTokens(bill.supplierName, s); if (c > sConf) { sConf = c; sName = s; } });
  if (bill.supplierName && sConf < 0.34) { sName = null; }
  const lines = bill.lineItems.map((l) => {
    let best = 0, id = null, nm = null;
    S.state.products.forEach((p) => { const c = simTokens(l.description, p.name); if (c > best) { best = c; id = p.id; nm = p.name; } });
    return { description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, amount: l.amount, matchedItemId: best >= 0.34 ? id : null, matchedName: best >= 0.34 ? nm : null, confidence: best };
  });
  return { supplier: { name: bill.supplierName, matchedId: sName ? 'demo' : null, matchedName: sName, confidence: sConf }, lines };
}
let billDraft = {};
function confTag(c) { const k = c >= 0.6 ? 'green' : c >= 0.34 ? 'amber' : 'red'; return `<span class="tag ${k}">${Math.round(c * 100)}%</span>`; }

// -------- delivery route: geo distance + nearest-first ordering --------
function haversine(a, b) {
  const R = 6371, toR = (x) => x * Math.PI / 180;
  const dLat = toR(b.lat - a.lat), dLng = toR(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
function orderRoute(start, stops) {
  const rem = stops.slice(), seq = []; let cur = start;
  while (rem.length) {
    let bi = 0, bd = Infinity;
    rem.forEach((s, i) => { const d = haversine(cur, s); if (d < bd) { bd = d; bi = i; } });
    const n = rem.splice(bi, 1)[0]; n._dist = bd; seq.push(n); cur = n;
  }
  return seq;
}
let _map = null;
function mountMaps() { if (role === 'driver' && tab === 'route' && document.getElementById('map')) mountRouteMap(); }
function mountRouteMap() {
  const el = document.getElementById('map');
  if (!el || typeof L === 'undefined' || !window._routeData) return;
  if (_map) { _map.remove(); _map = null; }
  const { dl, seq } = window._routeData;
  _map = L.map(el, { zoomControl: false, attributionControl: false }).setView([dl.lat, dl.lng], 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(_map);
  const pts = [[dl.lat, dl.lng]];
  const mk = (cls, txt) => L.divIcon({ className: '', html: `<div class="mk ${cls}">${txt}</div>`, iconSize: [26, 26], iconAnchor: [13, 13] });
  L.marker([dl.lat, dl.lng], { icon: mk('depot', 'D') }).addTo(_map).bindPopup(dl.name);
  seq.forEach((x, i) => {
    pts.push([x.lat, x.lng]);
    L.marker([x.lat, x.lng], { icon: mk('', i + 1) }).addTo(_map).bindPopup(`#${i + 1} ${x.name}<br>${aed(x.o.total)}`);
  });
  if (pts.length > 1) {
    L.polyline(pts, { color: '#1f6feb', weight: 3, opacity: 0.7, dashArray: '6 6' }).addTo(_map);
    _map.fitBounds(pts, { padding: [28, 28] });
  }
  setTimeout(() => { if (_map) _map.invalidateSize(); }, 200);
}

// ---------------- forms ----------------
function newCustomerForm() {
  openSheet('New customer', `
    <label class="fld"><span class="lab">Business name</span><input id="f_name" placeholder="Green Grocers LLC" /></label>
    <label class="fld"><span class="lab">Category (sets pricing)</span><select id="f_cat">
      <option>SUPERMARKET_GROCERY</option><option>RESTAURANT</option><option>VAN_SALE</option><option>WAREHOUSE_SALE</option><option selected>RETAIL</option><option>WHOLESALE</option></select></label>
    <label class="fld"><span class="lab">Requested credit limit (AED)</span><input id="f_credit" type="number" value="5000" /></label>
    <label class="fld"><span class="lab">Credit period (days)</span><input id="f_days" type="number" value="30" /></label>
    <div class="card pad" style="margin-bottom:13px"><b style="font-size:12.5px">📍 GPS captured at site</b><div class="muted" style="font-size:11.5px" id="f_gps">Capturing…</div></div>
    <button class="btn primary full" data-act="saveCustomer">Submit for Sales Admin approval</button>`,
    () => { captureGps('f_gps'); });
}
function newOrderForm() {
  const active = S.state.customers.filter((c) => c.status === 'ACTIVE' && !c.onHold);
  if (!active.length) { toast('No active customers — add & approve one first'); return; }
  cart = {};
  openSheet('New order', `
    <label class="fld"><span class="lab">Customer</span><select id="o_cust">${active.map((c) => `<option value="${c.id}">${c.name}</option>`).join('')}</select></label>
    <div class="seg" id="o_method"><button class="on" data-m="CASH_ON_DELIVERY">Cash on delivery</button><button data-m="CHEQUE_ON_DELIVERY">Cheque</button></div>
    <span class="lab" style="font-size:12px;color:var(--muted);font-weight:600">Products</span>
    <div id="o_items">${S.state.products.slice(0, 80).map((p) => `<div class="qty"><div class="m"><b>${p.name}</b><span>${aed(p.price)} · stock ${p.stock}</span></div><div class="ctl"><button data-step="-" data-id="${p.id}">−</button><b id="q_${p.id}">0</b><button data-step="+" data-id="${p.id}">+</button></div></div>`).join('')}</div>
    <div class="li" style="border:none"><div class="m"><b>Total</b></div><div class="end" style="font-size:17px;font-weight:700" id="o_total">AED 0.00</div></div>
    <button class="btn primary full" data-act="saveOrder">Place order</button>`,
    (sh) => {
      sh.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => {
        const id = b.dataset.id, p = S.product(id); cart[id] = cart[id] || 0;
        cart[id] += b.dataset.step === '+' ? 1 : -1;
        if (cart[id] < 0) cart[id] = 0;
        if (cart[id] > p.stock) { cart[id] = p.stock; toast('Only ' + p.stock + ' in stock'); }
        sh.querySelector('#q_' + id).textContent = cart[id];
        let tot = 0; for (const k in cart) tot += S.product(k).price * cart[k];
        sh.querySelector('#o_total').textContent = aed(tot);
      }));
      sh.querySelectorAll('#o_method button').forEach((b) => b.addEventListener('click', () => {
        sh.querySelectorAll('#o_method button').forEach((x) => x.classList.remove('on')); b.classList.add('on');
      }));
    });
}
function checkinForm() {
  openSheet('Check in visit', `
    <label class="fld"><span class="lab">Customer</span><select id="v_cust">${custOptions(false)}</select></label>
    <label class="fld"><span class="lab">Outcome / note</span><input id="v_note" placeholder="Order placed / follow up" /></label>
    <div class="card pad" style="margin-bottom:13px"><b style="font-size:12.5px">📍 GPS</b><div class="muted" style="font-size:11.5px" id="v_gps">Capturing…</div></div>
    <button class="btn primary full" data-act="saveVisit">Check in</button>`, () => captureGps('v_gps'));
}
function specialPriceForm() {
  // With no active customers the select would submit an empty id and the store
  // would crash resolving the customer — guard like newOrderForm does.
  if (!S.state.customers.some((c) => c.status === 'ACTIVE')) { toast('No active customers — add & approve one first'); return; }
  openSheet('Special price request', `
    <label class="fld"><span class="lab">Customer</span><select id="sp_cust">${custOptions(true)}</select></label>
    <label class="fld"><span class="lab">Product</span><select id="sp_prod">${S.state.products.map((p) => `<option value="${p.id}">${p.name} (std ${aed(p.price)})</option>`).join('')}</select></label>
    <label class="fld"><span class="lab">Requested price (AED)</span><input id="sp_price" type="number" /></label>
    <button class="btn primary full" data-act="saveSpecial">Submit for approval</button>`);
}
function deliverForm(orderId) {
  const o = S.order(orderId); const c = S.customer(o.customerId);
  openSheet('Deliver — ' + (c ? c.name : ''), `
    <div class="card pad" style="margin-bottom:13px"><b>${o.id}</b><div class="muted" style="font-size:12px">${o.items.length} lines · ${aed(o.total)}</div></div>
    <div class="seg" id="d_method"><button class="on" data-m="CASH_ON_DELIVERY">Cash</button><button data-m="CHEQUE_ON_DELIVERY">Cheque</button></div>
    <label class="fld"><span class="lab">Amount collected (AED)</span><input id="d_amt" type="number" value="${o.total}" /></label>
    <label class="fld" id="d_chqwrap" style="display:none"><span class="lab">Cheque number</span><input id="d_chq" placeholder="CHQ-00000" /></label>
    <button class="btn green full" data-act="saveDeliver" data-id="${orderId}">Mark delivered & collect</button>`,
    (sh) => {
      sh.querySelectorAll('#d_method button').forEach((b) => b.addEventListener('click', () => {
        sh.querySelectorAll('#d_method button').forEach((x) => x.classList.remove('on')); b.classList.add('on');
        sh.querySelector('#d_chqwrap').style.display = b.dataset.m === 'CHEQUE_ON_DELIVERY' ? 'block' : 'none';
      }));
    });
}
function failForm(orderId) {
  openSheet('Mark failed', `
    <label class="fld"><span class="lab">Reason (required)</span><select id="x_reason">
      <option>customer_unavailable</option><option>premises_closed</option><option>order_refused</option><option>address_issue</option><option>other</option></select></label>
    <button class="btn danger full" data-act="saveFail" data-id="${orderId}">Confirm failed</button>`);
}
function adjustForm(pid) {
  const p = S.product(pid);
  openSheet('Adjust — ' + p.name, `
    <div class="muted" style="font-size:12.5px;margin-bottom:10px">On hand: <b>${p.stock}</b> ${p.unit}</div>
    <label class="fld"><span class="lab">Change (+ add / − remove)</span><input id="aj_delta" type="number" value="0" /></label>
    <label class="fld"><span class="lab">Reason</span><select id="aj_reason"><option>stocktake correction</option><option>damage</option><option>expiry</option><option>manual adjustment</option></select></label>
    <button class="btn primary full" data-act="saveAdjust" data-id="${pid}">Apply adjustment</button>`);
}
function receiveForm() {
  openSheet('Receive goods (GRN)', `
    <label class="fld"><span class="lab">Product</span><select id="r_prod">${S.state.products.map((p) => `<option value="${p.id}">${p.name}</option>`).join('')}</select></label>
    <label class="fld"><span class="lab">Quantity received (cartons)</span><input id="r_qty" type="number" value="50" /></label>
    <button class="btn primary full" data-act="saveReceive">Accept into stock</button>`);
}
function poForm() {
  openSheet('New purchase order', `
    <label class="fld"><span class="lab">Supplier</span><select id="po_sup"><option>Gulf Beverages Trading</option><option>Emirates Cola Distributors</option><option>Al Ain Drinks Supply</option></select></label>
    <label class="fld"><span class="lab">Product</span><select id="po_prod">${S.state.products.map((p) => `<option value="${p.id}">${p.name}</option>`).join('')}</select></label>
    <label class="fld"><span class="lab">Quantity</span><input id="po_qty" type="number" value="100" /></label>
    <label class="fld"><span class="lab">Unit price (AED)</span><input id="po_price" type="number" value="24" /></label>
    <button class="btn primary full" data-act="savePo">Create & send PO</button>`);
}
function reqForm(pid) {
  const p = S.product(pid);
  openSheet('Raise requisition', `
    <div class="muted" style="font-size:12.5px;margin-bottom:10px">${p.name} · on hand ${p.stock}</div>
    <label class="fld"><span class="lab">Quantity needed</span><input id="rq_qty" type="number" value="100" /></label>
    <button class="btn primary full" data-act="saveReq" data-id="${pid}">Submit to Purchase Admin</button>`);
}
function captureGps(elId) {
  const el = document.getElementById(elId); if (!el) return;
  if (!navigator.geolocation) { el.textContent = '25.4052, 55.5136 (Ajman, default)'; el._lat = 25.4052; el._lng = 55.5136; return; }
  navigator.geolocation.getCurrentPosition(
    (pos) => { el._lat = pos.coords.latitude; el._lng = pos.coords.longitude; el.textContent = el._lat.toFixed(4) + ', ' + el._lng.toFixed(4); },
    () => { el.textContent = '25.4052, 55.5136 (Ajman, default)'; el._lat = 25.4052; el._lng = 55.5136; });
}

function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

// Shrink a phone photo before upload. Camera images are often 3-8MB, which
// bloats the request and can exceed Claude's per-image size cap. Cap the longest
// edge at maxDim and re-encode as JPEG. If the browser can't process it via
// canvas (rare), fall back to the original file so capture still works.
// Resolves to { dataUrl, mediaType }, or null if the file can't be read at all.
function downscaleImage(file, maxDim = 1600, quality = 0.8) {
  return new Promise((resolve) => {
    const rd = new FileReader();
    rd.onload = () => {
      const dataUrl = rd.result;
      const fallback = { dataUrl, mediaType: file.type || 'image/jpeg' };
      const img = new Image();
      img.onload = () => {
        try {
          const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
          if (scale >= 1) { resolve(fallback); return; } // already small enough
          const cv = document.createElement('canvas');
          cv.width = Math.round(img.width * scale);
          cv.height = Math.round(img.height * scale);
          cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
          resolve({ dataUrl: cv.toDataURL('image/jpeg', quality), mediaType: 'image/jpeg' });
        } catch (e) { resolve(fallback); }
      };
      img.onerror = () => resolve(fallback);
      img.src = dataUrl;
    };
    rd.onerror = () => resolve(null);
    rd.readAsDataURL(file);
  });
}

function addBillForm() {
  openSheet('Add purchase bill', `
    <div class="muted" style="font-size:12.5px;margin-bottom:12px">Take or attach a photo of the supplier bill.</div>
    <input type="file" id="bill_file" accept="image/*" capture="environment" style="margin-bottom:12px" />
    <div id="bill_preview"></div>
    <button class="btn primary full" data-act="extractBill" style="margin-top:10px">⚡ Extract with Claude</button>
    <p class="muted" style="font-size:11.5px;margin-top:10px">A clear, flat photo reads best. Without an API key it runs a demo extraction.</p>`,
    (sh) => {
      const f = sh.querySelector('#bill_file');
      f.addEventListener('change', async () => {
        const file = f.files[0]; if (!file) return;
        const shot = await downscaleImage(file);
        if (!shot) return;
        billDraft = { imageData: shot.dataUrl, mediaType: shot.mediaType };
        sh.querySelector('#bill_preview').innerHTML = `<img src="${shot.dataUrl}" style="width:100%;border-radius:10px;border:1px solid var(--line)" />`;
      });
    });
}
// --- editable bill line items (Part A) ---
// Working copy while the purchaser edits the review table; written back into
// billDraft.extracted.lineItems (with recomputed totals) on "Match with Zoho".
let billLineRows = [];
function billLineTotal(r) { return round((+r.quantity || 0) * (+r.unitPrice || 0)); } // excl. VAT
function billTotals() {
  let sub = 0, vat = 0;
  billLineRows.forEach((r) => { const lt = billLineTotal(r); sub += lt; vat += lt * (+r.taxPercent || 0) / 100; });
  sub = round(sub); vat = round(vat);
  return { subtotal: sub, taxAmount: vat, total: round(sub + vat) };
}
// Read the current input values back into billLineRows (before add/delete or match).
function syncBillLines() {
  document.querySelectorAll('#bill_lines .blrow').forEach((el, i) => {
    const r = billLineRows[i]; if (!r) return;
    r.description = el.querySelector('.bl_desc').value;
    r.quantity = +el.querySelector('.bl_qty').value || 0;
    r.unitPrice = +el.querySelector('.bl_rate').value || 0;
    r.taxPercent = +el.querySelector('.bl_tax').value || 0;
  });
}
function billRowHtml(r, i) {
  return `<div class="blrow card pad" style="margin-bottom:8px" data-i="${i}">
    <div style="display:flex;gap:8px;align-items:flex-start">
      <input class="bl_desc" style="flex:1" value="${esc(r.description)}" placeholder="Description" />
      <button class="x" data-act="delBillLine" data-i="${i}" title="Remove line">✕</button>
    </div>
    <div style="display:flex;gap:8px;margin-top:8px">
      <label style="flex:1"><span class="lab" style="font-size:11px">Qty</span><input class="bl_qty" type="number" inputmode="decimal" value="${r.quantity}" /></label>
      <label style="flex:1"><span class="lab" style="font-size:11px">Rate</span><input class="bl_rate" type="number" inputmode="decimal" value="${r.unitPrice}" /></label>
      <label style="flex:1"><span class="lab" style="font-size:11px">VAT %</span><input class="bl_tax" type="number" inputmode="decimal" value="${r.taxPercent}" /></label>
    </div>
    <div class="muted" style="text-align:right;font-size:12px;margin-top:6px">Line total (excl. VAT): <b style="color:var(--ink)" class="bl_lt">${aed(billLineTotal(r))}</b></div>
  </div>`;
}
function renderBillTotals() {
  const el = document.getElementById('bill_totals'); if (!el) return;
  const t = billTotals();
  el.innerHTML = `<div style="display:flex;justify-content:space-between"><span class="muted">Subtotal (excl. VAT)</span><b>${aed(t.subtotal)}</b></div>
    <div style="display:flex;justify-content:space-between;margin-top:4px"><span class="muted">VAT</span><b>${aed(t.taxAmount)}</b></div>
    <div style="display:flex;justify-content:space-between;margin-top:6px;border-top:1px solid var(--line);padding-top:6px"><b>Total (incl. VAT)</b><b>${aed(t.total)}</b></div>`;
}
// Update per-row line totals + the totals card in place (keeps input focus).
function updateBillLineTotals() {
  document.querySelectorAll('#bill_lines .blrow').forEach((el, i) => {
    const r = billLineRows[i]; if (!r) return;
    const lt = el.querySelector('.bl_lt'); if (lt) lt.textContent = aed(billLineTotal(r));
  });
  renderBillTotals();
}
function renderBillLines() {
  const host = document.getElementById('bill_lines'); if (!host) return;
  host.innerHTML = billLineRows.map((r, i) => billRowHtml(r, i)).join('');
  renderBillTotals();
}
function reviewBillForm() {
  const b = billDraft.extracted;
  // Seed the editable rows; default VAT to 5% when the bill didn't specify one.
  billLineRows = (b.lineItems || []).map((l) => ({
    description: l.description || '',
    quantity: +l.quantity || 0,
    unitPrice: +l.unitPrice || 0,
    taxPercent: l.taxPercent != null ? +l.taxPercent : 5,
  }));
  openSheet('Review extracted bill', `
    ${b._demo ? '<div class="card pad" style="background:var(--amber-bg);border-color:transparent;margin-bottom:12px"><b style="color:var(--amber);font-size:12.5px">Demo extraction</b><div class="muted" style="font-size:11.5px">Backend/Claude key not detected — sample values shown. Connect the API for real OCR.</div></div>' : '<div class="card pad" style="background:var(--green-bg);border-color:transparent;margin-bottom:12px"><b style="color:var(--green);font-size:12.5px">✓ Read by Claude</b></div>'}
    <label class="fld"><span class="lab">Supplier</span><input id="b_sup" value="${esc(b.supplierName)}" /></label>
    <label class="fld"><span class="lab">Invoice no</span><input id="b_inv" value="${esc(b.invoiceNumber)}" /></label>
    <label class="fld"><span class="lab">Date</span><input id="b_date" value="${esc(b.invoiceDate)}" /></label>
    <div style="display:flex;justify-content:space-between;align-items:center;margin:8px 0 4px">
      <span class="lab" style="font-size:12px;color:var(--muted);font-weight:600">Line items</span>
      <button class="btn sm" data-act="addBillLine">+ Add line</button>
    </div>
    <div id="bill_lines"></div>
    <div id="bill_totals" class="card pad" style="margin-top:4px"></div>
    <button class="btn primary full" data-act="matchBill" style="margin-top:12px">Match with Zoho →</button>`,
    () => {
      renderBillLines();
      const host = document.getElementById('bill_lines');
      if (host) host.addEventListener('input', () => { syncBillLines(); updateBillLineTotals(); });
    });
}
function matchReviewForm() {
  const b = billDraft.extracted, m = billDraft.match;
  const sup = m.supplier.matchedName ? `${esc(m.supplier.matchedName)} ${confTag(m.supplier.confidence)}` : '<span class="muted">no match — a new vendor will be created</span>';
  openSheet('Match &amp; record', `
    <span class="lab" style="font-size:12px;color:var(--muted);font-weight:600">Supplier</span>
    <div class="card"><div class="li"><div class="ic ${m.supplier.matchedName ? 'g' : 'a'}">${m.supplier.matchedName ? '✓' : '+'}</div><div class="m"><b>${esc(b.supplierName)}</b><span>${sup}</span></div></div></div>
    <span class="lab" style="font-size:12px;color:var(--muted);font-weight:600">Line items → Zoho items</span>
    <div class="card">${m.lines.map((l) => `<div class="li"><div class="ic ${l.matchedItemId ? 'g' : 'a'}">${l.matchedItemId ? '✓' : '?'}</div><div class="m"><b>${esc(l.description)}</b><span>${l.matchedName ? '→ ' + esc(l.matchedName) : 'no match — kept as text'}</span></div><div class="end">${confTag(l.confidence)}</div></div>`).join('')}</div>
    <div class="li" style="border:none"><div class="m"><b>Total</b></div><div class="end" style="font-weight:700">${aed(b.total)}</div></div>
    <button class="btn green full" data-act="recordBill">Record bill in Zoho</button>`);
}

function reminderForm(cid) {
  const c = S.customer(cid); const col = S.collections().find((x) => x.id === cid) || { outstanding: 0 };
  const msg = `Dear ${c.name},\n\nThis is a friendly reminder from National Trading regarding your outstanding balance of ${aed(col.outstanding)}.${c.onHold ? ' Your account is currently on hold pending cheque recovery.' : ''}\n\nKindly arrange payment at your earliest convenience. Please ignore this message if payment has already been made.\n\nThank you for your business,\nNational Trading Accounts · Ajman, UAE`;
  openSheet('Payment reminder — ' + c.name, `
    <textarea id="rm_text" rows="9" style="resize:vertical">${esc(msg)}</textarea>
    <div class="btn-row" style="margin-top:10px"><button class="btn" data-act="copyReminder">Copy</button><button class="btn primary" data-act="sentReminder" data-id="${cid}">Mark sent</button></div>`);
}
function settingsForm() {
  const api = localStorage.getItem('ntbf_api') || ((location.protocol.startsWith('http') && location.port !== '8080') ? location.origin : 'http://localhost:3000');
  const custOpts = S.state.customers.map((c) => `<option value="${c.id}" ${c.id === curCustomerId() ? 'selected' : ''}>${c.name}</option>`).join('');
  const isAdmin = staff && staff.roles && staff.roles.indexOf('admin') >= 0;
  openSheet('Settings', `
    ${staff ? `<div class="card pad" style="margin-bottom:14px">
      <div style="font-size:12px;color:var(--muted)">Signed in as</div>
      <div style="font-size:16px;font-weight:800;margin:2px 0 2px">${esc(staff.name)} <span class="muted" style="font-weight:500;font-size:12px">@${esc(staff.username || '')}</span></div>
      <div style="font-size:12px;color:var(--muted)">Roles: ${esc((staff.roles || []).join(', '))}</div>
      <div class="btn-row" style="margin-top:12px">
        <button class="btn" data-act="changePwForm">Change password</button>
        ${isAdmin ? '<button class="btn" data-act="teamForm">Manage team</button>' : ''}
      </div>
      <div class="btn-row" style="margin-top:9px">
        <button class="btn" data-act="myExpensesSheet">My expenses</button>
        <button class="btn" data-act="myAdvancesSheet">My advances</button>
      </div>
      <div class="btn-row" style="margin-top:9px">
        <button class="btn" data-act="rcptCollectSheet">Record a receipt</button>
        ${(isAdmin || (staff.roles || []).indexOf('finance') >= 0) ? '<button class="btn" data-act="rcptQueueSheet">Receipt approvals</button>' : ''}
      </div>
      <div class="btn-row" style="margin-top:9px">
        <button class="btn" data-act="trfAdd">Pay a colleague</button>
        <button class="btn" data-act="trfMineSheet">My transfers</button>
      </div>
      ${isAdmin ? `<div class="btn-row" style="margin-top:9px">
        <button class="btn" data-act="admExpenses">Expense approvals</button>
        <button class="btn" data-act="admAdvances">Advances (admin)</button>
      </div>` : ''}
      <div class="btn-row" style="margin-top:9px">
        <button class="btn" data-act="sugForm">💡 Suggest an improvement</button>
        <button class="btn" data-act="sugMineSheet">My ideas</button>
      </div>
      ${isAdmin ? `<div class="btn-row" style="margin-top:9px">
        <button class="btn" data-act="admSuggestions">Suggestions (admin)</button>
      </div>
      <div class="btn-row" style="margin-top:9px">
        <button class="btn danger" data-act="clearTestDataForm">Clear test data (admin)</button>
      </div>
      <div class="btn-row" style="margin-top:9px">
        <button class="btn" data-act="julyImportForm">Import July history (admin)</button>
      </div>` : ''}
      <button class="btn danger full" data-act="staffLogout" style="margin-top:9px">Sign out</button>
    </div>` : ''}
    <div class="sect" style="margin-top:4px">Advanced</div>
    <label class="fld"><span class="lab">Backend API URL</span><input id="set_api" value="${esc(api)}" /></label>
    <label class="fld"><span class="lab">API access token (if the server requires one)</span><input id="set_token" placeholder="x-api-key" value="${esc(localStorage.getItem('ntbf_token') || '')}" /></label>
    ${role === 'customer' ? `<label class="fld"><span class="lab">Shopping as</span><select id="set_cust">${custOpts}</select></label>` : ''}
    <button class="btn primary full" data-act="saveSettings">Save</button>
    <div class="btn-row" style="margin-top:14px"><button class="btn danger" data-act="resetAll">Reset all data</button></div>
    <p class="muted" style="font-size:11.5px;margin-top:12px">Backend: <span id="set_stat">checking…</span></p>`,
    (sh) => { fetch(api + '/api/agent/status').then((r) => r.json()).then((s) => { sh.querySelector('#set_stat').textContent = s.configured ? 'online · AI live' : 'online · local AI mode'; }).catch(() => { sh.querySelector('#set_stat').textContent = 'offline (apps run locally)'; }); });
}

function changePwForm() {
  openSheet('Change my password', `
    <label class="fld"><span class="lab">Current password</span><input id="cp_old" type="password" /></label>
    <label class="fld"><span class="lab">New password</span><input id="cp_new" type="password" placeholder="At least 4 characters" /></label>
    <label class="fld"><span class="lab">Confirm new password</span><input id="cp_confirm" type="password" /></label>
    <button class="btn primary full" data-act="saveChangePw">Update password</button>`);
}
const ROLE_OPTS = [
  ['salesman', 'Salesman'], ['driver', 'Driver'], ['warehouse', 'Warehouse'], ['purchase', 'Purchase'],
  ['finance', 'Finance'], ['service', 'Customer Service'], ['admin', 'Management (admin)'],
];
async function teamForm() {
  openSheet('Manage team', '<div class="empty"><div class="ei">👥</div>Loading team…</div>');
  let team = [];
  try { team = await staffApi('/api/staff/team', 'GET'); } catch (e) { toast(e.message); }
  const rows = team.map((s) => `<div class="li">
    <div class="ic g">${esc((s.name || '?').slice(0, 1).toUpperCase())}</div>
    <div class="m"><b>${esc(s.name)} <span class="muted" style="font-weight:500">@${esc(s.username)}</span></b><span>${esc((s.roles || []).join(', '))}</span></div>
    <div class="end"><button class="btn sm" data-act="resetStaffPw" data-id="${s.id}">Reset PW</button>${s.roles && s.roles.indexOf('admin') >= 0 ? '' : ` <button class="btn sm danger" data-act="removeStaff" data-id="${s.id}">✕</button>`}</div>
  </div>`).join('');
  openSheet('Manage team', `
    <div class="card" style="margin-bottom:12px">${rows || '<div class="empty">No staff yet.</div>'}</div>
    <button class="btn primary full" data-act="addStaffForm">+ Add staff member</button>`);
}
function addStaffForm() {
  openSheet('Add staff member', `
    <label class="fld"><span class="lab">Full name</span><input id="ns_name" placeholder="e.g. Rashid Ali" /></label>
    <label class="fld"><span class="lab">Username (for login)</span><input id="ns_user" autocapitalize="none" placeholder="e.g. rashid" /></label>
    <label class="fld"><span class="lab">Temporary password</span><input id="ns_pass" placeholder="At least 4 characters" /></label>
    <div class="lab" style="font-size:12px;color:var(--muted);font-weight:600;margin-bottom:6px">Roles (tap to select)</div>
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px">
      ${ROLE_OPTS.map(([r, l]) => `<button type="button" class="btn sm ns_role" data-act="toggleNsRole" data-r="${r}">${l}</button>`).join('')}
    </div>
    <button class="btn primary full" data-act="saveStaff">Create account</button>
    <p class="muted" style="font-size:11.5px;margin-top:10px">Give the staff their username and temporary password. They can change it after signing in.</p>`);
}
function assetForm() {
  openSheet('Register an asset', `
    <label class="fld"><span class="lab">Asset name</span><input id="as_name" placeholder="e.g. Delivery van" /></label>
    <label class="fld"><span class="lab">Category</span><select id="as_cat"><option>Vehicle</option><option>Equipment</option><option>Devices</option><option>Furniture</option><option>Other</option></select></label>
    <label class="fld"><span class="lab">Purchase cost (AED)</span><input id="as_cost" type="number" /></label>
    <label class="fld"><span class="lab">Salvage value (AED)</span><input id="as_salvage" type="number" value="0" /></label>
    <label class="fld"><span class="lab">Purchase date</span><input id="as_date" type="date" /></label>
    <label class="fld"><span class="lab">Useful life (years)</span><input id="as_life" type="number" value="5" /></label>
    <button class="btn primary full" data-act="saveAsset">Register</button>`);
}
function renewalForm() {
  openSheet('Add document / renewal', `
    <label class="fld"><span class="lab">Type</span><select id="rn_kind">${Object.entries(RENEWAL_KINDS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}</select></label>
    <label class="fld"><span class="lab">Holder (person or vehicle)</span><input id="rn_holder" placeholder="e.g. Tahir / Van DXB-4471" /></label>
    <label class="fld"><span class="lab">Expiry date</span><input id="rn_expiry" type="date" /></label>
    <button class="btn primary full" data-act="saveRenewal">Save</button>`);
}
function renewItemForm(id) {
  const r = (S.state.renewals || []).find((x) => x.id === id);
  openSheet('Renew — ' + (r ? r.holder : ''), `
    <div class="muted" style="font-size:12.5px;margin-bottom:10px">Current expiry: ${r ? r.expiry : ''}</div>
    <label class="fld"><span class="lab">New expiry date</span><input id="rn_new" type="date" /></label>
    <button class="btn green full" data-act="saveRenew" data-id="${id}">Update expiry</button>`);
}
function captureForm(type) {
  const cfg = DOC_TYPES[type];
  capDraft = { type, image: null };
  openSheet(cfg.label, `
    <div class="muted" style="font-size:12.5px;margin-bottom:10px">Photograph the document, then check the details below.</div>
    <input type="file" id="cap_file" accept="image/*" capture="environment" style="margin-bottom:10px" />
    <div id="cap_preview"></div>
    ${cfg.extract ? `<button class="btn full" data-act="extractCapture" style="margin:8px 0">⚡ Extract with Claude</button>` : ''}
    ${cfg.fields.map((f) => `<label class="fld"><span class="lab">${f.label}</span><input id="cap_${f.key}" /></label>`).join('')}
    <button class="btn primary full" data-act="reviewCapture">Review &amp; prepare for Zoho</button>`,
    (sh) => {
      sh.querySelector('#cap_file').addEventListener('change', async function () {
        const file = this.files[0]; if (!file) return;
        const shot = await downscaleImage(file);
        if (!shot) return;
        capDraft.image = shot.dataUrl; capDraft.mediaType = shot.mediaType;
        sh.querySelector('#cap_preview').innerHTML = `<img src="${shot.dataUrl}" style="width:100%;border-radius:10px;border:1px solid var(--line)" />`;
      });
    });
}
function confirmCaptureForm() {
  const cfg = DOC_TYPES[capDraft.type]; const f = capDraft.fields;
  openSheet('Confirm before Zoho', `
    <div class="card pad" style="background:var(--amber-bg);border-color:transparent;margin-bottom:12px"><b style="color:var(--amber);font-size:12px">🔒 Test mode — review only</b><div class="muted" style="font-size:11px;color:var(--amber)">Prepared, not posted, until Asif confirms.</div></div>
    ${capDraft.image ? `<img src="${capDraft.image}" style="width:100%;border-radius:10px;border:1px solid var(--line);margin-bottom:12px" />` : ''}
    <div class="card">${cfg.fields.map((x) => row('•', 'a', x.label, esc(f[x.key] || '—'), '')).join('')}</div>
    <div class="card pad" style="margin:12px 0"><div class="muted" style="font-size:12px">Will post to Zoho as</div><b>${cfg.zoho}</b></div>
    <button class="btn primary full" data-act="saveCapture">Prepare for Zoho</button>`);
}
function viewDocForm(id) {
  const d = (S.state.documents || []).find((x) => x.id === id); if (!d) return;
  const cfg = DOC_TYPES[d.type] || { fields: [] };
  openSheet(d.title, `
    ${d.image ? `<img src="${d.image}" style="width:100%;border-radius:10px;border:1px solid var(--line);margin-bottom:12px" />` : ''}
    <div class="card">${cfg.fields.map((x) => row('•', 'a', x.label, esc((d.fields || {})[x.key] || '—'), '')).join('')}</div>
    <div class="card pad" style="margin-top:12px"><div class="muted" style="font-size:12px">Target</div><b>${d.zoho}</b></div>
    <button class="btn green full" data-act="postDoc" data-id="${id}" style="margin-top:12px">Confirm &amp; post to Zoho</button>`);
}
function handoverForm() {
  const expected = S.driverHolding();
  openSheet('Hand cash to Haris', `
    <div class="card pad" style="margin-bottom:12px"><div class="muted" style="font-size:12.5px">Expected (cash collected, not yet handed)</div><b style="font-size:18px">${aed(expected)}</b></div>
    <label class="fld"><span class="lab">Amount you're handing over (AED)</span><input id="ho_amt" type="number" value="${expected}" /></label>
    <label class="fld"><span class="lab">Reason if different (shortage / expense taken)</span><input id="ho_reason" placeholder="e.g. AED 50 kept for fuel" /></label>
    <button class="btn primary full" data-act="saveHandover">Hand over</button>`);
}
function confirmHandoverForm(id) {
  const e = (S.state.cash || []).find((x) => x.id === id);
  openSheet('Count cash received', `
    <div class="card pad" style="margin-bottom:12px"><div class="muted" style="font-size:12.5px">Musthafa declared</div><b style="font-size:18px">${aed(e.declared)}</b></div>
    <label class="fld"><span class="lab">Amount you actually counted (AED)</span><input id="cf_amt" type="number" value="${e.declared}" /></label>
    <button class="btn green full" data-act="saveConfirm" data-id="${id}">Confirm receipt</button>`);
}
function cashOutForm() {
  openSheet('Log cash out', `
    <label class="fld"><span class="lab">Type</span><select id="co_kind"><option value="expense">Expense (fuel, food, etc.)</option><option value="advance">Salary advance</option></select></label>
    <label class="fld"><span class="lab">Person</span><select id="co_person"><option>Musthafa</option><option>Haris</option><option>Tahir</option><option>Asif</option></select></label>
    <label class="fld"><span class="lab">Amount (AED)</span><input id="co_amt" type="number" /></label>
    <label class="fld"><span class="lab">Reason</span><input id="co_reason" placeholder="e.g. fuel for the van" /></label>
    <button class="btn primary full" data-act="saveCashOut">Log it</button>`);
}
function profileForm() {
  const c = window.curCustomer();
  openSheet('Edit business details', `
    <label class="fld"><span class="lab">Contact / phone</span><input id="pf_phone" value="${esc(c.phone || '')}" placeholder="+971 ..." /></label>
    <label class="fld"><span class="lab">Delivery address</span><input id="pf_addr" value="${esc(c.addressLine || '')}" placeholder="Shop no, street, area" /></label>
    <button class="btn primary full" data-act="saveProfile">Save</button>`);
}
function ticketForm() {
  openSheet('Raise a support ticket', `
    <label class="fld"><span class="lab">Topic</span><select id="tk_type"><option value="query">General query</option><option value="return">Return / damaged goods</option><option value="refund">Refund request</option></select></label>
    <label class="fld"><span class="lab">Subject</span><input id="tk_subject" placeholder="Short summary" /></label>
    <label class="fld"><span class="lab">Details</span><textarea id="tk_body" rows="4" style="resize:vertical"></textarea></label>
    <button class="btn primary full" data-act="saveTicket">Submit ticket</button>`);
}
function replyForm(id) {
  const t = (S.state.tickets || []).find((x) => x.id === id);
  openSheet('Reply — ' + (t ? t.customerName : ''), `
    <div class="card pad" style="margin-bottom:12px"><b>${esc(t ? t.subject : '')}</b><div class="muted" style="font-size:12.5px">${esc(t ? t.body : '')}</div></div>
    <label class="fld"><span class="lab">Your reply</span><textarea id="rp_text" rows="4" style="resize:vertical"></textarea></label>
    <button class="btn primary full" data-act="saveReply" data-id="${id}">Send reply</button>`);
}

// ---------------- actions ----------------
let cart = {};
const ACT = {
  staffLogin: async () => {
    const username = ($('#lg_user') || {}).value, password = ($('#lg_pass') || {}).value;
    if (!username || !password) return toast('Enter username and password');
    try {
      const r = await staffApi('/api/staff/login', 'POST', { username: username.trim(), password });
      staff = r.staff; staffToken = r.token;
      localStorage.setItem('ntbf_staff', JSON.stringify(staff));
      localStorage.setItem('ntbf_stafftoken', staffToken);
      role = ''; localStorage.removeItem('ntbf_role'); tab = '';
      render(); toast('Welcome, ' + String(staff.name).split(' ')[0]);
    } catch (e) { toast(e.message); }
  },
  staffLogout: () => {
    staff = null; staffToken = ''; role = '';
    ['ntbf_staff', 'ntbf_stafftoken', 'ntbf_role', 'ntbf_tab'].forEach((k) => localStorage.removeItem(k));
    closeSheet(); render();
  },
  pick: (d) => { if (allowedRoles().indexOf(d.id) < 0) return toast('Not permitted'); role = d.id; tab = ''; localStorage.setItem('ntbf_role', role); render(); },
  switchRole: () => { if (allowedRoles().length <= 1) return; role = ''; localStorage.removeItem('ntbf_role'); render(); },
  changePwForm: () => changePwForm(),
  saveChangePw: async () => {
    const o = $('#cp_old').value, n = $('#cp_new').value, c = $('#cp_confirm').value;
    if (n !== c) return toast('New passwords do not match');
    try { await staffApi('/api/staff/password', 'POST', { oldPassword: o, newPassword: n }); closeSheet(); toast('Password changed'); }
    catch (e) { toast(e.message); }
  },
  teamForm: () => teamForm(),
  addStaffForm: () => addStaffForm(),
  saveStaff: async () => {
    const name = $('#ns_name').value.trim(), username = $('#ns_user').value.trim(), password = $('#ns_pass').value;
    const roles = Array.from(document.querySelectorAll('.ns_role.on')).map((b) => b.dataset.r);
    if (!name || !username || !password) return toast('Fill name, username and password');
    if (!roles.length) return toast('Pick at least one role');
    try { await staffApi('/api/staff/team', 'POST', { name, username, password, roles }); toast('Staff added'); teamForm(); }
    catch (e) { toast(e.message); }
  },
  toggleNsRole: (d) => { const b = document.querySelector(`.ns_role[data-r="${d.r}"]`); if (b) b.classList.toggle('on'); },
  resetStaffPw: async (d) => {
    const pw = prompt('New password for this staff (min 4 chars):'); if (!pw || pw.length < 4) return;
    try { await staffApi('/api/staff/team/reset', 'POST', { id: d.id, password: pw }); toast('Password reset'); }
    catch (e) { toast(e.message); }
  },
  removeStaff: async (d) => {
    if (!confirm('Remove this staff account? They will no longer be able to sign in.')) return;
    try { await staffApi('/api/staff/team/remove', 'POST', { id: d.id }); toast('Staff removed'); teamForm(); }
    catch (e) { toast(e.message); }
  },
  reset: () => { S.reset(); toast('Demo data reset'); render(); },
  tab: (d) => { tab = d.id; localStorage.setItem('ntbf_tab', tab); render(); },
  closeSheet: () => closeSheet(),

  newCustomer: () => newCustomerForm(),
  saveCustomer: () => {
    const name = $('#f_name').value.trim(); if (!name) return toast('Enter a name');
    const gps = $('#f_gps');
    S.createCustomer({ name, category: $('#f_cat').value, credit: $('#f_credit').value, creditDays: $('#f_days').value, lat: gps._lat, lng: gps._lng });
    closeSheet(); render(); toast('Customer submitted for approval');
  },
  newOrder: () => newOrderForm(),
  saveOrder: () => {
    const customerId = $('#o_cust').value;
    const method = $('#o_method .on').dataset.m;
    const lines = Object.keys(cart).map((pid) => ({ pid, qty: cart[pid] }));
    try { const id = S.placeOrder({ customerId, lines, method }); closeSheet(); render(); toast('Order ' + id + ' placed'); }
    catch (e) { toast(e.message); }
  },
  refreshOnline: () => { onlineLoaded = false; loadOnlineOrders(); toast('Refreshing…'); },
  openOrder: (d) => { const o = onlineById(d.id); if (o) openSheet('Order ' + d.id, orderDetailsHtml(o)); },
  setOrderStatus: async (d) => {
    try {
      await postStatus(d.id, d.status);
      closeSheet(); buzz([15, 40, 20]); toast('Order ' + d.id + ' → ' + statusLabel(d.status).toLowerCase());
      await loadOnlineOrders();
    } catch (e) { toast(e.message || 'Could not update'); }
  },
  oResolve: async (d) => {
    try {
      const r = await fetch(API + '/api/portal/orders/resolve-review', { method: 'POST', headers: staffHeaders(), body: JSON.stringify({ id: d.id }) });
      if (!r.ok) { let m = 'Could not resolve'; try { m = (await r.json()).message || m; } catch (e) { /* ignore */ } throw new Error(m); }
      closeSheet(); toast('Review resolved — order can now be confirmed'); await loadOnlineOrders();
    } catch (e) { toast(e.message); }
  },
  oCancel: (d) => {
    openSheet('Cancel order', `<div class="card pad" style="margin-bottom:12px"><b>Cancel ${esc(d.id)}?</b><div class="muted" style="font-size:12px;margin-top:4px">This can't be undone.</div></div><button class="btn danger full" data-act="confirmCancel" data-id="${esc(d.id)}">Yes, cancel this order</button>`);
  },
  confirmCancel: async (d) => {
    try { await postStatus(d.id, 'CANCELLED'); closeSheet(); toast('Order ' + d.id + ' cancelled'); await loadOnlineOrders(); }
    catch (e) { toast(e.message); }
  },
  deliverOrder: (d) => {
    const o = onlineById(d.id); if (!o) return;
    openSheet('Delivered — cash collected', `
      <div class="card pad" style="margin-bottom:12px"><div class="muted" style="font-size:12px">${esc(o.customerName || '')} · ${esc(o.id)}</div><b style="font-size:16px">Order total ${aed(o.total)}</b></div>
      <label class="fld"><span class="lab">Amount collected (AED)</span><input id="dc_amt" type="number" step="0.01" value="${o.total}" /></label>
      <div class="fld"><span class="lab">Method</span><div id="dc_method" class="seg"><button class="${isCash(o) ? 'on' : ''}" data-m="CASH_ON_DELIVERY">Cash</button><button class="${!isCash(o) ? 'on' : ''}" data-m="CHEQUE_ON_DELIVERY">Cheque</button></div></div>
      <button class="btn green full" data-act="confirmDeliver" data-id="${esc(o.id)}">Confirm delivered</button>`,
    (sh) => { sh.querySelectorAll('#dc_method button').forEach((b) => b.addEventListener('click', () => { sh.querySelectorAll('#dc_method button').forEach((x) => x.classList.remove('on')); b.classList.add('on'); })); });
  },
  confirmDeliver: async (d) => {
    const amt = Number(($('#dc_amt') || {}).value);
    const mEl = $('#dc_method .on'); const method = mEl ? mEl.dataset.m : 'CASH_ON_DELIVERY';
    try { await postStatus(d.id, 'DELIVERED', { cashAmount: isFinite(amt) ? amt : undefined, cashMethod: method }); closeSheet(); buzz([15, 40, 20]); toast('Delivered · ' + aed(isFinite(amt) ? amt : 0) + ' collected'); await loadOnlineOrders(); }
    catch (e) { toast(e.message); }
  },
  navAll: (d) => {
    const addrs = (d.addrs || '').split('~|~').filter(Boolean).map((a) => encodeURIComponent(a));
    if (!addrs.length) return;
    const dest = addrs[addrs.length - 1];
    const wps = addrs.slice(0, -1).join('|');
    window.open('https://www.google.com/maps/dir/?api=1&destination=' + dest + (wps ? '&waypoints=' + wps : '') + '&travelmode=driving', '_blank');
  },
  checkin: () => checkinForm(),
  saveVisit: () => { const gps = $('#v_gps'); S.checkInVisit($('#v_cust').value, $('#v_note').value.trim()); closeSheet(); render(); toast('Checked in'); },
  specialPrice: () => specialPriceForm(),
  saveSpecial: () => { const price = $('#sp_price').value; if (!price) return toast('Enter a price'); S.specialPrice({ customerId: $('#sp_cust').value, pid: $('#sp_prod').value, price }); closeSheet(); render(); toast('Special price submitted'); },

  startShift: () => { S.startShift(); render(); toast('Shift started'); },
  verifyLoad: () => { S.verifyLoad(); render(); toast('Load verified · route planned'); },
  useGps: () => {
    if (!navigator.geolocation) return toast('No GPS on this device');
    toast('Locating…');
    navigator.geolocation.getCurrentPosition(
      (p) => { S.setDriverLoc(p.coords.latitude, p.coords.longitude); render(); toast('Location updated · route re-optimized'); },
      () => toast('Location permission denied'));
  },
  navigate: (d) => { window.open('https://www.google.com/maps/dir/?api=1&destination=' + d.lat + ',' + d.lng + '&travelmode=driving', '_blank'); },
  navAddr: (d) => { window.open('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(d.addr || ''), '_blank'); },
  deliver: (d) => deliverForm(d.id),
  saveDeliver: (d) => {
    const method = $('#d_method .on').dataset.m;
    const amount = $('#d_amt').value; const chequeNo = method === 'CHEQUE_ON_DELIVERY' ? $('#d_chq').value : '';
    S.deliver(d.id, { method, amount, chequeNo }); closeSheet(); render(); toast('Delivered · payment collected');
  },
  fail: (d) => failForm(d.id),
  saveFail: (d) => { S.failDelivery(d.id, $('#x_reason').value); closeSheet(); render(); toast('Marked failed'); },
  submitEod: () => { const r = S.submitEod(); render(); toast('EOD sent · cash ' + aed(r.cash)); },

  adjust: (d) => adjustForm(d.id),
  saveAdjust: (d) => { const r = $('#aj_reason'); S.adjustStock(d.id, $('#aj_delta').value, r ? r.value : 'manual adjustment'); closeSheet(); render(); toast('Stock updated'); },
  receive: () => receiveForm(),
  saveReceive: () => { S.receiveGrn($('#r_prod').value, $('#r_qty').value); closeSheet(); render(); toast('Goods received into stock'); },
  dispatch: (d) => { S.advanceDispatch(d.id); render(); const o = S.order(d.id); toast(o.id + ' → ' + o.status.replace(/_/g, ' ').toLowerCase()); },

  raiseReq: (d) => reqForm(d.id),
  saveReq: (d) => { S.raiseRequisition(d.id, $('#rq_qty').value); closeSheet(); render(); toast('Requisition raised'); },
  autoReplenish: () => { const n = S.autoReplenish(); render(); toast(n ? n + ' requisition' + (n === 1 ? '' : 's') + ' drafted' : 'Nothing to reorder'); },
  draftReq: (d) => { const x = S.forecast().find((f) => f.id === d.id); S.raiseRequisition(d.id, x ? x.recommend : 0); render(); toast('Requisition drafted'); },

  addBill: () => addBillForm(),
  extractBill: async () => {
    toast('Reading bill…');
    let bill;
    try {
      if (!billDraft.imageData) throw new Error('no image');
      bill = await apiPost('/api/bills/extract', { imageBase64: billDraft.imageData, mediaType: billDraft.mediaType });
      if (!bill || !bill.lineItems) throw new Error('bad response');
    } catch (e) { bill = mockExtract(); }
    billDraft.extracted = bill; reviewBillForm();
  },
  addBillLine: () => { syncBillLines(); billLineRows.push({ description: '', quantity: 1, unitPrice: 0, taxPercent: 5 }); renderBillLines(); },
  delBillLine: (d) => { syncBillLines(); const i = +d.i; if (i >= 0 && i < billLineRows.length) billLineRows.splice(i, 1); renderBillLines(); },
  matchBill: async () => {
    const b = billDraft.extracted;
    b.supplierName = $('#b_sup').value; b.invoiceNumber = $('#b_inv').value; b.invoiceDate = $('#b_date').value;
    // Carry the edited line items + recomputed totals into the match/record steps.
    syncBillLines();
    b.lineItems = billLineRows.map((r) => ({
      description: r.description, quantity: +r.quantity || 0, unitPrice: +r.unitPrice || 0,
      taxPercent: +r.taxPercent || 0, amount: billLineTotal(r),
    }));
    const t = billTotals();
    b.subtotal = t.subtotal; b.taxAmount = t.taxAmount; b.total = t.total;
    toast('Matching with Zoho…');
    let m;
    try { m = await apiPost('/api/bills/match', { bill: b }); if (!m || !m.lines) throw new Error('bad'); }
    catch (e) { m = localMatch(b); }
    billDraft.match = m; matchReviewForm();
  },
  recordBill: async () => {
    const b = billDraft.extracted, m = billDraft.match;
    let zoho = false;
    try { await apiPost('/api/bills/record', { bill: b, match: m, createVendor: true }); zoho = true; }
    catch (e) { zoho = false; }
    S.addBill({ supplierName: b.supplierName, invoiceNumber: b.invoiceNumber, invoiceDate: b.invoiceDate, total: b.total, lineItems: b.lineItems, zoho });
    billDraft = {}; closeSheet(); render(); toast(zoho ? 'Bill recorded in Zoho ✓' : 'Bill saved locally (API offline)');
  },
  newPo: () => poForm(),
  savePo: () => { S.createPo({ supplier: $('#po_sup').value, pid: $('#po_prod').value, qty: $('#po_qty').value, price: $('#po_price').value }); closeSheet(); render(); toast('PO created & sent'); },

  cheque: (d) => { S.clearCheque(d.id, d.ok === '1'); render(); toast(d.ok === '1' ? 'Cheque cleared' : 'Bounced · AED 250 charge · account on hold'); },
  approve: (d) => { S.approve(d.id); render(); toast('Approved'); },
  reject: (d) => { S.reject(d.id); render(); toast('Rejected'); },
  approveAll: () => { S.approveAll(); render(); toast('All approvals cleared'); },

  // collections
  draftReminder: (d) => reminderForm(d.id),
  copyReminder: () => { const t = $('#rm_text'); if (navigator.clipboard) navigator.clipboard.writeText(t.value); t.select(); toast('Reminder copied'); },
  sentReminder: () => { closeSheet(); toast('Reminder sent (logged)'); },
  recover: (d) => { S.recoverCustomer(d.id); render(); toast('Recovered · hold released'); },

  // customer portal
  shopInc: (d) => { const p = S.product(d.id); shopCart[d.id] = Math.min((shopCart[d.id] || 0) + 1, p.stock); render(); },
  shopDec: (d) => { shopCart[d.id] = Math.max((shopCart[d.id] || 0) - 1, 0); if (!shopCart[d.id]) delete shopCart[d.id]; render(); },
  shopMethod: (d) => { shopMethod = d.m; render(); },
  shopOrder: () => {
    const cid = curCustomerId(); const lines = Object.keys(shopCart).map((pid) => ({ pid, qty: shopCart[pid] }));
    if (!lines.length) return toast('Your cart is empty');
    try { const id = S.placeOrder({ customerId: cid, lines, method: shopMethod }); shopCart = {}; tab = 'myorders'; localStorage.setItem('ntbf_tab', tab); render(); toast('Order ' + id + ' placed'); }
    catch (e) { toast(e.message); }
  },

  // fixed assets
  addAsset: () => assetForm(),
  saveAsset: () => { const n = $('#as_name').value.trim(); const c = parseFloat($('#as_cost').value); const d = $('#as_date').value; if (!n || isNaN(c) || !d) return toast('Enter name, cost and purchase date'); S.addAsset({ name: n, category: $('#as_cat').value, cost: c, salvage: parseFloat($('#as_salvage').value) || 0, purchaseDate: d, lifeYears: parseFloat($('#as_life').value) || 5 }); closeSheet(); render(); toast('Asset registered'); },
  removeAsset: (d) => { S.removeAsset(d.id); render(); toast('Asset removed'); },

  // compliance & renewals
  addRenewal: () => renewalForm(),
  saveRenewal: () => { const h = $('#rn_holder').value.trim(); const e = $('#rn_expiry').value; if (!h || !e) return toast('Enter holder and expiry date'); S.addRenewal({ kind: $('#rn_kind').value, holder: h, expiry: e }); closeSheet(); render(); toast('Renewal now tracked'); },
  renewItem: (d) => renewItemForm(d.id),
  saveRenew: (d) => { const e = $('#rn_new').value; if (!e) return toast('Pick the new date'); S.updateRenewal(d.id, e); closeSheet(); render(); toast('Expiry updated'); },

  // document capture
  capDoc: (d) => captureForm(d.type),
  extractCapture: async () => {
    if (!capDraft.image) return toast('Take a photo first');
    toast('Reading…');
    const set = (id, v) => { const el = $('#' + id); if (el && v != null) el.value = v; };
    try {
      const r = await apiPost('/api/bills/extract', { imageBase64: capDraft.image, mediaType: capDraft.mediaType || 'image/jpeg' });
      if (r && r.supplierName !== undefined) { set('cap_vendor', r.supplierName); set('cap_invoiceNo', r.invoiceNumber); set('cap_date', r.invoiceDate); set('cap_total', r.total); toast('Extracted — please verify'); return; }
      throw new Error('no data');
    } catch (e) { toast('Claude not connected — enter the details manually'); }
  },
  reviewCapture: () => {
    const cfg = DOC_TYPES[capDraft.type]; const fields = {};
    cfg.fields.forEach((f) => { const el = $('#cap_' + f.key); fields[f.key] = el ? el.value.trim() : ''; });
    capDraft.fields = fields; confirmCaptureForm();
  },
  saveCapture: () => {
    const cfg = DOC_TYPES[capDraft.type]; const f = capDraft.fields || {};
    const title = f.vendor || f.customer || f.paidTo || cfg.label;
    S.addDocument({ type: capDraft.type, typeLabel: cfg.label, icon: cfg.icon, zoho: cfg.zoho, fields: f, image: capDraft.image, title });
    capDraft = {}; closeSheet(); render(); toast('Captured — ready for Asif to confirm');
  },
  viewDoc: (d) => viewDocForm(d.id),
  postDoc: async (d) => {
    const doc = (S.state.documents || []).find((x) => x.id === d.id);
    let msg = 'Confirmed — prepared for Zoho';
    if (doc) {
      try {
        const r = await apiPost('/api/documents/post', { type: doc.type, fields: doc.fields, image: doc.image });
        msg = r.mode === 'posted' ? 'Posted to Zoho ✓ (' + r.target + ')' : 'Prepared → ' + r.target + ' · test mode';
      } catch (e) { /* backend offline — mark locally */ }
    }
    S.markDocPosted(d.id); closeSheet(); render(); toast(msg);
  },

  // cash custody
  handover: () => { if (S.driverHolding() <= 0) return toast('No cash to hand over'); handoverForm(); },
  saveHandover: () => {
    const amt = parseFloat($('#ho_amt').value); const reason = $('#ho_reason').value.trim();
    if (isNaN(amt)) return toast('Enter the amount');
    const variance = amt - S.driverHolding();
    if (variance !== 0 && !reason) return toast('Amount differs — please give a reason');
    S.declareHandover(amt, reason); closeSheet(); render(); toast('Handed over — pending Haris confirmation');
  },
  confirmHandover: (d) => confirmHandoverForm(d.id),
  saveConfirm: (d) => { const amt = parseFloat($('#cf_amt').value); if (isNaN(amt)) return toast('Enter counted amount'); S.confirmHandover(d.id, amt); closeSheet(); render(); toast('Cash receipt confirmed'); },
  logCashOut: () => cashOutForm(),
  saveCashOut: () => { const amt = parseFloat($('#co_amt').value); if (isNaN(amt) || amt <= 0) return toast('Enter the amount'); S.logCashOut({ kind: $('#co_kind').value, person: $('#co_person').value, amount: amt, reason: $('#co_reason').value.trim() }); closeSheet(); render(); toast('Cash out logged'); },

  // customer profile
  editProfile: () => profileForm(),
  saveProfile: () => { S.updateCustomerProfile(curCustomerId(), { phone: $('#pf_phone').value.trim(), addressLine: $('#pf_addr').value.trim() }); closeSheet(); render(); toast('Profile updated'); },
  updateCustLoc: () => { if (!navigator.geolocation) return toast('No GPS on this device'); toast('Locating…'); navigator.geolocation.getCurrentPosition((p) => { S.setCustomerLocation(curCustomerId(), p.coords.latitude, p.coords.longitude); render(); toast('Delivery location updated'); }, () => toast('Location permission denied')); },

  // customer service
  newTicket: () => ticketForm(),
  saveTicket: () => { const s = $('#tk_subject').value.trim(); if (!s) return toast('Enter a subject'); S.createTicket({ customerId: curCustomerId(), subject: s, body: $('#tk_body').value.trim(), type: $('#tk_type').value }); closeSheet(); render(); toast('Ticket submitted'); },
  reply: (d) => replyForm(d.id),
  saveReply: (d) => { const t = $('#rp_text').value.trim(); if (!t) return toast('Enter a reply'); S.replyTicket(d.id, 'service', t); closeSheet(); render(); toast('Reply sent'); },
  closeTicket: (d) => { S.closeTicket(d.id); render(); toast('Ticket resolved'); },

  // settings
  settings: () => settingsForm(),
  saveSettings: () => { localStorage.setItem('ntbf_api', $('#set_api').value.trim()); const tk = $('#set_token'); if (tk) { const v = tk.value.trim(); if (v) localStorage.setItem('ntbf_token', v); else localStorage.removeItem('ntbf_token'); } const sc = $('#set_cust'); if (sc) localStorage.setItem('ntbf_customer', sc.value); closeSheet(); render(); toast('Settings saved'); },
  resetAll: () => { S.reset(); shopCart = {}; closeSheet(); render(); toast('All data reset'); },

  // ---- Clear test data (admin): wipes ALL transactional records on the SERVER for
  // ALL users, then resets this device's local demo dataset (same as Reset all data).
  clearTestDataForm: () => {
    if (!staff || !staff.roles || staff.roles.indexOf('admin') < 0) return toast('Admins only');
    openSheet('Clear test data (admin)', `
      <p style="font-size:13px;line-height:1.55;color:var(--muted)">This permanently deletes <b>ALL transactional records on the server, for ALL users</b> — orders (app &amp; WhatsApp), expenses, advances, receipts, payments, transfers, cheque records, suggestions and the shared synced dataset. Staff accounts, the audit log and app settings are kept. <b>This cannot be undone.</b></p>
      <label class="fld"><span class="lab">Type CLEAR to confirm</span><input id="ctd_confirm" autocomplete="off" autocapitalize="characters" placeholder="CLEAR" /></label>
      <button class="btn danger full" data-act="clearTestDataGo">Permanently clear test data</button>`);
  },
  clearTestDataGo: async () => {
    const inp = $('#ctd_confirm');
    const typed = (inp && inp.value ? inp.value : '').trim();
    if (typed !== 'CLEAR') return toast('Type CLEAR (in capitals) to confirm');
    try {
      const res = await staffApi('/api/admin/clear-test-data', 'POST', { confirm: 'CLEAR' });
      // Server wiped — clear this device too (same client logic as Reset all data),
      // and drop the sync revision so the app re-syncs against the fresh server state.
      S.reset(); shopCart = {};
      localStorage.removeItem('ntbf_rev');
      closeSheet();
      toast('Cleared ' + ((res && res.cleared) || []).length + ' server stores — reloading…');
      setTimeout(() => location.reload(), 900);
    } catch (e) { toast(e.message); }
  },

  // ---- July 2026 history backfill (admin, server-only) ----
  julyImportForm: async () => {
    if (!staff || !staff.roles || staff.roles.indexOf('admin') < 0) return toast('Admins only');
    openSheet('Import July history (admin)', '<div class="empty"><div class="ei">📚</div>Checking July data…</div>');
    try {
      const rep = await staffApi('/api/admin/backfill-july', 'POST', { mode: 'dry-run' });
      openSheet('Import July history (admin)', julyReportHtml(rep, false));
    } catch (e) { closeSheet(); toast(e.message); }
  },
  julyImportGo: async () => {
    const inp = $('#jly_confirm');
    if (((inp && inp.value) || '').trim() !== 'IMPORT') return toast('Type IMPORT (in capitals) to confirm');
    try {
      const rep = await staffApi('/api/admin/backfill-july', 'POST', { mode: 'write', confirm: 'IMPORT' });
      openSheet('July history imported', julyReportHtml(rep, true));
      toast('Imported ' + ((rep.totals && rep.totals.imported) || 0) + ' July records');
    } catch (e) { toast(e.message); }
  },
  julyImportRemoveForm: () => {
    if (!staff || !staff.roles || staff.roles.indexOf('admin') < 0) return toast('Admins only');
    openSheet('Remove July import', `
      <p style="font-size:13px;line-height:1.55;color:var(--muted)">Deletes <b>only</b> the records imported from the July 2026 books (origin “july-import”) from orders, receipts, payments, expenses and transfers. Everything else is untouched — and July stays safe in Zoho.</p>
      <label class="fld"><span class="lab">Type REMOVE-JULY to confirm</span><input id="jly_remove" autocomplete="off" autocapitalize="characters" placeholder="REMOVE-JULY" /></label>
      <button class="btn danger full" data-act="julyImportRemoveGo">Remove July import</button>`);
  },
  julyImportRemoveGo: async () => {
    const inp = $('#jly_remove');
    if (((inp && inp.value) || '').trim() !== 'REMOVE-JULY') return toast('Type REMOVE-JULY (with the dash) to confirm');
    try {
      const res = await staffApi('/api/admin/backfill-july', 'POST', { mode: 'remove', confirm: 'REMOVE-JULY' });
      closeSheet();
      toast('Removed ' + ((res && res.total) || 0) + ' imported July records');
    } catch (e) { toast(e.message); }
  },

  // admin override
  advanceOrder: (d) => { S.adminAdvance(d.id); render(); const o = S.order(d.id); toast(o.id + ' → ' + o.status.replace(/_/g, ' ').toLowerCase()); },
  cancelOrder: (d) => { S.cancelOrder(d.id); render(); toast(d.id + ' cancelled · stock restored'); },
  approveCustomer: (d) => { const c = S.customer(d.id); if (c) { c.status = 'ACTIVE'; S.save(); } render(); toast('Customer activated'); },
  hold: (d) => { S.setHold(d.id, true); render(); toast('Account placed on hold'); },
  release: (d) => { S.setHold(d.id, false); render(); toast('Hold released'); },

  // ---- Muhammed (AI colleague) ----
  muhammedChip: (d) => ACT.muhammedSend({ text: d.q }),
  muhammedSend: async (d) => {
    const inp = $('#m-input');
    const text = (d && d.text) || (inp ? inp.value.trim() : '');
    if (!text || mBusy) return;
    if (inp && !(d && d.text)) inp.value = '';
    mView.push({ k: 'user', t: text });
    mBusy = true; mDraw();
    try {
      const r = await staffApi('/api/muhammed/ask', 'POST', { text });
      mView.push({ k: 'bot', t: r.answer || '…' });
    } catch (e) {
      mView.push({ k: 'bot', t: '⚠ ' + (e.message || 'Could not reach Muhammed. Check Settings → server address.') });
    }
    mBusy = false; mDraw();
  },
};

// ---------------- Muhammed (AI colleague) chat tab ----------------
let mView = []; let mBusy = false;
function mFirstName() { return String((staff && staff.name) || '').split(' ')[0] || 'there'; }
function muhammedScopeChips() {
  const roles = (staff && staff.roles) || [];
  const has = (r) => roles.indexOf(r) >= 0;
  if (has('admin')) return ["Today's sales", 'Cash by driver', 'Queue health', 'Collections', 'What did the team ask today?', "What couldn't you answer?"];
  const c = [];
  if (has('salesman')) c.push('My sales today', 'My customers', 'My orders', 'Pending approvals');
  if (has('warehouse') || has('purchase')) c.push("What's below reorder?", 'Dispatch queue', 'Cash in hand', 'Handovers to confirm');
  if (has('driver')) c.push('My next stop', "Cash I've collected", 'Stops left', 'My deliveries');
  return c.length ? c : ['What can you help me with?'];
}
function mMsgsHtml() {
  let html = mView.map((m) => `<div class="m-msg ${m.k}">${esc(m.t)}</div>`).join('');
  if (mBusy) html += '<div class="m-dots">Muhammed is typing…</div>';
  return html;
}
function mDraw() { const box = $('#m-msgs'); if (box) box.innerHTML = mMsgsHtml(); const inp = $('#m-input'); if (inp) inp.scrollIntoView({ block: 'end' }); }
window.__mSend = () => ACT.muhammedSend({});
views.muhammed = () => {
  const chips = muhammedScopeChips();
  const greeting = mView.length ? '' : `<div class="m-msg bot">Hello ${esc(mFirstName())}! 👋 I'm Muhammed, your colleague. Ask me about your work — tap a suggestion or type below. I only ever see your own information, and I reply in your language.</div>`;
  return `
    <div class="m-head"><div class="av">✦</div><div><b>Muhammed</b><span>Your NTBFLLC colleague</span></div></div>
    <div class="m-msgs" id="m-msgs">${greeting}${mMsgsHtml()}</div>
    <div class="m-chips">${chips.map((q) => `<button data-act="muhammedChip" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>
    <div class="m-in"><input id="m-input" placeholder="Ask Muhammed…" onkeydown="if(event.key==='Enter'){event.preventDefault();window.__mSend();}" /><button data-act="muhammedSend">➤</button></div>
    <div class="m-spacer"></div>`;
};

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-act]'); if (!t) return;
  if (t.tagName === 'A') e.preventDefault();
  const fn = ACT[t.dataset.act]; if (fn) fn(t.dataset);
});
$('#scrim').addEventListener('click', closeSheet);

// ===========================================================================
// Rashid module (Stage 1) — employee Tasks (placeholder) · Expenses · Advances.
// The `staff` role gets these as bottom-nav tabs; every other role reaches the
// same expense/advance tools from the ⚙ Settings sheet. Talks to the file-backed
// backend at /api/expenses/* and /api/advances/* using the staff JWT (staffApi).
// ===========================================================================
ROLES.staff = { name: 'Staff', sub: 'Employee', pic: 'S', status: 'On duty',
  tabs: [{ id: 'mytasks', label: 'Tasks', i: '🗒️' }, { id: 'myexp', label: 'Expenses', i: '🧾' }, { id: 'myadv', label: 'Advances', i: '💵' }] };
if (ALL_ROLES.indexOf('staff') < 0) ALL_ROLES.push('staff');
if (!ROLE_OPTS.find((o) => o[0] === 'staff')) ROLE_OPTS.push(['staff', 'General staff']);

const EXP_CATS = ['Fuel', 'Salik', 'Parking', 'Vehicle Maintenance', 'Government Fees', 'Office', 'Hospitality', 'Other'];
const PAID_FROM_OPTS = [['advance', 'From advance'], ['own_money', 'Own money'], ['company_card', 'Company card']];
function paidFromLabel(v) { return ({ advance: 'Advance', own_money: 'Own money', company_card: 'Company card' })[v] || v; }
function expStatusTag(s) { const m = { SUBMITTED: 'amber', APPROVED: 'green', REJECTED: 'red' }; return `<span class="tag ${m[s] || ''}">${String(s || '').toLowerCase()}</span>`; }
function advStatusTag(s) { const m = { ISSUED: 'amber', ACKNOWLEDGED: 'accent', SETTLED: 'green' }; return `<span class="tag ${m[s] || ''}">${String(s || '').toLowerCase()}</span>`; }
let expDraft = {};
let myExpData = null;   // my expenses cache (null = not loaded yet)
let myAdvData = null;   // my advances + balance cache

async function loadMyExp() { try { myExpData = await staffApi('/api/expenses/mine', 'GET'); } catch (e) { myExpData = []; toast(e.message); } render(); }
async function loadMyAdv() { try { myAdvData = await staffApi('/api/advances/mine', 'GET'); } catch (e) { myAdvData = { advances: [], balance: {} }; toast(e.message); } render(); }

function expensesBody(list, showAdd) {
  const rows = (list || []).map((x) => `<div class="li" data-act="expOpen" data-id="${x.id}">
    <div class="ic ${x.status === 'APPROVED' ? 'g' : x.status === 'REJECTED' ? 'r' : 'a'}">🧾</div>
    <div class="m"><b>${esc(x.category)} · ${aed(x.amount)}</b><span>${esc(x.date)} · ${esc(paidFromLabel(x.paidFrom))}${x.hasPhoto ? ' · 📎' : ''}</span></div>
    <div class="end">${expStatusTag(x.status)}</div></div>`).join('');
  return `${showAdd ? '<button class="btn primary full" data-act="expAdd" style="margin-bottom:12px">＋ Add expense</button>' : ''}
    <div class="sect">My expenses (${(list || []).length})</div>
    <div class="card">${rows || emptyRow('No expenses yet.')}</div>`;
}
function advancesBody(data) {
  const b = (data && data.balance) || {}; const advs = (data && data.advances) || [];
  const rows = advs.map((a) => `<div class="li">
    <div class="ic ${a.status === 'SETTLED' ? 'g' : 'a'}">💵</div>
    <div class="m"><b>${aed(a.amount)}</b><span>${esc((a.issuedAt || '').slice(0, 10))} · by ${esc(a.issuedBy || '—')}${a.remark ? ' · ' + esc(a.remark) : ''}</span></div>
    <div class="end">${advStatusTag(a.status)}${a.status === 'ISSUED' ? `<br><button class="btn sm" data-act="advAck" data-id="${a.id}" style="margin-top:6px">Acknowledge</button>` : ''}</div></div>`).join('');
  return `<div class="mkpis">
      ${kpi('Advance balance', aed(b.balance || 0), (b.balance || 0) < 0 ? 'red' : 'green')}
      ${kpi('Reimbursement owed', aed(b.reimbursementOwed || 0), (b.reimbursementOwed || 0) > 0 ? 'amber' : '')}
    </div>
    <button class="btn full" data-act="advStatement" style="margin-bottom:10px">📄 View statement</button>
    <div class="muted" style="font-size:11.5px;margin:2px 2px 10px">Balance = advances held − approved advance-paid expenses. Negative means the company owes you.</div>
    <div class="sect">My advances (${advs.length})</div>
    <div class="card">${rows || emptyRow('No advances issued yet.')}</div>`;
}

// Per-staff prepayment ledger — a dated statement of credits/debits with a running
// balance. Reads GET /api/advances/ledger/mine (own) or /:employeeId (admin/finance
// drill-down). Pure read; renders the same .li/.card/.tabnum primitives as elsewhere.
const ledgerKindMeta = { advance_issued: ['💵', 'g'], expense_spend: ['🧾', 'a'], advance_settled: ['✓', 'g'] };
function ledgerRowHtml(r) {
  const m = ledgerKindMeta[r.kind] || ['•', 'a'];
  const amt = r.credit ? `<b style="color:var(--green)">+${aed(r.credit)}</b>` : r.debit ? `<b style="color:var(--red)">−${aed(r.debit)}</b>` : '<span class="muted">—</span>';
  return `<div class="li"><div class="ic ${m[1]}">${m[0]}</div>
    <div class="m"><b>${esc(r.description || r.ref || '')}</b><span>${esc((r.at || '').slice(0, 10))} · ${esc(r.ref || '')} · bal <span class="tabnum">${aed(r.runningBalance)}</span></span></div>
    <div class="end">${amt}</div></div>`;
}
function ledgerBody(d) {
  const cur = (d && d.current) || {}; const rows = (d && d.rows) || [];
  return `<div class="mkpis">
      ${kpi('Current balance', aed(cur.balance || 0), (cur.balance || 0) < 0 ? 'red' : 'green')}
      ${kpi('Held', aed(cur.advanced || 0))}
      ${kpi('Spent', aed(cur.spentFromAdvance || 0))}
    </div>
    <div class="muted" style="font-size:11.5px;margin:2px 2px 10px">Statement of advances (credits) and approved advance-paid expenses (debits), oldest first. Running balance in the right-hand tally.</div>
    <div class="sect">Statement (${rows.length})</div>
    <div class="card">${rows.map(ledgerRowHtml).join('') || emptyRow('No ledger entries yet.')}</div>`;
}
async function openLedger(employeeId, name) {
  const path = employeeId ? '/api/advances/ledger/' + encodeURIComponent(employeeId) : '/api/advances/ledger/mine';
  openSheet('Statement' + (name ? ' — ' + name : ''), loadingCard('Loading statement…'));
  try { const d = await staffApi(path, 'GET'); openSheet('Statement' + ' — ' + esc(d.name || name || 'me'), ledgerBody(d)); }
  catch (e) { toast(e.message); openSheet('Statement', emptyRow(esc(e.message))); }
}
ACT.advStatement = () => openLedger(null, null);
ACT.advLedgerOpen = (d) => openLedger(d.id, d.name);

views.mytasks = () => `<div class="card pad" style="text-align:center">
    <div style="font-size:34px;margin-bottom:6px">🗒️</div>
    <b>Tasks are coming soon</b>
    <div class="muted" style="font-size:12.5px;margin-top:6px">Your assigned tasks — with locations and proof-of-completion — will appear here in the next update.</div>
  </div>`;
views.myexp = function () { if (myExpData === null) { setTimeout(loadMyExp, 0); return loadingCard('Loading your expenses…'); } return expensesBody(myExpData, true); };
views.myadv = function () { if (myAdvData === null) { setTimeout(loadMyAdv, 0); return loadingCard('Loading your advances…'); } return advancesBody(myAdvData); };

function expenseForm() {
  expDraft = {};
  const today = new Date().toISOString().slice(0, 10);
  openSheet('Add expense', `
    <div class="muted" style="font-size:12.5px;margin-bottom:8px">Optional: photograph the bill and let Claude read it.</div>
    <input type="file" id="exp_file" accept="image/*" capture="environment" style="margin-bottom:8px" />
    <button class="btn full" data-act="expExtract" style="margin-bottom:8px">⚡ Read bill with Claude</button>
    <div id="exp_preview"></div>
    <label class="fld"><span class="lab">Date</span><input id="exp_date" type="date" value="${today}" /></label>
    <label class="fld"><span class="lab">Amount (AED)</span><input id="exp_amount" type="number" inputmode="decimal" placeholder="0.00" /></label>
    <label class="fld"><span class="lab">Category</span><select id="exp_cat">${EXP_CATS.map((c) => `<option>${c}</option>`).join('')}</select></label>
    <label class="fld"><span class="lab">Paid from</span><select id="exp_paid">${PAID_FROM_OPTS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label>
    <label class="fld"><span class="lab">Remark</span><input id="exp_remark" placeholder="e.g. ENOC fuel, Sharjah" /></label>
    <button class="btn primary full" data-act="expSave">Submit expense</button>
    <p class="muted" style="font-size:11.5px;margin-top:8px">Small expenses are approved automatically; larger ones go to admin for approval.</p>`,
    (sh) => {
      sh.querySelector('#exp_file').addEventListener('change', async function () {
        const f = this.files[0]; if (!f) return;
        const shot = await downscaleImage(f); if (!shot) return;
        expDraft.photo = shot.dataUrl; expDraft.mediaType = shot.mediaType;
        sh.querySelector('#exp_preview').innerHTML = `<img src="${shot.dataUrl}" style="width:100%;border-radius:10px;border:1px solid var(--line);margin-bottom:10px" />`;
      });
    });
}

async function expenseDetail(x) {
  if (!x) return;
  const isAdm = staff && staff.roles && staff.roles.indexOf('admin') >= 0;
  const hist = (x.statusHistory || []).map((h) => `<div class="li"><div class="ic ${h.to === 'APPROVED' ? 'g' : h.to === 'REJECTED' ? 'r' : 'a'}">•</div><div class="m"><b>${esc(h.to)}</b><span>${esc((h.at || '').slice(0, 16).replace('T', ' '))} · ${esc(h.by)}${h.note ? ' · ' + esc(h.note) : ''}</span></div></div>`).join('');
  openSheet(x.category + ' · ' + aed(x.amount), `
    <div id="exp_photo"></div>
    <div class="card">
      ${row('👤', 'a', 'Employee', esc(x.employeeName || '—'), '')}
      ${row('📅', 'a', 'Date', esc(x.date), '')}
      ${row('🏷', 'a', 'Category', esc(x.category), '')}
      ${row('💳', 'a', 'Paid from', esc(paidFromLabel(x.paidFrom)), '')}
      ${row('💬', 'a', 'Remark', esc(x.remark || '—'), '')}
      ${row('•', x.status === 'APPROVED' ? 'g' : x.status === 'REJECTED' ? 'r' : 'a', 'Status', expStatusTag(x.status), '')}
    </div>
    ${isAdm && x.status === 'SUBMITTED' ? `<div class="btn-row" style="margin-top:12px"><button class="btn green" data-act="expApprove" data-id="${x.id}">Approve</button><button class="btn danger" data-act="expReject" data-id="${x.id}">Reject</button></div>` : ''}
    <div class="sect">Timeline</div><div class="card">${hist || emptyRow('—')}</div>`,
    (sh) => { if (x.hasPhoto) { staffApi('/api/expenses/' + x.id + '/photo', 'GET').then((r) => { if (r && r.dataUrl) { const el = sh.querySelector('#exp_photo'); if (el) el.innerHTML = `<img src="${r.dataUrl}" style="width:100%;border-radius:10px;border:1px solid var(--line);margin-bottom:12px" />`; } }).catch(() => {}); } });
}

async function adminExpenses() {
  openSheet('Expense approvals', '<div class="empty"><div class="ei">🧾</div>Loading…</div>');
  let cfg = { autoApproveThreshold: 50 }; let pending = [];
  try { cfg = await staffApi('/api/expenses/config', 'GET'); } catch (e) { /* keep default */ }
  try { pending = await staffApi('/api/expenses?status=SUBMITTED', 'GET'); } catch (e) { toast(e.message); }
  window._admExp = pending;
  const rows = pending.map((x) => `<div class="li">
    <div class="ic a" data-act="expOpen" data-id="${x.id}">🧾</div>
    <div class="m" data-act="expOpen" data-id="${x.id}"><b>${esc(x.employeeName)} · ${aed(x.amount)}</b><span>${esc(x.category)} · ${esc(x.date)}${x.hasPhoto ? ' · 📎' : ''}</span></div>
    <div class="end"><button class="btn green sm" data-act="expApprove" data-id="${x.id}">✓</button> <button class="btn danger sm" data-act="expReject" data-id="${x.id}">✕</button></div></div>`).join('');
  openSheet('Expense approvals', `
    <label class="fld"><span class="lab">Auto-approve expenses at/under (AED)</span><input id="exp_thr" type="number" value="${esc(cfg.autoApproveThreshold)}" /></label>
    <button class="btn full" data-act="setThreshold" style="margin-bottom:14px">Save threshold</button>
    <div class="sect">Pending approval (${pending.length})</div>
    <div class="card">${rows || emptyRow('Nothing pending — all clear.')}</div>`);
}

async function adminAdvances() {
  openSheet('Advances (admin)', '<div class="empty"><div class="ei">💵</div>Loading…</div>');
  let balances = []; let all = [];
  try { balances = await staffApi('/api/advances/balances', 'GET'); } catch (e) { toast(e.message); }
  try { all = await staffApi('/api/advances', 'GET'); } catch (e) { /* ignore */ }
  const bRows = balances.map((b) => `<div class="li" data-act="advLedgerOpen" data-id="${esc(b.employeeId)}" data-name="${esc(b.name)}"><div class="ic ${b.balance < 0 ? 'r' : 'g'}">👤</div><div class="m"><b>${esc(b.name)}</b><span>held ${aed(b.advanced)} · spent ${aed(b.spentFromAdvance)}${b.reimbursementOwed ? ' · owed ' + aed(b.reimbursementOwed) : ''} · 📄</span></div><div class="end"><b style="color:${b.balance < 0 ? 'var(--red)' : 'var(--green)'}">${aed(b.balance)}</b></div></div>`).join('');
  const balByEmp = {}; balances.forEach((b) => { balByEmp[b.employeeId] = b.balance; });
  const aRows = all.map((a) => { const bal = balByEmp[a.employeeId]; return `<div class="li"><div class="ic ${a.status === 'SETTLED' ? 'g' : 'a'}">💵</div><div class="m"><b>${esc(a.employeeName)} · ${aed(a.amount)}</b><span>${esc((a.issuedAt || '').slice(0, 10))}${a.remark ? ' · ' + esc(a.remark) : ''}</span></div><div class="end">${advStatusTag(a.status)}${a.status !== 'SETTLED' ? `<br><button class="btn sm" data-act="advSettle" data-id="${a.id}" data-bal="${bal != null ? bal : ''}" style="margin-top:6px">Settle</button>` : ''}</div></div>`; }).join('');
  openSheet('Advances (admin)', `
    <button class="btn primary full" data-act="advIssueForm" style="margin-bottom:14px">＋ Issue an advance</button>
    <div class="sect">Employee balances</div>
    <div class="card">${bRows || emptyRow('No balances yet.')}</div>
    <div class="sect">All advances (${all.length})</div>
    <div class="card">${aRows || emptyRow('None issued yet.')}</div>`);
}
async function advanceIssueForm() {
  openSheet('Issue an advance', '<div class="empty">Loading team…</div>');
  let team = []; try { team = await staffApi('/api/staff/team', 'GET'); } catch (e) { toast(e.message); }
  openSheet('Issue an advance', `
    <label class="fld"><span class="lab">Employee</span><select id="adv_emp">${team.map((s) => `<option value="${s.id}">${esc(s.name)} (${esc((s.roles || []).join(', '))})</option>`).join('')}</select></label>
    <label class="fld"><span class="lab">Amount (AED)</span><input id="adv_amount" type="number" inputmode="decimal" /></label>
    <label class="fld"><span class="lab">Remark</span><input id="adv_remark" placeholder="e.g. weekly fuel float" /></label>
    <button class="btn primary full" data-act="advIssue">Issue advance</button>`);
}
function findExp(id) { return (myExpData || []).concat(window._admExp || []).find((e) => e.id === id); }
const isAdminNow = () => staff && staff.roles && staff.roles.indexOf('admin') >= 0;

ACT.expAdd = () => expenseForm();
ACT.expOpen = (d) => expenseDetail(findExp(d.id));
ACT.expExtract = async () => {
  if (!expDraft.photo) return toast('Take a photo first');
  toast('Reading…');
  const set = (id, v) => { const el = $('#' + id); if (el && v != null && v !== '') el.value = v; };
  try {
    const r = await apiPost('/api/bills/extract', { imageBase64: expDraft.photo, mediaType: expDraft.mediaType || 'image/jpeg' });
    if (r && r.supplierName !== undefined) { if (r.total != null) set('exp_amount', r.total); set('exp_date', r.invoiceDate); if (r.supplierName) set('exp_remark', r.supplierName); expDraft.ocr = { supplierName: r.supplierName, invoiceDate: r.invoiceDate, total: r.total }; toast('Read — please verify'); return; }
    throw new Error('no data');
  } catch (e) { toast('Claude not connected — enter the details manually'); }
};
ACT.expSave = async () => {
  const amount = parseFloat($('#exp_amount').value); const date = $('#exp_date').value;
  const category = $('#exp_cat').value; const paidFrom = $('#exp_paid').value; const remark = $('#exp_remark').value.trim();
  if (!(amount > 0)) return toast('Enter an amount');
  if (!date) return toast('Pick a date');
  const body = { date, amount, category, paidFrom, remark };
  if (expDraft.photo) { body.billPhoto = expDraft.photo; body.billMediaType = expDraft.mediaType || 'image/jpeg'; }
  if (expDraft.ocr) body.ocr = expDraft.ocr;
  try { const r = await staffApi('/api/expenses', 'POST', body); expDraft = {}; myExpData = null; closeSheet(); render(); toast(r.autoApproved ? 'Expense approved ✓' : 'Expense submitted for approval'); }
  catch (e) { toast(e.message); }
};
ACT.expApprove = async (d) => { try { await staffApi('/api/expenses/' + d.id + '/approve', 'POST', {}); myExpData = null; toast('Approved'); if (isAdminNow()) adminExpenses(); else { closeSheet(); render(); } } catch (e) { toast(e.message); } };
ACT.expReject = async (d) => { const note = prompt('Reason for rejection:'); if (!note) return; try { await staffApi('/api/expenses/' + d.id + '/reject', 'POST', { note }); myExpData = null; toast('Rejected'); if (isAdminNow()) adminExpenses(); else { closeSheet(); render(); } } catch (e) { toast(e.message); } };
ACT.setThreshold = async () => { const v = parseFloat($('#exp_thr').value); if (!(v >= 0)) return toast('Enter a number'); try { await staffApi('/api/expenses/config', 'PUT', { autoApproveThreshold: v }); toast('Threshold saved'); } catch (e) { toast(e.message); } };
ACT.admExpenses = () => adminExpenses();

ACT.admAdvances = () => adminAdvances();
ACT.advIssueForm = () => advanceIssueForm();
ACT.advIssue = async () => { const employeeId = $('#adv_emp').value; const amount = parseFloat($('#adv_amount').value); const remark = $('#adv_remark').value.trim(); if (!(amount > 0)) return toast('Enter an amount'); try { await staffApi('/api/advances', 'POST', { employeeId, amount, remark }); toast('Advance issued'); adminAdvances(); } catch (e) { toast(e.message); } };
ACT.advSettle = async (d) => {
  const note = prompt('Settlement note (optional):') || '';
  const body = { note };
  // Balance-aware: when the running balance is non-zero, capture the cash returned at settle.
  const bal = (d.bal === '' || d.bal == null) ? null : parseFloat(d.bal);
  if (bal !== null && Math.abs(bal) > 0.005) {
    const rc = prompt('Balance is ' + aed(bal) + '. Cash returned now (AED)? Leave blank to skip.', bal > 0 ? String(bal) : '0');
    const n = parseFloat(rc);
    if (rc != null && rc !== '' && !isNaN(n) && n >= 0) body.returnedCash = n;
  }
  try { await staffApi('/api/advances/' + d.id + '/settle', 'POST', body); toast('Settled'); adminAdvances(); } catch (e) { toast(e.message); }
};
ACT.advAck = async (d) => { try { await staffApi('/api/advances/' + d.id + '/ack', 'POST', {}); myAdvData = null; toast('Receipt acknowledged'); render(); } catch (e) { toast(e.message); } };

ACT.myExpensesSheet = async () => { closeSheet(); let list = []; try { list = await staffApi('/api/expenses/mine', 'GET'); } catch (e) { toast(e.message); } window._admExp = null; myExpData = list; openSheet('My expenses', expensesBody(list, true)); };
ACT.myAdvancesSheet = async () => { closeSheet(); let d = { advances: [], balance: {} }; try { d = await staffApi('/api/advances/mine', 'GET'); } catch (e) { toast(e.message); } openSheet('My advances', advancesBody(d)); };

// ===========================================================================
// Staff suggestions — a field-driven improvement inbox. ANY staff can submit an
// idea and see their own; admin sees all and moves them along the lifecycle.
// Talks to /api/suggestions via the staff JWT. Purely additive; reuses the same
// sheet/.li/.card/tag primitives as the rest of the app.
// ===========================================================================
const SUG_CATEGORIES = ['Orders', 'Delivery', 'Stock', 'Finance', 'App', 'Other'];
function sugStatusTag(s) {
  const m = { NEW: 'amber', REVIEWING: 'accent', PLANNED: 'accent', DONE: 'green', DECLINED: 'red' };
  return `<span class="tag ${m[s] || ''}">${String(s || '').toLowerCase()}</span>`;
}
function sugForm() {
  openSheet('Suggest an improvement', `
    <div class="card pad" style="margin-bottom:12px">
      <div style="font-size:13px;font-weight:700">Your idea — what would make the app better?</div>
      <div class="muted" style="font-size:11.5px;margin-top:3px">Anything you'd change, add, or fix. The owner reads every one.</div>
    </div>
    <label class="fld"><span class="lab">Your idea</span><textarea id="sug_text" rows="5" maxlength="1000" placeholder="e.g. Let me see yesterday's deliveries on the home screen"></textarea></label>
    <label class="fld"><span class="lab">Category</span><select id="sug_cat">${SUG_CATEGORIES.map((c) => `<option value="${c}">${c}</option>`).join('')}</select></label>
    <button class="btn primary full" data-act="sugSubmit">Submit idea</button>
    <button class="btn full" data-act="sugMineSheet" style="margin-top:9px">My ideas</button>`);
}
function sugMineBody(list) {
  const rows = (list || []).map((x) => `<div class="li">
    <div class="ic ${x.status === 'DONE' ? 'g' : x.status === 'DECLINED' ? 'r' : 'a'}">💡</div>
    <div class="m"><b>${esc(x.category || 'Other')}</b><span>${esc((x.createdAt || '').slice(0, 10))} · ${esc(String(x.text || '').slice(0, 80))}${String(x.text || '').length > 80 ? '…' : ''}</span></div>
    <div class="end">${sugStatusTag(x.status)}</div></div>`).join('');
  return `<button class="btn primary full" data-act="sugForm" style="margin-bottom:12px">＋ New idea</button>
    <div class="sect">My ideas (${(list || []).length})</div>
    <div class="card">${rows || emptyRow('No ideas yet. Tap “New idea”.')}</div>`;
}
function sugAdminBody(d) {
  const items = (d && d.items) || []; const sum = (d && d.summary) || {};
  const rows = items.map((x) => `<div class="li">
    <div class="ic ${x.status === 'DONE' ? 'g' : x.status === 'DECLINED' ? 'r' : 'a'}">💡</div>
    <div class="m"><b>${esc(x.staffName || '—')} · ${esc(x.category || 'Other')}</b><span>${esc((x.createdAt || '').slice(0, 10))} · ${esc(x.text || '')}</span>
      <div class="btn-row" style="margin-top:6px">
        <button class="btn sm" data-act="sugStatus" data-id="${x.id}" data-s="REVIEWING">Reviewing</button>
        <button class="btn sm" data-act="sugStatus" data-id="${x.id}" data-s="PLANNED">Planned</button>
        <button class="btn green sm" data-act="sugStatus" data-id="${x.id}" data-s="DONE">Done</button>
        <button class="btn danger sm" data-act="sugStatus" data-id="${x.id}" data-s="DECLINED">Declined</button>
      </div></div>
    <div class="end">${sugStatusTag(x.status)}</div></div>`).join('');
  return `<div class="mkpis">${kpi('New', sum.NEW || 0, (sum.NEW || 0) ? 'amber' : 'green')}${kpi('Reviewing', sum.REVIEWING || 0, 'accent')}${kpi('Planned', sum.PLANNED || 0, 'accent')}${kpi('Done', sum.DONE || 0, 'green')}</div>
    <div class="sect">All ideas (${items.length})</div>
    <div class="card">${rows || emptyRow('No ideas submitted yet.')}</div>`;
}
ACT.sugForm = () => sugForm();
ACT.sugSubmit = async () => {
  const text = ($('#sug_text').value || '').trim(); const category = $('#sug_cat').value;
  if (!text) return toast('Please write your idea first');
  try { await staffApi('/api/suggestions', 'POST', { text, category }); closeSheet(); toast('Thanks! Your idea was sent 💡'); }
  catch (e) { toast(e.message); }
};
ACT.sugMineSheet = async () => { closeSheet(); let list = []; try { list = await staffApi('/api/suggestions/mine', 'GET'); } catch (e) { toast(e.message); } openSheet('My ideas', sugMineBody(list)); };
ACT.admSuggestions = () => adminSuggestions();
ACT.sugStatus = async (d) => {
  const note = prompt('Note (optional):') || '';
  try { await staffApi('/api/suggestions/' + d.id + '/status', 'PATCH', { status: d.s, note: note || undefined }); toast('Updated'); adminSuggestions(); }
  catch (e) { toast(e.message); }
};
async function adminSuggestions() {
  closeSheet();
  openSheet('Suggestions (admin)', '<div class="empty"><div class="ei">💡</div>Loading…</div>');
  let d = { items: [], summary: {} };
  try { d = await staffApi('/api/suggestions', 'GET'); } catch (e) { toast(e.message); }
  openSheet('Suggestions (admin)', sugAdminBody(d));
}

// ===========================================================================
// Finance module — the money hub, built on the live System A.
//   Collectors (driver/salesman/anyone): a Receipts tab (collect + my receipts)
//     plus paying a colleague (staff-to-staff transfers).
//   Finance/admin: a Finance hub with segments — Receipts · Payments · Cheques ·
//     Transfers · Overview. Talks to /api/finance/* via the staff JWT.
//   Does not touch orders or the WhatsApp ingest contract.
// ===========================================================================
(function financeHubUI() {
  const RCPT_METHODS = [['CASH', 'Cash'], ['CHEQUE', 'Cheque'], ['BANK', 'Bank transfer'], ['CARD', 'Card']];
  const methodLabel = (m) => ({ CASH: 'Cash', CHEQUE: 'Cheque', BANK: 'Bank transfer', CARD: 'Card' })[m] || m;
  const rcptStatusTag = (s) => { const m = { PENDING_APPROVAL: 'amber', COLLECTED: 'accent', CONFIRMED: 'green', REJECTED: 'red' }; return `<span class="tag ${m[s] || ''}">${String(s || '').toLowerCase().replace(/_/g, ' ')}</span>`; };

  // Add the finance tab (before Muhammed). Collectors get a simple "Receipts" tab;
  // finance/admin get the full "Finance" hub under the same tab id.
  [['driver', 'Receipts', '🧾'], ['salesman', 'Receipts', '🧾'], ['finance', 'Finance', '💰'], ['admin', 'Finance', '💰']].forEach(([r, label, icon]) => {
    const tabs = ROLES[r] && ROLES[r].tabs; if (!tabs || tabs.find((t) => t.id === 'receipts')) return;
    const mi = tabs.findIndex((t) => t.id === 'muhammed');
    tabs.splice(mi < 0 ? tabs.length : mi, 0, { id: 'receipts', label, i: icon });
  });

  const payStatusTag = (s) => { const m = { PENDING_APPROVAL: 'amber', APPROVED: 'green', REJECTED: 'red' }; return `<span class="tag ${m[s] || ''}">${String(s || '').toLowerCase().replace(/_/g, ' ')}</span>`; };
  const trfStatusTag = (s) => { const m = { PENDING_CONFIRM: 'amber', CONFIRMED: 'green', DECLINED: 'red' }; return `<span class="tag ${m[s] || ''}">${String(s || '').toLowerCase().replace(/_/g, ' ')}</span>`; };
  const chqTag = (s) => `<span class="tag ${s === 'CLEARED' ? 'green' : s === 'BOUNCED' ? 'red' : 'amber'}">${String(s || '').toLowerCase()}</span>`;

  let myRcptData = null, allRcptData = null, allPayData = null, chqData = null, myTrfData = null, sumData = null, payCats = null;
  let rcptDraft = {}, payDraft = {}, trfDraft = {};
  let finSeg = localStorage.getItem('ntbf_finseg') || 'receipts';
  async function loadMyRcpt() { try { myRcptData = await staffApi('/api/finance/receipts/mine', 'GET'); } catch (e) { myRcptData = []; toast(e.message); } render(); }
  async function loadAllRcpt() { try { allRcptData = await staffApi('/api/finance/receipts', 'GET'); } catch (e) { allRcptData = []; toast(e.message); } render(); }
  async function loadAllPay() { try { allPayData = await staffApi('/api/finance/payments', 'GET'); } catch (e) { allPayData = []; toast(e.message); } render(); }
  async function loadCheques() { try { chqData = await staffApi('/api/finance/cheques', 'GET'); } catch (e) { chqData = []; toast(e.message); } render(); }
  async function loadMyTrf() { try { myTrfData = await staffApi('/api/finance/transfers/mine', 'GET'); } catch (e) { myTrfData = []; toast(e.message); } render(); }
  async function loadSummary() { try { sumData = await staffApi('/api/finance/summary', 'GET'); } catch (e) { sumData = {}; toast(e.message); } render(); }
  async function ensureCats() { if (payCats) return payCats; try { payCats = (await staffApi('/api/finance/payments/categories', 'GET')).categories; } catch (e) { payCats = []; } return payCats; }
  const isFinanceView = () => role === 'finance' || role === 'admin';
  const refreshFin = () => { myRcptData = allRcptData = allPayData = chqData = myTrfData = sumData = null; };

  function receiptRow(x, acts) {
    return `<div class="li"><div class="ic ${x.status === 'CONFIRMED' ? 'g' : x.status === 'REJECTED' ? 'r' : 'a'}" data-act="rcptOpen" data-id="${x.id}">🧾</div>
      <div class="m" data-act="rcptOpen" data-id="${x.id}"><b>${esc(x.customerName || '—')} · ${aed(x.collectedAmount)}</b><span>${esc(methodLabel(x.method))}${x.billAmount != null ? ' · bill ' + aed(x.billAmount) : ''}${x.discount > 0 ? ' · disc ' + aed(x.discount) : ''}${x.orderId ? ' · ' + esc(x.orderId) : ''}</span></div>
      <div class="end">${acts}</div></div>`;
  }
  function trfRow(x) {
    const iAmReceiver = staff && x.toId === staff.id;
    const canAct = iAmReceiver && x.status === 'PENDING_CONFIRM';
    return `<div class="li"><div class="ic ${x.status === 'CONFIRMED' ? 'g' : x.status === 'DECLINED' ? 'r' : 'a'}" data-act="trfOpen" data-id="${x.id}">🤝</div>
      <div class="m" data-act="trfOpen" data-id="${x.id}"><b>${esc(x.fromName)} → ${esc(x.toName)} · ${aed(x.amount)}</b><span>${esc(methodLabel(x.method))}${x.narration ? ' · ' + esc(x.narration) : ''}</span></div>
      <div class="end">${canAct ? `<button class="btn green sm" data-act="trfConfirm" data-id="${x.id}">✓</button> <button class="btn danger sm" data-act="trfDecline" data-id="${x.id}">✕</button>` : trfStatusTag(x.status)}</div></div>`;
  }
  function transfersBlock(list, showAdd) {
    const rows = (list || []).map((x) => trfRow(x)).join('');
    return `${showAdd ? '<button class="btn full" data-act="trfAdd" style="margin:14px 0 0">＋ Pay a colleague</button>' : ''}
      <div class="sect">Colleague transfers (${(list || []).length})</div>
      <div class="card">${rows || emptyRow('None yet.')}</div>`;
  }
  function collectorBody(list, trf) {
    const rows = (list || []).map((x) => receiptRow(x, rcptStatusTag(x.status))).join('');
    return `<button class="btn primary full" data-act="rcptAdd" style="margin-bottom:12px">＋ Collect a payment</button>
      <div class="sect">My receipts (${(list || []).length})</div>
      <div class="card">${rows || emptyRow('No receipts yet. Tap “Collect a payment”.')}</div>
      ${trf === null ? loadingCard('Loading transfers…') : transfersBlock(trf, true)}`;
  }
  function queueBody(list) {
    const pending = (list || []).filter((x) => x.status === 'PENDING_APPROVAL');
    const toConfirm = (list || []).filter((x) => x.status === 'COLLECTED');
    const recent = (list || []).filter((x) => x.status === 'CONFIRMED' || x.status === 'REJECTED').slice(0, 40);
    return `<div class="mkpis">${kpi('To approve', pending.length, pending.length ? 'amber' : 'green')}${kpi('To confirm', toConfirm.length, toConfirm.length ? 'accent' : 'green')}${kpi('Done', recent.length, 'green')}</div>
      <div class="sect">Discounts awaiting approval (${pending.length})</div>
      <div class="card">${pending.map((x) => receiptRow(x, `<button class="btn green sm" data-act="rcptApprove" data-id="${x.id}">✓</button> <button class="btn danger sm" data-act="rcptReject" data-id="${x.id}">✕</button>`)).join('') || emptyRow('Nothing to approve.')}</div>
      <div class="sect">Awaiting confirmation (${toConfirm.length})</div>
      <div class="card">${toConfirm.map((x) => receiptRow(x, `<button class="btn primary sm" data-act="rcptConfirm" data-id="${x.id}">Confirm</button>`)).join('') || emptyRow('Nothing to confirm.')}</div>
      <div class="sect">Recent (${recent.length})</div>
      <div class="card">${recent.map((x) => receiptRow(x, rcptStatusTag(x.status))).join('') || emptyRow('None yet.')}</div>`;
  }
  function paymentRow(x, acts) {
    return `<div class="li"><div class="ic ${x.status === 'APPROVED' ? 'g' : x.status === 'REJECTED' ? 'r' : 'a'}" data-act="payOpen" data-id="${x.id}">💸</div>
      <div class="m" data-act="payOpen" data-id="${x.id}"><b>${esc(x.payee)} · ${aed(x.amount)}</b><span>${esc(x.category)} · ${esc(methodLabel(x.method))}${x.narration ? ' · ' + esc(x.narration) : ''}</span></div>
      <div class="end">${acts}</div></div>`;
  }
  function paymentsBody(list) {
    const pending = (list || []).filter((x) => x.status === 'PENDING_APPROVAL');
    const done = (list || []).filter((x) => x.status !== 'PENDING_APPROVAL').slice(0, 40);
    const adm = isAdminNow();
    return `<button class="btn primary full" data-act="payAdd" style="margin-bottom:12px">＋ New payment</button>
      <div class="sect">Awaiting approval (${pending.length})</div>
      <div class="card">${pending.map((x) => paymentRow(x, adm ? `<button class="btn green sm" data-act="payApprove" data-id="${x.id}">✓</button> <button class="btn danger sm" data-act="payReject" data-id="${x.id}">✕</button>` : payStatusTag(x.status))).join('') || emptyRow('Nothing pending.')}</div>
      <div class="sect">Recent (${done.length})</div>
      <div class="card">${done.map((x) => paymentRow(x, payStatusTag(x.status))).join('') || emptyRow('No payments yet.')}</div>
      ${adm ? '<button class="btn full" data-act="payCatsForm" style="margin-top:8px">Manage categories</button>' : ''}`;
  }
  function chequesBody(list) {
    const rows = (list || []).map((x) => {
      const st = x.chequeStatus; const a = [];
      if (st === 'RECEIVED') a.push(`<button class="btn sm" data-act="chqAct" data-kind="${x.kind}" data-id="${x.id}" data-a="deposit">Deposit</button>`);
      if (st === 'RECEIVED' || st === 'DEPOSITED') { a.push(`<button class="btn green sm" data-act="chqAct" data-kind="${x.kind}" data-id="${x.id}" data-a="clear">Cleared</button>`); a.push(`<button class="btn danger sm" data-act="chqAct" data-kind="${x.kind}" data-id="${x.id}" data-a="bounce">Bounced</button>`); }
      return `<div class="li"><div class="ic ${st === 'CLEARED' ? 'g' : st === 'BOUNCED' ? 'r' : 'a'}">▤</div>
        <div class="m"><b>${esc(x.party)} · ${aed(x.amount)}</b><span>${x.kind === 'in' ? 'incoming' : 'outgoing'}${x.cheque && x.cheque.no ? ' · ' + esc(x.cheque.no) : ''}${x.cheque && x.cheque.bank ? ' · ' + esc(x.cheque.bank) : ''}${x.cheque && x.cheque.bounceCharge ? ' · +' + aed(x.cheque.bounceCharge) + ' charge' : ''}</span>${a.length ? `<div class="btn-row">${a.join('')}</div>` : ''}</div>
        <div class="end">${chqTag(st)}</div></div>`;
    }).join('');
    return `<div class="sect">Cheques (${(list || []).length})</div><div class="card">${rows || emptyRow('No cheques yet.')}</div>`;
  }
  function overviewBody(s) {
    s = s || {};
    return `<div class="mkpis">
        ${kpi('Money in', aed(s.moneyIn || 0), 'green')}
        ${kpi('Money out', aed(s.moneyOut || 0), 'red')}
        ${kpi('Net', aed(s.net || 0), (s.net || 0) < 0 ? 'red' : 'green')}
        ${kpi('To approve', (s.receiptsPendingApproval || 0) + (s.paymentsPending || 0), ((s.receiptsPendingApproval || 0) + (s.paymentsPending || 0)) ? 'amber' : 'green')}
        ${kpi('To confirm', s.receiptsToConfirm || 0, (s.receiptsToConfirm || 0) ? 'accent' : 'green')}
        ${kpi('Cheques out', s.chequesOutstanding || 0, 'accent')}
        ${kpi('Bounced', s.chequesBounced || 0, (s.chequesBounced || 0) ? 'red' : 'green')}
        ${kpi('Receipts', s.receiptsCount || 0)}
        ${kpi('Payments', s.paymentsCount || 0)}
      </div>
      <div class="card pad"><div class="muted" style="font-size:12px">Money in = confirmed customer receipts. Money out = approved company payments. Cheques out = received/deposited, not yet cleared.</div></div>`;
  }
  function finSegBar() {
    const segs = [['receipts', 'Receipts'], ['payments', 'Payments'], ['cheques', 'Cheques'], ['transfers', 'Transfers'], ['overview', 'Overview']];
    return `<div class="seg" style="margin-bottom:12px;overflow-x:auto">${segs.map(([id, l]) => `<button class="${finSeg === id ? 'on' : ''}" data-act="finSeg" data-id="${id}">${l}</button>`).join('')}</div>`;
  }
  views.receipts = function () {
    if (isFinanceView()) {
      let sub = '';
      if (finSeg === 'receipts') sub = allRcptData === null ? (setTimeout(loadAllRcpt, 0), loadingCard('Loading…')) : queueBody(allRcptData);
      else if (finSeg === 'payments') sub = allPayData === null ? (setTimeout(loadAllPay, 0), loadingCard('Loading…')) : paymentsBody(allPayData);
      else if (finSeg === 'cheques') sub = chqData === null ? (setTimeout(loadCheques, 0), loadingCard('Loading…')) : chequesBody(chqData);
      else if (finSeg === 'transfers') sub = myTrfData === null ? (setTimeout(loadMyTrf, 0), loadingCard('Loading…')) : transfersBlock(myTrfData, true);
      else sub = sumData === null ? (setTimeout(loadSummary, 0), loadingCard('Loading…')) : overviewBody(sumData);
      return finSegBar() + sub;
    }
    if (myRcptData === null) { setTimeout(loadMyRcpt, 0); return loadingCard('Loading your receipts…'); }
    if (myTrfData === null) setTimeout(loadMyTrf, 0);
    return collectorBody(myRcptData, myTrfData);
  };

  function receiptForm() {
    rcptDraft = {};
    openSheet('Collect a payment', `
      <label class="fld"><span class="lab">Order no (optional)</span>
        <div style="display:flex;gap:8px"><input id="rcpt_order" placeholder="e.g. ORD-1023" style="flex:1" /><button class="btn" data-act="rcptLookup">Look up</button></div></label>
      <div id="rcpt_billinfo" class="muted" style="font-size:12px;margin:2px 2px 8px"></div>
      <label class="fld"><span class="lab">Customer</span><input id="rcpt_customer" placeholder="Customer name" /></label>
      <label class="fld"><span class="lab">Bill amount (AED)</span><input id="rcpt_bill" type="number" inputmode="decimal" placeholder="0.00" /></label>
      <label class="fld"><span class="lab">Amount collected (AED)</span><input id="rcpt_amount" type="number" inputmode="decimal" placeholder="0.00" /></label>
      <label class="fld"><span class="lab">Method</span><select id="rcpt_method">${RCPT_METHODS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label>
      <div id="rcpt_cheque" style="display:none">
        <label class="fld"><span class="lab">Cheque no</span><input id="rcpt_chqno" /></label>
        <label class="fld"><span class="lab">Bank</span><input id="rcpt_chqbank" /></label>
        <label class="fld"><span class="lab">Cheque date</span><input id="rcpt_chqdate" type="date" /></label>
      </div>
      <label class="fld"><span class="lab">Narration</span><input id="rcpt_narration" placeholder="e.g. part payment, balance next week" /></label>
      <div class="muted" style="font-size:12.5px;margin-bottom:6px">Optional: photograph the bill / cheque.</div>
      <input type="file" id="rcpt_file" accept="image/*" capture="environment" style="margin-bottom:8px" />
      <div id="rcpt_preview"></div>
      <button class="btn primary full" data-act="rcptSave">Save receipt</button>
      <p class="muted" style="font-size:11.5px;margin-top:8px">Collect less than the bill and the discount goes to finance for approval. Every receipt is confirmed by the office.</p>`,
      (sh) => {
        const meth = sh.querySelector('#rcpt_method'); const chq = sh.querySelector('#rcpt_cheque');
        const sync = () => { chq.style.display = meth.value === 'CHEQUE' ? 'block' : 'none'; };
        meth.addEventListener('change', sync); sync();
        sh.querySelector('#rcpt_file').addEventListener('change', async function () {
          const f = this.files[0]; if (!f) return;
          const shot = await downscaleImage(f); if (!shot) return;
          rcptDraft.photo = shot.dataUrl; rcptDraft.mediaType = shot.mediaType;
          sh.querySelector('#rcpt_preview').innerHTML = `<img src="${shot.dataUrl}" style="width:100%;border-radius:10px;border:1px solid var(--line);margin-bottom:10px" />`;
        });
      });
  }

  function receiptDetail(x) {
    if (!x) return;
    const fin = isFinanceView();
    const hist = (x.statusHistory || []).map((h) => `<div class="li"><div class="ic ${h.to === 'CONFIRMED' || h.to === 'COLLECTED' ? 'g' : h.to === 'REJECTED' ? 'r' : 'a'}">•</div><div class="m"><b>${esc(String(h.to).replace(/_/g, ' '))}</b><span>${esc((h.at || '').slice(0, 16).replace('T', ' '))} · ${esc(h.by)}${h.note ? ' · ' + esc(h.note) : ''}</span></div></div>`).join('');
    const items = (x.billItems || []).map((i) => `<div class="li"><div class="ic a">▪</div><div class="m"><b>${esc(i.name)}</b><span>${i.qty} × ${aed(i.price)}${i.unit ? ' · ' + esc(i.unit) : ''}</span></div><div class="end">${aed((i.qty || 0) * (i.price || 0))}</div></div>`).join('');
    let actions = '';
    if (fin && x.status === 'PENDING_APPROVAL') actions = `<div class="btn-row" style="margin-top:12px"><button class="btn green" data-act="rcptApprove" data-id="${x.id}">Approve discount</button><button class="btn danger" data-act="rcptReject" data-id="${x.id}">Reject</button></div>`;
    else if (fin && x.status === 'COLLECTED') actions = `<button class="btn primary full" data-act="rcptConfirm" data-id="${x.id}" style="margin-top:12px">Confirm received</button>`;
    let chequeActions = '';
    if (fin && x.method === 'CHEQUE' && x.cheque && x.cheque.status !== 'CLEARED' && x.cheque.status !== 'BOUNCED') {
      const st = x.cheque.status || 'RECEIVED'; const b = [];
      if (st === 'RECEIVED') b.push(`<button class="btn sm" data-act="chqAct" data-kind="in" data-id="${x.id}" data-a="deposit">Deposit</button>`);
      b.push(`<button class="btn green sm" data-act="chqAct" data-kind="in" data-id="${x.id}" data-a="clear">Cleared</button>`);
      b.push(`<button class="btn danger sm" data-act="chqAct" data-kind="in" data-id="${x.id}" data-a="bounce">Bounced</button>`);
      chequeActions = `<div class="sect">Cheque · ${esc(st.toLowerCase())}</div><div class="btn-row">${b.join('')}</div>`;
    }
    openSheet('Receipt · ' + aed(x.collectedAmount), `
      <div id="rcpt_photo"></div>
      <div class="card">
        ${row('🧾', 'a', 'Receipt', esc(x.id), '')}
        ${row('👤', 'a', 'Customer', esc(x.customerName || '—'), '')}
        ${x.orderId ? row('▣', 'a', 'Order', esc(x.orderId), '') : ''}
        ${x.billAmount != null ? row('🧮', 'a', 'Bill amount', aed(x.billAmount), '') : ''}
        ${row('💵', 'g', 'Collected', aed(x.collectedAmount), '')}
        ${x.discount > 0 ? row('🏷', 'a', 'Discount', aed(x.discount), '') : ''}
        ${row('💳', 'a', 'Method', esc(methodLabel(x.method)) + (x.cheque && x.cheque.no ? ' · ' + esc(x.cheque.no) : ''), '')}
        ${row('💬', 'a', 'Narration', esc(x.narration || '—'), '')}
        ${row('•', x.status === 'CONFIRMED' ? 'g' : x.status === 'REJECTED' ? 'r' : 'a', 'Status', rcptStatusTag(x.status), '')}
        ${row('🧍', 'a', 'Collected by', esc(x.collectedBy || '—'), '')}
      </div>
      ${items ? `<div class="sect">Bill items</div><div class="card">${items}</div>` : ''}
      ${actions}
      ${chequeActions}
      <div class="sect">Timeline</div><div class="card">${hist || emptyRow('—')}</div>`,
      (sh) => { if (x.hasPhoto) { staffApi('/api/finance/receipts/' + x.id + '/photo', 'GET').then((r) => { if (r && r.dataUrl) { const el = sh.querySelector('#rcpt_photo'); if (el) el.innerHTML = `<img src="${r.dataUrl}" style="width:100%;border-radius:10px;border:1px solid var(--line);margin-bottom:12px" />`; } }).catch(() => {}); } });
  }
  const findRcpt = (id) => (myRcptData || []).concat(allRcptData || []).find((r) => r.id === id);
  const findPay = (id) => (allPayData || []).find((r) => r.id === id);
  const findTrf = (id) => (myTrfData || []).find((r) => r.id === id);

  // ---- Payment form + detail ----
  async function paymentForm() {
    payDraft = {};
    const cats = await ensureCats();
    const today = new Date().toISOString().slice(0, 10);
    openSheet('New payment', `
      <label class="fld"><span class="lab">Paid to</span><input id="pay_payee" placeholder="Supplier / person" /></label>
      <label class="fld"><span class="lab">Amount (AED)</span><input id="pay_amount" type="number" inputmode="decimal" placeholder="0.00" /></label>
      <label class="fld"><span class="lab">Category</span><select id="pay_cat">${(cats || []).map((c) => `<option>${esc(c)}</option>`).join('')}</select></label>
      <label class="fld"><span class="lab">Date</span><input id="pay_date" type="date" value="${today}" /></label>
      <label class="fld"><span class="lab">Method</span><select id="pay_method">${RCPT_METHODS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label>
      <div id="pay_cheque" style="display:none">
        <label class="fld"><span class="lab">Cheque no</span><input id="pay_chqno" /></label>
        <label class="fld"><span class="lab">Bank</span><input id="pay_chqbank" /></label>
        <label class="fld"><span class="lab">Cheque date</span><input id="pay_chqdate" type="date" /></label>
      </div>
      <label class="fld"><span class="lab">Narration</span><input id="pay_narration" placeholder="What is this payment for?" /></label>
      <input type="file" id="pay_file" accept="image/*" capture="environment" style="margin:6px 0 8px" />
      <div id="pay_preview"></div>
      <button class="btn primary full" data-act="paySave">Submit for approval</button>
      <p class="muted" style="font-size:11.5px;margin-top:8px">Every payment needs admin approval before it is paid.</p>`,
      (sh) => {
        const m = sh.querySelector('#pay_method'); const c = sh.querySelector('#pay_cheque');
        const sync = () => { c.style.display = m.value === 'CHEQUE' ? 'block' : 'none'; };
        m.addEventListener('change', sync); sync();
        sh.querySelector('#pay_file').addEventListener('change', async function () {
          const f = this.files[0]; if (!f) return; const shot = await downscaleImage(f); if (!shot) return;
          payDraft.photo = shot.dataUrl; payDraft.mediaType = shot.mediaType;
          sh.querySelector('#pay_preview').innerHTML = `<img src="${shot.dataUrl}" style="width:100%;border-radius:10px;border:1px solid var(--line);margin-bottom:10px" />`;
        });
      });
  }
  function paymentDetail(x) {
    if (!x) return;
    const adm = isAdminNow();
    const hist = (x.statusHistory || []).map((h) => `<div class="li"><div class="ic ${h.to === 'APPROVED' ? 'g' : h.to === 'REJECTED' ? 'r' : 'a'}">•</div><div class="m"><b>${esc(String(h.to).replace(/_/g, ' '))}</b><span>${esc((h.at || '').slice(0, 16).replace('T', ' '))} · ${esc(h.by)}${h.note ? ' · ' + esc(h.note) : ''}</span></div></div>`).join('');
    let actions = '';
    if (adm && x.status === 'PENDING_APPROVAL') actions = `<div class="btn-row" style="margin-top:12px"><button class="btn green" data-act="payApprove" data-id="${x.id}">Approve</button><button class="btn danger" data-act="payReject" data-id="${x.id}">Reject</button></div>`;
    let chequeActions = '';
    if (x.method === 'CHEQUE' && x.cheque && x.cheque.status !== 'CLEARED' && x.cheque.status !== 'BOUNCED') {
      const st = x.cheque.status || 'RECEIVED'; const b = [];
      if (st === 'RECEIVED') b.push(`<button class="btn sm" data-act="chqAct" data-kind="out" data-id="${x.id}" data-a="deposit">Presented</button>`);
      b.push(`<button class="btn green sm" data-act="chqAct" data-kind="out" data-id="${x.id}" data-a="clear">Cleared</button>`);
      b.push(`<button class="btn danger sm" data-act="chqAct" data-kind="out" data-id="${x.id}" data-a="bounce">Bounced</button>`);
      chequeActions = `<div class="sect">Cheque · ${esc(st.toLowerCase())}</div><div class="btn-row">${b.join('')}</div>`;
    }
    openSheet('Payment · ' + aed(x.amount), `
      <div id="pay_photo"></div>
      <div class="card">
        ${row('💸', 'a', 'Payment', esc(x.id), '')}
        ${row('👤', 'a', 'Paid to', esc(x.payee), '')}
        ${row('🏷', 'a', 'Category', esc(x.category), '')}
        ${row('💰', 'r', 'Amount', aed(x.amount), '')}
        ${row('💳', 'a', 'Method', esc(methodLabel(x.method)) + (x.cheque && x.cheque.no ? ' · ' + esc(x.cheque.no) : ''), '')}
        ${row('📅', 'a', 'Date', esc(x.date || '—'), '')}
        ${row('💬', 'a', 'Narration', esc(x.narration || '—'), '')}
        ${row('•', x.status === 'APPROVED' ? 'g' : x.status === 'REJECTED' ? 'r' : 'a', 'Status', payStatusTag(x.status), '')}
        ${row('🧍', 'a', 'Created by', esc(x.createdBy || '—'), '')}
      </div>
      ${actions}
      ${chequeActions}
      <div class="sect">Timeline</div><div class="card">${hist || emptyRow('—')}</div>`,
      (sh) => { if (x.hasPhoto) { staffApi('/api/finance/payments/' + x.id + '/photo', 'GET').then((r) => { if (r && r.dataUrl) { const el = sh.querySelector('#pay_photo'); if (el) el.innerHTML = `<img src="${r.dataUrl}" style="width:100%;border-radius:10px;border:1px solid var(--line);margin-bottom:12px" />`; } }).catch(() => {}); } });
  }
  // ---- Transfer form + detail ----
  async function transferForm() {
    trfDraft = {};
    openSheet('Pay a colleague', '<div class="empty">Loading colleagues…</div>');
    let team = []; try { team = await staffApi('/api/finance/colleagues', 'GET'); } catch (e) { toast(e.message); }
    openSheet('Pay a colleague', `
      <label class="fld"><span class="lab">Colleague</span><select id="trf_to">${(team || []).map((s) => `<option value="${s.id}">${esc(s.name)} (${esc((s.roles || []).join(', '))})</option>`).join('')}</select></label>
      <label class="fld"><span class="lab">Amount (AED)</span><input id="trf_amount" type="number" inputmode="decimal" placeholder="0.00" /></label>
      <label class="fld"><span class="lab">Method</span><select id="trf_method">${RCPT_METHODS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label>
      <label class="fld"><span class="lab">Narration</span><input id="trf_narration" placeholder="e.g. shared fuel" /></label>
      <button class="btn primary full" data-act="trfSave">Record payment</button>
      <p class="muted" style="font-size:11.5px;margin-top:8px">The colleague you paid confirms they received it. This stays between you two — it doesn’t go to admin.</p>`);
  }
  function transferDetail(x) {
    if (!x) return;
    const iAmReceiver = staff && x.toId === staff.id;
    const hist = (x.statusHistory || []).map((h) => `<div class="li"><div class="ic ${h.to === 'CONFIRMED' ? 'g' : h.to === 'DECLINED' ? 'r' : 'a'}">•</div><div class="m"><b>${esc(String(h.to).replace(/_/g, ' '))}</b><span>${esc((h.at || '').slice(0, 16).replace('T', ' '))} · ${esc(h.by)}${h.note ? ' · ' + esc(h.note) : ''}</span></div></div>`).join('');
    const actions = (iAmReceiver && x.status === 'PENDING_CONFIRM') ? `<div class="btn-row" style="margin-top:12px"><button class="btn green" data-act="trfConfirm" data-id="${x.id}">Confirm received</button><button class="btn danger" data-act="trfDecline" data-id="${x.id}">Decline</button></div>` : '';
    openSheet('Transfer · ' + aed(x.amount), `
      <div class="card">
        ${row('🤝', 'a', 'Transfer', esc(x.id), '')}
        ${row('➡', 'a', 'From → To', esc(x.fromName) + ' → ' + esc(x.toName), '')}
        ${row('💵', 'g', 'Amount', aed(x.amount), '')}
        ${row('💳', 'a', 'Method', esc(methodLabel(x.method)), '')}
        ${row('💬', 'a', 'Narration', esc(x.narration || '—'), '')}
        ${row('•', x.status === 'CONFIRMED' ? 'g' : x.status === 'DECLINED' ? 'r' : 'a', 'Status', trfStatusTag(x.status), '')}
      </div>
      ${actions}
      <div class="sect">Timeline</div><div class="card">${hist || emptyRow('—')}</div>`);
  }

  ACT.rcptAdd = () => receiptForm();
  ACT.rcptOpen = (d) => receiptDetail(findRcpt(d.id));
  ACT.rcptLookup = async () => {
    const id = ($('#rcpt_order').value || '').trim(); if (!id) return toast('Type an order no');
    try {
      const o = await staffApi('/api/finance/orders/' + encodeURIComponent(id) + '/lookup', 'GET');
      const set = (i, v) => { const el = $('#' + i); if (el && v != null) el.value = v; };
      set('rcpt_customer', o.customerName); set('rcpt_bill', o.billAmount);
      const inf = $('#rcpt_billinfo'); if (inf) inf.textContent = `Bill ${aed(o.billAmount)} · ${o.customerName || ''} · ${(o.items || []).length} item(s)`;
      rcptDraft.orderId = o.orderId; toast('Bill loaded');
    } catch (e) { toast(e.message); }
  };
  ACT.rcptSave = async () => {
    const collected = parseFloat($('#rcpt_amount').value); if (!(collected > 0)) return toast('Enter the amount collected');
    const method = $('#rcpt_method').value;
    const body = { collectedAmount: collected, method };
    const narration = ($('#rcpt_narration').value || '').trim(); if (narration) body.narration = narration;
    if (rcptDraft.orderId) { body.orderId = rcptDraft.orderId; }
    else { const cn = ($('#rcpt_customer').value || '').trim(); const bill = parseFloat($('#rcpt_bill').value); if (cn) body.customerName = cn; if (bill > 0) body.billAmount = bill; }
    if (method === 'CHEQUE') { body.cheque = { no: ($('#rcpt_chqno').value || '').trim(), bank: ($('#rcpt_chqbank').value || '').trim(), date: ($('#rcpt_chqdate').value || '').trim() }; }
    if (rcptDraft.photo) { body.billPhoto = rcptDraft.photo; body.billMediaType = rcptDraft.mediaType || 'image/jpeg'; }
    try { const r = await staffApi('/api/finance/receipts', 'POST', body); rcptDraft = {}; refreshFin(); closeSheet(); render(); toast(r.status === 'PENDING_APPROVAL' ? 'Saved — discount sent to finance for approval' : 'Receipt saved'); }
    catch (e) { toast(e.message); }
  };
  ACT.rcptApprove = async (d) => { try { await staffApi('/api/finance/receipts/' + d.id + '/approve', 'POST', {}); refreshFin(); toast('Discount approved'); closeSheet(); render(); } catch (e) { toast(e.message); } };
  ACT.rcptReject = async (d) => { const note = prompt('Reason for rejection:'); if (!note) return; try { await staffApi('/api/finance/receipts/' + d.id + '/reject', 'POST', { note }); refreshFin(); toast('Rejected'); closeSheet(); render(); } catch (e) { toast(e.message); } };
  ACT.rcptConfirm = async (d) => { try { await staffApi('/api/finance/receipts/' + d.id + '/confirm', 'POST', {}); refreshFin(); toast('Confirmed received ✓'); closeSheet(); render(); } catch (e) { toast(e.message); } };

  // ---- segment switch ----
  ACT.finSeg = (d) => { finSeg = d.id; localStorage.setItem('ntbf_finseg', d.id); render(); };

  // ---- payments ----
  ACT.payAdd = () => paymentForm();
  ACT.payOpen = (d) => paymentDetail(findPay(d.id));
  ACT.paySave = async () => {
    const payee = ($('#pay_payee').value || '').trim(); if (!payee) return toast('Enter who is being paid');
    const amount = parseFloat($('#pay_amount').value); if (!(amount > 0)) return toast('Enter an amount');
    const method = $('#pay_method').value;
    const body = { payee, amount, method, category: $('#pay_cat').value, date: $('#pay_date').value };
    const narration = ($('#pay_narration').value || '').trim(); if (narration) body.narration = narration;
    if (method === 'CHEQUE') { body.cheque = { no: ($('#pay_chqno').value || '').trim(), bank: ($('#pay_chqbank').value || '').trim(), date: ($('#pay_chqdate').value || '').trim() }; }
    if (payDraft.photo) { body.billPhoto = payDraft.photo; body.billMediaType = payDraft.mediaType || 'image/jpeg'; }
    try { await staffApi('/api/finance/payments', 'POST', body); payDraft = {}; refreshFin(); closeSheet(); render(); toast('Payment submitted for admin approval'); }
    catch (e) { toast(e.message); }
  };
  ACT.payApprove = async (d) => { try { await staffApi('/api/finance/payments/' + d.id + '/approve', 'POST', {}); refreshFin(); toast('Payment approved'); closeSheet(); render(); } catch (e) { toast(e.message); } };
  ACT.payReject = async (d) => { const note = prompt('Reason for rejection:'); if (!note) return; try { await staffApi('/api/finance/payments/' + d.id + '/reject', 'POST', { note }); refreshFin(); toast('Payment rejected'); closeSheet(); render(); } catch (e) { toast(e.message); } };
  ACT.payCatsForm = async () => {
    const cats = await ensureCats();
    openSheet('Payment categories', `
      <div class="muted" style="font-size:12.5px;margin-bottom:8px">One category per line. These appear in the New payment dropdown.</div>
      <textarea id="pay_cats" rows="10" style="resize:vertical">${esc((cats || []).join('\n'))}</textarea>
      <button class="btn primary full" data-act="payCatsSave" style="margin-top:10px">Save categories</button>`);
  };
  ACT.payCatsSave = async () => {
    const categories = ($('#pay_cats').value || '').split('\n').map((s) => s.trim()).filter(Boolean);
    if (!categories.length) return toast('Add at least one category');
    try { const r = await staffApi('/api/finance/payments/categories', 'PUT', { categories }); payCats = r.categories; toast('Categories saved'); closeSheet(); } catch (e) { toast(e.message); }
  };

  // ---- cheques ----
  ACT.chqAct = async (d) => {
    const path = d.kind === 'out' ? '/api/finance/payments/' : '/api/finance/receipts/';
    try { await staffApi(path + d.id + '/cheque', 'POST', { action: d.a }); refreshFin(); toast('Cheque ' + (d.a === 'deposit' ? 'deposited' : d.a === 'clear' ? 'cleared' : 'bounced')); closeSheet(); render(); } catch (e) { toast(e.message); }
  };

  // ---- transfers ----
  ACT.trfAdd = () => transferForm();
  ACT.trfOpen = (d) => transferDetail(findTrf(d.id));
  ACT.trfSave = async () => {
    const toStaffId = $('#trf_to').value; if (!toStaffId) return toast('Pick a colleague');
    const amount = parseFloat($('#trf_amount').value); if (!(amount > 0)) return toast('Enter an amount');
    const body = { toStaffId, amount, method: $('#trf_method').value };
    const narration = ($('#trf_narration').value || '').trim(); if (narration) body.narration = narration;
    try { await staffApi('/api/finance/transfers', 'POST', body); refreshFin(); closeSheet(); render(); toast('Recorded — waiting for their confirmation'); }
    catch (e) { toast(e.message); }
  };
  ACT.trfConfirm = async (d) => { try { await staffApi('/api/finance/transfers/' + d.id + '/confirm', 'POST', {}); refreshFin(); toast('Confirmed ✓'); closeSheet(); render(); } catch (e) { toast(e.message); } };
  ACT.trfDecline = async (d) => { try { await staffApi('/api/finance/transfers/' + d.id + '/decline', 'POST', {}); refreshFin(); toast('Declined'); closeSheet(); render(); } catch (e) { toast(e.message); } };

  // Reachable from ⚙ Settings for every role too.
  ACT.rcptCollectSheet = () => { closeSheet(); receiptForm(); };
  ACT.rcptQueueSheet = async () => { closeSheet(); let list = []; try { list = await staffApi('/api/finance/receipts', 'GET'); } catch (e) { toast(e.message); } allRcptData = list; openSheet('Receipt approvals', queueBody(list)); };
  ACT.trfMineSheet = async () => { closeSheet(); let list = []; try { list = await staffApi('/api/finance/transfers/mine', 'GET'); } catch (e) { toast(e.message); } myTrfData = list; openSheet('My transfers', transfersBlock(list, true)); };
})();

// ===========================================================================
// Oversight — the Finance/Management "Documents" dashboard. One read-only place
// where finance + admin see EVERY staff-uploaded bill/receipt/document across
// all five stores (expenses · advances · receipts · payments · transfers),
// each with its photo and its update history. Reuses the KPI-tile, segmented
// filter, .tag/.li and photo/timeline primitives from the finance hub. Reads
// /api/finance/documents(+/summary); never writes anything.
// ===========================================================================
(function oversightUI() {
  // Finance + admin only — inject a Documents tab the same way the finance hub does.
  ['finance', 'admin'].forEach((r) => {
    const tabs = ROLES[r] && ROLES[r].tabs; if (!tabs || tabs.find((t) => t.id === 'documents')) return;
    const mi = tabs.findIndex((t) => t.id === 'muhammed');
    tabs.splice(mi < 0 ? tabs.length : mi, 0, { id: 'documents', label: 'Documents', i: '📄' });
  });
  const canSeeDocs = () => role === 'finance' || role === 'admin';

  const DOC_TYPES = [['all', 'All'], ['expense', 'Expenses'], ['receipt', 'Receipts'], ['payment', 'Payments'], ['transfer', 'Transfers'], ['advance', 'Advances']];
  const DOC_STATUSES = [['all', 'All'], ['pending', 'Pending'], ['done', 'Done'], ['rejected', 'Rejected']];
  const typeMeta = { expense: ['🧾', 'accent', 'Expense'], receipt: ['💵', 'blue', 'Receipt'], payment: ['💸', 'purple', 'Payment'], transfer: ['🤝', 'amber', 'Transfer'], advance: ['🏦', 'gray', 'Advance'] };
  const GREEN = ['APPROVED', 'CONFIRMED', 'COLLECTED', 'SETTLED', 'CLEARED', 'ACKNOWLEDGED'];
  const RED = ['REJECTED', 'DECLINED', 'BOUNCED'];
  const docStatusCls = (s) => GREEN.indexOf(s) >= 0 ? 'green' : RED.indexOf(s) >= 0 ? 'red' : 'amber';
  const docStatusTag = (s) => `<span class="tag ${docStatusCls(s)}">${String(s || '').toLowerCase().replace(/_/g, ' ')}</span>`;
  const docTypeBadge = (t) => { const m = typeMeta[t] || ['📄', 'gray', t]; return `<span class="tag ${m[1]}">${m[2]}</span>`; };
  // Coarse status buckets so one filter spans the five different lifecycles.
  const statusBucket = (s) => GREEN.indexOf(s) >= 0 ? 'done' : RED.indexOf(s) >= 0 ? 'rejected' : 'pending';

  // Shared update-history timeline (also handy for any doc detail sheet).
  function docTimelineHtml(hist) {
    return (hist || []).map((h) => `<div class="li"><div class="ic ${GREEN.indexOf(h.to) >= 0 ? 'g' : RED.indexOf(h.to) >= 0 ? 'r' : 'a'}">•</div><div class="m"><b>${esc(String(h.to || '').replace(/_/g, ' '))}</b><span>${esc((h.at || '').slice(0, 16).replace('T', ' '))}${h.by ? ' · ' + esc(h.by) : ''}${h.note ? ' · ' + esc(h.note) : ''}</span></div></div>`).join('');
  }

  let docData = null, docSummary = null;
  let docType = localStorage.getItem('ntbf_doctype') || 'all';
  let docStatus = localStorage.getItem('ntbf_docstatus') || 'all';
  async function loadDocs() {
    try { const [list, sum] = await Promise.all([staffApi('/api/finance/documents', 'GET'), staffApi('/api/finance/documents/summary', 'GET')]); docData = Array.isArray(list) ? list : []; docSummary = sum || {}; }
    catch (e) { docData = []; docSummary = {}; toast(e.message); }
    render();
  }

  function docKpis(s) {
    s = s || {}; const bt = s.byType || {};
    return `<div class="mkpis">
        ${kpi('Documents', s.total || 0)}
        ${kpi('Total value', aed(s.totalValue || 0), 'accent')}
        ${kpi('With photo', s.withPhotos || 0, (s.withPhotos || 0) ? 'green' : '')}
        ${kpi('Expenses', bt.expense || 0)}
        ${kpi('Receipts', bt.receipt || 0)}
        ${kpi('Payments', bt.payment || 0)}
        ${kpi('Transfers', bt.transfer || 0)}
        ${kpi('Advances', bt.advance || 0)}
      </div>`;
  }
  function docSegBar(segs, cur, act) {
    return `<div class="seg" style="margin-bottom:10px;overflow-x:auto">${segs.map(([id, l]) => `<button class="${cur === id ? 'on' : ''}" data-act="${act}" data-id="${id}">${l}</button>`).join('')}</div>`;
  }
  function docRow(d) {
    const m = typeMeta[d.docType] || ['📄', 'gray', d.docType];
    const ic = docStatusCls(d.status) === 'green' ? 'g' : docStatusCls(d.status) === 'red' ? 'r' : 'a';
    const sub = [esc(d.summary || d.category || '—'), d.date ? esc(d.date) : '', d.hasPhoto ? '📎' : ''].filter(Boolean).join(' · ');
    return `<div class="li" data-act="docOpen" data-id="${d.id}">
      <div class="ic ${ic}">${m[0]}</div>
      <div class="m"><b>${docTypeBadge(d.docType)} ${esc(d.staff && d.staff.name || '—')} · ${aed(d.amount)}</b><span>${sub}</span></div>
      <div class="end">${docStatusTag(d.status)}</div></div>`;
  }
  function docsBody() {
    const list = (docData || []).filter((d) => (docType === 'all' || d.docType === docType) && (docStatus === 'all' || statusBucket(d.status) === docStatus));
    const rows = list.map((d) => docRow(d)).join('');
    return '<button class="btn primary full" data-act="finAdvIssueForm" style="margin-bottom:12px">＋ Issue advance</button>'
      + docKpis(docSummary)
      + docSegBar(DOC_TYPES, docType, 'docType')
      + docSegBar(DOC_STATUSES, docStatus, 'docStatus')
      + `<div class="sect">Documents (${list.length})</div>`
      + `<div class="card">${rows || emptyRow('No documents match this filter.')}</div>`;
  }
  views.documents = function () {
    if (!canSeeDocs()) return emptyRow('Finance or management only.');
    if (docData === null) { setTimeout(loadDocs, 0); return loadingCard('Loading documents…'); }
    return docsBody();
  };

  function docDetail(d) {
    if (!d) return;
    const m = typeMeta[d.docType] || ['📄', 'gray', d.docType];
    openSheet(m[2] + ' · ' + aed(d.amount), `
      <div id="doc_photo"></div>
      <div class="card">
        ${row(m[0], 'a', 'Type', docTypeBadge(d.docType), '')}
        ${row('▣', 'a', 'Reference', esc(d.id), '')}
        ${row('🧍', 'a', 'Staff', esc(d.staff && d.staff.name || '—'), '')}
        ${row('💰', docStatusCls(d.status) === 'red' ? 'r' : 'g', 'Amount', aed(d.amount), '')}
        ${d.category ? row('🏷', 'a', 'Category', esc(d.category), '') : ''}
        ${d.paidFrom ? row('💳', 'a', 'Paid from', esc(String(d.paidFrom).replace(/_/g, ' ')), '') : ''}
        ${d.date ? row('📅', 'a', 'Date', esc(d.date), '') : ''}
        ${d.summary ? row('💬', 'a', 'Summary', esc(d.summary), '') : ''}
        ${row('•', docStatusCls(d.status) === 'green' ? 'g' : docStatusCls(d.status) === 'red' ? 'r' : 'a', 'Status', docStatusTag(d.status), '')}
        ${row('📎', d.hasPhoto ? 'g' : 'a', 'Photo', d.hasPhoto ? 'attached' : 'none', '')}
      </div>
      ${d.staff && d.staff.id ? `<button class="btn full" data-act="docStatement" data-id="${esc(d.staff.id)}" data-name="${esc(d.staff.name || '')}" style="margin-top:12px">📄 View this staff's prepayment statement</button>` : ''}
      <div class="sect">Update history</div><div class="card">${docTimelineHtml(d.statusHistory) || emptyRow('—')}</div>`,
      (sh) => {
        if (d.hasPhoto && d.photoUrl) {
          staffApi(d.photoUrl, 'GET').then((r) => { if (r && r.dataUrl) { const el = sh.querySelector('#doc_photo'); if (el) el.innerHTML = `<img src="${r.dataUrl}" style="width:100%;border-radius:10px;border:1px solid var(--line);margin-bottom:12px" />`; } }).catch(() => {});
        }
      });
  }

  ACT.docType = (d) => { docType = d.id; localStorage.setItem('ntbf_doctype', d.id); render(); };
  ACT.docStatus = (d) => { docStatus = d.id; localStorage.setItem('ntbf_docstatus', d.id); render(); };
  ACT.docOpen = (d) => docDetail((docData || []).find((x) => x.id === d.id));
  ACT.docStatement = (d) => openLedger(d.id, d.name); // drill into that staff's prepayment ledger

  // Finance-originated advance (Stage C): finance/admin hand a float directly to a staff member.
  // POSTs to the finance-gated /api/finance/advances/issue, then refreshes the documents view so
  // the new float shows immediately (it also lands on the staff's balance/statement server-side).
  async function financeIssueAdvanceForm() {
    if (!canSeeDocs()) return; // finance/admin only — same gate as the Documents view
    openSheet('Issue advance', loadingCard('Loading staff…'));
    let team = []; try { team = await staffApi('/api/finance/colleagues', 'GET'); } catch (e) { toast(e.message); }
    openSheet('Issue advance', `
      <div class="muted" style="font-size:12.5px;margin-bottom:8px">Hand a cash float directly to a staff member. It appears immediately on their advance balance and statement.</div>
      <label class="fld"><span class="lab">Staff member</span><select id="fadv_emp">${team.map((s) => `<option value="${esc(s.id)}">${esc(s.name)} (${esc((s.roles || []).join(', '))})</option>`).join('')}</select></label>
      <label class="fld"><span class="lab">Amount (AED)</span><input id="fadv_amount" type="number" inputmode="decimal" placeholder="0.00" /></label>
      <label class="fld"><span class="lab">Note (optional)</span><input id="fadv_note" placeholder="e.g. weekly fuel float" /></label>
      <button class="btn primary full" data-act="finAdvIssue">Issue advance</button>`);
  }
  ACT.finAdvIssueForm = () => financeIssueAdvanceForm();
  ACT.finAdvIssue = async () => {
    const empEl = $('#fadv_emp'); const employeeId = empEl && empEl.value;
    const amount = parseFloat($('#fadv_amount').value);
    const note = ($('#fadv_note').value || '').trim();
    if (!employeeId) return toast('Pick a staff member');
    if (!(amount > 0)) return toast('Enter an amount');
    const body = { employeeId, amount }; if (note) body.note = note;
    try { await staffApi('/api/finance/advances/issue', 'POST', body); toast('Advance issued'); closeSheet(); loadDocs(); }
    catch (e) { toast(e.message); }
  };
})();

// ===========================================================================
// Server-backed driver EOD — replaces the legacy client-local EOD/Collect tab
// bodies with the REAL day from /api/finance/eod/mine (orders the caller
// delivered, receipts they collected, cash they paid out, transfers both ways,
// and the resulting cash in hand). The legacy custody/demo code is untouched —
// these overrides simply stop the EOD & Collect tabs reading it. "Hand over
// cash" opens the existing pay-a-colleague transfer form (same field ids, same
// ACT.trfSave handler → POST /api/finance/transfers, receiver confirms on
// their phone) prefilled with cash-in-hand and an EOD narration. Additive only.
// ===========================================================================
(function eodServerUI() {
  const TRF_METHODS = [['CASH', 'Cash'], ['CHEQUE', 'Cheque'], ['BANK', 'Bank transfer'], ['CARD', 'Card']];
  let eodData = null, eodErr = null;
  async function loadEod() {
    try { eodData = await staffApi('/api/finance/eod/mine', 'GET'); eodErr = null; }
    catch (e) { eodData = null; eodErr = e.message || 'Could not load'; }
    render();
  }
  function eodErrCard(title) {
    return `<div class="card pad" style="margin-bottom:12px"><b style="font-size:13.5px">${title}</b>
      <div class="muted" style="font-size:12px;margin:4px 0 10px">Could not load today’s figures: ${esc(eodErr)}</div>
      <button class="btn sm" data-act="eodRefresh">↻ Retry</button></div>`;
  }
  function deliveredRow(o) {
    const cash = (o.cashMethod || 'CASH_ON_DELIVERY') === 'CASH_ON_DELIVERY';
    return row(cash ? '💵' : '▤', 'g', esc(o.customer || '—'),
      esc(o.orderId) + ' · ' + (cash ? 'Cash' : 'Cheque') + (o.at ? ' · ' + uaeTime(o.at) : ''),
      aed(o.cashAmount));
  }

  // ---- EOD tab: the real daily cash-up ----
  views.eod = function () {
    if (eodErr) return eodErrCard('▰ End of day');
    if (eodData === null) { setTimeout(loadEod, 0); return loadingCard('Loading today’s cash-up…'); }
    const d = eodData;
    const del = d.delivered || {}; const rc = d.receiptsCollected || {}; const po = d.paidOut || {}; const tr = d.transfers || {};
    const pend = tr.sentPending || [];
    const hand = Number(d.cashOnHand) || 0;
    return `
      <div class="mkpis">
        ${kpi('Delivered', del.count || 0, 'accent')}
        ${kpi('Cash', aed(del.cashTotal || 0), 'green')}
        ${kpi('Cheques', aed(del.chequeTotal || 0))}
        ${kpi('Receipts', aed(rc.total || 0), 'green')}
        ${kpi('Paid out', aed(po.total || 0), (po.total || 0) ? 'amber' : '')}
        ${kpi('Cash in hand', aed(hand), hand > 0 ? 'amber' : 'green')}
      </div>
      <div class="card pad" style="margin-bottom:12px">
        <b style="font-size:13.5px">▰ End of day · ${esc(d.date || '')}</b>
        <div class="muted" style="font-size:12px;margin:4px 0 10px">Live server figures for your day. Cash in hand = cash deliveries + cash receipts − cash paid out − confirmed handovers sent + transfers received. Hand it over below — the receiver confirms on their phone.</div>
        <div class="btn-row">
          <button class="btn primary" data-act="eodHandover"${hand > 0 ? '' : ' style="opacity:.5"'}>💵 Hand over cash</button>
          <button class="btn sm" data-act="eodRefresh">↻ Refresh</button>
        </div>
      </div>
      ${pend.length ? `<div class="sect">Awaiting confirmation (${pend.length})</div>
      <div class="card">${pend.map((t) => row('⏳', 'a', aed(t.amount) + (t.toName ? ' to ' + esc(t.toName) : ''), 'awaiting confirmation by ' + esc(t.toName || 'colleague') + (t.createdAt ? ' · ' + uaeTime(t.createdAt) : ''), '<span class="tag amber">pending</span>')).join('')}</div>` : ''}
      <div class="sect">Delivered today (${del.count || 0})</div>
      <div class="card">${(del.list || []).map(deliveredRow).join('') || emptyRow('No deliveries recorded for you today.')}</div>`;
  };

  // ---- Collect tab: same endpoint's delivered data, cash-method only ----
  views.collect = function () {
    if (eodErr) return eodErrCard('＄ Collections');
    if (eodData === null) { setTimeout(loadEod, 0); return loadingCard('Loading…'); }
    const del = (eodData.delivered || {});
    const cashList = (del.list || []).filter((o) => (o.cashMethod || 'CASH_ON_DELIVERY') === 'CASH_ON_DELIVERY');
    return `
      <div class="mkpis">${kpi('Cash collected', aed(del.cashTotal || 0), 'green')}${kpi('Cheques', aed(del.chequeTotal || 0))}</div>
      <div class="card pad" style="margin-bottom:12px"><div class="muted" style="font-size:12px">Cash collected on orders you delivered today (server records). Hand it over from the EOD tab at end of day.</div>
      <button class="btn sm" data-act="eodRefresh" style="margin-top:10px">↻ Refresh</button></div>
      <div class="sect">Cash collected today (${cashList.length})</div>
      <div class="card">${cashList.map(deliveredRow).join('') || emptyRow('No cash deliveries recorded for you today.')}</div>`;
  };

  ACT.eodRefresh = () => { eodData = null; eodErr = null; render(); };
  // "Hand over cash" → the existing pay-a-colleague transfer form, prefilled. Same field
  // ids as transferForm(), submitted through the existing ACT.trfSave handler → the
  // unchanged POST /api/finance/transfers (PENDING_CONFIRM until the receiver confirms).
  ACT.eodHandover = async () => {
    const d = eodData || {};
    const hand = Number(d.cashOnHand) || 0;
    openSheet('Hand over cash', '<div class="empty">Loading colleagues…</div>');
    let team = []; try { team = await staffApi('/api/finance/colleagues', 'GET'); } catch (e) { toast(e.message); }
    openSheet('Hand over cash', `
      <div class="muted" style="font-size:12.5px;margin-bottom:8px">Today’s cash in hand: <b>${aed(hand)}</b>. Edit the amount if you are handing over a different figure.</div>
      <label class="fld"><span class="lab">Hand over to</span><select id="trf_to">${(team || []).map((s) => `<option value="${s.id}">${esc(s.name)} (${esc((s.roles || []).join(', '))})</option>`).join('')}</select></label>
      <label class="fld"><span class="lab">Amount (AED)</span><input id="trf_amount" type="number" inputmode="decimal" value="${hand > 0 ? hand : ''}" placeholder="0.00" /></label>
      <label class="fld"><span class="lab">Method</span><select id="trf_method">${TRF_METHODS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label>
      <label class="fld"><span class="lab">Narration</span><input id="trf_narration" value="EOD cash handover ${esc(d.date || '')}" /></label>
      <button class="btn primary full" data-act="eodTrfSave">Record handover</button>
      <p class="muted" style="font-size:11.5px;margin-top:8px">The colleague confirms on their phone that they received the cash — it stays “awaiting confirmation” until then.</p>`);
  };
  // Existing transfer submit, then refetch today's figures so the pending handover shows.
  ACT.eodTrfSave = async () => { eodData = null; eodErr = null; await ACT.trfSave(); };
})();

// ===========================================================================
// Attention badges — role-scoped "what needs me right now" counters from
// GET /api/attention/mine, polled on its OWN ~30s timer (deliberately separate
// from the 6s appstate sync in sync.js — attention is a slow, cheap signal).
//   · Small count chips on the relevant bottom tabs per role (hidden at zero).
//   · A one-line banner on the caller's FIRST tab when cash handovers are
//     awaiting THEIR confirmation — taps through to the existing My transfers
//     sheet (ACT.trfMineSheet → confirm/decline flow, unchanged).
// Purely additive: wraps login/logout/tab actions, injects DOM after render();
// no existing flow, endpoint, or role gate is modified.
// ===========================================================================
(function attentionUI() {
  let attn = null;
  let attnTimer = null;

  async function loadAttention() {
    if (!staffToken || !staff) return;
    try {
      const fresh = await staffApi('/api/attention/mine', 'GET');
      const changed = JSON.stringify({ ...fresh, at: 0 }) !== JSON.stringify(attn ? { ...attn, at: 0 } : null);
      attn = fresh;
      if (changed) render(); // re-render only when the counters actually moved
    } catch (e) { /* silent — badges just stay as they were */ }
  }
  function startAttention() {
    stopAttention();
    if (!staffToken || !staff) return;
    loadAttention();
    attnTimer = setInterval(loadAttention, 30000); // 30s — NOT tied to the 6s sync poll
  }
  function stopAttention() {
    if (attnTimer) { clearInterval(attnTimer); attnTimer = null; }
    attn = null;
  }

  // Badge map: which bottom tab carries which counter, per active role. The
  // transfers-to-confirm count rides on the tab where the confirm flow lives
  // (collectors' Receipts tab / the finance hub's Transfers segment); roles
  // without such a tab still get the first-tab banner below.
  function badgeCounts() {
    if (!attn) return {};
    const t = (attn.transfersToConfirm && attn.transfersToConfirm.count) || 0;
    const m = {};
    if (role === 'salesman') {
      m.online = (attn.ordersNeedsReview || 0) + (attn.ordersIncoming || 0);
      m.receipts = t;
    } else if (role === 'driver') {
      m.route = attn.ordersOutForDelivery || 0;
      m.receipts = t;
    } else if (role === 'warehouse') {
      m.dispatch = attn.ordersToPack || 0;
    } else if (role === 'finance') {
      m.receipts = (attn.receiptsPendingApproval || 0) + (attn.receiptsAwaitingConfirm || 0) + (attn.paymentsPending || 0) + t;
    } else if (role === 'admin') {
      m.receipts = (attn.receiptsPendingApproval || 0) + (attn.receiptsAwaitingConfirm || 0) + (attn.paymentsPending || 0) + t;
      m.approvals = (attn.expensesPending || 0) + (attn.suggestionsNew || 0);
    }
    return m;
  }

  // Called from render() after the shell is in the DOM. Idempotent per render.
  window.applyAttentionBadges = function () {
    if (!staffToken || !staff || !role || !ROLES[role]) return;
    const counts = badgeCounts();
    document.querySelectorAll('.bottom-nav .bn[data-id]').forEach((btn) => {
      const n = counts[btn.dataset.id] || 0;
      const old = btn.querySelector('.bn-badge');
      if (old) old.remove();
      if (n > 0) {
        const b = document.createElement('span');
        b.className = 'bn-badge';
        b.textContent = n > 99 ? '99+' : String(n);
        btn.appendChild(b);
      }
    });
    // Handover nudge: one-line banner at the top of this role's FIRST tab.
    const first = ROLES[role].tabs[0] && ROLES[role].tabs[0].id;
    const body = document.querySelector('#app .body');
    const tc = attn && attn.transfersToConfirm;
    const n = (tc && tc.count) || 0;
    const oldBanner = document.getElementById('attn-banner');
    if (oldBanner) oldBanner.remove();
    if (body && tab === first && n > 0) {
      const div = document.createElement('div');
      div.id = 'attn-banner';
      div.className = 'card pad';
      div.setAttribute('data-act', 'trfMineSheet');
      div.style.cssText = 'margin-bottom:12px;cursor:pointer;background:var(--amber-bg);border-color:transparent';
      div.innerHTML = `<b style="color:var(--amber);font-size:12.5px">💵 ${n} cash handover${n === 1 ? '' : 's'} awaiting your confirmation — ${aed(tc.total || 0)}</b><div class="muted" style="font-size:11.5px;color:var(--amber)">Tap to review and confirm you received the cash.</div>`;
      body.prepend(div);
    }
  };

  // Lifecycle: start after login, stop on logout, refetch on tab switch.
  const origLogin = ACT.staffLogin;
  ACT.staffLogin = async (d) => { await origLogin(d); startAttention(); };
  const origLogout = ACT.staffLogout;
  ACT.staffLogout = (d) => { stopAttention(); origLogout(d); };
  const origTab = ACT.tab;
  ACT.tab = (d) => { origTab(d); loadAttention(); };
  if (staffToken && staff) startAttention(); // already signed in on load
})();

window.renderApp = render;        // let Muhammed refresh the UI after acting
window.currentRole = () => role;  // expose active role to Muhammed
render();
