# AI Operations Center — foundation shell (Lane B)

**Status: isolated, non-production foundation. 100% mock data. Nothing here runs in, deploys with, or is reachable from the live platform.**

This directory is the Lane B foundation for a future AI Operations Center: a dashboard for observing (and eventually gating) multi-agent work — tasks, approvals, deliverables, agent activity — on top of the coordination model the business already runs through the `/ai` files (TASK_QUEUE, ROADMAP owner-gates, AGENT_LOG). It deliberately ships **no orchestrator and no background worker**: DEC-014 postpones any orchestrator runtime behind explicit gates (G1–G5), and this shell respects that decision — it is a *viewing surface* foundation, not an automation engine.

## What's here

| Path | Deliverable |
|---|---|
| `contracts/ops-contracts.ts` | Typed contracts: agents, workstreams, AI tasks, events, approvals, deliverables, statuses, executive snapshot. Pure types, zero imports, zero runtime. |
| `contracts/adapter.ts` | `AiOpsDataAdapter` — the read-only async interface the UI consumes. The only seam a future live data source needs to fill. |
| `contracts/constants.mjs` | Runtime home of every enum vocabulary. The TS unions mirror it; tests fail on drift. |
| `mock/mock-data.mjs` | Fictional, deterministic dataset. Every id is `MOCK-`-prefixed; fixed timestamps; tests assert no live-id shapes (ORD-####, TASK-###, org ids, hostnames) appear. |
| `mock/mock-adapter.mjs` | `MockAiOpsAdapter` implementing the contract: deep-frozen data, defensive copies, no I/O of any kind. |
| `ui/` | The shell: `index.html` + `styles.css` + widget library (`components.mjs`) + four example layouts (`views.mjs`) + hash router (`main.mjs`). Vanilla ES modules — same no-framework idiom as the live staff app. Light/dark theming; status is always icon+label, never color alone; all text rendered via `textContent` (no innerHTML with data — the stored-XSS lesson from PROJECT_KNOWLEDGE §10.8 applied from day one). |
| `tests/run-tests.mjs` | 16-check suite: isolation proofs + contract/adapter checks. Zero dependencies. |
| `CODEX_HANDOFF.md` | Handoff: changed files, tests, integration dependencies, risks, recommended integration order. |

### The four example layouts

1. **Executive overview** — KPI tiles, task-pipeline distribution bar, workstream table, latest activity.
2. **Work queue** — open/closed task tables mirroring the `/ai` queue lifecycle (`queued → claimed → in_progress → blocked/awaiting_approval → done/cancelled`).
3. **Approval queue** — pending vs decided owner gates, typed by the real gate classes (zoho_write, financial_posting, deployment, credential, data_export). Read-only by design.
4. **Agent activity** — registered agents with live task counts + newest-first event feed.

## Running it

```bash
# Tests (from repo root, Node ≥ 22.18 — no installs needed):
node foundation/ai-ops-center/tests/run-tests.mjs

# UI (ES modules need an HTTP origin; any static server works):
cd foundation/ai-ops-center && python3 -m http.server 8899
# → open http://127.0.0.1:8899/ui/index.html
```

## Why this is provably isolated

1. **Not in the production image.** The Dockerfile copies only `backend/` and `apps/` (`COPY backend/ ./`, `COPY apps /app/apps`). `foundation/` is never copied, so the deployed container physically cannot serve or import it. A test parses the Dockerfile's COPY lines and fails if that ever changes.
2. **Not served.** `ServeStaticModule` serves `STATIC_DIR` (= `apps/` in prod). This directory is outside `apps/`, so no URL on app.ntbfllc.com can reach it.
3. **Not imported.** No file under `backend/src/` or `apps/` references `foundation/` or `ai-ops-center` (tested). `app.module.ts` is untouched. No NestJS module, route, guard, or provider was added.
4. **No runtime, no I/O.** Foundation code contains no `fetch`, sockets, filesystem access, timers, or background loops (tested), and imports nothing outside its own directory — not even backend types (tested). There is no orchestrator and no worker.
5. **No real data.** Every record is fictional, `MOCK-`-prefixed, with fixed timestamps; tests assert the absence of live identifier shapes, the production hostname, the Zoho org id, and real task ids.
6. **No dependencies installed.** Contracts are pure TS (checked via Node's native type-stripping); everything else is dependency-free ESM. `package.json` files were not modified.

## Future integration points (each needs its own owner-approved step — nothing here enables them)

| # | Integration | Where it plugs in | Precondition |
|---|---|---|---|
| 1 | **Live data adapter** | Implement `AiOpsDataAdapter` (e.g. `LiveAiOpsAdapter`) over a read-only source and swap the one marked line in `ui/main.mjs`. The natural first source is the `/ai` files themselves (TASK_QUEUE/AGENT_LOG parsed server-side), keeping DEC-014's "same files, no new state store" rule. | Owner go; read-only; server endpoint gated by `StaffAuthGuard` admin |
| 2 | **Serving the UI** | Either move `ui/` under `apps/ai-ops/` (auto-served by the existing static module) or add a gated route. Until then it runs only from a local static server. | Owner go — this is the step that makes it reachable in production |
| 3 | **Backend module** | A read-only `AiOpsModule` under `backend/src/` registered in `app.module.ts`, following the System A pattern (`@Public()` + `StaffAuthGuard`, admin-gated). | Owner go + PR review; still no writes |
| 4 | **Approval actions** (approve/reject buttons) | New write endpoints + `statusHistory[]` audit per house convention. This is the first *write* surface — treat like a money path. | Owner go; DEC-016 trace record; second-agent review |
| 5 | **Orchestrator** | Out of scope entirely until the DEC-014 gates (G1–G5) fire. The contracts here were designed so an orchestrator could publish into the same shapes later. | ALL DEC-014 gates, evidenced in AGENT_LOG |

Recommended order: 1 → 2 → 3 (any subset, in order) — 4 and 5 only after the earlier steps have soaked. Details in `CODEX_HANDOFF.md`.

## Design notes

- **Vocabulary maps 1:1 onto the existing protocol** (task lifecycle = TASK_QUEUE states; approval subject types = ROADMAP §4 owner-gate classes; actor ids = HANDOFF §1 agent-id convention) so a live adapter is a mapping exercise, not a redesign.
- **Single source of enum truth**: `constants.mjs` is runtime, the TS unions mirror it, and the test suite fails on any drift — the same "convention enforced by a check" style as `backend/tools/test-live-standard.mjs`.
- **Deterministic by construction**: no `Date.now()` anywhere; the mock snapshot timestamp is a fixed literal, so UI screenshots and tests are reproducible.
