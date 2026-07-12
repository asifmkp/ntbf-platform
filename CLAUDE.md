# NTBF Platform — Project Context (CLAUDE.md)

Operations platform for **National Trading of Beverage & Foodstuff LLC** (NTBF, Ajman, UAE) — a wholesale FMCG/beverage distributor. Customer ordering app + role-locked staff field app on one backend, with Zoho Books as the accounting system of record and Claude for the AI copilot and bill OCR.

## Repo & hosting
- **Local folder:** `C:\Users\Lenovo\foodstuffs-app`
- **GitHub:** `asifmkp/ntbf-platform` → `main` (auto-deploys)
- **Host:** Render (Docker, Starter, always-on, 1 GB persistent disk at `/var/data`)
- **Live:** https://app.ntbfllc.com  (customer: `/order/`, staff: `/mobile-app/`)

## Stack
- **Backend:** NestJS + TypeScript. Serves the API (`/api/*`) and the frontends from one Docker container.
- **Data (important):** runs on **file-backed JSON stores** at `STATE_DIR/data/*.json` on the Render disk (staff-auth, appstate, customer-portal, bills). A Prisma/Postgres schema exists but is **UNUSED** — `DATABASE_URL` points at localhost and Prisma is not wired into the running flow. The `prisma:warn ... Database unavailable — running without it` and `libssl.so.1.1` lines in the Render logs are **expected noise, not bugs.**
- **Frontend:** vanilla HTML/CSS/JS (no framework), installable PWA / Android TWA. Customer app `apps/order/`, staff app `apps/mobile-app/`. Server-side prices in `backend/src/catalog.data.ts`.
- **AI:** Anthropic API. Model `claude-sonnet-4-6`.

## Zoho Books (system of record) — CONFIRMED
- **Org ID: `928751913`** — the platform's ONLY allowed write target (NTBFLLC). *An earlier note using `170000198188` was wrong.* ⚠ There is a SECOND org on the account — `929441168` "ntbfllc" (a deleted Zoho Expense trial). Writes are hard-locked to `928751913` in code (see write gating), so the second org can never be written to.
- **Plan: Standard.** Inventory app is joined; treat items as amount + description.
- **Account IDs (live, org 928751913 — these are the code defaults, env-overridable):**
  - Sales (income): `416943000000000388`
  - Cost of Goods Sold: `416943000000034003`
  - Inventory Asset: `416943000000034001`
  - Accounts Payable: `416943000000000373` · Petty Cash: `416943000000000361`
  - Zero Rate tax: `416943000000093180`
  - *(The stale `2532…` defaults were removed 2026-07-12.)*
- **Write gating (enforced 2026-07-12):** EVERY Zoho write goes through `ZohoService.post()`, which hard-enforces two invariants, fail-closed: `ZOHO_WRITES_ENABLED === 'true'` **AND** `orgId === 928751913`. No caller can bypass it. **Policy: drafts only.** The controlled write test is `POST /api/documents/zoho-test-po` → creates ONE draft Purchase Order for an EXISTING vendor (never creates a vendor; POs are draft by default = zero ledger impact). Caveat: Zoho *bills* post as "open" via the API (not drafts) — prefer POs for safe tests.
- Zoho reachable via MCP / API. Item list: `ZohoService.listItems()` (`items?per_page=200`; paginate past 200).

## Auth model
- Staff and customer JWTs (staff token stored in localStorage as `ntbf_stafftoken`).
- `PUBLIC_API_TOKEN` gates public/AI endpoints.
- **`ApiGateGuard` accepts EITHER** a valid `x-api-key` (the `PUBLIC_API_TOKEN`) **OR** a valid staff Bearer JWT (verified against `JWT_SECRET`, `typ === 'staff'`). Anonymous requests are still rejected.

## Bill capture pipeline (working)
- Frontend downscales the photo client-side, POSTs base64 to `POST /api/bills/extract` with the staff Bearer token.
- `AnthropicService.extractBill` → Claude vision with a forced tool call (`record_bill`, schema `BILL_TOOL` in `anthropic.service.ts`). Returns header fields + a `lineItems` array (description, quantity, unitPrice, amount, taxPercent).
- `POST /api/bills/match` (`BillsService.match`) → Jaccard/token-overlap match against Zoho items.
- `POST /api/bills/record` (`BillsService.record`) → builds the Zoho bills payload. **Now gated by `ZOHO_WRITES_ENABLED`** — returns a preview (writes nothing, not even a vendor) when off. *Before 2026-07-12 this path was NOT actually gated; the earlier claim here was aspirational. It is now enforced both here and at the `ZohoService.post()` choke point.*
- Body-parser limit raised to **15 mb** in `main.ts` for image uploads.
- Diagnostics: `GET /api/agent/status?ping=1` → live key+model test `{ok, model}` (no key leak). `GET /api/bills/status` → gated by `PUBLIC_API_TOKEN` (a plain browser hit returns 401 — expected).

## Env vars (set on Render — never in code)
`ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `JWT_SECRET`, `PUBLIC_API_TOKEN`, `STATE_DIR`, `PORT`, `CHEQUE_BOUNCE_CHARGE`, `ZOHO_ACCOUNTS_HOST`, `ZOHO_API_HOST`, `ZOHO_WRITES_ENABLED`, plus Zoho OAuth creds.

## Current state / known gaps
- **`ZOHO_WRITES_ENABLED = false`** — test mode; nothing posts to real Zoho books. Keep as-is until explicitly enabled.
- Catalog ~**1,678 SKUs, only ~395 priced** → ~1,200 at AED 0.00 (pricing deferred — data task for Asif/Haris).
- Bill line-item editable table = "Stage 1" built; Stage 2 (per-line Zoho matching + purchaser confirmation + remembered mappings in Supabase) is planned, not built.
- WhatsApp automation (Build B: Node/Express + 360dialog + VPS) is separate and not yet deployed.

## Team
Tahir (sales/invoicing) · Haris (purchasing/warehouse) · Musthafa (delivery/cash collection).

## Dev environment
- Claude Code installed natively on Windows. `git` 2.55 present; **no `gh` CLI** (use `git clone https://github.com/asifmkp/ntbf-platform.git`).
- **`node_modules` is NOT installed locally** → the backend can't be type-checked locally → after any push, confirm the **Render build went green** before trusting a deploy.

## Hard rules
- **NEVER commit `.env` or any secret.** Keys live in Render env vars only.
- **Ask before** deploys, DB/schema changes, Zoho writes, or key changes. **Show changes in plain English before committing; push only when Asif says so.**
- Keep `ZOHO_WRITES_ENABLED` in test mode unless explicitly told to enable it.
- Zoho org is `928751913` (Standard, inventory OFF) — never write to any other org.
- Prefer small, staged changes with a test step; explain trade-offs simply.
