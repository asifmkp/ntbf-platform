# Implementation Status — Foodstuffs Trading Application

Legend: ✅ done · 🟡 partial · ⬜ not started

## Backend (NestJS + Prisma + PostgreSQL) — 108 API routes
| TRD area | Status | Module |
|----------|--------|--------|
| §3 Data model (all ~45 entities) | ✅ | `prisma/schema.prisma` |
| §2/§5 Auth + RBAC (dept submit→approve, Super Admin) | ✅ | `auth`, `common/guards` |
| §4.1 Customer: catalog, cart, orders, tracking | ✅ | `catalog`, `orders` |
| §4.2 Catalog & inventory mgmt | ✅ | `catalog`, `inventory` |
| Payments / credit (COD/cheque, bounce→hold→recover, 250) | ✅ | `payments` |
| §4.4 Sales: special price, GPS visits, sales reports | ✅ | `sales` |
| §4.5/§4.8 Delivery: dispatch, nearest-km route optimizer, sales returns, EOD, deliveries | ✅ | `delivery` |
| §4.8.1 Fleet: vehicles, service records, renewal-due alerts | ✅ | `delivery` |
| §4.3.2/§4.6 Procurement: suppliers, requisitions, quotations, PO, GRN, three-way match, Super-Admin invoice approval | ✅ | `procurement` |
| §4.3.1 Accounting: ledger, expense payments, P&L, AR/AP aging, cash flow, VAT, balance sheet | ✅ | `accounting` |
| §4.3.3 HR & Payroll: attendance, leave, salary advance, payroll run, recruitment, offers, passport custody, exit, memos | ✅ | `hr` |
| §6.10 Cross-department approvals (Super Admin pending + override) | ✅ | `accounting` (ApprovalsController) |
| Zoho Books ERP integration + dashboard summary | ✅ | `zoho`, `dashboard` |
| Purchase bill photo → Claude vision → Zoho | ✅ | `ai`, `bills` |
| Role-aware Copilot agent (tool-use) | ✅ | `agent` |
| Single-service static hosting (apps + API) | ✅ | `ServeStaticModule` |

## Front-end
| Item | Status |
|------|--------|
| Interactive mobile field app (7 roles, working actions, shared store) | ✅ |
| Geographic nearest-first delivery route (Leaflet map) | ✅ |
| Bill photo capture → extract → match → record flow | ✅ |
| Role-aware Copilot (proactive insights, command execution, persistence) | ✅ |
| AI demand forecast & auto-replenishment | ✅ |
| Collections agent (reminders, recovery) | ✅ |
| Customer portal (shop + chat-ordering) | ✅ |
| Role dashboards + admin dashboard (live Zoho + snapshot fallback) | ✅ |

## Remaining / next
- 🟡 **Auth on demo endpoints** — `/api/agent`, `/api/bills`, `/api/dashboard/summary` are `@Public()` for the demo; gate before public launch.
- 🟡 **Automated GL posting** — ledger model + reports exist; auto-journal from orders/payroll/purchases is a follow-up.
- ⬜ **DB provisioning** — backend boots without a DB; run `prisma migrate deploy` + seed to enable relational ERP writes.
- ⬜ **Anthropic credits** — key wired & verified; add billing credits to make the Copilot fully conversational.
- ⬜ **Public deploy** — Dockerfile + render.yaml ready; pick a host.

## Run
See [RUN.md](RUN.md) (local) and [DEPLOY.md](DEPLOY.md) (production). API docs at `/docs`.
