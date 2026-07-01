# Go live on ntbfllc.com — step by step

Goal: put the staff field app on **app.ntbfllc.com**, on your own brand, usable from
any phone. Your WordPress site at ntbfllc.com is untouched — we only add a subdomain.

The whole platform runs as **one service** (Render Docker), backed by a small database
and a 1 GB disk for shared data. Est. time: ~20 minutes, most of it waiting for the build.

---

## Step 1 — Put the code on GitHub (once)
The repo is already committed locally. Create an empty **private** repo on your GitHub
(e.g. `ntbf-platform`), then from `C:\Users\Lenovo\foodstuffs-app`:

```bash
git remote add origin https://github.com/<your-username>/ntbf-platform.git
git push -u origin main
```
(If git asks to sign in, use your GitHub login / a personal access token.)

## Step 2 — Deploy on Render
1. Go to **https://render.com** → sign up / log in (free tier is fine to start).
2. **New → Blueprint** → connect your GitHub → pick the `ntbf-platform` repo.
3. Render reads `render.yaml` and proposes: a **web service** + a **Postgres** + a **1 GB disk**. Click **Apply**.
4. It builds the Docker image and deploys. You get a URL like `https://ntbf-platform.onrender.com`.

## Step 3 — Set the secret values (Render dashboard → your service → Environment)
Paste these (the same ones already working locally):
| Key | Value |
|-----|-------|
| `ANTHROPIC_API_KEY` | your `sk-ant-…` key |
| `ZOHO_CLIENT_ID` | `1000.R8U645…` |
| `ZOHO_CLIENT_SECRET` | your secret |
| `ZOHO_REFRESH_TOKEN` | `1000.c8d119…` |
| `PUBLIC_API_TOKEN` | make up a long random string (this protects your API) |
| `CORS_ORIGIN` | `https://app.ntbfllc.com` (add after Step 4) |

`ZOHO_WRITES_ENABLED` stays **false** — Zoho stays read-only until you decide to turn on posting.
Save → Render redeploys automatically.

## Step 4 — Point your subdomain at it
1. In Render → your service → **Settings → Custom Domains → Add** `app.ntbfllc.com`. Render shows a target (a CNAME value).
2. Log into wherever **ntbfllc.com**'s DNS is managed → add a record:
   - **Type:** CNAME · **Name:** `app` · **Value:** the target Render gave you.
3. Wait a few minutes (Render auto-issues an HTTPS certificate). Then **https://app.ntbfllc.com** is live.

## Step 5 — Switch the app on to your token (once per device)
Open the app → **⚙ Settings → API access token** → paste the same `PUBLIC_API_TOKEN` → Save.
Do this on each staff phone the first time (Tahir, Haris, Musthafa, Asif). Now they share
live data and the AI works.

---

## Security — read this before sharing links
- The staff app is protected by `PUBLIC_API_TOKEN` + rate limiting. That's appropriate for
  **an internal team tool** (your 4 staff share the token). Keep the token private.
- **Do NOT publicly link the customer ordering portal yet.** It currently shares the same
  data store, so exposing it to the open internet is not safe. Making `order.ntbfllc.com`
  public for customers needs **per-customer login** first (the `auth` module + customer
  accounts already exist in the backend — it's a focused next phase, not a rewrite).
- So: **app.ntbfllc.com (staff) go live now; order.ntbfllc.com (customers) = phase 2** after
  customer auth is wired.

## Zoho posting stays locked
Even live, document posting to Zoho stays in **preview** until you set
`ZOHO_WRITES_ENABLED=true`. Test extraction on real bills first, then flip it.

## Shared data persistence
The 1 GB disk (`/data`) keeps shared data across restarts. On Render's **free** tier the
service sleeps when idle and the disk needs a paid instance — for always-on + reliable
persistence, use the **Starter** plan (~\$7/mo) or move shared state to the Postgres
database (models already exist).
