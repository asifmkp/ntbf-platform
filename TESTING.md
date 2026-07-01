# Testing

Automated tests cover the core business rules on both sides. CI runs them on every
push/PR ([.github/workflows/ci.yml](.github/workflows/ci.yml)).

## Front-end — business engine (no deps)
The shared store (`apps/mobile-app/store.js`) holds the real TRD business logic. It's
tested with a plain-Node harness (sandbox + localStorage shim), so it runs anywhere:

```bash
node apps/mobile-app/store.test.js
```

Covers: per-category order pricing & stock decrement, on-hold order blocking, insufficient-stock
rejection, **cheque bounce → AED 250 charge → account hold → recovery → release**, demand forecast
(stock-out risk + reorder qty), auto-replenishment de-duplication, customer create→approve→activate,
order cancel restock, collections aggregation, support-ticket lifecycle, and the order pipeline.
**13 tests.**

## Backend — unit tests
```bash
cd backend
npx jest
```

Covers: bill OCR→Zoho fuzzy matching (supplier + line items, with an unmatched-below-threshold case)
and the copilot agent's per-role tool scoping (salesman vs driver vs customer vs shared read tools).
**8 tests, 2 suites.** No database required — services are tested with mocks.

## Build verification
```bash
cd backend && npm run build      # type-checks all 112 API routes
node --check apps/mobile-app/app.js
node --check apps/mobile-app/copilot.js
```

## What's intentionally not unit-tested here
DB-backed Prisma services and the live Claude/Zoho calls are integration concerns — run them against
a real Postgres + keys (see [DEPLOY.md](DEPLOY.md)). The unit tests deliberately isolate the pure
business logic so they're fast and dependency-free.
