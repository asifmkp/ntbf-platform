// ---------------------------------------------------------------------------
// NTBFLLC mobile app — shared state store (localStorage). One source of truth
// for all roles, so actions in one role show up in another (the full TRD loop).
// ---------------------------------------------------------------------------
const KEY = 'ntbf_app_v1';

// Bump SEED_VERSION whenever the built-in seed changes shape or content in a way
// every device must pick up. On load, any persisted dataset with a missing or
// older seedVersion is DISCARDED and re-initialized from the current (empty)
// production seed — this is the one-time migration that drops the old demo
// dataset (fake orders/customers/cash) from every device automatically.
const SEED_VERSION = 2; // v2: production mode — empty seed, demo data removed

// Fallback catalog used only when catalog.js hasn't loaded (offline first paint,
// Node tests). The live app always uses window.NTBF_CATALOG.
// velocity = avg cartons sold per day; leadDays = supplier lead time.
const SEED_PRODUCTS = [
  { id: 'p1', name: '7Up 1.5 Litre', unit: 'Ctn of 6', price: 25.71, cost: 24.76, stock: 120, velocity: 12, leadDays: 3 },
  { id: 'p2', name: '7Up 1.5 Litre Zero', unit: 'Ctn of 6', price: 17.62, cost: 16.19, stock: 90, velocity: 6, leadDays: 3 },
  { id: 'p3', name: '7Up 2.28 Litre', unit: 'Ctn of 6', price: 39, cost: 41, stock: 60, velocity: 4, leadDays: 4 },
  { id: 'p4', name: 'Barbican Apple 330ml', unit: 'Ctn of 24', price: 72.38, cost: 70.48, stock: 40, velocity: 3, leadDays: 5 },
  { id: 'p5', name: 'Capri Sun Mango 200ml', unit: 'Ctn of 40', price: 29.05, cost: 29.05, stock: 75, velocity: 5, leadDays: 4 },
  { id: 'p6', name: 'Coca Cola 2 Litre', unit: 'Ctn of 6', price: 32.38, cost: 28.57, stock: 150, velocity: 18, leadDays: 3 },
  { id: 'p7', name: 'Fanta Orange 300ml', unit: 'Ctn of 30', price: 40.5, cost: 40.01, stock: 30, velocity: 4, leadDays: 4 },
  { id: 'p8', name: 'Lipton Peach Iced Tea 290ml', unit: 'Ctn of 24', price: 53.33, cost: 50.1, stock: 25, velocity: 2, leadDays: 6 },
  { id: 'p9', name: 'Mirinda Orange 1.5 Litre', unit: 'Ctn of 6', price: 24.76, cost: 23.4, stock: 80, velocity: 7, leadDays: 3 },
  { id: 'p10', name: 'Mirinda Cans 245ml', unit: 'Ctn of 24', price: 33.81, cost: 36.4, stock: 50, velocity: 5, leadDays: 4 },
];

// Production seed: the real catalog plus EMPTY transactional data. Every KPI
// (revenue, collected, A/R, pipeline, visits, cash…) derives to 0; every list
// renders its empty state. Real records arrive via staff actions and sync.
function seed() {
  const catalog = (typeof window !== 'undefined' && window.NTBF_CATALOG && window.NTBF_CATALOG.length) ? window.NTBF_CATALOG : SEED_PRODUCTS;
  return {
    seedVersion: SEED_VERSION,
    seq: 1050,
    products: catalog.map((p) => ({ ...p })),
    customers: [],
    visits: [],
    orders: [],
    payments: [],
    requisitions: [],
    pos: [],
    approvals: [],
    grns: [],
    bills: [],
    tickets: [],
    cash: [],
    documents: [],
    stockMoves: [],
    assets: [],
    renewals: [],
    shift: { started: false, loadVerified: false },
    driverLoc: { lat: 25.4052, lng: 55.5136, name: 'Warehouse depot · Ajman' },
    eod: [],
  };
}

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    // One-time migration: any persisted dataset from before the current seed
    // (e.g. the old self-seeding demo, which had no seedVersion) is discarded
    // so this device starts from the clean production seed.
    if (!s || (s.seedVersion || 0) < SEED_VERSION) return null;
    return s;
  } catch (e) { return null; }
}

const Store = {
  state: load() || seed(),
  listeners: [],

  save() { localStorage.setItem(KEY, JSON.stringify(this.state)); this.emit(); },
  reset() { this.state = seed(); this.save(); },
  on(cb) { this.listeners.push(cb); },
  emit() { this.listeners.forEach((cb) => cb()); },
  nextId(prefix) { this.state.seq += 1; return prefix + '-' + this.state.seq; },

  // ---- selectors ----
  product(id) { return this.state.products.find((p) => p.id === id); },
  customer(id) { return this.state.customers.find((c) => c.id === id); },
  order(id) { return this.state.orders.find((o) => o.id === id); },
  pendingApprovals() { return this.state.approvals.filter((a) => a.status === 'PENDING'); },
  driverStops() { return this.state.orders.filter((o) => o.status === 'OUT_FOR_DELIVERY'); },
  dispatchQueue() { return this.state.orders.filter((o) => ['PLACED', 'CONFIRMED', 'PACKED'].includes(o.status)); },
  lowStock() { return this.state.products.filter((p) => p.stock <= 40); },

  // ---- SALES ----
  checkInVisit(customerId, note) {
    const c = this.customer(customerId);
    this.state.visits.unshift({ id: this.nextId('V'), customerId, name: c ? c.name : 'Unknown', time: now(), note: note || '' });
    this.save();
  },
  createCustomer({ name, category, credit, creditDays, lat, lng }) {
    const id = this.nextId('C').replace('C-', 'c');
    this.state.customers.push({ id, name, category, credit: +credit || 0, creditDays: +creditDays || 0, status: 'PENDING', onHold: false, lat, lng });
    this.state.approvals.unshift({ id: this.nextId('A'), type: 'CUSTOMER', refId: id, label: 'New customer: ' + name, status: 'PENDING' });
    this.save();
    return id;
  },
  specialPrice({ customerId, pid, price }) {
    const c = this.customer(customerId); const p = this.product(pid);
    this.state.approvals.unshift({ id: this.nextId('A'), type: 'PRICE', label: `Special price: ${p.name} → AED ${price} for ${c.name}`, status: 'PENDING' });
    this.save();
  },
  placeOrder({ customerId, lines, method }) {
    const c = this.customer(customerId);
    if (!c) throw new Error('Pick a customer');
    if (c.onHold) throw new Error(c.name + ' is on hold (bounced cheque) — cannot order');
    const items = lines.filter((l) => l.qty > 0);
    if (!items.length) throw new Error('Add at least one product');
    for (const l of items) {
      const p = this.product(l.pid);
      if (p.stock < l.qty) throw new Error('Not enough stock for ' + p.name + ' (have ' + p.stock + ')');
    }
    let total = 0;
    items.forEach((l) => { const p = this.product(l.pid); total += p.price * l.qty; p.stock -= l.qty; });
    const id = this.nextId('SO');
    this.state.orders.unshift({ id, customerId, items: items.map((l) => ({ pid: l.pid, qty: l.qty })), total: round(total), status: 'PLACED', method, createdBy: 'sales' });
    items.forEach((l) => this._logMove(l.pid, -l.qty, 'out', 'sale ' + id, 'system'));
    this.save();
    return id;
  },

  // ---- WAREHOUSE ----
  advanceDispatch(orderId) {
    const o = this.order(orderId); if (!o) return;
    const flow = { PLACED: 'PACKED', CONFIRMED: 'PACKED', PACKED: 'OUT_FOR_DELIVERY' };
    o.status = flow[o.status] || o.status;
    if (o.status === 'OUT_FOR_DELIVERY' && !o.driver) o.driver = 'd1';
    this.save();
  },
  adjustStock(pid, delta, reason) { const p = this.product(pid); p.stock = Math.max(0, p.stock + (+delta || 0)); this._logMove(pid, +delta || 0, 'adjust', reason || 'manual adjustment', 'Haris'); this.save(); },
  receiveGrn(pid, qty) { const p = this.product(pid); p.stock += (+qty || 0); this.state.grns.unshift({ id: this.nextId('GRN'), pid, qty: +qty, time: now() }); this._logMove(pid, +qty || 0, 'in', 'goods received (GRN)', 'Haris'); this.save(); },

  // ---- DELIVERY ----
  setDriverLoc(lat, lng) { this.state.driverLoc = { lat, lng, name: 'My current location' }; this.save(); },
  startShift() { this.state.shift.started = true; this.save(); },
  verifyLoad() { this.state.shift.loadVerified = true; this.save(); },
  deliver(orderId, { method, amount, chequeNo }) {
    const o = this.order(orderId); if (!o) return;
    o.status = 'DELIVERED';
    const pay = { id: this.nextId('PAY'), orderId, customerId: o.customerId, method, amount: round(+amount || o.total), chequeNo: chequeNo || '', status: method === 'CHEQUE_ON_DELIVERY' ? 'PENDING' : 'COLLECTED', time: now() };
    this.state.payments.unshift(pay);
    this.save();
  },
  failDelivery(orderId, reason) { const o = this.order(orderId); if (!o) return; o.status = 'FAILED'; o.failReason = reason; this.save(); },
  submitEod() {
    const today = this.state.payments;
    const cash = sum(today.filter((p) => p.method === 'CASH_ON_DELIVERY').map((p) => p.amount));
    const cheque = sum(today.filter((p) => p.method === 'CHEQUE_ON_DELIVERY').map((p) => p.amount));
    const delivered = this.state.orders.filter((o) => o.status === 'DELIVERED').length;
    this.state.eod.unshift({ id: this.nextId('EOD'), time: now(), cash: round(cash), cheque: round(cheque), delivered });
    this.save();
    return { cash: round(cash), cheque: round(cheque), delivered };
  },

  // ---- FINANCE ----
  clearCheque(payId, cleared) {
    const p = this.state.payments.find((x) => x.id === payId); if (!p) return;
    if (cleared) { p.status = 'CLEARED'; }
    else {
      p.status = 'BOUNCED'; p.bounceCharge = 250;
      const c = this.customer(p.customerId); if (c) c.onHold = true;
      this.state.approvals.unshift({ id: this.nextId('A'), type: 'RECOVERY', refId: p.customerId, label: 'Recover bounced cheque: ' + (c ? c.name : ''), status: 'PENDING' });
    }
    this.save();
  },

  // ---- PURCHASE ----
  raiseRequisition(pid, qty) { const p = this.product(pid); this.state.requisitions.unshift({ id: this.nextId('REQ'), pid, name: p.name, qty: +qty, status: 'PENDING' }); this.save(); },
  createPo({ supplier, pid, qty, price }) { const p = this.product(pid); this.state.pos.unshift({ id: this.nextId('PO'), supplier, name: p.name, qty: +qty, total: round(+qty * +price), status: 'SENT' }); this.save(); },
  addBill(bill) {
    this.state.bills = this.state.bills || [];
    this.state.bills.unshift({ id: this.nextId('BILL'), time: now(), ...bill });
    this.save();
  },

  // ---- AUTO-REPLENISHMENT (demand forecast) ----
  forecast() {
    const SAFETY = 7; // warn buffer (days)
    return this.state.products.map((p) => {
      const vel = p.velocity || 5, lead = p.leadDays || 3, stock = p.stock;
      const cover = vel > 0 ? stock / vel : 999;
      const status = cover <= lead ? 'critical' : cover <= lead + SAFETY ? 'warn' : 'ok';
      const recommend = status === 'ok' ? 0 : Math.max(0, Math.ceil(vel * (lead + 21) - stock));
      return { id: p.id, name: p.name, unit: p.unit, stock, velocity: vel, leadDays: lead, cover: Math.round(cover * 10) / 10, status, recommend, cost: p.cost };
    }).sort((a, b) => a.cover - b.cover);
  },
  autoReplenish() {
    const recs = this.forecast().filter((x) => x.recommend > 0);
    let n = 0;
    recs.forEach((x) => {
      const exists = this.state.requisitions.find((r) => r.pid === x.id && r.status === 'PENDING');
      if (!exists) { this.state.requisitions.unshift({ id: this.nextId('REQ'), pid: x.id, name: x.name, qty: x.recommend, status: 'PENDING', auto: true }); n++; }
    });
    this.save();
    return n;
  },

  // ---- CUSTOMER SERVICE (support tickets) ----
  createTicket({ customerId, subject, body, type }) {
    const c = this.customer(customerId);
    this.state.tickets = this.state.tickets || [];
    const id = this.nextId('TK');
    this.state.tickets.unshift({ id, customerId, customerName: c ? c.name : '—', subject, body, type: type || 'query', status: 'open', replies: [], time: now() });
    this.save();
    return id;
  },
  replyTicket(id, by, text) { const t = (this.state.tickets || []).find((x) => x.id === id); if (t) { t.replies.push({ by, text, time: now() }); t.status = by === 'service' ? 'answered' : 'open'; } this.save(); },
  closeTicket(id) { const t = (this.state.tickets || []).find((x) => x.id === id); if (t) t.status = 'resolved'; this.save(); },
  updateCustomerProfile(cid, data) { const c = this.customer(cid); if (c) Object.assign(c, data); this.save(); },
  setCustomerLocation(cid, lat, lng) { const c = this.customer(cid); if (c) { c.lat = lat; c.lng = lng; } this.save(); },
  ticketsFor(cid) { return (this.state.tickets || []).filter((t) => t.customerId === cid); },
  openTickets() { return (this.state.tickets || []).filter((t) => t.status !== 'resolved'); },
  customerInvoices(cid) {
    return this.state.orders.filter((o) => o.customerId === cid && o.status !== 'CANCELLED').map((o) => ({
      no: 'INV-' + o.id.replace('SO-', ''), orderId: o.id, amount: o.total,
      status: o.status === 'DELIVERED' ? 'paid' : 'outstanding',
    }));
  },

  // ---- FIXED ASSET REGISTER (straight-line depreciation) ----
  addAsset(a) { this.state.assets = this.state.assets || []; this.state.assets.unshift({ id: this.nextId('AS'), ...a }); this.save(); },
  removeAsset(id) { this.state.assets = (this.state.assets || []).filter((a) => a.id !== id); this.save(); },
  assetRegister() {
    const today = new Date();
    return (this.state.assets || []).map((a) => {
      const pd = new Date(a.purchaseDate);
      const months = Math.max(0, (today.getFullYear() - pd.getFullYear()) * 12 + (today.getMonth() - pd.getMonth()));
      const depBase = Math.max(0, a.cost - (a.salvage || 0));
      const monthly = a.lifeYears > 0 ? depBase / (a.lifeYears * 12) : 0;
      const accumulated = Math.min(depBase, round(monthly * months));
      return { ...a, months, monthly: round(monthly), accumulated: round(accumulated), bookValue: round(a.cost - accumulated) };
    });
  },
  assetTotals() {
    const reg = this.assetRegister();
    return {
      cost: round(reg.reduce((s, a) => s + a.cost, 0)),
      bookValue: round(reg.reduce((s, a) => s + a.bookValue, 0)),
      monthlyDep: round(reg.reduce((s, a) => s + a.monthly, 0)),
      count: reg.length,
    };
  },

  // ---- STOCK MOVEMENT LEDGER (every in / out / adjust, GRN-driven) ----
  _logMove(pid, qty, type, reason, by) {
    this.state.stockMoves = this.state.stockMoves || [];
    const p = this.product(pid);
    this.state.stockMoves.unshift({ id: this.nextId('MV'), pid, name: p ? p.name : pid, qty: round(qty), type, reason: reason || '', by: by || '', time: now() });
    if (this.state.stockMoves.length > 500) this.state.stockMoves.length = 500;
  },
  stockMoves() { return this.state.stockMoves || []; },

  // ---- COMPLIANCE & RENEWALS (visa / labour card / Emirates ID / vehicle docs) ----
  addRenewal({ kind, holder, expiry }) {
    this.state.renewals = this.state.renewals || [];
    this.state.renewals.unshift({ id: this.nextId('RN'), kind, holder, expiry });
    this.save();
  },
  updateRenewal(id, expiry) { const r = (this.state.renewals || []).find((x) => x.id === id); if (r) r.expiry = expiry; this.save(); },
  removeRenewal(id) { this.state.renewals = (this.state.renewals || []).filter((r) => r.id !== id); this.save(); },
  renewalsDue() {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return (this.state.renewals || []).map((r) => {
      const d = new Date(r.expiry); d.setHours(0, 0, 0, 0);
      const days = Math.ceil((d - today) / 86400000);
      const tier = days < 0 ? 'expired' : days <= 30 ? '30' : days <= 60 ? '60' : days <= 90 ? '90' : 'ok';
      return { ...r, days, tier };
    }).sort((a, b) => a.days - b.days);
  },

  // ---- DOCUMENT CAPTURE (photo → extract → confirm → prepare for Zoho; test mode) ----
  addDocument(doc) {
    this.state.documents = this.state.documents || [];
    const id = this.nextId('DOC');
    this.state.documents.unshift({ id, time: now(), posted: false, ...doc });
    this.save();
    return id;
  },
  markDocPosted(id) { const d = (this.state.documents || []).find((x) => x.id === id); if (d) { d.posted = true; d.status = 'posted'; } this.save(); },

  // ---- CASH CUSTODY (Musthafa collects → hands to Haris; expected vs actual) ----
  totalCashCollected() { return round(this.state.payments.filter((p) => p.method === 'CASH_ON_DELIVERY').reduce((s, p) => s + p.amount, 0)); },
  cashHandedDeclared() { return round((this.state.cash || []).filter((e) => e.kind === 'handover').reduce((s, e) => s + e.declared, 0)); },
  driverHolding() { return round(this.totalCashCollected() - this.cashHandedDeclared()); },
  declareHandover(amount, reason) {
    const expected = this.driverHolding();
    const declared = round(+amount || 0);
    const variance = round(declared - expected);
    this.state.cash = this.state.cash || [];
    const id = this.nextId('CH');
    this.state.cash.unshift({ id, kind: 'handover', expected, declared, variance, counted: null, by: 'Musthafa', to: 'Haris', reason: reason || '', status: 'pending', flagged: variance !== 0, time: now() });
    this.save();
    return id;
  },
  confirmHandover(id, counted) {
    const e = (this.state.cash || []).find((x) => x.id === id); if (!e) return;
    e.counted = round(+counted || 0); e.status = 'confirmed'; e.confirmVariance = round(e.counted - e.declared);
    if (e.confirmVariance !== 0) e.flagged = true;
    this.save();
  },
  logCashOut({ kind, amount, person, reason }) {
    this.state.cash = this.state.cash || [];
    this.state.cash.unshift({ id: this.nextId('CO'), kind, amount: round(+amount || 0), person: person || '', reason: reason || '', time: now() });
    this.save();
  },
  harisCashInHand() {
    const cash = this.state.cash || [];
    const inflow = cash.filter((e) => e.kind === 'handover' && e.status === 'confirmed').reduce((s, e) => s + (e.counted || 0), 0);
    const outflow = cash.filter((e) => e.kind === 'expense' || e.kind === 'advance').reduce((s, e) => s + e.amount, 0);
    return round(inflow - outflow);
  },
  cashFlags() { return (this.state.cash || []).filter((e) => e.kind === 'handover' && e.flagged); },
  pendingHandovers() { return (this.state.cash || []).filter((e) => e.kind === 'handover' && e.status === 'pending'); },
  cashOuts() { return (this.state.cash || []).filter((e) => e.kind === 'expense' || e.kind === 'advance'); },

  // ---- COLLECTIONS (receivables & recovery) ----
  collections() {
    const map = {};
    const add = (cid, amt, kind) => { if (!map[cid]) map[cid] = { outstanding: 0, items: [] }; map[cid].outstanding += amt; map[cid].items.push(kind); };
    this.state.orders.forEach((o) => { if (['PLACED', 'CONFIRMED', 'PACKED', 'OUT_FOR_DELIVERY'].includes(o.status)) add(o.customerId, o.total, o.id + ' (' + o.status.toLowerCase().replace(/_/g, ' ') + ')'); });
    this.state.payments.forEach((p) => { if (p.status === 'BOUNCED') add(p.customerId, p.amount + (p.bounceCharge || 0), 'bounced cheque ' + (p.chequeNo || '')); });
    return this.state.customers.map((c) => ({ id: c.id, name: c.name, onHold: c.onHold, outstanding: round(map[c.id] ? map[c.id].outstanding : 0), items: map[c.id] ? map[c.id].items : [] }))
      .filter((x) => x.outstanding > 0 || x.onHold).sort((a, b) => b.outstanding - a.outstanding);
  },
  recoverCustomer(cid) {
    this.state.payments.forEach((p) => { if (p.customerId === cid && p.status === 'BOUNCED') p.status = 'RECOVERED'; });
    const c = this.customer(cid); if (c) c.onHold = false;
    this.save();
  },

  // ---- ADMIN / SUPER-ADMIN OVERRIDE ----
  setHold(customerId, hold) { const c = this.customer(customerId); if (c) c.onHold = hold; this.save(); },
  cancelOrder(orderId) {
    const o = this.order(orderId); if (!o || o.status === 'DELIVERED' || o.status === 'CANCELLED') return;
    o.items.forEach((l) => { const p = this.product(l.pid); if (p) p.stock += l.qty; this._logMove(l.pid, l.qty, 'in', 'cancel ' + o.id, 'system'); }); // restock
    o.status = 'CANCELLED';
    this.save();
  },
  adminAdvance(orderId) {
    const o = this.order(orderId); if (!o) return;
    const flow = { PLACED: 'CONFIRMED', CONFIRMED: 'PACKED', PACKED: 'OUT_FOR_DELIVERY', OUT_FOR_DELIVERY: 'DELIVERED' };
    o.status = flow[o.status] || o.status;
    if (o.status === 'OUT_FOR_DELIVERY' && !o.driver) o.driver = 'd1';
    this.save();
  },
  approveAll() { this.state.approvals.forEach((a) => { if (a.status === 'PENDING') this.approve(a.id); }); this.save(); },

  // ---- APPROVALS (admin / dept admin) ----
  approve(id) {
    const a = this.state.approvals.find((x) => x.id === id); if (!a) return;
    a.status = 'APPROVED';
    if (a.type === 'CUSTOMER' && a.refId) { const c = this.customer(a.refId); if (c) c.status = 'ACTIVE'; }
    if (a.type === 'RECOVERY' && a.refId) { const c = this.customer(a.refId); if (c) c.onHold = false; }
    this.save();
  },
  reject(id) { const a = this.state.approvals.find((x) => x.id === id); if (a) a.status = 'REJECTED'; this.save(); },
};

function now() { const d = new Date(); return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
function round(n) { return Math.round((+n || 0) * 100) / 100; }
function sum(arr) { return arr.reduce((s, n) => s + (+n || 0), 0); }
function aed(n) { return 'AED ' + (+n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

window.Store = Store;
window.aed = aed;
