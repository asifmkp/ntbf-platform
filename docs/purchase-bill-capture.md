# Purchase bill capture (photo → Claude → Zoho)

Snap a supplier bill; Claude reads it, matches it to your Zoho vendors and items, then records it.

## In the app
Field app → **Purchase** role → **Bills** tab → **Add bill from photo**:
1. **Capture** — take or attach a photo of the bill.
2. **Extract** — Claude vision pulls supplier, invoice no, date, line items, VAT, total (editable).
3. **Match** — each line is matched to a Zoho item and the supplier to a Zoho vendor, with a confidence %.
4. **Record** — creates the vendor bill in Zoho Books (creates the vendor if it's new).

Works in **demo mode** with no keys (sample extraction + local matching against the catalog) so the
flow is usable immediately. With the backend + keys it does real OCR and writes to Zoho.

## Backend endpoints
- `POST /api/bills/extract` `{ imageBase64, mediaType }` → structured bill (Claude vision)
- `POST /api/bills/match` `{ bill }` → supplier + per-line item matches with confidence
- `POST /api/bills/record` `{ bill, match, createVendor }` → creates the bill in Zoho Books
- `GET  /api/bills/status` → `{ anthropicConfigured, zohoConfigured }`

## Going live
In `backend/.env`:
```
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-4-6
# plus the ZOHO_* vars (see .env.example)
```
Then `npm run start:dev`. The app auto-detects the API at `http://localhost:3000`
(override with `localStorage.setItem('ntbf_api','https://your-host')`).

## How matching works
Token-overlap similarity between the bill text and Zoho vendor/item names. A line scoring ≥ 0.34
links to that Zoho item; below that it's recorded as free-text. Tune the threshold in
`backend/src/bills/bills.service.ts`.

## Notes / next steps
- Extraction is forced through a structured tool schema, so the result is always valid JSON.
- Three-way matching (bill ↔ PO ↔ GRN) and Super-Admin payment approval are modelled in the
  Prisma schema and can be layered on so a recorded bill auto-checks against its purchase order.
