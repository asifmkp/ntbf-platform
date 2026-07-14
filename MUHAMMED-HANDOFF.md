# Muhammed — AI Colleague on WhatsApp · Handoff

_For the "WhatsApp Bot" chat-Claude workstream. Contains no secrets — keys/tokens live only in Render/Supabase._

## What it is
One shared AI-colleague persona ("Muhammed") for staff. Same persona for everyone; the person's
**role decides what data he reveals**, enforced server-side (read-only). Reached two ways: an in-app
"Muhammed" tab, and on the **shared WhatsApp number +971 58 980 0236** (staff → Muhammed; everyone
else → the existing customer bot, untouched).

## Architecture (final, live)
- **NestJS backend** (repo `asifmkp/ntbf-platform`, Render, `app.ntbfllc.com`): `backend/src/muhammed/*`.
  - `POST /api/muhammed/ask` — in-app tab (staff JWT).
  - `POST /api/muhammed/wa` — called by the bot; auth header `x-ingest-token` = `WHATSAPP_INGEST_TOKEN`
    (same secret as order ingest). Body `{phone,text,wa_id,name,roles}`. Resolves phone→staff; if not in
    the app's staff store, **trusts the bot-supplied `name`/`roles`** (it's shared-secret authed). De-dupes on `wa_id`.
  - Latest `main` commit: `5068376` ("accept bot-supplied identity (name/roles) as a fallback"). Deployed & verified.
- **Supabase bot** (`whatsapp-webhook`, project `wvsgeumafnqelspcqivo`): **v22**, `verify_jwt=false`.
  Staff pre-check at the top of `handleMessage` reads `bot_settings.staff_roster` (JSON `[{phone,name,roles}]`);
  matched sender → `POST /api/muhammed/wa` → reply → `return` (skips customer flow). Fail-open; 5-min settings cache.
  **Customer flow and the frozen order-ingest contract are unchanged.** Rollback = redeploy v18.

## Current `staff_roster`
```json
[{"phone":"918281436921","name":"Asif","roles":["admin"]},
 {"phone":"971589800239","name":"Asif","roles":["admin"]},
 {"phone":"971589800237","name":"Haris","roles":["warehouse","purchase"]}]
```
Add/change staff (no redeploy — applies within ≤5 min via the cache):
```sql
update bot_settings set value = '<new JSON array>' where key = 'staff_roster';
```
⚠️ **One phone = one person** (matcher takes the first hit) — never list a number under two entries, or the wrong scope leaks.

## Bugs found & fixed this session
1. Asif was messaging from his **India number (+91 82814 36921)**, not in the roster → dropped to customer bot. Added.
2. Messages during the backend redeploy failed silently: the validation pipe (`forbidNonWhitelisted`) 400'd the
   bot's `name`/`roles` call **before** the token check on old Render builds. Resolved once `5068376` rolled out.

## Diagnostics that work here
- Staff-matched messages **skip `wa_messages`** — so anything in `wa_messages` fell to the customer flow
  (effectively a log of "who didn't match").
- Probe backend build without the token: `POST /api/muhammed/wa` with a bogus token → **401** = new build
  (accepts name/roles), **400** = old build.
- Force an end-to-end test by injecting a synthetic webhook to the bot with `from` = a roster number.

## Open items
- **Musthafa** not added (owner said skip for now) — add his WhatsApp number with `roles:["driver"]` when ready.
- **Rotate the Anthropic API key** — it passed through chat during local setup and is **burned**; set a fresh one
  in Render + the Supabase bot secret only. (Same for the Zoho creds per `CLAUDE.md`.)
- **In-app Muhammed tab** shipped for all staff roles (`apps/mobile-app`); works with the Anthropic key on Render.
- **Nice-to-have:** a Manage-Team phone field so staff phones self-manage instead of SQL.
- **Pending:** confirm Asif received Muhammed's reply to the injected "today's sales" test (owner scope).
