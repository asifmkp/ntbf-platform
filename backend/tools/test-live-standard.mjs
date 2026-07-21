// Regression test — Live Operations vs Historical Import standard (FACT-026).
// Proves no operational KPI/list includes imported historical data unless a
// historical/combined view is explicitly selected, and that historical surfaces
// stay correct. Run against a local boot seeded with the July backfill:
//
//   STATE_DIR=$(mktemp -d) PORT=4310 node dist/src/main.js &
//   node tools/test-live-standard.mjs http://127.0.0.1:4310
//
// Exits 0 on full pass; prints FAIL lines and exits 1 otherwise.

const BASE = process.argv[2] || 'http://127.0.0.1:4310';
let failures = 0;
const ok = (cond, label) => { console.log((cond ? 'PASS  ' : 'FAIL  ') + label); if (!cond) failures++; };
const j = async (path, opts = {}) => {
  const r = await fetch(BASE + path, opts);
  if (!r.ok) throw new Error(path + ' -> HTTP ' + r.status + ' ' + (await r.text()).slice(0, 200));
  return r.json();
};
const round2 = (n) => Math.round(n * 100) / 100;

// --- expected imported aggregates (from the bundled backfill dataset) ---
const EXP = {
  orders: { count: 255, sum: 63519.51 },
  receipts: { count: 216, sum: 52349.88 },
  payments: { count: 45, sum: 35380.38 },
  expenses: { count: 47, sum: 10572.0 },
  transfers: { count: 43, sum: 61390.0 },
};

// 1. Login (seeded admin + a finance-capable check via the same account).
const login = await j('/api/staff/login', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ username: 'asif', password: 'Admin@2026' }),
});
const H = { authorization: 'Bearer ' + login.token, 'content-type': 'application/json' };

// 2. Import July history (idempotent; refs dedupe on re-run).
const imp = await j('/api/admin/backfill-july', { method: 'POST', headers: H, body: JSON.stringify({ mode: 'write', confirm: 'IMPORT' }) });
const impCount = (t) => (imp.types[t].imported || 0) + (imp.types[t].alreadyPresent || 0);
for (const t of Object.keys(EXP)) ok(impCount(t) === EXP[t].count, `backfill ${t}: ${impCount(t)} imported/present == ${EXP[t].count}`);

// 3. Create ONE live receipt so "live" is non-empty and distinguishable.
const LIVE_AMT = 123.45;
const rcpt = await j('/api/finance/receipts', {
  method: 'POST', headers: H,
  body: JSON.stringify({ customerName: 'Live Test Customer', collectedAmount: LIVE_AMT, method: 'CASH', narration: 'live-standard test', clientRef: 'live-standard-test-1' }),
});
if (rcpt.status !== 'CONFIRMED') await j(`/api/finance/receipts/${rcpt.id}/confirm`, { method: 'POST', headers: H, body: JSON.stringify({}) });

// 4. Orders feed: default live must contain ZERO imported records.
const live = await j('/api/portal/orders/all', { headers: H });
ok(live.every((o) => o.origin !== 'july-import'), `orders/all default: 0 imported of ${live.length}`);
const hist = await j('/api/portal/orders/all?view=historical', { headers: H });
ok(hist.length === EXP.orders.count && hist.every((o) => o.origin === 'july-import'), `orders/all?view=historical: ${hist.length} == ${EXP.orders.count}, all imported`);
const comb = await j('/api/portal/orders/all?view=combined', { headers: H });
ok(comb.length === live.length + hist.length, `orders/all?view=combined: ${comb.length} == live ${live.length} + hist ${hist.length}`);
ok(round2(hist.reduce((s, o) => s + o.total, 0)) === EXP.orders.sum, `historical orders sum == ${EXP.orders.sum}`);

// 5. Finance summary: default live excludes imported money entirely.
const sumLive = await j('/api/finance/summary', { headers: H });
ok(sumLive.view === 'live', 'summary default view == live');
ok(sumLive.moneyIn === LIVE_AMT, `summary live moneyIn ${sumLive.moneyIn} == ${LIVE_AMT} (imported 52,349.88 excluded)`);
ok(sumLive.moneyOut === 0, `summary live moneyOut ${sumLive.moneyOut} == 0 (imported 35,380.38 excluded)`);
ok(sumLive.receiptsCount === 1 && sumLive.paymentsCount === 0, `summary live counts r=${sumLive.receiptsCount}/p=${sumLive.paymentsCount} == 1/0`);
const sumHist = await j('/api/finance/summary?view=historical', { headers: H });
ok(sumHist.moneyIn === EXP.receipts.sum && sumHist.moneyOut === EXP.payments.sum, `summary historical ${sumHist.moneyIn}/${sumHist.moneyOut} == ${EXP.receipts.sum}/${EXP.payments.sum}`);
const sumComb = await j('/api/finance/summary?view=combined', { headers: H });
ok(sumComb.moneyIn === round2(EXP.receipts.sum + LIVE_AMT) && sumComb.moneyOut === EXP.payments.sum, `summary combined moneyIn ${sumComb.moneyIn} == ${round2(EXP.receipts.sum + LIVE_AMT)}`);
ok(sumComb.receiptsCount === EXP.receipts.count + 1, `summary combined receiptsCount ${sumComb.receiptsCount} == ${EXP.receipts.count + 1}`);

// 6. EOD stays live-only (regression — was already origin-filtered).
const eod = await j('/api/finance/eod/mine', { headers: H });
const eodCash = Number(eod.receiptsCollected && eod.receiptsCollected.cashTotal) || 0;
ok(eodCash <= LIVE_AMT + 0.001, `eod/mine cash ${eodCash} contains no imported cash`);

// 7. Historical summary endpoint (Historical Imported Data card source).
const h = await j('/api/admin/july-history/summary', { headers: H });
ok(h.counts.orders === EXP.orders.count && h.counts.documents === EXP.receipts.count + EXP.payments.count + EXP.expenses.count + EXP.transfers.count,
  `july-history counts: orders ${h.counts.orders}, documents ${h.counts.documents} == 351`);
ok(h.totals.revenue === EXP.orders.sum && h.totals.collections === EXP.receipts.sum, `july-history totals revenue/collections == ${EXP.orders.sum}/${EXP.receipts.sum}`);
ok(h.totals.documentsTotal === round2(EXP.receipts.sum + EXP.payments.sum + EXP.expenses.sum + EXP.transfers.sum), `july-history documentsTotal == 159,692.26`);

// 8. Documents dashboard (audit surface) still sees imported records:
//    351 imported money documents + the 1 live test receipt = 352 rows.
const docs = await j('/api/finance/documents', { headers: H });
ok(Array.isArray(docs) && docs.length >= 352, `documents dashboard still lists imported history (${Array.isArray(docs) ? docs.length : '?'} rows >= 352)`);

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
