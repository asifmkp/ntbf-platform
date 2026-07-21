# Codex handoff — AI Operations Center foundation (Lane B)

Audience: the next implementing agent (Codex or otherwise). Read `README.md` first for the isolation story; this file is the working handoff.

## 1. Changed files (this PR — everything is NEW; no existing file was modified except `/ai` docs)

```
foundation/ai-ops-center/
├── README.md                      isolation + integration documentation
├── CODEX_HANDOFF.md               this file
├── contracts/
│   ├── ops-contracts.ts           typed domain contracts (pure types)
│   ├── adapter.ts                 AiOpsDataAdapter interface + filters
│   └── constants.mjs              runtime enum vocabularies (single source)
├── mock/
│   ├── mock-data.mjs              deterministic fictional dataset (MOCK- ids)
│   └── mock-adapter.mjs           MockAiOpsAdapter (read-only, frozen, cloned)
├── ui/
│   ├── index.html                 shell: sidebar, mock banner, theme toggle
│   ├── styles.css                 light/dark tokens, widgets, tables, badges
│   ├── components.mjs             el/statCard/statusBadge/panel/dataTable/
│   │                              distributionBar/timeline (framework-free)
│   ├── views.mjs                  4 layouts: overview, work queue, approvals,
│   │                              agent activity
│   └── main.mjs                   hash router + adapter injection point
└── tests/
    └── run-tests.mjs              16-check suite (isolation + contracts)
```

`/ai` docs touched in the same PR (docs-only, additive): AGENT_LOG.md entry, STATUS.md "Recently completed" line, UNKNOWNS.md UNK-013, TRACEABILITY.md TRACE-002.

Not touched: `backend/` (anything), `apps/` (anything), `Dockerfile`, `render.yaml`, `docker-compose.yml`, any `package.json`, any auth/credential/config file.

## 2. Tests & how to run them

```bash
node foundation/ai-ops-center/tests/run-tests.mjs   # from repo root; Node ≥ 22.18
```

16 checks, currently 16/16 PASS:

- **Isolation (7):** no backend/src reference · no apps/ reference · Dockerfile COPY audit (foundation never enters the image) · render.yaml clean · app.module.ts unregistered · no I/O primitives in foundation code · no imports escaping foundation/ (also bans bare specifiers, i.e. external deps).
- **Contracts (9):** TS files parse under Node type-stripping · TS-union↔constants drift guard · MOCK- id prefix on every record · vocabulary membership on every field · referential integrity (tasks→workstreams, approvals→subjects, events→actors, deliverables→tasks, dependsOn closure, pending⇔decidedAt) · snapshot-vs-list agreement · filter narrowing + newest-first events · determinism + defensive copies · no live business identifiers in mock content.

UI smoke: serve `foundation/ai-ops-center/` statically and open `ui/index.html`; all four views render in light and dark with zero console errors.

These tests are cheap and standalone — wire them into CI (TASK-015) as a separate job step whenever CI activates; they need no npm install.

## 3. Integration dependencies (what a live version needs, none present today)

| Dependency | Needed for | Notes |
|---|---|---|
| Read-only data source for real tasks/approvals | Live adapter (integration #1) | Per DEC-014: the /ai files ARE the state store — parse TASK_QUEUE.md/AGENT_LOG.md server-side rather than inventing a new store |
| `StaffAuthGuard` + admin role gate | Any served endpoint/UI (integrations #2–3) | Follow the System A pattern: `@Public()` to bypass the global Prisma guard, then local guard |
| ServeStaticModule or `apps/` placement | Making the UI reachable (integration #2) | Moving files under `apps/` is the act of deployment — owner go required; bump `apps/sw.js` CACHE if staff should receive it (DEC-012) |
| Audit interceptor + `statusHistory[]` | Approval actions (integration #4) | First write surface; treat like a money path (second review, DEC-016 trace) |
| DEC-014 gates G1–G5 | Any orchestrator (integration #5) | Hard governance block — do not build |

## 4. Risks & mitigations

1. **Someone wires the mock into a live screen "temporarily".** Mitigation: test suite fails the moment `apps/` or `backend/src` references the foundation; keep the suite in CI.
2. **Mock data mistaken for real.** Mitigation: MOCK- prefix on every id (tested), yellow banner on every screen, fictional numbers only, live-id-pattern test.
3. **Contract drift when the live adapter arrives** (TS unions vs runtime constants vs real /ai vocab). Mitigation: constants.mjs is the single runtime source + drift test; extend the vocabulary in BOTH files in one commit and let the test arbitrate.
4. **Dockerfile refactor silently starts copying `foundation/`** (e.g. a future `COPY . .`). Mitigation: the COPY-audit test fails on any unexpected source, forcing a conscious re-verification.
5. **Governance drift**: this shell referenced DEC-014 deliberately; the tasking chat referenced DEC-018–022 and planning docs (EXECUTION_PLAN.md, ENTERPRISE_INITIATIVE_REGISTER.md, AI_WORK_ALLOCATION.md) that are **not present in `/ai`** — recorded as UNK-013. If those docs land later, re-check this foundation against them before integrating.

## 5. Recommended integration order (each step = its own PR + owner go)

1. **CI hook**: add `node foundation/ai-ops-center/tests/run-tests.mjs` to the build workflow when TASK-015 activates CI. Zero risk, locks the isolation guarantees in.
2. **Live read adapter behind admin auth**: small read-only backend module (parses /ai files) + `LiveAiOpsAdapter`; swap the marked line in `ui/main.mjs`. Still not served publicly — verified via local dev only.
3. **Serve the UI** to admin only (move under `apps/` or gated route) — this is the first user-visible step; bump sw.js CACHE.
4. **Approval actions** (writes) — only after 1–3 have soaked and with the money-path review discipline.
5. **Orchestrator** — blocked on DEC-014 gates; not an integration of this shell so much as a future producer into the same contracts.

Rationale for the order: each step is independently reversible, the first two are invisible to staff, and the write surface comes last — matching the house rule that merge = deploy and risky classes get gates.
