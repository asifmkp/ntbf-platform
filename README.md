# Foodstuffs Trading Application — with Integrated ERP

Implementation of the Technical Requirements Document (TRD v1.0).
A single role-based platform (Customer / Admin / Driver views) sharing one backend and database,
with built-in ERP modules (Accounting, Procurement, HR/Payroll).

## Monorepo layout

```
foodstuffs-app/
  backend/        Node.js (NestJS) + Prisma + PostgreSQL — REST API (this is being built first)
  apps/           React Native + React Native Web client (customer / admin / driver views) — later phase
```

## Build sequence (per TRD §9, backend-first)

- [x] Phase 0 — Backend scaffold: NestJS, Prisma, PostgreSQL, config
- [x] Phase 0 — Full data model (all entities from TRD §3)
- [x] Phase 0 — Auth + Role-Based Access Control (department submit → approve, Super Admin override)
- [ ] Phase 1 — Catalog & Inventory (admin)
- [ ] Phase 2 — Customer view APIs: catalog, cart, orders
- [ ] Phase 3 — Accounting module (ledger, AP/AR, COD/cheque, credit control)
- [ ] Phase 4 — Procurement (suppliers, requisitions, POs, quotations, GRN)
- [ ] Phase 5 — Driver/Delivery (routes, status, payment collection, tracking)
- [ ] Phase 6 — HR & Payroll
- [ ] Phase 7 — Reporting & analytics; client apps

## Backend quick start

```bash
cd backend
npm install
cp .env.example .env          # then edit DATABASE_URL + JWT_SECRET
npx prisma migrate dev --name init
npm run seed
npm run start:dev             # http://localhost:3000  (Swagger at /docs)
```

See `backend/README.md` for full details.
