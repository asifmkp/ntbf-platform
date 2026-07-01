# Foodstuffs Backend (NestJS + Prisma + PostgreSQL)

REST API for the Foodstuffs Trading Application with integrated ERP (TRD v1.0).

## Stack
- **NestJS 10** (REST), global `ValidationPipe`, Swagger at `/docs`
- **Prisma 5** ORM over **PostgreSQL**
- **JWT auth** (`passport-jwt`) with global `JwtAuthGuard`
- **RBAC** matching TRD §5: top-level role + department + access level
  (`STAFF < DEPARTMENT_ADMIN < SUPER_ADMIN`), Super Admin overrides everything

## Setup
```bash
npm install
cp .env.example .env          # set DATABASE_URL + JWT_SECRET
npx prisma migrate dev --name init   # needs a running PostgreSQL
npm run seed                  # sample data (see logins below)
npm run start:dev             # http://localhost:3000/api , Swagger /docs
```

> No PostgreSQL handy? `docker run --name foodstuffs-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=foodstuffs -p 5432:5432 -d postgres:16`

### Seed logins (password `Password123!`)
| Email | Role |
|-------|------|
| owner@foodstuffs.local | Super Admin (Management) |
| sales.admin@foodstuffs.local | Sales Department Admin |
| finance.admin@foodstuffs.local | Finance Department Admin |
| warehouse.admin@foodstuffs.local | Warehouse Department Admin |
| driver1@foodstuffs.local | Driver |
| shop@customer.local | Customer |
| …one `<dept>.admin@foodstuffs.local` per department | Department Admin |

## RBAC usage
```ts
@Departments(Department.FINANCE)
@MinAccessLevel(AccessLevel.DEPARTMENT_ADMIN)   // Finance Admin only
@Patch(':id/credit')
setCredit() { ... }
```
Decorators: `@Public()`, `@Roles()`, `@Departments()`, `@MinAccessLevel()`, `@CurrentUser()`.

## Implemented endpoints (this phase)
- **Auth** — `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`
- **Catalog** — `GET /api/products`, `GET /api/products/:id` (public, real-time stock + per-category price); `POST/PATCH/DELETE` (staff)
- **Customers** — `POST /api/customers` (Sales submit), `PATCH /api/customers/:id/approve` (Sales Admin), `PATCH /api/customers/:id/location` (GPS), `PATCH/GET /api/customers/:id/credit` (Finance Admin)
- **Orders** — `POST /api/orders` (place: category pricing + stock check + invoice + zone driver), `GET /api/orders/:id`, `GET /api/orders/:id/tracking`, `GET /api/orders/history/me`, `PATCH /api/orders/:id/status`
- **Payments** — `POST /api/payments`, `PATCH /api/payments/:id/clear` (bounce → 250 charge + account hold), `PATCH /api/payments/:id/recover` (Sales → auto-release), `POST /api/payments/:id/receipt`
- **Inventory** — `GET /api/inventory/:warehouseId`, `GET /api/inventory/check/:productId`, `POST /api/inventory/adjustments`, `POST /api/stock-transfers`, `PATCH /api/stock-transfers/:id/receive`

See [IMPLEMENTATION_STATUS.md](../IMPLEMENTATION_STATUS.md) for full TRD coverage.
