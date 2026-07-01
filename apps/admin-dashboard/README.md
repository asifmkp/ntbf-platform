# NTBFLLC Admin Dashboard (sample)

A self-contained admin dashboard for the Foodstuffs Trading Application, seeded with a
**live snapshot of your Zoho Books / Inventory org (NTBFLLC)** taken 30 Jun 2026.

## Open it
Just open `index.html` in any browser — no build step, no server needed.
(Chart.js loads from CDN, so keep an internet connection.)

## What it shows
- **Dashboard** — KPI cards (products, stock, inventory value, customers, revenue, A/R, open orders, pricing alerts), a gross-margin-per-carton chart, and auto-flagged pricing issues.
- **Catalog** — searchable table of all products synced from Zoho, with margin and a Healthy / Below-cost / Missing-price status per item.
- **Pricing health** — the issues that need a corrected sale or purchase price before go-live.
- **Customers / Orders / Procurement / Accounting** — empty-state modules that fill in as you trade.

It is **data-driven**: everything (KPIs, chart, alerts, table) is computed from the
`DATA` object in `index.html`. As you finish uploading products in Zoho, the dashboard
reflects the full list — nothing is hard-coded per product.

## Current data (sample)
10 products, AED, 5% VAT, zero stock/customers/orders yet. Six products are flagged:
3 selling below cost, 3 missing a sale or purchase price — expected, since the catalog
upload is still in progress.

## Switching to live data
`index.html` embeds `DATA` inline so it opens from `file://` without CORS issues.
`data/zoho-snapshot.json` holds the same snapshot in the shape the live API returns.
To go live, replace the inline `DATA` with a fetch from the NestJS backend, e.g.:

```js
const DATA = await fetch('/api/dashboard/summary').then(r => r.json());
```

where `/api/dashboard/summary` proxies Zoho (`list_items`, `list_invoices`,
`list_contacts`, `list_sales_orders`, …) and returns `{ counts, totals, items }`.
That endpoint is the natural next step to make this dashboard refresh on real data.
