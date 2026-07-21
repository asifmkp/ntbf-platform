-- ============================================================================
-- Muhammad Agent — Schema 001 (initial)
-- Target: Supabase / PostgreSQL
-- Apply in the Supabase SQL editor, or:  psql "$SUPABASE_DB_URL" -f 001_muhammad_schema.sql
--
-- This is the agent's own system of record. It is intentionally self-contained
-- so the agent can run even before it is wired into the main platform DB.
-- All tables are prefixed conceptually under the "muhammad" domain.
-- Re-runnable: uses IF NOT EXISTS and idempotent seed upserts.
-- ============================================================================

create extension if not exists "pgcrypto";  -- for gen_random_uuid()

-- ---------------------------------------------------------------------------
-- Enums (guarded so re-running the script does not error)
-- ---------------------------------------------------------------------------
do $$ begin
  create type staff_role as enum ('sales', 'delivery', 'warehouse', 'owner');
exception when duplicate_object then null; end $$;

do $$ begin
  create type order_status as enum (
    'pending',        -- just received, not yet processed by the agent
    'needs_approval', -- routed to owner, awaiting YES/NO
    'approved',       -- owner said YES
    'rejected',       -- owner said NO
    'invoiced',       -- invoice raised (Zoho, if writes enabled)
    'assigned',       -- delivery staff assigned
    'delivered',      -- goods delivered
    'collected',      -- cash/credit collected & reconciled
    'cancelled',
    'failed'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type approval_status as enum ('pending', 'approved', 'rejected', 'expired');
exception when duplicate_object then null; end $$;

do $$ begin
  create type task_status as enum ('pending', 'sent', 'done', 'failed', 'skipped');
exception when duplicate_object then null; end $$;

do $$ begin
  create type job_status as enum ('pending', 'retrying', 'exhausted', 'escalated', 'resolved');
exception when duplicate_object then null; end $$;

do $$ begin
  create type msg_direction as enum ('outbound', 'inbound');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- agent_config : key/value runtime configuration (overrides .env at runtime)
-- ---------------------------------------------------------------------------
create table if not exists agent_config (
  id          uuid primary key default gen_random_uuid(),
  key         text unique not null,
  value       jsonb not null,
  description text,
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- staff : the human roster the agent coordinates
-- ---------------------------------------------------------------------------
create table if not exists staff (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  role       staff_role not null,
  whatsapp   text not null unique,           -- E.164 without '+', e.g. 971536460085
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- task_definitions : the recurring jobs the agent hands to staff
-- ---------------------------------------------------------------------------
create table if not exists task_definitions (
  id            uuid primary key default gen_random_uuid(),
  code          text unique not null,        -- e.g. 'daily_delivery_route'
  title         text not null,
  description   text,
  assigned_role staff_role,                  -- who normally receives it
  schedule_note text,                        -- human note, e.g. '07:00 daily'
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- task_instances : a concrete task sent to a specific staff member
-- ---------------------------------------------------------------------------
create table if not exists task_instances (
  id             uuid primary key default gen_random_uuid(),
  definition_id  uuid references task_definitions(id) on delete set null,
  assigned_staff uuid references staff(id) on delete set null,
  status         task_status not null default 'pending',
  due_at         timestamptz,
  sent_at        timestamptz,
  completed_at   timestamptz,
  payload        jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);
create index if not exists idx_task_instances_status on task_instances(status);
create index if not exists idx_task_instances_staff  on task_instances(assigned_staff);

-- ---------------------------------------------------------------------------
-- orders : the order-to-cash state machine
-- ---------------------------------------------------------------------------
create table if not exists orders (
  id                 uuid primary key default gen_random_uuid(),
  external_ref       text,                    -- source id (WhatsApp thread, Zoho SO, etc.)
  customer_name      text,
  customer_whatsapp  text,
  is_new_customer    boolean not null default false,
  is_reorder         boolean not null default false,
  reorder_overdue    boolean not null default false,
  total_aed          numeric(12,2) not null default 0,
  status             order_status not null default 'pending',
  needs_approval     boolean not null default false,
  approval_id        uuid,                    -- fk set after approval row is created
  assigned_delivery  uuid references staff(id) on delete set null,
  zoho_invoice_id    text,
  invoiced_at        timestamptz,
  delivered_at       timestamptz,
  collected_at       timestamptz,
  meta               jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists idx_orders_status on orders(status);
create index if not exists idx_orders_created on orders(created_at);

-- ---------------------------------------------------------------------------
-- approvals : owner YES/NO gates for anything money-touching
-- ---------------------------------------------------------------------------
create table if not exists approvals (
  id            uuid primary key default gen_random_uuid(),
  type          text not null,               -- 'order' | 'purchase_order' | 'reorder'
  ref_table     text not null,               -- e.g. 'orders'
  ref_id        uuid not null,
  requested_to  text not null,               -- owner WhatsApp (E.164 no '+')
  question      text not null,
  status        approval_status not null default 'pending',
  decided_at    timestamptz,
  decided_via   text,                        -- 'whatsapp_yes' | 'whatsapp_no' | 'manual'
  expires_at    timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists idx_approvals_status on approvals(status);
create index if not exists idx_approvals_ref    on approvals(ref_table, ref_id);

-- ---------------------------------------------------------------------------
-- notification_log : every message in/out (also the dedupe + audit trail)
-- ---------------------------------------------------------------------------
create table if not exists notification_log (
  id            uuid primary key default gen_random_uuid(),
  direction     msg_direction not null,
  channel       text not null default 'whatsapp',
  to_number     text,
  from_number   text,
  template      text,                        -- template name if a template send
  body          text,
  wa_message_id text,                        -- 360dialog message id
  status        text not null default 'queued', -- queued|sent|delivered|failed|received
  related_type  text,                        -- 'order' | 'approval' | 'task' | 'customer'
  related_id    uuid,
  dedupe_key    text unique,                 -- prevents duplicate sends within a window
  error         text,
  created_at    timestamptz not null default now()
);
create index if not exists idx_notif_related on notification_log(related_type, related_id);
create index if not exists idx_notif_created on notification_log(created_at);

-- ---------------------------------------------------------------------------
-- failed_jobs : retry queue with exponential backoff, escalates when exhausted
-- ---------------------------------------------------------------------------
create table if not exists failed_jobs (
  id           uuid primary key default gen_random_uuid(),
  job_type     text not null,               -- e.g. 'process_order', 'send_whatsapp'
  payload      jsonb not null default '{}'::jsonb,
  attempts     int not null default 0,
  max_attempts int not null default 5,
  next_run_at  timestamptz not null default now(),
  last_error   text,
  status       job_status not null default 'pending',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_failed_jobs_due on failed_jobs(status, next_run_at);

-- ---------------------------------------------------------------------------
-- updated_at trigger helper
-- ---------------------------------------------------------------------------
create or replace function set_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

do $$ begin
  create trigger trg_orders_updated before update on orders
    for each row execute function set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger trg_failed_jobs_updated before update on failed_jobs
    for each row execute function set_updated_at();
exception when duplicate_object then null; end $$;

-- ===========================================================================
-- SEED DATA
-- ===========================================================================

-- Staff roster (idempotent on whatsapp). Owner is seeded from env at runtime.
insert into staff (name, role, whatsapp) values
  ('Tahir',    'sales',     '971536460085'),
  ('Musthafa', 'delivery',  '971526460084'),
  ('Haris',    'warehouse', '971589800237')
on conflict (whatsapp) do update
  set name = excluded.name, role = excluded.role, active = true;

-- Recurring task definitions (idempotent on code).
insert into task_definitions (code, title, assigned_role, schedule_note) values
  ('daily_delivery_route',   'Delivery route + collection list', 'delivery',  '07:00 daily'),
  ('daily_pending_orders',   'Pending orders list',              'sales',     '08:00 daily'),
  ('daily_stock_alerts',     'Stock alerts',                     'warehouse', '08:00 daily'),
  ('daily_customer_leads',   'Request new customer leads',       'sales',     '17:00 daily'),
  ('daily_reorder_review',   'Approve/reject reorder drafts',    'warehouse', '18:00 daily'),
  ('daily_owner_approvals',  'Remind owner of waiting approvals','owner',     '20:30 daily'),
  ('daily_owner_report',     'Owner daily report',               'owner',     '21:00 daily')
on conflict (code) do update
  set title = excluded.title, assigned_role = excluded.assigned_role,
      schedule_note = excluded.schedule_note, active = true;

-- Default runtime config (idempotent on key).
insert into agent_config (key, value, description) values
  ('agent_enabled',                 'true',  'Master on/off; false = dry-run only'),
  ('zoho_writes_enabled',           'false', 'Gate on all Zoho POST/PUT/DELETE'),
  ('approval_order_value_threshold_aed', '1000', 'Orders >= this AED need owner approval'),
  ('cash_collection_reminder_hours','24',   'Hours after delivery before a collection reminder'),
  ('quiet_hours_start',             '22',   'No non-urgent WhatsApp from this hour (agent TZ)'),
  ('quiet_hours_end',               '6',    'Quiet hours end at this hour (agent TZ)')
on conflict (key) do nothing;
