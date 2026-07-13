# Deploy NTBFLLC

The backend now serves the front-end apps too, so the **entire platform is one service**:
`/` = hub, `/mobile-app`, `/role-dashboards`, `/admin-dashboard`, and `/api/*` = the API.
One container, one public URL.

## Required env vars
| Var | Needed for | Notes |
|-----|-----------|-------|
| `DATABASE_URL` | relational ERP write endpoints | Postgres. App boots without it (AI/Zoho/bill features still work). |
| `JWT_SECRET` | auth | any long random string |
| `ANTHROPIC_API_KEY` | live Copilot (Claude) | from console.anthropic.com. Without it the agent runs in local mode. |
| `ANTHROPIC_MODEL` | model choice | default `claude-sonnet-4-6` |
| `ZOHO_ORG_ID` | Zoho | `928751913` |
| `ZOHO_CLIENT_ID` / `ZOHO_CLIENT_SECRET` / `ZOHO_REFRESH_TOKEN` | live Zoho data + bill recording | Self Client at api-console.zoho.com |
| `ZOHO_ACCOUNTS_HOST` / `ZOHO_API_HOST` | Zoho DC | .com defaults already set |

## Option A — Docker Compose (local, full stack + Postgres)
```bash
# optionally export ANTHROPIC_API_KEY / ZOHO_* first
docker compose up --build
# → http://localhost:3000   (run DB migrations once: see below)
```

## Option B — Single Docker image (any host: Fly, Railway, a VPS)
```bash
docker build -t ntbf-platform .
docker run -p 3000:3000 \
  -e DATABASE_URL=... -e JWT_SECRET=... \
  -e ANTHROPIC_API_KEY=sk-ant-... \
  -e ZOHO_CLIENT_ID=... -e ZOHO_CLIENT_SECRET=... -e ZOHO_REFRESH_TOKEN=... \
  ntbf-platform
```
- **Fly.io:** `fly launch` (detects the Dockerfile), set secrets with `fly secrets set ...`.
- **Railway:** new project from repo, it builds the Dockerfile; add the env vars.

## Option C — Render blueprint (one click, managed Postgres)
1. Push this repo to GitHub.
2. Render → **New → Blueprint** → select the repo (`render.yaml` is detected).
3. Fill the secret vars (`ANTHROPIC_API_KEY`, `ZOHO_*`). Deploy.
You get a public `https://ntbf-platform.onrender.com` serving everything.

## Database migrations (only if you use the relational ERP endpoints)
```bash
# locally against the deployed DB, or as a one-off job
DATABASE_URL=... npx prisma migrate deploy
DATABASE_URL=... npm run seed   # optional sample staff/customers
```

## After deploy
- The apps auto-target the same origin they're served from — no config needed.
- To point apps at a different API host, set it once in the browser:
  `localStorage.setItem('ntbf_api','https://your-api')`.
- Health: `GET /api/dashboard/health` and `GET /api/agent/status`.

## Security (built in — configure before going public)
The AI / Zoho / dashboard demo endpoints are protected by `ApiGateGuard`. Set these env vars:

| Var | Effect |
|-----|--------|
| `PUBLIC_API_TOKEN` | If set, `/api/agent/chat`, `/api/bills/*`, `/api/dashboard/summary` require header `x-api-key: <token>`. Empty = open (dev only). |
| `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_MS` | Per-IP rate limit on those endpoints (default 30 / 60 000 ms) — protects your paid Claude usage. |
| `CORS_ORIGIN` | Comma-separated origin allowlist (e.g. `https://app.yourdomain.com`). Empty = allow all (dev only). |
| `JWT_SECRET` | Use a strong random value. |

In the front-end, set the matching token once: **⚙ Settings → API access token** (stored as `localStorage.ntbf_token`, sent as `x-api-key`). Health checks (`/api/dashboard/health`, `/api/agent/status`) stay open by design.

Verified behavior with a token set: unauthenticated request → **401**, wrong token → **401**, correct token → passes through.

For full multi-user auth (staff logins, per-role tokens), use the JWT flow in the `auth` module
(`POST /api/auth/login`) and the existing `@Departments` / `@MinAccessLevel` guards — those already
protect all 80+ ERP endpoints (procurement, HR, accounting, sales, delivery, approvals).

- Never commit `.env` (already git-ignored). Rotate any key that has been shared.
