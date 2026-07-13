# National Trading Platform — Handoff Summary

_Last updated: 2 July 2026. This document summarizes everything built, decided, and outstanding._

---

## 1. What this is

An operations platform for **National Trading of Beverage and Foodstuff LLC (NTBFLLC)** — a
wholesale FMCG/beverage distributor in Ajman, UAE. Built as a **single-app, role-based system**
(the original TRD) **plus** the real-business control systems from the owner's briefing.

- **Repo:** `C:\Users\Lenovo\foodstuffs-app` (git, branch `main`)
- **GitHub:** https://github.com/asifmkp/ntbf-platform
- **Live (web):** https://ntbf-platform.onrender.com  (Render, free tier)
- **Native app project:** Expo `@asifmkp/ntbf-order` — https://expo.dev/accounts/asifmkp/projects/ntbf-order

---

## 2. Company context (the real business)

- **National Trading (NTBFLLC)** — Ajman, UAE. Wholesale beverages + foodstuff. AED, 5% VAT.
- **Zoho Books** is the accounting system of record (Org ID `928751913`, .com data centre).
  Confirmed account IDs: Sales `416943000000000388`, COGS `416943000000034003`, Inventory Asset `416943000000034001`.
- **4 staff** (not a big org — the generic 7-department TRD was aspirational):
  - **Asif** — Owner/Admin, final approval on all financials. *Not a developer.*
  - **Tahir** — Sales: calls customers, checks stock, creates invoices.
  - **Haris** — Purchasing + Warehouse: POs, receives stock, recycles collected cash into purchases.
  - **Musthafa** — Delivery: delivers, collects cash, hands cash to Haris.
- **Daily cash cycle:** Tahir invoices → Haris fulfils/buys → Musthafa delivers + collects cash →
  hands to Haris → Haris funds next purchases. **Cash withdrawals were never logged — the #1 control gap.**
- **Catalog:** 1,467 SKUs (source: `NTBF_Inventory_Sheet.xlsx`). Pricing rule: **Sale = Purchase × 1.05**.
- **Public website:** ntbfllc.com — WordPress brochure site, **no store/portal** (that's the gap this fills).
- **Hard constraints:** staff non-technical (photo + button simple); mobile-first; **do NOT write to
  real Zoho until extraction is tested**; explain decisions to Asif in plain language; **ask before
  business-logic choices**; every uploaded document must attach to its Zoho record for audit.

---

## 3. Architecture

```
foodstuffs-app/
  backend/            NestJS + Prisma. Boots WITHOUT a DB (Prisma optional).
                      Serves the web apps (ServeStaticModule) + REST API (/api/*).
  apps/
    mobile-app/       Staff field app (HTML/JS, localStorage + shared-state sync)
    order/            Customer web ordering portal (per-account JWT auth)
    role-dashboards/  Department dashboards (live Zoho + snapshot fallback)
    admin-dashboard/  Management dashboard
    index.html        Hub landing page
    native/           Expo / React Native — native customer app (iOS+Android)
```

**Key architectural facts / decisions:**
- The **staff web app stores data in the browser** (`localStorage`) and **syncs across devices** via a
  single shared JSON blob: `GET/PUT /api/appstate` (file `backend/data/appstate.json`, monotonic `rev`,
  last-write-wins). This is a **prototype architecture** — right-sized for 4 staff, NOT for many
  concurrent users. The full relational **Prisma schema exists** (all ~45 entities, 112 routes) for the
  eventual production version but the web apps don't use it yet.
- The **customer portal is properly secured**: per-account register/login → JWT, orders isolated per
  customer, stored separately (`backend/data/customers.json`). This is production-shaped and safe to
  expose publicly. `/api/portal/*`.
- **Backend serves everything as one service** (API at `/api`, apps at `/`), so it deploys as one container.

---

## 4. What's built (features)

**TRD (fully implemented backend, 112 API routes):** auth + RBAC, catalog, orders, payments
(COD/cheque, bounce→250 charge→hold→recover), procurement (suppliers→requisition→quote→PO→GRN→
three-way match→Super-Admin approval), accounting (ledger, AP/AR aging, P&L, VAT, cash flow, balance
sheet), HR/payroll, sales (special price, GPS visits, reports), delivery + fleet (nearest-km route
optimiser, renewals), cross-department approvals.

**Staff field app (mobile-app) — 8 roles:** salesman(Tahir), driver(Musthafa), warehouse+purchase
(Haris), finance, admin(Asif), customer-service, customer. Working actions with a shared store.

**The 7 owner-priority control systems — ALL built:**
1. **Document capture → Zoho** — photo → Claude extracts → confirm screen → post to Zoho (Vendor Bill /
   Expense / PO) using real account IDs. **Safe test mode** (write-locked, see §6).
2. **Cash custody control** — Musthafa→Haris handover, expected-vs-actual, same-day shortage flag with
   person + reason, cash-out log (expenses/advances). *(This was the #1 gap.)*
3. **Stock movement ledger** — every IN/OUT/adjust logged (GRN, sale, damage/expiry/stocktake).
4. **Fixed-asset register** — straight-line depreciation, net book value.
5. **Compliance & renewals** — visa / labour card / Emirates ID / passport / vehicle insurance /
   registration with **90/60/30-day alerts**.
6. **Vehicle docs** — covered by renewals.
7. **Receivables / credit** — collections agent (reminders, recovery) + finance dashboards.

**Extras:** role-aware **AI copilot** (acts on data + proactive insights), **demand forecast &
auto-replenishment**, real **1,467-SKU catalog** with ×1.05 pricing, real staff names/branding.

**Native app (apps/native):** Expo/React Native **customer ordering app** (auth → shop → cart → order →
my orders) on the live backend. iOS+Android from one codebase.

---

## 5. Live status & deployment

- **Web platform is LIVE** at https://ntbf-platform.onrender.com (Render free tier). Verified working:
  hub, staff app, customer portal, dashboards, **live Zoho reads**, customer register→order→my-orders,
  security (401 without token). ✅
- **Render free tier caveats:** sleeps after ~15 min idle (~40s cold start); **file data (shared state,
  customer orders) RESETS on restart/redeploy/sleep.** For real daily use, upgrade to **Starter (~$7/mo)**
  for always-on + add a disk/DB for persistence. (render.yaml was stripped to free-tier: no disk/DB.)
- **Auto-deploy:** pushing to GitHub `main` auto-redeploys Render.

**Git commits this session (single clean history after a rewrite to drop `.github/workflows` — the
CI file is preserved at `docs/ci.workflow.txt`):** platform build → free-tier render.yaml → AI timeout
fix → native app.

---

## 6. Integrations & security state

- **Zoho Books:** CONNECTED and reading live from the cloud (OAuth refresh-token, .com DC). **Writes are
  DOUBLE-LOCKED:** (a) server env `ZOHO_WRITES_ENABLED=false`, and (b) an explicit `confirm:true` flag.
  Nothing has been written to Zoho. To go live for posting: set `ZOHO_WRITES_ENABLED=true` **after**
  testing extraction accuracy on real bills.
- **AI (Anthropic/Claude):** works perfectly **locally**; on Render it returns **503** (see open tasks —
  most likely the `ANTHROPIC_API_KEY` on Render is truncated/mis-pasted; a 30s timeout was added so a bad
  call fails cleanly instead of crashing the free instance).
- **API security:** `PUBLIC_API_TOKEN` gates `/api/agent`, `/api/bills`, `/api/dashboard/summary`,
  `/api/appstate` (sent as header `x-api-key`; set in the app via ⚙ Settings). Rate-limited per IP.
  Customer portal endpoints use their own JWT (no shared token needed).
- **Secrets are NOT in this file or in git.** They live in `backend/.env` (git-ignored) locally and as
  Render environment variables: `ANTHROPIC_API_KEY`, `ZOHO_CLIENT_ID/SECRET/REFRESH_TOKEN`,
  `PUBLIC_API_TOKEN`, `JWT_SECRET`.

---

## 7. Tests & quality

- **Front-end business engine:** `node apps/mobile-app/store.test.js` → **20 tests** (pricing, stock,
  cheque bounce→hold→recover, forecast, replenishment, collections, cash custody, renewals, stock moves,
  assets, tickets). All green.
- **Backend:** `cd backend && npx jest` → **8 tests** (bill fuzzy-matching, agent role-scoping). All green.
- Backend builds clean (`npx nest build`, 0 errors). CI config saved at `docs/ci.workflow.txt` (couldn't
  push under `.github/workflows/` because the GitHub token lacked `workflow` scope).

---

## 8. OPEN TASKS (in rough priority)

1. **Android app build finishing** — build `7a2307ed` is **queued on Expo free tier** (slow queue,
   then ~10-15 min). When done: build page → Install → APK on Android phone. **Then test it.**
   Watch: https://expo.dev/accounts/asifmkp/projects/ntbf-order/builds/7a2307ed-c239-47b2-9c4e-62e54bcae4f8
2. **Fix AI copilot 503 on Render** — re-check/re-paste the full `ANTHROPIC_API_KEY` in Render →
   Environment (it works locally; likely truncated on Render). Then re-test `/api/agent/chat`.
3. **DNS subdomains not done** — `app.ntbfllc.com` / `order.ntbfllc.com`. **Blocker:** the domain is
   registered under a **different Namecheap account** than the one Asif logged into (which only holds the
   hosting) — "You have not permission to manage this domain." Domain uses Namecheap BasicDNS
   (`dns1/dns2.registrar-servers.com`). **Action:** whoever owns the domain login adds two CNAMEs
   (`app` → `ntbf-platform.onrender.com`, `order` → same) + add the custom domains in Render Settings.
   Not urgent — the Render URL works today.
4. **iOS native build** — needs an **Apple Developer account ($99/yr)**. Android first.
5. **Enable Zoho posting** — after testing extraction on real bills, set `ZOHO_WRITES_ENABLED=true`.
6. **Upgrade Render to Starter (~$7/mo)** for always-on + persistent data (free tier loses data on
   restart). Add a disk or move shared state to Postgres.
7. **Native staff app** — only the customer native app is built; the staff field app is still web-only.
8. **Production data layer** — move the staff app from the localStorage/shared-blob prototype to the
   relational Prisma/Postgres backend for real multi-user integrity + scale.
9. **Revoke shared credentials** — the GitHub Personal Access Token and the Expo access token were pasted
   in chat during setup; delete them (GitHub → Developer settings; expo.dev → Access Tokens).
10. **Recommended: pilot first** — run the current system with Tahir/Haris/Musthafa for 2-3 weeks to
    surface real-workflow gaps before investing further in the native/production build.
11. **Money-critical review** — because it touches accounting, have the production build reviewed by a
    professional developer before real financial use.

---

## 9. How to run locally

```bash
# Backend + all web apps (one server on :3000; boots without a DB)
cd backend && npx nest build && node dist/src/main.js
#   Hub: http://localhost:3000/   ·   Field app: /mobile-app/index.html   ·   Portal: /order/index.html
#   Swagger API docs: /docs

# Native app (customer ordering) on your phone
cd apps/native && npm install && npx expo start   # then Expo Go on same Wi-Fi, or use EAS build (done)

# Tests
node apps/mobile-app/store.test.js
cd backend && npx jest
```

Key run/deploy docs already in repo: `RUN.md`, `DEPLOY.md`, `DEPLOY-NTBFLLC.md`, `TESTING.md`,
`apps/native/README.md`, `docs/`. Company briefing is saved in Claude memory (`ntbfllc-company`).

---

## 10. Key decisions made

- **Kept the full generic ERP** (owner's call) and **enriched it** with the real catalog + staff names,
  rather than narrowing it to the 4-person workflow.
- **Prioritised the owner's real control systems** (cash custody, doc-capture) over more generic ERP.
- **Zoho writes stay locked** until extraction is validated on real documents (honours the briefing).
- **Deployed on Render free tier first** (no card) to see it live; Starter plan is the real-use path.
- **Went native via Expo/React Native** (one codebase → both stores; EAS cloud build → no Mac needed).
  **Android first** (free); iOS later (needs Apple account).
- **Customer portal built with real per-account auth** so it's safe to expose publicly; the staff app's
  shared-blob is acceptable only because it's an internal 4-person tool behind a shared token.
