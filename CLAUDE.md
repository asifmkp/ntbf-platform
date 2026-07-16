# NTBF Platform — Project Context (CLAUDE.md) — updated 16 Jul 2026

Operations platform for **National Trading of Beverage & Foodstuff LLC** (NTBF, Ajman, UAE) — wholesale FMCG/beverage distributor. Customer ordering app + role-locked staff app on one backend, a **live Claude-powered WhatsApp bot**, Zoho Books as the accounting system of record, and Claude for AI copilot + bill OCR.

## ⚠️ ZOHO — CORRECT ORG IS 928751913 ON THE .COM DATA CENTRE. ALWAYS.
- The ONLY correct Zoho Books org for NTBF is **928751913** (`.com` data centre).
- Correct connectors: **NATIONALBOOKS\*** and **"ZOHO NATIONAL BOOKS"** (all `.com` endpoints).
- WRONG org: `170000198188` (and Zoho One IDs `170000198375` / `170000199615`). These come from the `.ae` connector or a different Zoho login. **NEVER write to them.**
- The `.ae` "Zoho Books" connector returns the WRONG org and error **6041** — do not use it.
- **BEFORE any Zoho read/write, a chat MUST confirm it can see org 928751913.** If it sees `170000198188`, it is on the WRONG account — **STOP and reconnect via the `.com` world.**
- Env vars `ZOHO_ACCOUNTS_HOST` / `ZOHO_API_HOST` must use `.com` endpoints, never `.ae`.

## Repo & hosting
- **Local folder:** `C:\Users\Lenovo\foodstuffs-app` · **GitHub:** `asifmkp/ntbf-platform` → `main` (auto-deploys)
- **Host:** Render (Docker, Starter, persistent disk `/var/data`) · **Live:** https://app.ntbfllc.com (customer `/order/`, staff `/mobile-app/`)
- **WhatsApp bot host:** Supabase project `wvsgeumafnqelspcqivo` — Edge Function `whatsapp-webhook` (deployed via MCP by chat-Claude; local folder `Desktop\ntbf-whatsapp` holds an OLD version — the deployed code is the truth).

## Stack
- **Backend:** NestJS + TypeScript, file-backed JSON stores at `STATE_DIR/data/*.json` (Prisma/Postgres schema exists but UNUSED — `Database unavailable` + `libssl` log lines are expected noise).
- **Frontend:** vanilla JS PWA/TWA. Server-side prices in `backend/src/catalog.data.ts`.
- **AI:** Anthropic API, model `claude-sonnet-4-6`.

## WhatsApp bot (LIVE — built 11 Jul 2026, **v16** — webhook loop guard deployed 13 Jul 2026)
- Number **+971 58 980 0236** via **360dialog** (Cloud API; send via `waba-v2.360dialog.io/messages`, header `D360-API-KEY`). Meta-direct attempt abandoned.
- Features live: Claude replies 24/7 in customer's language; live catalog search (fetches the app's public catalog, 6h refresh, never invents prices); per-customer conversation memory (12 msgs / 24h, table `wa_messages`); webhook-retry dedupe; collects delivery address; `save_order` tool → `wa_orders` → **auto-push to platform ingest** → returns platform `ORD-####`.
- Supabase tables: `wa_messages`, `wa_orders` (+`address`, `platform_order_id`, `push_status`), `opt_ins`, `bot_settings` (holds review/cron tokens, `reminders_enabled=false`).
- **Reminder engine:** pg_cron daily 04:00 UTC (8AM UAE) → dormant until Meta template approval + opt-ins, then flip `reminders_enabled=true`.
- **Team dashboard:** standalone file `NTBF-WhatsApp-Dashboard.html` (Supabase blocks HTML on its domain — JSON API + local HTML viewer). Staff app is the real order queue.
- Bot secrets in Supabase: `D360_API_KEY`, `ANTHROPIC_API_KEY`, `PLATFORM_INGEST_TOKEN`.

## Unified order pipeline (LIVE)
- `POST /api/portal/orders/ingest` — auth header `x-ingest-token` = Render env `WHATSAPP_INGEST_TOKEN` (same value as bot's `PLATFORM_INGEST_TOKEN`). Idempotent on `source+external_ref`; server-side re-pricing (brand/size-safe matcher); unknown phones → guest + `needsReview`; orders enter PLACED with source badge. **This contract is frozen — the bot depends on it.**
- **Role-enforced transitions** (server-side 403s + hidden buttons): PLACED→CONFIRMED (Tahir/admin, blocked while needsReview until resolve-review), CONFIRMED→PACKED (Haris/admin), →OUT_FOR_DELIVERY (Haris/Musthafa/admin), →DELIVERED + real collected-cash amount (Musthafa/admin). Admin overrides flagged. Full `statusHistory[]` audit timeline on every order; order-details sheet everywhere; driver route = ordered stop list with Navigate links (no pin map — informal addresses).
- **Test-data cleanup DONE & verified (12 Jul):** 17 pre-production orders archived to `orders-archive-test-2026-07-12.json` and the live queue emptied (count 0); `seq` preserved at 1022 → next real order is `ORD-1023` (test IDs never reused). wa_orders test rows marked `[TEST]`/done.

## Rashid module — Employee expenses & advances (Stage 1 — in PR, NOT deployed)
- New feature on **System A** (file-backed JSON + staff JWT): `backend/src/rashid/rashid.module.ts` + additions in `apps/mobile-app/app.js`. New role **`staff`** (general employee; first user Rashid, distinct from `driver`), created via existing Manage Team. **Does not touch the `/api/portal/orders/ingest` contract.**
- Stores `data/expenses.json` + `data/advances.json`; bill photos on the persistent disk at `/var/data/data/expense-bills/<EXP-id>.<ext>` (fetched via `GET /api/expenses/:id/photo`). Endpoints under `/api/expenses/*` and `/api/advances/*`, `StaffAuthGuard` + inline admin gate.
- Expenses: date/amount/category(8 fixed)/paidFrom(advance|own_money|company_card)/remark/photo → SUBMITTED→APPROVED|REJECTED with `statusHistory[]`; **auto-approve ≤ AED 50** (admin-editable in `expenses.json` settings). Bill OCR reuses the existing `POST /api/bills/extract` (Claude) to prefill. Balance = outstanding advances − approved advance-paid expenses; approved `own_money` = reimbursement owed; negative balances shown. Verified by a 24/24 end-to-end test + photo disk round-trip.
- **Roadmap (each stage is PLAN-FIRST → written approval → code; "do all" never skips a gate):** Stage 2 = task tracker + vehicle log · Stage 3 = document-expiry locker (60/30/7-day) · Stage 4 (separate explicit go) = approved expenses → Zoho **DRAFT** expenses (org 928751913, `ZOHO_WRITES_ENABLED` respected).

## Zoho Books (system of record) — CONFIRMED
- **Org `928751913`** — the only ACTIVE org (`.com` DC). ⚠️ A **second deleted org `929441168`** exists on the account → **hard org guard required on all writes.** Old note `170000198188` was wrong — never use.
- **Plan: Professional** (upgraded 13 Jul — stock tracking ON, POs enabled). ⚠️ Stock tracking means any PO/bill line that hits a stock account must reference a real `item_id` (else Zoho code **13030** "Item field under stock account cannot be empty").
- Accounts: Sales `416943000000000388` · COGS `416943000000034003` · Zero Rate tax `416943000000093180`. (Code's old `2532…` defaults were stale/wrong — fixed in Gate 2; also Inventory Asset `416943000000034001`, Petty Cash `416943000000000361`.)
- **Gate 2 COMPLETE (12 Jul):** hard org guard + write-lock enforced at the single `ZohoService.post()` choke point (fail-closed), `bills/record` properly gated, correct `416943…` account IDs wired. **Verified on the deployed code (commits `259f9c8`+`b1fb34a`):** write-lock off → `{mode:preview, "…writes off. Nothing was written."}`; org guard → **403** for any org ≠ `928751913` (tested against the real second org `929441168`). Production also blocks anonymous writes with 401.
- **Gate 3 COMPLETE (13 Jul):** the platform wrote a real **DRAFT** Purchase Order (`PO-00001`, vendor Al Maha General Trading LLC, AED 1, line `item_id 416943000000118002`) to org 928751913 via `POST /api/documents/zoho-test-po` — verified via MCP, then **deleted** (draft = no ledger impact). The full write path (org guard + write-lock + drafts-only) is proven end-to-end. Root-cause chain of the long fight: stale `ZOHO_ORG_ID` (`170000198188`) → `ZOHO_REFRESH_TOKEN` minted from the **wrong identity/world** (deleted trial `929441168`) → fixed with a clean `.com` Self Client token (⚠️ all three creds — client_id, secret, refresh_token — must be a **matched set** in Render, or you get 503 "Could not obtain Zoho access token") → then Zoho `13030` fixed by referencing a real `item_id` (Professional stock tracking). `ZOHO_WRITES_ENABLED` set back to **false**.

## Open security to-dos (TOP PRIORITY — all still OPEN as of 14 Jul 2026)
- **Rotate Zoho OAuth creds — OVERDUE.** The client secret + refresh token were pasted into chat during Gate-3 troubleshooting → **burned**. Regenerate a fresh `.com` Self Client and enter the new client_id / client_secret / refresh_token **straight into Render** (never into chat or a screenshot); all three must be the same matched set.
- **Rotate the admin password — OVERDUE.** Burned + weak (see Auth model). Change via Settings → Change password (strong 10+ chars).
- **Wipe local PowerShell history** — `Remove-Item (Get-PSReadlineOption).HistorySavePath` (leaked values were typed there during the fix).

## Migration project (in progress)
- Business **restarted fresh 1 Jul 2026**; old software still in parallel. Source: all-transactions CSV 1–12 Jul = **428 vouchers** (182 Sales w/ item lines, 145 Receipts, 43 Payments, 30 Purchases, 15 Contra, 13 Credit Notes; VAT@5% exclusive; van-cash ledgers "Musthafa-Cash In Hand", "Vansale UAQ-Haris").
- Plan: readiness audit → mapping sign-off → pilot (July 1 only) → full run → item pricing from latest purchase/sale rates. Fresh numbering = Zoho defaults from 1. Opening balances arrive later and must precede receipts. **Accountant must confirm Zoho files July VAT (single source of record).**
- Pricing status: 1,407 items, 247 priced, 1,160 unpriced (`NTBF-Pricing-Worklist.xlsx` with Haris; chat-Claude can bulk-write via item IDs).

## Auth model
- Staff/customer JWTs; `ApiGateGuard` accepts `x-api-key` (PUBLIC_API_TOKEN) OR staff Bearer JWT. Admin password must be **rotated again** (the 12-Jul replacement was also exposed in chat — use a strong 10+ char password). Self-service: Settings → Change password; admin resets via Manage team. Rule: passwords are never typed into chats; scripts prompt with masked input.

## Env vars (Render — never in code)
`ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `JWT_SECRET`, `PUBLIC_API_TOKEN`, `STATE_DIR`, `PORT`, `CHEQUE_BOUNCE_CHARGE`, `WHATSAPP_INGEST_TOKEN`, `ZOHO_ACCOUNTS_HOST`, `ZOHO_API_HOST`, `ZOHO_WRITES_ENABLED`, `ZOHO_ORG_ID`, Zoho OAuth creds (+ account-ID vars after Gate 2).

## Team
Tahir (sales/invoicing) · Haris (purchasing/warehouse) · Musthafa (delivery/cash — van sales heavy).

## Chat workstreams (project)
"Zoho Migration" · "WhatsApp Bot" · "Platform & Claude Code" · "Daily Ops".

## Hard rules
- **NEVER commit `.env` or any secret.** Treat anything typed into a chat as burned.
- **Ask before** deploys, schema changes, Zoho writes, key changes. Plain-English diffs; push only on Asif's go. `nest build` before every push (no local node_modules → trust Render green).
- **Zoho org `928751913` only** — hard-guard every write; drafts only; `ZOHO_WRITES_ENABLED` stays false until explicitly enabled.
- The WhatsApp ingest contract is frozen; never change it without updating the Supabase bot in the same move.
- Small staged changes, test step each, trade-offs explained simply.
