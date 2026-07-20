# PROJECT_KNOWLEDGE.md — NTBF Platform Canonical Knowledge Base

> **FORMAT / RULES** · This file is the single source of truth about this repository.
> If code and this file disagree, the code is right and **fixing this file is part of your current task**.
> Every section carries a `Last verified` stamp (ISO 8601, Asia/Dubai +04:00). Update the stamp when you re-verify a section.
> Never put secrets here — env var *names* only. See `/ai/HANDOFF.md` for how agents work in this repo.

Last full audit: **2026-07-21 · commit `2d3179f`** (three-way code audit: backend, frontend, infra).

---

## 1. What this is

**NTBF Platform** runs the operations of *National Trading of Beverage and Foodstuff LLC* (NTBF), an FMCG/beverage wholesale distributor in Ajman, UAE. Owner: Asif. It comprises:

- A **NestJS backend** (`backend/`) exposing `/api/*` and serving the static frontends.
- A **vanilla-JS staff PWA** (`apps/mobile-app/`) — the field app used daily by staff.
- A **customer shop** (`apps/order/`) and marketing/dashboard surfaces (`apps/`).
- A **WhatsApp bot** — lives OUTSIDE this repo (Supabase Edge Function `whatsapp-webhook`, project `wvsgeumafnqelspcqivo`); it calls into this backend.
- **Zoho Books** (org **928751913**, `.com` DC) — the accounting ledger of record. July 2026 books were fully imported and reconciled there.

Deployment: single Docker image on **Render** (`render.yaml`, plan starter), **`main` auto-deploys**. Persistent disk `/var/data` (1 GB) holds all live data as JSON files.

## 2. Architecture — the two systems (critical)

Last verified: 2026-07-21

The backend contains **two parallel systems in one app**:

**System A — LIVE (file-backed JSON).** All real functionality. Stores are classes persisting to `STATE_DIR/data/*.json` via atomic temp-write+rename, monotonic `seq`, IDs never reused. Auth = bespoke JWTs (`typ:'staff'` / `typ:'customer'`) or shared-secret ingest tokens. Every System A route is `@Public()` (to bypass the global Prisma guard) then locally re-guarded by `StaffAuthGuard`/`CustomerAuthGuard`/`IngestGuard`; role checks (`isAdmin`, `assertFinance`…) are hand-rolled in each service.

**System B — DORMANT ERP (Prisma/PostgreSQL).** The original TRD build: ~55 models (HR, procurement, accounting, delivery…), global `JwtAuthGuard`+`RolesGuard`. `DATABASE_URL` is unset in prod; `PrismaService` boots anyway (catch + warn). **Every System B endpoint 500s at runtime in prod.** It is routable dead code (see §10 debt #3, #4).

**Frontend has two data worlds too:**
- **`S` store** (`store.js`, localStorage `ntbf_app_v1`) — a client-side business engine synced across devices via `/api/appstate` (sync.js: pull 6s / push debounced 900ms, whole-blob last-write-wins, photo-stripping). Since PR #18 it seeds **empty** (`SEED_VERSION=2`; older persisted blobs are discarded on load; sync refuses to adopt older seedVersions). Many role views still read S (salesman home/customers/visits, warehouse stock, purchase, finance legacy tabs, admin overview, customer-portal role, service).
- **Server-fed views** — the real operational surfaces fetch `/api` directly: online orders, finance hub, expenses/advances, EOD, oversight documents, attention, suggestions, admin tools.

## 3. Module inventory (backend/src)

Last verified: 2026-07-21

| Module | System | Purpose |
|---|---|---|
| staff-auth | A | Staff login/JWT (30d), team mgmt, phone→staff registry. Seeds 4 accounts on first boot (`staff-auth.module.ts:56-61` — **passwords in source, HIGH risk**, see §10) |
| customer-portal | A | Customer accounts/orders + **WhatsApp order ingest** (`POST /api/portal/orders/ingest`, header `x-ingest-token`, idempotent by `source+externalRef` — **frozen contract**) |
| appstate | A | Whole-app shared JSON blob for sync.js. `PUT /api/appstate` guarded only by ApiGateGuard (see §10 #5) |
| finance | A | Receipts, payments, transfers (+cheque lifecycle), **EOD cash-up** (`/api/finance/eod/mine`), oversight documents union, finance-issued advances |
| rashid | A | Employee expenses (auto-approve ≤ threshold 50) + advances + per-staff ledger |
| suggestions | A | Staff improvement inbox (NEW→REVIEWING→PLANNED→DONE/DECLINED) |
| attention | A | Read-only role-scoped badge counts (`/api/attention/mine`) |
| audit | A | Global hash-chained audit log (interceptor on all writes) + gated Supabase exporter |
| muhammed | A | AI colleague: WhatsApp staff routing (`/api/muhammed/wa`) + in-app chat; read-only role-scoped tools over appstate |
| admin/clear-test-data | A | Admin wipe of transactional stores (`confirm:"CLEAR"`) |
| admin/july-backfill | A | July-2026 history import (dry-run/write/remove; `origin:'july-import'`) |
| zoho | integ | Zoho Books client. **Write-locked**: needs `ZOHO_WRITES_ENABLED='true'` AND org `928751913` else throws |
| bills | integ | Bill photo → Claude vision extract → Zoho match (Jaccard 0.34) → record (preview when locked) |
| agent, dashboard, documents | integ | Role-aware copilot; Zoho KPI dashboard; captured-doc → Zoho poster |
| ai/anthropic.service | integ | Claude client. Model `ANTHROPIC_MODEL` env (render.yaml pins it) |
| notifications | stub | FCM stub, logs only |
| prisma + auth, catalog, customers, orders, payments, inventory, procurement, hr, sales, delivery, accounting, support | **B (dormant)** | Full ERP surface; throws without DATABASE_URL |

## 4. API endpoints (live System A + integrations)

Last verified: 2026-07-21 · Guard legend: SA=staff JWT · CA=customer JWT · IG=ingest token · AG=ApiGateGuard (x-api-key or staff JWT + rate-limit) · PUB=open. Role gates in ( ).

```
Staff auth      POST /api/staff/login PUB · GET /me SA · POST /password SA
                GET|POST /team, /team/reset, /team/remove SA(admin)
Portal          POST /api/portal/register|login PUB · POST|GET /orders CA
                GET /orders/all SA · POST /orders/status SA(role-gated transitions)
                POST /orders/resolve-review SA(sales/admin) · /orders/archive SA(admin)
                POST /orders/ingest IG                      ← FROZEN CONTRACT
Muhammed        GET /api/muhammed/status PUB · POST /wa PUB+inline ingest-token
                POST /ask SA · /identity, /identities, /logs SA(admin)
Finance         POST|GET /api/finance/receipts(/mine|/:id/photo|approve|reject|confirm|cheque)
                GET /cheques · POST|GET /payments(+categories, approve/reject=admin)
                GET /colleagues · POST|GET /transfers(/mine|confirm|decline)
                GET /eod/mine · GET /eod/:employeeId (finance) — literal route first!
                POST /advances/issue (finance) · GET /summary (finance)
                GET /documents, /documents/summary (finance)   ← oversight
Expenses        POST /api/expenses · GET /mine · GET|PUT /config (admin)
                GET / (admin) · /:id/photo · /:id/approve|reject (admin)
Advances        POST /api/advances (admin) · GET /mine · /balances (admin)
                GET /ledger/mine · /ledger/:employeeId (owner|admin|finance)
                POST /:id/ack · /:id/settle (admin)
Suggestions     POST /api/suggestions · GET /mine · GET / (admin) · PATCH /:id/status (admin)
Attention       GET /api/attention/mine SA (role-scoped counters)
Audit           GET /api/audit, /verify, /export-status SA(admin)
Admin           POST /api/admin/clear-test-data SA(admin, confirm CLEAR)
                POST /api/admin/backfill-july SA(admin, dry-run|write:IMPORT|remove:REMOVE-JULY)
AppState        GET|PUT /api/appstate PUB+AG          ← see debt #5
AI/Zoho         GET /api/agent/status PUB · POST /chat AG
                /api/bills/* AG+SA · GET /api/dashboard/summary AG · /health PUB
                /api/documents/* AG only (writes Zoho when unlocked)
System B        ~80 further Prisma endpoints (auth, orders, hr, accounting…) — dormant, 500 in prod
```

## 5. Data: JSON stores & record shapes

Last verified: 2026-07-21 · All under `STATE_DIR/data/` (`/var/data/data/` on Render — persistent disk).

| Store | File | ID/seq | Lifecycle |
|---|---|---|---|
| StaffStore | staff.json | stf-/100 | seeded asif(admin), tahir(salesman), haris(warehouse+purchase), musthafa(driver) |
| CustomerStore | customers.json | cust-, ORD-/1000 | orders: PLACED→CONFIRMED→PACKED→OUT_FOR_DELIVERY→DELIVERED / CANCELLED; `collected{amount,method}` on delivery; `needsReview` flag |
| ExpenseStore | expenses.json | EXP-/2000 | SUBMITTED→APPROVED/REJECTED; auto-approve ≤ settings.autoApproveThreshold (50); paidFrom: advance/own_money/company_card |
| AdvanceStore | advances.json | ADV-/3000 | ISSUED→ACKNOWLEDGED→SETTLED; `source:'finance'` marks finance-issued |
| ReceiptStore | finance-receipts.json | RCPT-/4000 | PENDING_APPROVAL→COLLECTED→CONFIRMED / REJECTED; discount routing; cheque{…status} |
| PaymentStore | finance-payments.json | PAY-/5000 | PENDING_APPROVAL→APPROVED/REJECTED (admin approves) |
| TransferStore | finance-transfers.json | TRF-/6000 | PENDING_CONFIRM→CONFIRMED/DECLINED (receiver confirms — dual-control cash) |
| SuggestionStore | suggestions.json | SUG-/5000 | NEW→REVIEWING→PLANNED→DONE / DECLINED |
| AppStateService | appstate.json | {rev,state} | whole-blob, last-write-wins, rev monotonic server-side |
| MuhammedLog | muhammed-log.json | mlog- | append, cap 5000 |
| AuditStore | audit-log.json | aud-… | hash-chained (sha256(canonicalJSON+prevHash)), cap 10 000 rows |

**Cross-cutting fields:** `statusHistory[] = {from,to,by,byId,role,at,note?,override?}` (honest actor attribution — never fabricate);
`origin:'july-import'` (display-only history — **excluded from EOD + attention; MUST be excluded from any future app→Zoho sync**, see DEC-007);
`clientRef` (offline-outbox idempotency — same clientRef ⇒ server returns existing record);
`reference` (old-software ref: INV####/RCV###/PAY###/CON###/PUR### — July dedupe key);
`source`/`externalRef` (whatsapp ingest idempotency). Bill photos live as files under `data/*-bills/`, referenced by path.

## 6. Authentication flow

Last verified: 2026-07-21

1. **Global stack** (`app.module.ts:80-84`): `JwtAuthGuard` (passport-jwt vs Prisma users; `@Public()` bypasses) → `RolesGuard` (**open when no role metadata** — debt #4). Global `ValidationPipe {whitelist, transform, forbidNonWhitelisted}` — unknown body fields 400 (why DTOs enumerate everything incl. clientRef). Body limit **15 MB** (base64 photos). Global `AuditInterceptor` (fail-open; POST/PATCH/PUT/DELETE; actor from req.staff→user→customerId→ingest→anonymous; deep-redacts password/token/photo/… keys; 800-char summary).
2. **Staff**: bcrypt(10) verify → JWT `{sub, typ:'staff', name, roles}`, secret `JWT_SECRET || 'dev-secret'` (**landmine fallback in 11 files**), expiry 30d. `StaffAuthGuard` requires `typ==='staff'`, sets `req.staff{id,roles,name}`.
3. **Customer**: same pattern, `typ:'customer'`, sets `req.customerId`.
4. **Ingest**: `x-ingest-token === WHATSAPP_INGEST_TOKEN`; fail-closed when env empty. Two copies of the check (IngestGuard + inline in muhammed.controller).
5. **ApiGateGuard**: if `PUBLIC_API_TOKEN` set → require x-api-key OR valid staff JWT; **unset → open**. Plus in-memory per-IP rate limit 30/60s.

## 7. Business workflows (as wired today)

Last verified: 2026-07-21

- **Order → cash**: customer (shop/WhatsApp) → `PLACED` (WhatsApp via frozen ingest; fuzzy item match may set `needsReview`) → salesman **Confirm** → warehouse **Mark packed** → **Hand to driver** → driver **Delivered + cash** (records `collected{amount,method}`). App shows only the current role's button.
- **Driver day**: Route (server queue, maps) → deliver+collect → **EOD tab** (`/api/finance/eod/mine`: delivered cash/cheque, receipts, paid-out, **cashOnHand**) → **Hand over cash** → transfer PENDING_CONFIRM → receiver confirms on own phone (attention banner nudges them). Formula: deliveredCash + receiptsCash − CASH payments − advance-paid expenses − confirmed sent + confirmed received; pending-sent listed, not deducted; cheques never in cash.
- **Money capture**: receipts (discount<bill ⇒ PENDING_APPROVAL to finance), payments (admin approves), expenses (photo→Claude OCR prefill; ≤50 auto-approve), colleague transfers. All four flows carry `clientRef` idempotency + **offline outbox** (queue on network-fail only; 4xx surfaces; flush 20s/online; failed entries kept for explicit discard).
- **Floats**: advances ISSUED (admin or finance) → staff Acknowledge → spend via `paidFrom:'advance'` expenses → balance = advances − approved advance-spend; `reimbursementOwed` = approved own_money. Ledger `/api/advances/ledger/*`.
- **Oversight**: finance/admin **Documents** tab unions all 5 money stores with filters + per-record statusHistory.
- **Attention**: 30s poll → per-role tab badges, stale-order aging tags (>1h amber, >3h red), handover-confirm banner.
- **Muhammed**: staff-only AI over their own data (in-app + WhatsApp via bot pre-check `POST /wa`).
- **Bookkeeping boundary**: Zoho is the ledger. July 1–20 2026 fully lives in Zoho (reconciled to the fil). The app's July copy is display-only history (origin-tagged). **There is currently NO app→Zoho sync** — live app transactions accumulate un-booked until one exists (top queued task).

## 8. Completed features (chronological, PR-mapped)

Last verified: 2026-07-21

PR #2/#4 Finance module & cache bump · #8 Anthropic model default fix · #9 warm redesign · #10/#11 audit trail stages 1-3 (hash chain, interceptor, gated Supabase export) · #12 finance oversight dashboard · #13 per-staff prepayment ledger + balance-aware settle · #14 finance-issued advances · #15 staff suggestions inbox · #16 PWA cache v12 rollout · #17 admin clear-test-data · #18 **empty production seed** (demo dataset removed, SEED_VERSION migration) · #19 **July 2026 history backfill** (606 records, dry-run/write/remove, origin-tagged) · #20 **server-backed driver EOD + confirmed handover** · #21 **attention badges + order aging** · #22 **offline outbox + clientRef idempotency**. PWA cache now **v16**; WhatsApp bot at **v41** (voice-note support wired, pending key verification).

Outside repo, done: July Zoho import (47 bills PB-…, 255 invoices, 216 receipts, 45 vendor payments, 13 credit notes, 47 expenses, 43 cash-transfer journals, owner-capital journals; grand reconciliation PASS — receivable 11,193.05 = arithmetic tie-out); ops dashboard artifact; staff handbook PDF; management report PDF.

## 9. Missing features / known gaps

Last verified: 2026-07-21

1. **App→Zoho daily sync** — the biggest gap; must exclude `origin:'july-import'` (DEC-007) and use `clientRef`-style idempotency. (TASK-012)
2. Item-level sales/inventory (invoices are summary lines; Zoho inventory tracking off; barcodes absent on all 1,490 items).
3. Voice notes live-verification (bot code shipped; Groq key check pending). Push notifications (FCM stub). Photo→Zoho attachment (placeholder no-op).
4. Opening staff cash floats + old-Haris-account set-off (owner inputs pending).
5. Backups for `/var/data` (nothing automated — single copy of the business).
6. CI (none active — workflow exists only as `docs/ci.workflow.txt`), lint (script broken, no eslint installed).
7. `mytasks` staff tab is a placeholder.

## 10. Technical debt & risks (ranked)

Last verified: 2026-07-21 · file:line refs in the audit reports; top items:

1. **Seeded real staff passwords in source** (`staff-auth.module.ts:56-61`) + 30d tokens. Rotate + enforce change. (TASK-020)
2. **`'dev-secret'` JWT fallback** in 11 files if `JWT_SECRET` unset (render generateValue mitigates; still a landmine).
3. **System B dormant-but-routable** — Prisma endpoints 500 raw; `dbReady` never checked.
4. **RolesGuard open-by-default** — System B routes lacking metadata are open to any Prisma-authenticated user (`/orders/:id`, `/payslips/:employeeId`, `/offer-letters/:id/respond`…). Moot while System B is dead, real if ever revived.
5. **`PUT /api/appstate` effectively open** when `PUBLIC_API_TOKEN` unset — whole shared dataset writable; rev ignored (last-write-wins by design, but unauth write is not).
6. **No backups; 1 GB disk** holds everything incl. bill photos (15 MB uploads accumulate; no rotation).
7. **No CI, ungated auto-deploy** of `main` to prod.
8. **Stored-XSS vector in frontend**: `esc()` misses `>`; S-fed views interpolate customer/product names unescaped (customer-registerable names sync to staff screens). (TASK-021)
9. **render.yaml ships wrong Zoho org (`170000198188`) + `.ae` hosts** contradicting the only-valid org 928751913/.com (CLAUDE.md); currently neutralized by write-lock + org guard. Same mismatch in `.env.example`.
10. **Muhammed trusts bot-supplied roles** for unknown phones (confidentiality = ingest token strength). In-memory `waSeen` dedupe resets on redeploy.
11. Frontend structural debt: API-base expression duplicated 6+×; 5 overlapping auth-header helpers; ACT lifecycle double-wrapped (order-implicit); legacy S custody/demo views still wired (driver `custody`, purchase `cash`, admin `acash`); 4 orphan views; Leaflet CDN breaks route map offline; catalog.js (273 KB) not precached; `catalog.data.ts` hand-synced duplicate of catalog.js (server pricing source — drift mis-prices orders).
12. Audit chain caps at 10 000 rows (evicted rows leave the chain unverifiable); Swagger `/docs` public; ~21 stale merged remote branches.
13. CLAUDE.md marks **OVERDUE**: rotate Zoho OAuth creds (burned in chat), rotate admin password, wipe PS history.

## 11. Suggested improvements (beyond fixing §10)

Last verified: 2026-07-21

- App→Zoho sync designed around the existing idempotency primitives (clientRef/reference + origin exclusion).
- Consolidate: single `apiBase()`/auth-header helper; retire legacy S-only views or mark them; delete or feature-flag System B; shared ingest-token guard.
- Activate the docs-check CI template (`/ai/templates/`) + a real build/test workflow from `docs/ci.workflow.txt`.
- Nightly `/var/data` backup (e.g. tar → object storage or the gated Supabase channel); photo size/rotation policy.
- Barcode capture in the field app (unblocks item images/enrichment); item-wise sales analytics once the owner uploads the item-level report.
- Auth hardening: env-fail-fast when `JWT_SECRET` missing; force password change on first login; shorter staff-token expiry + refresh.

## 12. Environment variables (names only)

Last verified: 2026-07-21

Runtime: `PORT` `STATE_DIR` `STATIC_DIR` `CORS_ORIGIN` `JWT_SECRET` `JWT_EXPIRES_IN` ·
AI: `ANTHROPIC_API_KEY` `ANTHROPIC_MODEL` ·
Zoho: `ZOHO_ORG_ID` `ZOHO_CLIENT_ID` `ZOHO_CLIENT_SECRET` `ZOHO_REFRESH_TOKEN` `ZOHO_ACCOUNTS_HOST` `ZOHO_API_HOST` `ZOHO_WRITES_ENABLED` `ZOHO_SALES/COGS/INVENTORY/EXPENSE/CASH_ACCOUNT` ·
Gates: `PUBLIC_API_TOKEN` `WHATSAPP_INGEST_TOKEN` `RATE_LIMIT_MAX` `RATE_LIMIT_WINDOW_MS` ·
Audit export: `AUDIT_EXPORT_ENABLED` `AUDIT_SUPABASE_URL` `AUDIT_SUPABASE_KEY` ·
Misc: `CHEQUE_BOUNCE_CHARGE` `DATABASE_URL` (unset in prod).

## 13. Hard rules for every agent (non-negotiable)

1. **Zoho org 928751913 on `.com` only.** Never touch any other org. No Zoho writes without explicit owner instruction (writes are also env-locked).
2. **`POST /api/portal/orders/ingest` contract is FROZEN.**
3. **`origin:'july-import'` records must never reach Zoho** (DEC-007) and never count as live cash/attention.
4. No production deletion/cleanup, financial posting, or destructive action without owner ask. `main` auto-deploys — merging IS deploying.
5. Verify before merge: `cd backend && npx nest build` (exit 0) + `node --check apps/mobile-app/app.js`; bump `apps/sw.js` CACHE for any frontend change staff must receive immediately.
6. statusHistory actors are honest — never fabricate staff actions.
7. Update `/ai` docs as part of the task (see HANDOFF.md Definition of Done).
