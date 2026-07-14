// ---------------------------------------------------------------------------
// Muhammed — read-only tools over the shared field-app state (appstate.json).
//
// Every tool is a pure, READ-ONLY view computed server-side from the state blob
// (same shape as apps/mobile-app/store.js). The role → tool mapping is the
// confidentiality boundary: a user is only ever handed the tools their role(s)
// allow, so out-of-scope data is literally never fetched — not just hidden by
// the prompt. Logic mirrors the proven store.js selectors.
// ---------------------------------------------------------------------------

export interface ToolCtx {
  /** Called by note_gap so the service can log answered=false + the reason. */
  noteGap: (reason: string) => void;
  /** Read team-report log rows (admin tools only). */
  readLog: (opts?: { unansweredOnly?: boolean; staff?: string; sinceIso?: string }) => any[];
}

export interface MuhammedTool {
  name: string;
  roles: string[]; // role ids that may use this tool ('all' = everyone)
  description: string;
  input_schema: Record<string, unknown>;
  run: (state: any, input: any, ctx: ToolCtx) => any;
}

const obj = (props: Record<string, unknown> = {}, required: string[] = []) => ({
  type: 'object',
  properties: props,
  required,
});

// ---- small helpers (defensive: state may be null before the app has synced) -
const arr = (state: any, key: string): any[] => (state && Array.isArray(state[key]) ? state[key] : []);
const round = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const sum = (xs: number[]) => round(xs.reduce((s, n) => s + (Number(n) || 0), 0));
const LOW_STOCK = 40;

const custName = (state: any, id: string) => (arr(state, 'customers').find((c) => c.id === id) || {}).name || '—';

function revenue(state: any) {
  return sum(arr(state, 'orders').filter((o) => o.status !== 'CANCELLED').map((o) => o.total));
}
function collectionsView(state: any) {
  const map: Record<string, { outstanding: number; items: string[] }> = {};
  const add = (cid: string, amt: number, kind: string) => {
    if (!map[cid]) map[cid] = { outstanding: 0, items: [] };
    map[cid].outstanding += amt;
    map[cid].items.push(kind);
  };
  arr(state, 'orders').forEach((o) => {
    if (['PLACED', 'CONFIRMED', 'PACKED', 'OUT_FOR_DELIVERY'].includes(o.status)) {
      add(o.customerId, o.total, `${o.id} (${String(o.status).toLowerCase().replace(/_/g, ' ')})`);
    }
  });
  arr(state, 'payments').forEach((p) => {
    if (p.status === 'BOUNCED') add(p.customerId, (p.amount || 0) + (p.bounceCharge || 0), 'bounced cheque');
  });
  return arr(state, 'customers')
    .map((c) => ({ name: c.name, onHold: !!c.onHold, outstanding: round(map[c.id] ? map[c.id].outstanding : 0), items: map[c.id] ? map[c.id].items : [] }))
    .filter((x) => x.outstanding > 0 || x.onHold)
    .sort((a, b) => b.outstanding - a.outstanding);
}
function forecast(state: any) {
  const SAFETY = 7;
  return arr(state, 'products')
    .map((p) => {
      const vel = p.velocity || 5, lead = p.leadDays || 3, stock = p.stock || 0;
      const cover = vel > 0 ? stock / vel : 999;
      const status = cover <= lead ? 'critical' : cover <= lead + SAFETY ? 'warn' : 'ok';
      const recommend = status === 'ok' ? 0 : Math.max(0, Math.ceil(vel * (lead + 21) - stock));
      return { name: p.name, unit: p.unit, stock, perDay: vel, daysCover: Math.round(cover * 10) / 10, risk: status, reorderQty: recommend };
    })
    .sort((a, b) => a.daysCover - b.daysCover);
}
const totalCashCollected = (state: any) => sum(arr(state, 'payments').filter((p) => p.method === 'CASH_ON_DELIVERY').map((p) => p.amount));
const cashHandedDeclared = (state: any) => sum(arr(state, 'cash').filter((e) => e.kind === 'handover').map((e) => e.declared));
const driverHolding = (state: any) => round(totalCashCollected(state) - cashHandedDeclared(state));
function harisCashInHand(state: any) {
  const cash = arr(state, 'cash');
  const inflow = sum(cash.filter((e) => e.kind === 'handover' && e.status === 'confirmed').map((e) => e.counted || 0));
  const outflow = sum(cash.filter((e) => e.kind === 'expense' || e.kind === 'advance').map((e) => e.amount));
  return round(inflow - outflow);
}
function renewalsDue(state: any) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return arr(state, 'renewals')
    .map((r) => {
      const d = new Date(r.expiry); d.setHours(0, 0, 0, 0);
      const days = Math.ceil((d.getTime() - today.getTime()) / 86400000);
      const tier = days < 0 ? 'expired' : days <= 30 ? '30' : days <= 60 ? '60' : days <= 90 ? '90' : 'ok';
      return { kind: r.kind, holder: r.holder, expiry: r.expiry, days, tier };
    })
    .filter((r) => r.tier !== 'ok')
    .sort((a, b) => a.days - b.days);
}
function km(a: any, b: any) {
  const R = 6371, rad = (x: number) => (x * Math.PI) / 180;
  const dla = rad(b.lat - a.lat), dln = rad(b.lng - a.lng);
  const s = Math.sin(dla / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dln / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
function route(state: any) {
  const dl = state?.driverLoc || { lat: 25.4052, lng: 55.5136 };
  const stops = arr(state, 'orders')
    .filter((o) => o.status === 'OUT_FOR_DELIVERY')
    .map((o) => {
      const c = arr(state, 'customers').find((x) => x.id === o.customerId) || {};
      return { id: o.id, name: c.name || '—', lat: c.lat || dl.lat, lng: c.lng || dl.lng, total: o.total, method: o.method };
    });
  const seq: any[] = [];
  let cur = dl; const rem = stops.slice();
  while (rem.length) {
    let bi = 0, bd = 1e9;
    rem.forEach((s, i) => { const d = km(cur, s); if (d < bd) { bd = d; bi = i; } });
    const n = rem.splice(bi, 1)[0];
    seq.push({ stop: seq.length + 1, customer: n.name, order: n.id, km: Math.round(bd * 10) / 10, amount: n.total, method: n.method });
    cur = n;
  }
  return seq;
}

// ---------------------------------------------------------------------------
// Tool registry. Roles: admin(Asif), salesman(Tahir), warehouse+purchase(Haris),
// driver(Musthafa). Admin is handed the full set (see toolsForRoles).
// ---------------------------------------------------------------------------
export const MUHAMMED_TOOLS: MuhammedTool[] = [
  // ---- everyone ----
  {
    name: 'note_gap',
    roles: ['all'],
    description: "Call this whenever you cannot answer — no tool exists for it, there is no data, or it is outside the user's access. Give a short reason. This records the question as a gap for the owner's review.",
    input_schema: obj({ reason: { type: 'string', description: 'short reason you could not answer' } }, ['reason']),
    run: (_s, input, ctx) => { ctx.noteGap(String(input?.reason || 'unspecified')); return { noted: true }; },
  },

  // ---- ADMIN / OWNER (Asif) ----
  {
    name: 'company_sales',
    roles: ['admin'],
    description: 'Company-wide sales snapshot: revenue (all non-cancelled orders), order count, cash collected, and total outstanding.',
    input_schema: obj({}),
    run: (state) => ({
      revenue: revenue(state),
      orders: arr(state, 'orders').length,
      collected: sum(arr(state, 'payments').map((p) => p.amount)),
      outstanding: sum(collectionsView(state).map((c) => c.outstanding)),
      note: 'Orders carry no date yet, so this is the current live snapshot, not a day/range total.',
    }),
  },
  {
    name: 'cash_by_driver',
    roles: ['admin'],
    description: "Cash position: total collected by the driver, what the driver is still holding, Haris's confirmed cash in hand, pending handovers, and any flagged shortages.",
    input_schema: obj({}),
    run: (state) => ({
      driverCollected: totalCashCollected(state),
      driverHolding: driverHolding(state),
      harisCashInHand: harisCashInHand(state),
      pendingHandovers: arr(state, 'cash').filter((e) => e.kind === 'handover' && e.status === 'pending').map((e) => ({ declared: e.declared, expected: e.expected, variance: e.variance })),
      flaggedShortages: arr(state, 'cash').filter((e) => e.kind === 'handover' && e.flagged).map((e) => ({ declared: e.declared, expected: e.expected, variance: e.variance, reason: e.reason })),
    }),
  },
  {
    name: 'queue_health',
    roles: ['admin'],
    description: 'Operational queue health: dispatch/pack backlog, stops out for delivery, pending approvals, and products below reorder level.',
    input_schema: obj({}),
    run: (state) => ({
      dispatchBacklog: arr(state, 'orders').filter((o) => ['PLACED', 'CONFIRMED', 'PACKED'].includes(o.status)).length,
      outForDelivery: arr(state, 'orders').filter((o) => o.status === 'OUT_FOR_DELIVERY').length,
      pendingApprovals: arr(state, 'approvals').filter((a) => a.status === 'PENDING').length,
      belowReorder: arr(state, 'products').filter((p) => (p.stock || 0) <= LOW_STOCK).length,
    }),
  },
  {
    name: 'collections',
    roles: ['admin'],
    description: 'Outstanding receivables per customer (undelivered orders + bounced cheques), with on-hold flag.',
    input_schema: obj({}),
    run: (state) => collectionsView(state),
  },
  {
    name: 'renewals_due',
    roles: ['admin'],
    description: 'Visa / labour card / Emirates ID / passport / vehicle documents due within 90 days (or expired).',
    input_schema: obj({}),
    run: (state) => renewalsDue(state),
  },
  {
    name: 'team_activity',
    roles: ['admin'],
    description: "The team's recent Muhammed conversations (who asked what, and whether it was answered). Optionally filter by staff name or a start date (YYYY-MM-DD).",
    input_schema: obj({ staff: { type: 'string' }, since: { type: 'string', description: 'YYYY-MM-DD' } }),
    run: (_s, input, ctx) => ctx.readLog({ staff: input?.staff, sinceIso: input?.since }).slice(0, 40).map((r) => ({ time: r.ts, who: r.staffName, question: r.question, answered: r.answered })),
  },
  {
    name: 'team_unanswered',
    roles: ['admin'],
    description: "Questions Muhammed could NOT answer — the feature-gap / missing-data list for the owner.",
    input_schema: obj({}),
    run: (_s, _i, ctx) => ctx.readLog({ unansweredOnly: true }).slice(0, 40).map((r) => ({ time: r.ts, who: r.staffName, question: r.question, reason: r.gapReason })),
  },
  {
    name: 'team_summary',
    roles: ['admin'],
    description: 'Totals of team Muhammed usage: number of questions, how many went unanswered, and a per-person count.',
    input_schema: obj({}),
    run: (_s, _i, ctx) => {
      const rows = ctx.readLog();
      const perPerson: Record<string, number> = {};
      rows.forEach((r) => { perPerson[r.staffName] = (perPerson[r.staffName] || 0) + 1; });
      return { totalQuestions: rows.length, unanswered: rows.filter((r) => !r.answered).length, perPerson };
    },
  },

  // ---- SALESMAN (Tahir) ----
  {
    name: 'my_sales',
    roles: ['salesman'],
    description: 'Your sales snapshot: total value of your orders (non-cancelled) and the order count.',
    input_schema: obj({}),
    run: (state) => ({ revenue: revenue(state), orders: arr(state, 'orders').length, note: 'Current live snapshot (orders are not date-stamped yet).' }),
  },
  {
    name: 'my_customers',
    roles: ['salesman'],
    description: 'Your customers with status, credit limit, credit days and on-hold flag.',
    input_schema: obj({}),
    run: (state) => arr(state, 'customers').map((c) => ({ name: c.name, category: c.category, status: c.status, credit: c.credit, creditDays: c.creditDays, onHold: !!c.onHold })),
  },
  {
    name: 'my_orders',
    roles: ['salesman'],
    description: 'Your orders with customer, status and total. Optional status filter.',
    input_schema: obj({ status: { type: 'string', description: 'optional status filter, e.g. PLACED' } }),
    run: (state, input) => arr(state, 'orders').filter((o) => !input?.status || o.status === input.status).map((o) => ({ id: o.id, customer: custName(state, o.customerId), status: o.status, total: o.total })),
  },
  {
    name: 'my_approvals',
    roles: ['salesman'],
    description: 'Your pending approvals (new customers, special prices) awaiting the owner.',
    input_schema: obj({}),
    run: (state) => arr(state, 'approvals').filter((a) => a.status === 'PENDING').map((a) => ({ type: a.type, label: a.label })),
  },

  // ---- WAREHOUSE + PURCHASE (Haris) ----
  {
    name: 'reorder_forecast',
    roles: ['warehouse', 'purchase'],
    description: 'Demand forecast: per product days-of-cover, stock-out risk (critical/warn/ok) and recommended reorder quantity.',
    input_schema: obj({}),
    run: (state) => forecast(state),
  },
  {
    name: 'low_stock',
    roles: ['warehouse', 'purchase'],
    description: 'Products at or below reorder level (40).',
    input_schema: obj({}),
    run: (state) => arr(state, 'products').filter((p) => (p.stock || 0) <= LOW_STOCK).map((p) => ({ name: p.name, stock: p.stock, reorder: LOW_STOCK })),
  },
  {
    name: 'dispatch_queue',
    roles: ['warehouse', 'purchase'],
    description: 'Orders waiting to be packed / advanced (PLACED, CONFIRMED, PACKED).',
    input_schema: obj({}),
    run: (state) => arr(state, 'orders').filter((o) => ['PLACED', 'CONFIRMED', 'PACKED'].includes(o.status)).map((o) => ({ id: o.id, customer: custName(state, o.customerId), status: o.status, total: o.total })),
  },
  {
    name: 'open_purchasing',
    roles: ['warehouse', 'purchase'],
    description: 'Open purchase requisitions and purchase orders.',
    input_schema: obj({}),
    run: (state) => ({
      requisitions: arr(state, 'requisitions').filter((r) => r.status === 'PENDING').map((r) => ({ id: r.id, product: r.name, qty: r.qty, auto: !!r.auto })),
      purchaseOrders: arr(state, 'pos').map((p) => ({ id: p.id, supplier: p.supplier, product: p.name, qty: p.qty, total: p.total, status: p.status })),
    }),
  },
  {
    name: 'grn_history',
    roles: ['warehouse', 'purchase'],
    description: 'Recent goods-received entries (GRN).',
    input_schema: obj({}),
    run: (state) => arr(state, 'grns').slice(0, 20),
  },
  {
    name: 'cash_in_hand',
    roles: ['warehouse', 'purchase'],
    description: 'Your confirmed cash in hand, plus any handovers from the driver still waiting for you to confirm, and flagged shortages.',
    input_schema: obj({}),
    run: (state) => ({
      cashInHand: harisCashInHand(state),
      pendingHandovers: arr(state, 'cash').filter((e) => e.kind === 'handover' && e.status === 'pending').map((e) => ({ declared: e.declared, expected: e.expected, variance: e.variance, by: e.by })),
      flaggedShortages: arr(state, 'cash').filter((e) => e.kind === 'handover' && e.flagged).map((e) => ({ declared: e.declared, expected: e.expected, variance: e.variance, reason: e.reason })),
    }),
  },

  // ---- DRIVER (Musthafa) ----
  {
    name: 'my_route',
    roles: ['driver'],
    description: 'Your optimized delivery route (nearest stop first) with the amount and payment method per stop.',
    input_schema: obj({}),
    run: (state) => route(state),
  },
  {
    name: 'my_cod',
    roles: ['driver'],
    description: 'Cash-on-delivery amounts you are due to collect on your remaining stops (total + per stop).',
    input_schema: obj({}),
    run: (state) => {
      const stops = arr(state, 'orders').filter((o) => o.status === 'OUT_FOR_DELIVERY' && o.method === 'CASH_ON_DELIVERY');
      return { totalToCollect: sum(stops.map((o) => o.total)), stops: stops.map((o) => ({ order: o.id, customer: custName(state, o.customerId), amount: o.total })) };
    },
  },
  {
    name: 'cash_status',
    roles: ['driver'],
    description: 'How much cash you have collected today and how much you are still holding (collected minus handed over).',
    input_schema: obj({}),
    run: (state) => ({ collected: totalCashCollected(state), holding: driverHolding(state), handedOver: cashHandedDeclared(state) }),
  },
  {
    name: 'my_deliveries',
    roles: ['driver'],
    description: 'Orders you have delivered, and how many stops are still out for delivery.',
    input_schema: obj({}),
    run: (state) => ({
      delivered: arr(state, 'orders').filter((o) => o.status === 'DELIVERED').map((o) => ({ order: o.id, customer: custName(state, o.customerId), total: o.total })),
      stopsLeft: arr(state, 'orders').filter((o) => o.status === 'OUT_FOR_DELIVERY').length,
    }),
  },
  {
    name: 'my_eod',
    roles: ['driver'],
    description: 'Your recent end-of-day summaries (cash, cheque, deliveries).',
    input_schema: obj({}),
    run: (state) => arr(state, 'eod').slice(0, 7),
  },
];

/** Union of tools the given roles may use. Admin (owner) is handed everything. */
export function toolsForRoles(roles: string[]): MuhammedTool[] {
  const set = new Set(roles || []);
  if (set.has('admin')) return MUHAMMED_TOOLS.slice();
  return MUHAMMED_TOOLS.filter((t) => t.roles.includes('all') || t.roles.some((r) => set.has(r)));
}

/** Plain-language capability menu per role — injected into the prompt so
 *  Muhammed can answer "what can you do for me?" accurately. */
export function capabilityMenu(roles: string[]): string[] {
  const set = new Set(roles || []);
  const out: string[] = [];
  if (set.has('admin')) out.push('company sales', 'cash by driver & shortages', 'queue health', 'collections', 'renewals due', "the team report (what the team asked, what couldn't be answered)");
  if (set.has('salesman')) out.push('your sales', 'your customers', 'your orders & their status', 'your pending approvals');
  if (set.has('warehouse') || set.has('purchase')) out.push('what needs reordering', 'low stock', 'the dispatch queue', 'open requisitions & POs', 'goods received', 'cash in hand & handovers to confirm');
  if (set.has('driver')) out.push('your delivery route', 'cash to collect (COD)', 'cash collected & holding', 'your deliveries', 'your end-of-day summary');
  return out;
}
