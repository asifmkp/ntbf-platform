#!/usr/bin/env node
// ---------------------------------------------------------------------------
// build-july-backfill.js — transforms the validated July 2026 ledger exports
// (invoices / receipts / vendor payments / expenses / contras) into the single
// bundled data file the admin backfill endpoint serves from:
//
//     backend/src/admin/july-backfill.data.json
//
// The July 2026 books ALREADY LIVE IN ZOHO. This import is history-display
// only — records it produces carry origin: 'july-import' and must NEVER be
// synced back to Zoho (that would double-post the month).
//
// Usage:  node backend/tools/build-july-backfill.js [--src <dir>]
//   --src defaults to the directory the July exports were staged in.
// The script validates per-type counts and sums against the expected totals
// and exits non-zero on any mismatch.
// ---------------------------------------------------------------------------
'use strict';
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const srcIdx = argv.indexOf('--src');
const SRC = srcIdx >= 0 ? argv[srcIdx + 1]
  : '/tmp/claude-0/-home-user-muhammed/7a9eef2b-4ec8-59ea-89cd-adf00d38fbd4/scratchpad/july-import';
const OUT = path.join(__dirname, '..', 'src', 'admin', 'july-backfill.data.json');

const EXPECTED = {
  orders: { count: 255, sum: 63519.51 },
  receipts: { count: 216, sum: 52349.88 },
  payments: { count: 45, sum: 35380.38 },
  expenses: { count: 47, sum: 10572.0 },
  transfers: { count: 43, sum: 61390.0 },
};

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const read = (f) => JSON.parse(fs.readFileSync(path.join(SRC, f), 'utf8'));

// DD-MM-YYYY → YYYY-MM-DD (invoices are already ISO).
function isoDate(d) {
  const s = String(d || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s);
  if (!m) throw new Error('Unparseable date: ' + s);
  return `${m[3]}-${m[2]}-${m[1]}`;
}
// Full timestamp for createdAt / statusHistory.at — noon Gulf time so the
// calendar day is stable in any nearby timezone.
const isoAt = (d) => isoDate(d) + 'T08:00:00.000Z';

// Acting user in the books → app staff username (admin entries were Asif's).
function appUser(u) {
  const k = String(u || '').trim().toLowerCase();
  if (k === 'musthafa') return 'musthafa';
  if (k === 'tahir') return 'tahir';
  if (k === 'haris') return 'haris';
  if (k === 'admin' || k === 'asif') return 'asif';
  throw new Error('Unknown acting user in books: ' + u);
}

// Cash-box label → app staff username, or null when no app staff account
// exists for that box (Cash in Hand-Office, Rashid, Dhanish). Null keeps the
// label as a display-name-only party — staff accounts are never invented.
function cashUser(label) {
  const k = String(label || '').toLowerCase();
  if (k.includes('musthafa')) return 'musthafa';
  if (k.includes('vansale') || k.includes('haris')) return 'haris';
  if (k.includes('asif')) return 'asif';
  return null;
}

// Expense label → category bucket (same buckets used in Zoho).
function expenseCategory(label) {
  const k = String(label || '').toLowerCase();
  if (/petrol|fuel|generator/.test(k)) return 'Fuel';
  if (/food/.test(k)) return 'Food';
  if (/salary/.test(k)) return 'Salary';
  if (/rent/.test(k)) return 'Rent'; // "Warehouse Rent Expence" is rent
  if (/warehouse/.test(k)) return 'Warehouse';
  if (/forklift/.test(k)) return 'Forklift';
  return 'Other'; // "Other Charge", "(As Per Details)"
}

const cleanNarration = (s) => String(s || '').replace(/^Narration:\s*/i, '').trim();

// ---- transform the five ledgers ----
const invoices = read('invoices_payload.json');
const receiptsSrc = read('receipts_plan.json');
const vendorPays = read('vendor_payments.json');
const expensesSrc = read('expenses.json');
const contras = read('contras.json');

const orders = invoices.map((x) => ({
  ref: x.ref, date: isoDate(x.date), at: isoAt(x.date),
  customer: String(x.customer || '').trim(), total: round2(x.gross), user: appUser(x.user),
}));
const receipts = receiptsSrc.map((x) => ({
  ref: x.no, date: isoDate(x.date), at: isoAt(x.date),
  customer: String(x.customer || '').trim(), amount: round2(x.amount),
  cashLabel: x.cash || '', user: appUser(x.user),
}));
const payments = vendorPays.map((x) => ({
  ref: x.no, date: isoDate(x.date), at: isoAt(x.date),
  payee: String(x.account || '').trim(), amount: round2(x.amount),
  cashLabel: x.cash || '', user: appUser(x.user), narration: cleanNarration(x.narration),
}));
const expenses = expensesSrc.map((x) => ({
  ref: x.no, date: isoDate(x.date), at: isoAt(x.date),
  label: String(x.account || '').trim(), category: expenseCategory(x.account),
  amount: round2(x.amount), cashLabel: x.cash || '', user: appUser(x.user),
  narration: cleanNarration(x.narration),
}));
const transfers = contras.map((x) => ({
  ref: x.no, date: isoDate(x.date), at: isoAt(x.date),
  fromLabel: x.from, fromUser: cashUser(x.from),
  toLabel: x.to, toUser: cashUser(x.to),
  amount: round2(x.amount), user: appUser(x.user),
}));

// ---- validate against the expected totals ----
const sum = (a, k) => round2(a.reduce((t, x) => t + x[k], 0));
const actual = {
  orders: { count: orders.length, sum: sum(orders, 'total') },
  receipts: { count: receipts.length, sum: sum(receipts, 'amount') },
  payments: { count: payments.length, sum: sum(payments, 'amount') },
  expenses: { count: expenses.length, sum: sum(expenses, 'amount') },
  transfers: { count: transfers.length, sum: sum(transfers, 'amount') },
};
let ok = true;
for (const t of Object.keys(EXPECTED)) {
  const e = EXPECTED[t]; const a = actual[t];
  const match = a.count === e.count && a.sum === e.sum;
  if (!match) ok = false;
  console.log(`${t.padEnd(10)} count ${String(a.count).padStart(4)} (expect ${e.count})  sum ${a.sum.toFixed(2).padStart(10)} (expect ${e.sum.toFixed(2)})  ${match ? 'OK' : 'MISMATCH'}`);
}
// duplicate-ref guard within each type
for (const [name, list] of [['orders', orders], ['receipts', receipts], ['payments', payments], ['expenses', expenses], ['transfers', transfers]]) {
  const refs = new Set(list.map((x) => x.ref));
  if (refs.size !== list.length) { ok = false; console.error(`${name}: duplicate refs detected`); }
}
if (!ok) { console.error('VALIDATION FAILED — data file NOT written'); process.exit(1); }

const out = {
  generatedAt: new Date().toISOString(),
  note: 'July 1-20 2026 history backfill. Display-only: July already exists in Zoho. Records built from this file carry origin "july-import" and must be EXCLUDED from any future app->Zoho sync.',
  expected: EXPECTED,
  orders, receipts, payments, expenses, transfers,
};
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log('Wrote', OUT);
