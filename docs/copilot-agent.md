# NTBFLLC Copilot (role-aware Claude agent)

A floating assistant (✦) on every screen of the field app. It answers questions about the
business and **performs actions** — create a customer, place an order, plan a route, adjust stock,
approve items, clear/bounce a cheque — by role.

## How it works
1. The browser posts `{ role, messages }` to `POST /api/agent/chat`.
2. The backend ([agent.service.ts](../backend/src/agent/agent.service.ts)) calls Claude with a
   **role-filtered tool schema** and a role-aware system prompt. The API key stays server-side.
3. Claude replies with text and/or `tool_use` blocks. The browser ([copilot.js](../apps/mobile-app/copilot.js))
   **executes those tools against the live store**, posts the `tool_result` back, and loops until Claude
   gives a final answer. The UI refreshes so the action is visible immediately.

The same tool *schema* points at the localStorage demo store today; in production the executor swaps to
the Prisma/Zoho-backed endpoints — the agent contract doesn't change.

## Tools by role
- **all:** get_overview, list_customers, list_low_stock, list_orders, list_pending_approvals
- **salesman:** create_customer, place_order, log_visit, request_special_price
- **driver:** plan_route, mark_delivered
- **warehouse:** adjust_stock, receive_stock, advance_dispatch
- **purchase:** raise_requisition, create_po
- **finance:** clear_cheque, approve_item
- **admin:** approve_item, hold_customer, release_customer, cancel_order, adjust_stock, place_order

## Try it (tap ✦)
- Salesman: *“Create customer Sunrise Mart, retail, 4000 credit”* then *“Place an order for Sunrise Mart: 10 Coca Cola 2 Litre, cash”*
- Driver: *“Plan my route”* · *“How much cash have I collected?”*
- Warehouse: *“Receive 100 of Coca Cola 2 Litre”* · *“What’s below reorder?”*
- Finance: *“Bounce the cheque from Corniche Bakery”* (auto 250 charge + hold)
- Admin: *“Approve all pending”* · *“Put Rashid Stores on hold”*

## Offline mode
With no backend/key, the copilot still answers overview, low-stock, approvals, customers and orders
locally, and tells you what to configure for full AI actions.

## Going live
Set `ANTHROPIC_API_KEY` (and `ANTHROPIC_MODEL=claude-sonnet-4-6`) in `backend/.env`, run
`npm run start:dev`. The app talks to `http://localhost:3000` (override with
`localStorage.setItem('ntbf_api', 'https://your-host')`).
