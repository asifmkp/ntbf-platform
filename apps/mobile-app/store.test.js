/*
 * Business-engine tests for store.js — runnable with plain Node (no deps):
 *   node apps/mobile-app/store.test.js
 * Loads store.js in a sandbox with a localStorage shim and asserts the core
 * TRD business rules (pricing, stock, cheque bounce→hold→recover, forecast,
 * replenishment, collections, approvals, tickets).
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

function makeStore() {
  const store = {};
  const localStorage = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { for (const k in store) delete store[k]; },
  };
  const sandbox = { localStorage, window: {}, Math, Date, JSON, console };
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'store.js'), 'utf8'), sandbox);
  const S = sandbox.window.Store;
  S.reset(); // start from a clean seed each time
  return S;
}

let pass = 0, fail = 0;
function test(name, fn) {
  const S = makeStore();
  try { fn(S); console.log('  ✓ ' + name); pass++; }
  catch (e) { console.log('  ✗ ' + name + '\n      ' + e.message); fail++; }
}

console.log('store.js — business engine');

test('seed has catalog, customers and live deliveries', (S) => {
  assert.strictEqual(S.state.products.length, 10);
  assert.strictEqual(S.state.customers.length, 4);
  assert.strictEqual(S.driverStops().length, 3);
});

test('placeOrder decrements stock and computes total by price', (S) => {
  const p = S.product('p6'); // Coca Cola 2L @ 32.38, stock 150
  const before = p.stock;
  const id = S.placeOrder({ customerId: 'c1', lines: [{ pid: 'p6', qty: 2 }], method: 'CASH_ON_DELIVERY' });
  const o = S.order(id);
  assert.strictEqual(Math.round(o.total * 100), Math.round(32.38 * 2 * 100));
  assert.strictEqual(S.product('p6').stock, before - 2);
  assert.strictEqual(o.status, 'PLACED');
});

test('placeOrder blocked for on-hold account', (S) => {
  S.setHold('c1', true);
  assert.throws(() => S.placeOrder({ customerId: 'c1', lines: [{ pid: 'p6', qty: 1 }], method: 'CASH_ON_DELIVERY' }), /on hold/i);
});

test('placeOrder rejects insufficient stock', (S) => {
  assert.throws(() => S.placeOrder({ customerId: 'c1', lines: [{ pid: 'p8', qty: 9999 }], method: 'CASH_ON_DELIVERY' }), /stock/i);
});

test('cheque bounce applies 250 charge, holds account, opens recovery', (S) => {
  S.deliver('SO-1043', { method: 'CHEQUE_ON_DELIVERY', amount: 289.52, chequeNo: 'CHQ-1' });
  const pay = S.state.payments.find((p) => p.orderId === 'SO-1043');
  S.clearCheque(pay.id, false);
  const updated = S.state.payments.find((p) => p.id === pay.id);
  assert.strictEqual(updated.status, 'BOUNCED');
  assert.strictEqual(updated.bounceCharge, 250);
  assert.strictEqual(S.customer('c2').onHold, true);
  assert.ok(S.pendingApprovals().some((a) => a.type === 'RECOVERY'));
});

test('recovery releases the hold and clears bounced payments', (S) => {
  S.deliver('SO-1043', { method: 'CHEQUE_ON_DELIVERY', amount: 289.52, chequeNo: 'CHQ-1' });
  const pay = S.state.payments.find((p) => p.orderId === 'SO-1043');
  S.clearCheque(pay.id, false);
  S.recoverCustomer('c2');
  assert.strictEqual(S.customer('c2').onHold, false);
  assert.ok(!S.state.payments.some((p) => p.status === 'BOUNCED'));
});

test('forecast flags stock-out risk and recommends a reorder qty', (S) => {
  S.adjustStock('p6', -(S.product('p6').stock - 5)); // drop Coca Cola to 5 (velocity 18/day)
  const f = S.forecast().find((x) => x.id === 'p6');
  assert.strictEqual(f.status, 'critical');
  assert.ok(f.recommend > 0);
});

test('autoReplenish drafts requisitions and de-duplicates', (S) => {
  const n1 = S.autoReplenish();
  assert.ok(n1 > 0);
  const n2 = S.autoReplenish();
  assert.strictEqual(n2, 0); // nothing new — already pending
});

test('createCustomer is pending until admin approval activates it', (S) => {
  const id = S.createCustomer({ name: 'Test Mart', category: 'RETAIL', credit: 1000, creditDays: 7 });
  assert.strictEqual(S.customer(id).status, 'PENDING');
  const appr = S.state.approvals.find((a) => a.refId === id);
  assert.ok(appr);
  S.approve(appr.id);
  assert.strictEqual(S.customer(id).status, 'ACTIVE');
});

test('cancelOrder restocks the items', (S) => {
  const before = S.product('p6').stock;
  const id = S.placeOrder({ customerId: 'c1', lines: [{ pid: 'p6', qty: 5 }], method: 'CASH_ON_DELIVERY' });
  assert.strictEqual(S.product('p6').stock, before - 5);
  S.cancelOrder(id);
  assert.strictEqual(S.order(id).status, 'CANCELLED');
  assert.strictEqual(S.product('p6').stock, before);
});

test('collections aggregates undelivered orders as receivables', (S) => {
  const col = S.collections();
  assert.ok(col.length > 0);
  assert.ok(col.every((c) => typeof c.outstanding === 'number'));
});

test('support tickets: create, reply, resolve', (S) => {
  const id = S.createTicket({ customerId: 'c1', subject: 'Test', body: 'x', type: 'query' });
  assert.strictEqual(S.openTickets().some((t) => t.id === id), true);
  S.replyTicket(id, 'service', 'Looking into it');
  S.closeTicket(id);
  assert.strictEqual(S.state.tickets.find((t) => t.id === id).status, 'resolved');
});

test('adminAdvance walks an order through the pipeline to delivered', (S) => {
  const id = S.placeOrder({ customerId: 'c1', lines: [{ pid: 'p1', qty: 1 }], method: 'CASH_ON_DELIVERY' });
  ['CONFIRMED', 'PACKED', 'OUT_FOR_DELIVERY', 'DELIVERED'].forEach((expected) => {
    S.adminAdvance(id);
    assert.strictEqual(S.order(id).status, expected);
  });
});

test('cash handover flags a shortage and keeps the reason', (S) => {
  S.deliver('SO-1042', { method: 'CASH_ON_DELIVERY', amount: 271.41 });
  const holding = S.driverHolding();
  assert.ok(holding > 0);
  S.declareHandover(holding - 50, 'kept AED 50 for fuel');
  const h = S.state.cash.find((e) => e.kind === 'handover');
  assert.strictEqual(h.variance, -50);
  assert.strictEqual(h.flagged, true);
  assert.strictEqual(S.cashFlags().length, 1);
});

test('confirmed handover credits Haris cash-in-hand', (S) => {
  S.deliver('SO-1042', { method: 'CASH_ON_DELIVERY', amount: 271.41 });
  const id = S.declareHandover(271.41, '');
  S.confirmHandover(id, 271.41);
  assert.strictEqual(S.harisCashInHand(), 271.41);
});

test('cash-out (expense/advance) reduces cash-in-hand', (S) => {
  S.deliver('SO-1042', { method: 'CASH_ON_DELIVERY', amount: 271.41 });
  const id = S.declareHandover(271.41, '');
  S.confirmHandover(id, 271.41);
  S.logCashOut({ kind: 'expense', amount: 100, person: 'Haris', reason: 'fuel' });
  assert.strictEqual(S.harisCashInHand(), 171.41);
});

test('renewalsDue buckets expiries into 30/60/90 tiers, sorted by urgency', (S) => {
  const list = S.renewalsDue();
  const cnt = (t) => list.filter((r) => r.tier === t).length;
  assert.strictEqual(cnt('30'), 2); // Musthafa visa (25d) + van insurance (14d)
  assert.strictEqual(cnt('60'), 1); // Haris Emirates ID (55d)
  assert.ok(list[0].days <= list[list.length - 1].days);
});

test('addRenewal tracks a new document as OK when far out', (S) => {
  const before = S.state.renewals.length;
  S.addRenewal({ kind: 'visa', holder: 'New Staff', expiry: '2035-01-01' });
  assert.strictEqual(S.state.renewals.length, before + 1);
  assert.strictEqual(S.renewalsDue().find((r) => r.holder === 'New Staff').tier, 'ok');
});

test('stock movements are logged for sale, receipt and adjustment', (S) => {
  const before = S.stockMoves().length;
  S.placeOrder({ customerId: 'c1', lines: [{ pid: 'p6', qty: 2 }], method: 'CASH_ON_DELIVERY' });
  S.receiveGrn('p6', 50);
  S.adjustStock('p6', -3, 'damage');
  const mv = S.stockMoves();
  assert.strictEqual(mv.length, before + 3);
  assert.ok(mv.some((m) => m.type === 'out' && m.qty === -2));
  assert.ok(mv.some((m) => m.type === 'in' && m.qty === 50));
  assert.ok(mv.some((m) => m.type === 'adjust' && m.reason === 'damage'));
});

test('fixed-asset register depreciates straight-line to a book value', (S) => {
  S.state.assets = [{ id: 'AS-x', name: 'Van', category: 'Vehicle', cost: 60000, salvage: 0, purchaseDate: '2025-07-01', lifeYears: 5 }];
  const a = S.assetRegister()[0];
  assert.strictEqual(a.monthly, 1000); // 60000 / (5*12)
  assert.ok(a.bookValue < 60000 && a.bookValue >= 0);
  assert.ok(a.accumulated <= 60000);
  assert.strictEqual(S.assetTotals().count, 1);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
