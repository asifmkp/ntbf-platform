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
let shopCart = {}; let shopMethod = 'CASH_ON_DELIVERY';
let onlineOrders = []; let onlineLoaded = false;
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
  if (role === 'salesman' && tab === 'online' && !onlineLoaded) loadOnlineOrders();
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
      <div class="card">${S.state.customers.map((c) => row(c.name.slice(0, 2).toUpperCase(), c.onHold ? 'r' : 'g', c.name, c.category + ' · credit ' + aed(c.credit), c.onHold ? '<span class="tag red">On hold</span>' : statusTag(c.status))).join('')}</div>
      <button class="btn primary full" data-act="newCustomer">＋ New customer</button>`;
  },
  orders() {
    const orders = S.state.orders;
    return `<div class="sect">Orders (${orders.length})</div>
      <div class="card">${orders.length ? orders.map((o) => { const c = S.customer(o.customerId); return row(o.id.replace('SO-', '#'), 'a', c ? c.name : '—', o.id + ' · ' + o.items.length + ' lines', aed(o.total) + '<br>' + statusTag(o.status)); }).join('') : emptyRow('No orders yet.')}</div>
      <button class="btn primary full" data-act="newOrder">＋ New order</button>`;
  },
  online() {
    return `
      <div class="card pad" style="margin-bottom:13px"><b style="font-size:13.5px">🌐 Online orders</b><div class="muted" style="font-size:12px;margin:4px 0 10px">Orders customers placed on the website (app.ntbfllc.com/order). Advance each order — customers see the status live.</div><button class="btn sm" data-act="refreshOnline">↻ Refresh</button></div>
      <div class="sect">Incoming (${onlineOrders.length})</div>
      <div id="online-list">${onlineOrders.length ? onlineOrders.map((o) => {
        const ns = nextOrderStatus(o.status);
        const lines = (o.items || []).map((l) => esc((l.qty || 1) + '× ' + l.name)).join(', ');
        return `<div class="card pad" style="margin-bottom:10px">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
            <div style="min-width:0"><b style="font-size:14px">${esc(o.customerName || '—')}</b>
              <div class="muted" style="font-size:12px;margin-top:2px">${esc(o.id)} · <b style="color:var(--ink)">${aed(o.total)}</b> · ${(o.items || []).length} item(s)</div></div>
            ${statusTag(o.status)}
          </div>
          <div class="muted" style="font-size:12px;margin-top:7px;line-height:1.5">${lines}</div>
          ${o.address ? `<div class="muted" style="font-size:12px;margin-top:4px">📍 ${esc(o.address)}</div>` : ''}
          ${o.customerPhone ? `<div class="muted" style="font-size:12px;margin-top:2px">📞 ${esc(o.customerPhone)}</div>` : ''}
          ${ns ? `<button class="btn primary sm full" data-act="setOrderStatus" data-id="${esc(o.id)}" data-status="${ns}" style="margin-top:10px">${ORDER_NEXT_ACTION[o.status] || 'Advance'} →</button>`
               : `<div style="margin-top:9px;font-size:12.5px;color:var(--green);font-weight:700">✓ Delivered</div>`}
        </div>`;
      }).join('') : (onlineLoaded ? emptyRow('No online orders yet.') : emptyRow('Loading…'))}</div>`;
  },
  visits() {
    return `<div class="sect">Visit log</div>
      <div class="card">${S.state.visits.length ? S.state.visits.map((v) => row('◎', 'g', v.name, v.note || 'Visit', v.time)).join('') : emptyRow('No visits logged.')}</div>
      <button class="btn primary full" data-act="checkin">◎ Check in a visit</button>`;
  },

  // ---------------- DRIVER ----------------
  route() {
    const sh = S.state.shift;
    const dl = S.state.driverLoc || (S.state.driverLoc = { lat: 25.4052, lng: 55.5136, name: 'Warehouse depot · Ajman' });
    const delivered = S.state.orders.filter((o) => o.status === 'DELIVERED').length;
    const raw = S.driverStops().map((o) => { const c = S.customer(o.customerId) || {}; return { o, name: c.name || '—', lat: c.lat != null ? c.lat : dl.lat, lng: c.lng != null ? c.lng : dl.lng }; });
    const seq = orderRoute(dl, raw);
    const totalKm = seq.reduce((s, x) => s + x._dist, 0);
    window._routeData = { dl, seq };
    const totalToday = seq.length + delivered;
    const pct = totalToday ? Math.round((delivered / totalToday) * 100) : 0;
    const ready = sh.started && sh.loadVerified;

    let head = '';
    if (!sh.started) head = `<button class="btn primary full" data-act="startShift">▶ Start shift</button>`;
    else if (!sh.loadVerified) head = `<button class="btn primary full" data-act="verifyLoad">✓ Verify load against dispatch</button>`;

    const mapBlock = ready ? `
      <div id="map"></div>
      <div class="btn-row">
        <button class="btn sm" data-act="useGps">📍 Use my GPS</button>
        ${seq.length ? `<button class="btn sm primary" data-act="navigate" data-lat="${seq[0].lat}" data-lng="${seq[0].lng}">Navigate to stop 1</button>` : ''}
      </div>` : '';

    const list = ready
      ? (seq.length ? seq.map((x, idx) => `
          <div class="li"><div class="ic">${idx + 1}</div><div class="m"><b>${x.name}</b>
            <span>${x.o.id} · ${aed(x.o.total)} · ${x.o.method === 'CASH_ON_DELIVERY' ? 'Cash' : 'Cheque'} · ${x._dist.toFixed(1)} km ${idx === 0 ? 'from depot' : 'from prev'}</span>
            <div class="btn-row">
              <button class="btn sm" data-act="navigate" data-lat="${x.lat}" data-lng="${x.lng}">Navigate</button>
              <button class="btn green sm" data-act="deliver" data-id="${x.o.id}">Delivered</button>
              <button class="btn danger sm" data-act="fail" data-id="${x.o.id}">Failed</button>
            </div></div></div>`).join('') : emptyRow('All stops done — submit EOD.'))
      : emptyRow('Start shift and verify load to plan the route.');

    return `
      <div class="mkpis">
        ${kpi('Stops left', seq.length, 'accent')}
        ${kpi('Route distance', totalKm.toFixed(1) + ' km', 'green')}
        ${kpi('Delivered', delivered)}
        ${kpi('Cash', aed(sum('CASH_ON_DELIVERY')), 'green')}
      </div>
      ${ready ? `<div class="sect">Progress</div><div class="card pad"><div class="progress"><i style="width:${pct}%;background:var(--green)"></i></div><div class="muted" style="font-size:12px;margin-top:7px">${delivered} of ${totalToday} delivered · start: ${dl.name}</div></div>` : ''}
      ${head}
      ${mapBlock}
      <div class="sect">Optimized route (nearest first)</div>
      <div class="card">${list}</div>`;
  },
  collect() {
    const pays = S.state.payments;
    return `<div class="mkpis">${kpi('Cash collected', aed(sum('CASH_ON_DELIVERY')), 'green')}${kpi('Cheques', aed(sum('CHEQUE_ON_DELIVERY')))}</div>
      <div class="sect">Collections today</div>
      <div class="card">${pays.length ? pays.map((p) => { const c = S.customer(p.customerId); return row(p.method === 'CASH_ON_DELIVERY' ? '＄' : '▤', 'g', c ? c.name : '—', p.method === 'CASH_ON_DELIVERY' ? 'Cash · ' + p.time : 'Cheque ' + (p.chequeNo || '') + ' · ' + p.status, aed(p.amount)); }).join('') : emptyRow('No collections yet — deliver an order.')}</div>`;
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
    const q = S.dispatchQueue();
    return `<div class="sect">Dispatch queue (${q.length})</div>
      <div class="card">${q.length ? q.map((o) => { const c = S.customer(o.customerId); const next = { PLACED: 'Confirm & pack', CONFIRMED: 'Confirm & pack', PACKED: 'Ready for pickup' }[o.status]; return `<div class="li"><div class="ic">${o.id.replace('SO-', '#')}</div><div class="m"><b>${c ? c.name : '—'}</b><span>${o.id} · ${o.items.length} lines</span></div><div class="end">${statusTag(o.status)}<br><button class="btn primary sm" data-act="dispatch" data-id="${o.id}" style="margin-top:5px">${next}</button></div></div>`; }).join('') : emptyRow('Nothing to dispatch. Sales places orders here.')}</div>`;
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
      <div class="card">${S.state.customers.map((c) => {
      const out = S.state.orders.filter((o) => o.customerId === c.id && o.status !== 'DELIVERED' && o.status !== 'CANCELLED').reduce((s, o) => s + o.total, 0);
      const act = c.status === 'PENDING'
        ? `<button class="btn green sm" data-act="approveCustomer" data-id="${c.id}">Approve</button>`
        : c.onHold ? `<button class="btn green sm" data-act="release" data-id="${c.id}">Release hold</button>`
          : `<button class="btn danger sm" data-act="hold" data-id="${c.id}">Hold</button>`;
      return `<div class="li"><div class="ic ${c.onHold ? 'r' : 'g'}">${c.name.slice(0, 2).toUpperCase()}</div><div class="m"><b>${c.name}</b><span>${c.category} · A/R ${aed(out)} · credit ${aed(c.credit)}</span>
        <div class="btn-row">${c.onHold ? '<span class="tag red" style="align-self:center">On hold</span>' : statusTag(c.status)} ${act}</div></div></div>`;
    }).join('')}</div>`;
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
  return Object.assign({ 'content-type': 'application/json' }, tok ? { 'x-api-key': tok } : {}, extra || {});
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
  if (role === 'salesman' && tab === 'online') render();
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
function mountMaps() { if (role === 'driver' && tab === 'route') mountRouteMap(); }
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

function addBillForm() {
  openSheet('Add purchase bill', `
    <div class="muted" style="font-size:12.5px;margin-bottom:12px">Take or attach a photo of the supplier bill.</div>
    <input type="file" id="bill_file" accept="image/*" capture="environment" style="margin-bottom:12px" />
    <div id="bill_preview"></div>
    <button class="btn primary full" data-act="extractBill" style="margin-top:10px">⚡ Extract with Claude</button>
    <p class="muted" style="font-size:11.5px;margin-top:10px">A clear, flat photo reads best. Without an API key it runs a demo extraction.</p>`,
    (sh) => {
      const f = sh.querySelector('#bill_file');
      f.addEventListener('change', () => {
        const file = f.files[0]; if (!file) return;
        const rd = new FileReader();
        rd.onload = () => {
          billDraft = { imageData: rd.result, mediaType: file.type || 'image/jpeg' };
          sh.querySelector('#bill_preview').innerHTML = `<img src="${rd.result}" style="width:100%;border-radius:10px;border:1px solid var(--line)" />`;
        };
        rd.readAsDataURL(file);
      });
    });
}
function reviewBillForm() {
  const b = billDraft.extracted;
  openSheet('Review extracted bill', `
    ${b._demo ? '<div class="card pad" style="background:var(--amber-bg);border-color:transparent;margin-bottom:12px"><b style="color:var(--amber);font-size:12.5px">Demo extraction</b><div class="muted" style="font-size:11.5px">Backend/Claude key not detected — sample values shown. Connect the API for real OCR.</div></div>' : '<div class="card pad" style="background:var(--green-bg);border-color:transparent;margin-bottom:12px"><b style="color:var(--green);font-size:12.5px">✓ Read by Claude</b></div>'}
    <label class="fld"><span class="lab">Supplier</span><input id="b_sup" value="${esc(b.supplierName)}" /></label>
    <label class="fld"><span class="lab">Invoice no</span><input id="b_inv" value="${esc(b.invoiceNumber)}" /></label>
    <label class="fld"><span class="lab">Date</span><input id="b_date" value="${esc(b.invoiceDate)}" /></label>
    <span class="lab" style="font-size:12px;color:var(--muted);font-weight:600">Line items</span>
    <div class="card">${b.lineItems.map((l) => `<div class="li"><div class="m"><b>${esc(l.description)}</b><span>${l.quantity} × ${aed(l.unitPrice)}</span></div><div class="end">${aed(l.amount)}</div></div>`).join('')}</div>
    <div class="li" style="border:none"><div class="m"><b>Total (incl. VAT)</b></div><div class="end" style="font-weight:700">${aed(b.total)}</div></div>
    <button class="btn primary full" data-act="matchBill">Match with Zoho →</button>`);
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
      <button class="btn danger full" data-act="staffLogout" style="margin-top:9px">Sign out</button>
    </div>` : ''}
    <div class="sect" style="margin-top:4px">Advanced</div>
    <label class="fld"><span class="lab">Backend API URL</span><input id="set_api" value="${esc(api)}" /></label>
    <label class="fld"><span class="lab">API access token (if the server requires one)</span><input id="set_token" placeholder="x-api-key" value="${esc(localStorage.getItem('ntbf_token') || '')}" /></label>
    ${role === 'customer' ? `<label class="fld"><span class="lab">Shopping as</span><select id="set_cust">${custOpts}</select></label>` : ''}
    <button class="btn primary full" data-act="saveSettings">Save</button>
    <div class="btn-row" style="margin-top:14px"><button class="btn" data-act="clearChat">Clear copilot chat</button><button class="btn danger" data-act="resetAll">Reset all data</button></div>
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
      sh.querySelector('#cap_file').addEventListener('change', function () {
        const file = this.files[0]; if (!file) return;
        const rd = new FileReader();
        rd.onload = () => { capDraft.image = rd.result; sh.querySelector('#cap_preview').innerHTML = `<img src="${rd.result}" style="width:100%;border-radius:10px;border:1px solid var(--line)" />`; };
        rd.readAsDataURL(file);
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
  setOrderStatus: async (d) => {
    try {
      const r = await fetch(API + '/api/portal/orders/status', { method: 'POST', headers: staffHeaders(), body: JSON.stringify({ id: d.id, status: d.status }) });
      if (!r.ok) throw new Error('http ' + r.status);
      const o = onlineOrders.find((x) => x.id === d.id); if (o) o.status = d.status;
      buzz([15, 40, 20]); toast('Order ' + d.id + ' updated');
      render();
    } catch (e) { toast('Could not update — check you are signed in'); }
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
  matchBill: async () => {
    const b = billDraft.extracted;
    b.supplierName = $('#b_sup').value; b.invoiceNumber = $('#b_inv').value; b.invoiceDate = $('#b_date').value;
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
      const r = await apiPost('/api/bills/extract', { imageBase64: capDraft.image, mediaType: 'image/jpeg' });
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
  clearChat: () => { if (window.copilotClear) window.copilotClear(); toast('Copilot chat cleared'); },
  resetAll: () => { S.reset(); shopCart = {}; closeSheet(); render(); toast('All data reset'); },

  // admin override
  advanceOrder: (d) => { S.adminAdvance(d.id); render(); const o = S.order(d.id); toast(o.id + ' → ' + o.status.replace(/_/g, ' ').toLowerCase()); },
  cancelOrder: (d) => { S.cancelOrder(d.id); render(); toast(d.id + ' cancelled · stock restored'); },
  approveCustomer: (d) => { const c = S.customer(d.id); if (c) { c.status = 'ACTIVE'; S.save(); } render(); toast('Customer activated'); },
  hold: (d) => { S.setHold(d.id, true); render(); toast('Account placed on hold'); },
  release: (d) => { S.setHold(d.id, false); render(); toast('Hold released'); },
};

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-act]'); if (!t) return;
  if (t.tagName === 'A') e.preventDefault();
  const fn = ACT[t.dataset.act]; if (fn) fn(t.dataset);
});
$('#scrim').addEventListener('click', closeSheet);

window.renderApp = render;        // let the copilot refresh the UI after acting
window.currentRole = () => role;  // expose active role to the copilot
render();
