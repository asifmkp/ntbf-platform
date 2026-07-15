# NTBF Platform — Architecture & Control Review

This document describes what actually exists on `main` (commit `501672d` at time of
writing), grounded in file/line citations. It exists to answer a specific control-review
checklist about money-handling code (the order pipeline, cash-on-delivery, the Bills
module, and the Finance module). Where a control does not exist in the pushed code, this
document says so explicitly rather than inferring it from naming or intent.

No `feature/bills-trust-layer` branch exists on GitHub (checked all remote refs and
reflog) — if that work happened locally, it was never pushed, and none of it is reflected
here.

## 1. Stack & high-level shape

- **Backend:** NestJS + TypeScript, one deployable service (`backend/`).
- **Frontend:** vanilla JS PWA (`apps/mobile-app` staff app, plus a customer ordering
  app), served by the same NestJS process via `ServeStaticModule`
  (`backend/src/app.module.ts:38-43`).
- **Two parallel persistence/auth systems live side by side in this codebase:**
  - **"System B"** — Prisma/Postgres + `JwtAuthGuard`/`RolesGuard` applied globally
    (`backend/src/app.module.ts:71-74`). Covers `orders`, `customers`, `inventory`,
    `payments`, `catalog`, etc. Per `CLAUDE.md:11`, the Prisma/Postgres schema exists but
    is **unused** in production — "Database unavailable" is expected noise.
  - **"System A"** — flat, file-backed JSON stores under `STATE_DIR/data/*.json`,
    authenticated by a separate staff JWT (`typ: 'staff'`) via `StaffAuthGuard`
    (`backend/src/staff-auth/staff-auth.module.ts:87-101`). Every route on this system
    is marked `@Public()` to opt out of the global System-B guards, then re-guarded
    per-route with `@UseGuards(StaffAuthGuard)`. **This is where all real money movement
    happens**: `customer-portal` (orders + the WhatsApp ingest pipeline), `finance`
    (receipts/payments/cheques/transfers), `rashid` (expenses/advances), `bills`
    (currently ungated — see §4).
- **AI:** Anthropic API (`backend/src/ai/anthropic.service.ts`) for bill-photo OCR and
  the WhatsApp/in-app "Muhammed" assistant.
- **Accounting system of record:** Zoho Books, org `928751913`, written to only through
  a single choke point (`ZohoService.post()`), gated by `ZOHO_WRITES_ENABLED` and a hard
  org-ID guard (per `CLAUDE.md:38`).

Staff accounts (`backend/src/staff-auth/staff-auth.module.ts:56-61`) are seeded in code
with hardcoded temporary passwords (e.g. `Musthafa` / driver role / `Drive@2026`) —
bcrypt-hashed at rest, but the plaintext seed values live in source. `CLAUDE.md:42-44`
already flags this and a burned Zoho refresh token as open, overdue security to-dos.

## 2. Order pipeline (System A, `customer-portal.module.ts`)

```
PLACED → CONFIRMED → PACKED → OUT_FOR_DELIVERY → DELIVERED
                                                 ↘ CANCELLED (before packing: sales/admin;
                                                              after packing: admin only)
```

Defined at `backend/src/customer-portal/customer-portal.module.ts:100` (`ORDER_STATUSES`)
and `:109-116` (`TRANSITIONS`):

```ts
const TRANSITIONS: Record<string, { from: string[]; roles: string[] }> = {
  CONFIRMED: { from: ['PLACED'], roles: ['salesman'] },
  PACKED: { from: ['CONFIRMED'], roles: ['warehouse'] },
  OUT_FOR_DELIVERY: { from: ['PACKED'], roles: ['warehouse', 'driver'] },
  DELIVERED: { from: ['OUT_FOR_DELIVERY'], roles: ['driver'] },
};
```

The guard is enforced server-side in `updateStatus()` (`:292-335`):

```ts
const t = TRANSITIONS[to];
const fromOk = !!t && t.from.indexOf(from) >= 0;
const roleMatch = t ? t.roles.find((r) => hasRole(roles, r)) : undefined;
if (fromOk && roleMatch) { actingRole = roleMatch; }
else if (isAdmin) { override = true; actingRole = 'admin'; }
else if (!fromOk) throw new BadRequestException(`Can't move an order from ${from} to ${to}`);
else throw new ForbiddenException(`Your role can't perform ${from} → ${to}`);
```

**A non-admin driver cannot skip PACKED** — `DELIVERED` requires `from === 'OUT_FOR_DELIVERY'`
and role `driver`; a request to jump straight from `PLACED`/`CONFIRMED` to `DELIVERED`
fails `fromOk` and throws `BadRequestException`. **An admin can** — the `else if (isAdmin)`
branch bypasses `fromOk`/`roleMatch` entirely, for any status pair. The bypass is not
silent: `override = true` is recorded on the history entry (`:326`,
`entry = { from, to, by, byId, role, at, override }`), so every admin skip is visible in
`statusHistory`, but nothing stops it from happening.

### Cash-on-delivery is recorded here, at the `DELIVERED` transition

This is a different code path from the Finance module's receipts (§3) — it's the one
Musthafa (or any `driver`) actually hits when marking an order delivered:

```ts
// customer-portal.module.ts:328-331
if (to === 'DELIVERED') {
  const amt = Number(dto.cashAmount);
  const amount = (isFinite(amt) && amt >= 0) ? Math.round(amt * 100) / 100 : o.total;
  extra.collected = { amount, method: dto.cashMethod || o.method || 'CASH_ON_DELIVERY', at, by: staff.name };
}
```

**Validation is real but narrow:**
- `cashAmount` is `@IsOptional()` with no `@IsNumber()`/range decorator on the DTO
  (`:104`) — it's coerced with `Number()` in the service.
- If it's not a finite number, the amount **silently falls back to `o.total`** (the real
  order total) — so a missing/garbage value cannot under- or over-record.
- If it *is* a finite number, the only check is `amt >= 0`. **Zero is accepted.** There
  is **no upper bound** — nothing compares `amt` to `o.total`. A driver can enter
  `AED 99999` for a real `AED 50` order and it is recorded verbatim in
  `extra.collected.amount`, with no rejection, no warning, and no separate confirmation
  step before the write. This is the single sharpest gap in the whole COD/cash
  handling path — see Known Limitations.

## 3. Finance module (`backend/src/finance/finance.module.ts`)

Added in commit `2cce56d` (PR #2). One file containing DTOs, a shared `JsonStore` base
class, `ReceiptStore`/`PaymentStore`/`TransferStore`, `FinanceService`, and
`FinanceController`. All routes are `@Public()` + `@UseGuards(StaffAuthGuard)`
(System A) — see `:409-466`.

**Storage** (`:84-151`, `class JsonStore`): each of receipts/payments/transfers is a
flat JSON array at `STATE_DIR/data/finance-{receipts,payments,transfers}.json`. Writes
are atomic (`:100-107`: write to `.tmp`, then `fs.renameSync`), so a crash mid-write
can't corrupt the file, but there is **no database, no transaction log, and no mention
of backups anywhere in this file** — see Known Limitations.

### Receipts (money IN) — `createReceipt()`, `:192-228`

```ts
const collected = round2(dto.collectedAmount);
if (!(collected > 0)) throw new BadRequestException('Collected amount must be greater than 0');
...
if (dto.orderId) {
  const o = this.orders.allOrders().find((x: any) => x.id === dto.orderId);
  if (!o) throw new BadRequestException('Order not found');
  ...
  billAmount = round2(o.total);       // pulled server-side from the real order — not client-supplied
  ...
}
const discount = billAmount != null ? round2(billAmount - collected) : 0;
if (billAmount != null && collected - billAmount > 0.001) throw new BadRequestException('Collected amount is more than the bill — check the figures');
```

- **Zero/negative:** rejected (`collected > 0` check).
- **Wildly wrong amount when linked to a real order:** rejected — `collected` cannot
  exceed the order's real `billAmount`, which is fetched server-side and cannot be
  spoofed by the client.
- **Wildly wrong amount when *not* linked to an order:** `orderId` is `@IsOptional()`
  (`:47`) and so is `billAmount` (`:52`). If a receipt is raised with no `orderId` and no
  `billAmount`, the only check left is `collected > 0` — there is no upper bound at all,
  and no cross-check against anything real. This is a second, separate gap from the
  DELIVERED-transition one in §2.
- **Confirm step:** not an "are you sure" dialog at submission time (I checked
  `apps/mobile-app/app.js` — there's a browser `confirm()` used for removing a staff
  account, `:1380`, but none around receipt/payment submission). What *does* exist is a
  downstream reconciliation flow: a receipt with a discount is held at
  `PENDING_APPROVAL` until finance/admin calls `approveDiscount()` or `rejectReceipt()`
  (`:237-248`), and every receipt — discounted or not — needs a separate
  `confirmReceived()` call by finance/admin (`:249-255`) before it reaches the terminal
  `CONFIRMED` state. So there's no entry-time confirmation, but there is a mandatory
  second-person confirmation before the money is considered reconciled.

### Payments (money OUT) — `createPayment()`, `:301-323`

Same `amount > 0` check (`:304`). Every payment starts at `PENDING_APPROVAL` and needs
`approvePayment()` by an **admin** specifically (`assertAdmin`, `:332`) — finance alone
cannot approve its own payment.

### Cheque lifecycle — `chequeAdvance()`, `:258-277`

State machine `RECEIVED → DEPOSITED → CLEARED`/`BOUNCED`, enforced by an explicit `flow`
map (`:264-268`) with the same "reject if `cur` not in `step.from`" pattern as the order
pipeline. `BOUNCED` auto-applies `this.bounceCharge` (`CHEQUE_BOUNCE_CHARGE` env var,
default `250`, `:171`). No admin-override escape hatch exists here — unlike the order
pipeline, there's no `isAdmin` bypass branch in `chequeAdvance`, so even an admin cannot
force an out-of-order cheque transition.

### Transfers (staff-to-staff) — `createTransfer()`, `:345-361`

`amount > 0` check (`:347`), cannot pay yourself (`:348`), receiver must be a real staff
ID (`:349-350`). Only the receiving staff member can confirm/decline
(`actTransfer`, `:369-374`: `if (x.toId !== staff.id) throw new ForbiddenException(...)`)
— someone else's transfer cannot be confirmed or declined by anyone but the named
recipient (or altered by finance/admin at all; there's no admin override here either).

## 4. Bills module (`backend/src/bills/`) — purchase-bill capture

This is a **different feature from customer COD/receipts**: photo → Claude OCR extract
→ fuzzy-match against Zoho vendors/items → record as a vendor bill in Zoho.

`bills.controller.ts:38-40` is `@UseGuards(ApiGateGuard)` at the class level, but **every
individual route is also marked `@Public()`** (`:44, 50, 57, 63`), and the class-level
comment says so outright:

```ts
/**
 * Purchase bill capture: photo -> Claude extracts -> match Zoho -> record.
 * Public so the field app can call it during development; gate with
 * @Departments(PURCHASE) before production.
 */
```

That production gating has not been added — `bills/extract`, `bills/match`, and
`bills/record` are reachable with no auth at all on `main` right now.

`bills.service.ts` `record()` (`:99-135`) has **no amount validation whatsoever** — no
check on `bill.lineItems[].amount`, no total sanity check, nothing preventing a negative
or zero-priced line from being posted. Its only safety mechanism is the Zoho
write-lock/preview gate inherited from `ZohoService` (`:102-111`): if writes are
disabled or Zoho isn't configured, it returns a `mode: 'preview'` object and writes
nothing.

## 5. Verified: the five requested safety controls

| # | Control | Status | Evidence |
|---|---|---|---|
| 1 | COD amount validation (no negative/zero/absurd) | **Partial.** Zero/negative blocked in both paths. Absurd values blocked *only* when the money is tied to a real order in the Finance receipt path; **not blocked at all** at the driver's DELIVERED-transition path, nor in a Finance receipt raised without an `orderId`. | `customer-portal.module.ts:329-331`; `finance.module.ts:194,209` |
| 2 | Idempotency / duplicate prevention | **Present for WhatsApp order ingest only.** Absent for Finance receipts/payments/transfers and for Bills. | Present: `customer-portal.module.ts:355-360` (`findByRef('whatsapp', ref)` short-circuits a repeat `external_ref`). Absent: no equivalent lookup exists anywhere in `finance.module.ts` or `bills.service.ts` — a double-tap or retried POST creates a second record every time. |
| 3 | Undo window (time-limited reversal + audit) | **Does not exist anywhere in the pushed code.** | `git grep -in undo` across all of `main` returns one hit, a *frontend copy string* on the order-cancel confirmation sheet (`apps/mobile-app/app.js:1420`, "This can't be undone") — not a reversal feature. No `/undo` route, no time-window check, on any module. |
| 4 | Mandatory notes on money-field corrections | **No correction/edit endpoint exists at all** for `collectedAmount`, `amount`, or `billAmount` post-creation — so there's nothing to require a note on. Rejections specifically *do* require a note (`RejectDto` at `finance.module.ts:79`: `@IsString() note: string`, non-optional); approvals, confirmations, and cheque-status changes (including `bounce`, which levies a charge) use `NoteDto`/`ChequeActionDto` where `note` is `@IsOptional()` (`:78,80`). | `finance.module.ts:78-80` |
| 5 | Before/after audit trail | **Present for status transitions, not for field-level edits** (because field-level edits don't exist — see #4). Every status change across orders, receipts, payments, cheques, and transfers appends a `{ from, to, by, byId, role, at, note? }` entry to `statusHistory[]`; cheque status changes go through `patch()` which also appends an entry. There is no structured diff of arbitrary field changes, only whatever free-text `note`/generated message accompanies a status transition. | `finance.module.ts:175-179` (`hist()`), `:136-150` (`applyStatus`/`patch`); `customer-portal.module.ts:326` |

## 6. Known Limitations (explicit, not hand-waved)

- **Driver-entered COD amount has no upper bound.** `customer-portal.module.ts:330` only
  checks `amt >= 0`; a driver can record any finite number, including one wildly larger
  than the order total, with no rejection and no second-person confirmation before the
  order is marked `DELIVERED` and the amount is persisted to `extra.collected`.
- **A Finance receipt raised without an `orderId` has no upper bound either** —
  `finance.module.ts:194` only enforces `collected > 0`; the cross-check against a real
  bill only fires when `dto.orderId` is supplied, and `orderId` is optional at the API
  level (`:47`) regardless of what the staff-app UI currently requires client-side.
- **No idempotency key on Finance receipts, payments, transfers, or Bills.** A retried
  network request or an impatient double-tap creates a second, independent record every
  time — nothing in `createReceipt`/`createPayment`/`createTransfer`/`bills.record`
  looks for an existing match before inserting.
- **There is no undo, anywhere.** Every terminal state (`CONFIRMED`, `APPROVED`,
  `REJECTED`, `CLEARED`, `BOUNCED`, `DELIVERED`, `CANCELLED`) is a dead end in code. The
  only way to fix a mistake is a new, separate action (e.g. reject + manually recreate) —
  there's no bounded reversal window and no mechanism to check "did the right person do
  this, in time."
- **Bills endpoints (`/bills/extract`, `/bills/match`, `/bills/record`) are public with
  no auth**, by explicit admission in the source comment
  (`bills.controller.ts:33-37`) — anyone who can reach the API can attempt to post a
  vendor bill into Zoho, gated only by the global `ZOHO_WRITES_ENABLED` write-lock, not
  by who's asking.
- **Bill amounts are entirely unvalidated.** `bills.service.ts:record()` posts whatever
  line-item amounts the (unauthenticated) caller supplies, with no negative/zero check
  and no sanity bound.
- **Money is stored in flat JSON files on a single disk (`STATE_DIR/data/*.json`), not a
  database**, with no audit log separate from the in-record `statusHistory[]` array —
  anyone with filesystem access (or a bug in any code path that touches those files)
  could edit historical records with nothing else noticing. Atomic writes (`:100-107`)
  protect against corruption from a crash mid-write; they do not protect against
  deliberate or buggy edits, and nothing in this codebase backs the files up.
- **Two admin-override escape hatches exist and are logged, not blocked**: the order
  pipeline lets an admin skip any stage (`override: true` recorded,
  `customer-portal.module.ts:320`); Finance's cheque lifecycle has *no* such override
  (confirmed by absence — see §3), so it is more locked-down than the order pipeline it
  sits next to.
- **Hardcoded seed passwords and a previously-exposed Zoho refresh token** are called out
  as open, overdue security to-dos by the project's own `CLAUDE.md:42-44` — not a finding
  from this review, but worth carrying into any control checklist since it directly
  affects who can reach the money-handling routes described above.

## 7. What this document does not cover

This review answered the specific questions asked about Bills, Finance, and the
COD-at-delivery path. It does not attempt a full audit of `accounting`, `agent`,
`catalog`, `customers`, `dashboard`, `delivery`, `hr`, `inventory`, `notifications`,
`payments`, `procurement`, `sales`, `support`, or the Prisma "System B" side of the app —
those directories exist and are wired into `app.module.ts` but were not read for this
pass.
