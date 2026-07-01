# NTBFLLC Role Dashboards

Role-based views over one platform (TRD §1, §4). Open [`index.html`](index.html) to pick a role.

| View | File | Platform | TRD | Live data |
|------|------|----------|-----|-----------|
| Management / Admin | [`../admin-dashboard/index.html`](../admin-dashboard/index.html) | Web/tablet | §4.2 | ✅ catalog, KPIs |
| Salesman | [`salesman.html`](salesman.html) | Phone-first | §4.4 | sample ops |
| Purchase officer | [`purchase.html`](purchase.html) | Web/tablet | §4.6 | ✅ stock check |
| Delivery driver | [`delivery.html`](delivery.html) | Phone-first | §4.5 | sample ops |
| Warehouse incharge | [`warehouse.html`](warehouse.html) | Web/tablet | §4.7 | ✅ stock levels |
| Finance admin | [`finance.html`](finance.html) | Web/tablet | §4.9 | ✅ A/R, revenue, VAT |

## Live data
Admin, Purchase, Warehouse and Finance call the backend endpoint
`GET /api/dashboard/summary`, which aggregates **Zoho Books** (items, invoices, contacts,
sales/purchase orders). Each shows a **Live · Zoho Books** chip when connected, or
**Sample snapshot** when the API is offline — they always render thanks to the embedded
fallback in [`assets/snapshot.js`](assets/snapshot.js).

### Turn on live data
1. Start the backend with Zoho configured:
   ```bash
   cd ../../backend
   # set ZOHO_* in .env (see .env.example) — UAE data center
   npm run start:dev      # http://localhost:3000
   ```
   Get credentials from a Self Client at https://api-console.zoho.ae (scope `ZohoBooks.fullaccess.all`),
   then exchange the code for a refresh token.
2. Open any dashboard. If the API runs somewhere other than `http://localhost:3000`, set it once
   in the browser console: `NTBF.setApiBase('https://your-host')`.

Check connectivity at `GET /api/dashboard/health` → `{ "zohoConfigured": true|false }`.

## What's live vs sample
- **Live:** product catalog, stock levels, inventory value, A/R outstanding, revenue, VAT, counts.
- **Sample (for layout):** customer visits, route stops, suppliers, POs, GRNs, approvals —
  these populate once those flows run through the Sales / Procurement / Delivery modules.

All data flows through one shared loader ([`assets/data.js`](assets/data.js)) and one stylesheet
([`assets/app.css`](assets/app.css)), so the six views stay consistent.
