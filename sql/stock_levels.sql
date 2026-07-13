-- stock_levels.sql — Muhammad agent stock tracking (Supabase project wvsgeumafnqelspcqivo).
-- DRAFT — review before running. Idempotent (IF NOT EXISTS / CREATE OR REPLACE / DROP-if-exists).
-- Access model: SERVICE-ROLE ONLY. RLS is ON with NO policies, exactly like message_log,
-- so anon/authenticated see nothing; the agent's service-role key bypasses RLS.
-- NOTE: the stock_alerts view uses security_invoker (Postgres 15+) so it honours the
-- table's RLS rather than the view owner's — required so the view can't leak stock to anon.

-- 1. Table -------------------------------------------------------------------
create table if not exists public.stock_levels (
  item_id       text primary key,                 -- Zoho item_id
  item_name     text        not null,
  qty           numeric     not null default 0,
  uom           text,
  reorder_level numeric              default 0,
  source        text        not null default 'manual'
                  check (source in ('manual', 'zoho_sync')),
  updated_by    text,
  updated_at    timestamptz not null default now()
);

-- 2. Auto-touch updated_at on every UPDATE -----------------------------------
create or replace function public.stock_levels_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_stock_levels_touch on public.stock_levels;
create trigger trg_stock_levels_touch
  before update on public.stock_levels
  for each row
  execute function public.stock_levels_touch_updated_at();

-- 3. stock_alerts view — items at or below their reorder level ----------------
create or replace view public.stock_alerts
  with (security_invoker = true)
as
  select
    item_id,
    item_name,
    qty,
    reorder_level,
    (extract(epoch from (now() - updated_at)) / 86400)::int as days_since_update
  from public.stock_levels
  where qty <= reorder_level;

-- 4. RLS — enabled, NO policies (service-role only; mirrors message_log) ------
alter table public.stock_levels enable row level security;
-- Intentionally NO policies: anon/authenticated are blocked by RLS; the agent's
-- service-role key bypasses RLS. Add policies only if a non-service client ever needs access.
