# Muhammad — NTBFLLC Operations Agent

Muhammad is an autonomous **operations coordinator** for National Trading of Beverage
and Foodstuff LLC. He runs the order-to-cash loop on a schedule, coordinates the
staff over WhatsApp, and routes every money decision to the owner for a YES/NO.

**Stack:** NestJS 10 · Supabase (system of record) · 360dialog (WhatsApp) · Zoho Books (REST).
**Design principle:** the agent does the *work*; the owner keeps the *authority*. Nothing
that touches money or makes an external promise happens without a human checkpoint.

---

## What he does

**Every 5 minutes** (`AgentLoopService`):
1. **Process pending orders** → owner approval (new customer / ≥ AED 1,000 / overdue reorder) **or** auto-invoice.
2. **Assign delivery** on invoiced orders → notify Musthafa.
3. **Cash-collection reminders** for orders delivered > 24h ago and still uncollected.
4. **Stock check** → alert Haris + request owner approval for a purchase order.
5. **Retry failed jobs** with exponential backoff; escalate exhausted jobs to the owner.

**Daily** (`DailyTasksService`, times in `AGENT_TIMEZONE`, default Asia/Dubai):
| Time | Action | To |
|---|---|---|
| 07:00 | Delivery route + collection list | Musthafa (delivery) |
| 08:00 | Pending-orders list · stock alerts | Tahir (sales) · Haris (warehouse) |
| 17:00 | Ask for new customer leads | Tahir |
| 18:00 | Approve/reject reorder drafts | Haris |
| 20:30 | Reminder of waiting approvals | Owner |
| 21:00 | Daily report (orders, collections, staff tasks) | Owner |

**Inbound** (`WhatsappWebhookController` at `POST /webhooks/whatsapp`):
- **Owner** replies `YES` / `NO` → drives approvals and advances the order.
- **Staff** reply `done` / `collected` → marks deliveries and tasks complete.
- **Customers** → message logged and queued for **Phase 2** Claude order-parsing (no binding auto-reply).

Staff roster (seeded by the SQL): **Tahir** `+971536460085` (sales), **Musthafa** `+971526460084` (delivery), **Haris** `+971589800237` (warehouse). Owner approvals go to `OWNER_WHATSAPP` (`+91 82814 36921`).

---

## Setup

> Run these from **this folder**: `…\National-Trading-Ecosystem\platform\src\muhammad-agent`

### 1. Install dependencies
```powershell
npm install
# or, if starting from a bare folder, the three runtime deps explicitly:
npm install @nestjs/schedule @supabase/supabase-js axios
```

### 2. Create your .env
```powershell
Copy-Item ".\.env.example" -Destination ".\.env"
notepad ".\.env"
```
Fill in: Supabase URL + **service-role** key, 360dialog key + from-number + webhook secret,
`OWNER_WHATSAPP`, and (later) the Zoho OAuth values. **Leave `ZOHO_WRITES_ENABLED=false`
and `AGENT_ENABLED=true` for first run** — that's the safe dry-run posture.

### 3. Apply the database schema
Open Supabase → SQL editor → paste and run [`sql/001_muhammad_schema.sql`](./sql/001_muhammad_schema.sql).
It creates the tables and seeds the staff roster, task definitions, and default config.

### 4. Run
```powershell
npm run start:dev     # watch mode, logs every step
```
Boot log confirms posture (`agent_enabled`, `zoho_writes`). Point the 360dialog inbound
webhook at `https://<your-host>/webhooks/whatsapp` (Render/VPS).

---

## Phased rollout (do not skip)

This mirrors the maturity roadmap: prove each level before trusting the next.

- **Phase 0 — Shadow (days 1–3).** `AGENT_ENABLED=false`. The agent logs *what it would send*
  but sends nothing and writes nothing. Watch the logs; confirm the state machine picks the
  right orders and the right people. Zero risk.
- **Phase 1 — Coordination live (weeks 1–2).** `AGENT_ENABLED=true`, `ZOHO_WRITES_ENABLED=false`.
  Real WhatsApp goes out; approvals and staff replies work end-to-end; **invoices are previewed,
  never written to Zoho.** This is the safe steady state to run for a while.
- **Phase 2 — Order parsing.** Wire Claude to the queued customer messages using
  `muhammad.personality.ts`. Muhammad drafts structured orders; the owner still approves.
- **Phase 3 — Zoho writes.** Only after Phases 1–2 are trusted, flip `ZOHO_WRITES_ENABLED=true`
  so approved orders raise real invoices. Keep the approval gate on money.

**Kill switch:** set `agent_enabled=false` in the `agent_config` table (or `AGENT_ENABLED=false`
in `.env` and restart) to halt all external actions immediately.

---

## Safety model (why it's built this way)

- **Human-on-the-loop, not lights-out.** Money, new customers, and prices require an owner YES/NO.
- **Zoho writes are gated** by a flag so the agent can run against the live org read-only until trusted.
- **Every message is logged** (`notification_log`) for a full audit trail — and used for dedupe.
- **Inbound content is data, not commands** — the agent never executes instructions embedded in a message.
- **Quiet hours + dedupe** stop the agent spamming staff or the owner.
- **Failed jobs retry with backoff** and escalate to a human when exhausted, instead of failing silently.

## Files
```
muhammad-agent/
├─ sql/001_muhammad_schema.sql        # tables + staff/task/config seed
├─ src/
│  ├─ main.ts                         # standalone bootstrap (:3005)
│  ├─ muhammad-agent.module.ts        # wiring + how to mount into backend
│  ├─ supabase/supabase.service.ts    # client, config cache, helpers
│  ├─ whatsapp.service.ts             # 360dialog send, dedupe, quiet hours
│  ├─ zoho-books.service.ts           # OAuth + REST, write-gated
│  ├─ approval.service.ts             # owner YES/NO gate
│  ├─ agent-loop.service.ts           # the 5-minute state machine
│  ├─ daily-tasks.service.ts          # fixed daily schedule
│  ├─ whatsapp-webhook.controller.ts  # inbound router
│  └─ muhammad.personality.ts         # Claude persona (Phase 2)
├─ .env.example
└─ package.json
```

*Not legal advice. Confirm UAE company-law / bank-signatory points with a licensed UAE advisor
before letting any automated step touch money.*
