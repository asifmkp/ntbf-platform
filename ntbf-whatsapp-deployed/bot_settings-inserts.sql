-- NTBF WhatsApp reminders — bot_settings keys required by the Stage-6 draft.
-- UN-EXECUTED. Run manually against Supabase project wvsgeumafnqelspcqivo on your go.
-- bot_settings is (key text PK, value text). ON CONFLICT keeps this idempotent / re-runnable.

-- (a) REQUIRED: {{2}} highlights text for the reminder body. Replace the placeholder before enabling.
--     Reminders are SKIPPED (and logged) while this is empty, so nothing malformed ever sends.
insert into bot_settings (key, value)
values ('reminder_highlights', 'REPLACE_ME: e.g. Rani Float 240ml, Nissin Cup Noodles, Al Ain Water 500ml')
on conflict (key) do update set value = excluded.value;

-- (a) OPTIONAL: coupon code for the COPY_CODE button. Empty = no coupon component is sent.
--     (Per decision (b) the COPY_CODE button is being REMOVED from order_reminder in the 360dialog
--      Hub, so this stays empty; the code only adds the button component when this is non-empty.)
insert into bot_settings (key, value)
values ('reminder_coupon', '')
on conflict (key) do update set value = excluded.value;

-- (c) OPTIONAL: per-customer frequency gap in days. Code defaults to 7 if this row is absent;
--     insert only if you want a value other than 7.
-- insert into bot_settings (key, value)
-- values ('reminder_gap_days', '7')
-- on conflict (key) do update set value = excluded.value;

-- Verify:
-- select key, value from bot_settings where key like 'reminder_%' order by key;
