# Run NTBFLLC

## One command (Windows)
```powershell
powershell -ExecutionPolicy Bypass -File start-dev.ps1
```
Then open the hub: **http://localhost:8080/index.html**

## Manual
```bash
# backend API (http://localhost:3000)
cd backend
npx nest build
node dist/src/main.js

# app server (http://localhost:8080) — in another terminal
py -m http.server 8080 --directory apps
```

## Links
| | URL |
|---|---|
| Hub | http://localhost:8080/index.html |
| Field app (mobile) | http://localhost:8080/mobile-app/index.html |
| Role dashboards | http://localhost:8080/role-dashboards/index.html |
| Admin dashboard | http://localhost:8080/admin-dashboard/index.html |
| API docs (Swagger) | http://localhost:3000/docs |

## Make the AI + ERP live
Edit `backend/.env`:
- `ANTHROPIC_API_KEY=sk-ant-...` → the Copilot agent runs on real Claude.
- `ZOHO_CLIENT_ID / ZOHO_CLIENT_SECRET / ZOHO_REFRESH_TOKEN` → dashboards + bill recording use live Zoho Books.

Restart the backend (`node dist/src/main.js`). Check status at
`http://localhost:3000/api/agent/status` and `/api/dashboard/health`, or the dot on the hub page.

The backend **boots without a database** — the AI copilot, Zoho dashboards, and bill capture work
standalone. A Postgres DB (via `DATABASE_URL` + `npx prisma migrate dev`) is only needed for the
relational ERP write endpoints.
