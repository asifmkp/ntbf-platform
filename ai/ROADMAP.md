# ROADMAP.md — business-first execution roadmap

> **AUTHORITY** · This file owns *execution order and categorization* of everything in TASK_QUEUE.md (which owns task detail/state). If they disagree on order, this file wins; on task state, TASK_QUEUE wins. Adopted by owner directive — DEC-013. Orchestrator decision — DEC-014.
> Effort: **S** ≤ half day · **M** 1–2 days · **L** multi-day. Roles: **Claude** = architecture/risky builds & financial ops · **Codex** = tightly-specced mechanical implementation · **Gemini** = independent validation of risky diffs · **Human** = owner (Asif) approvals + CA. *"—" in Codex/Gemini = no external model genuinely needed; adding one would only add handoff cost.*

Last updated: 2026-07-21T04:30+04:00

## 1. Category map (every open task)

| Category | Tasks |
|---|---|
| **Business features** | TASK-001 floats · 002 hybrid · 003 voice verify · 004 item-wise report · 005/006/007/009 accounting calls · 008 CA journals · 010 TRNs · 011 Al Maha merge · **012 app→Zoho sync** · 013 barcode capture · 018 handbook v3 |
| **Infrastructure** | **014 backups** · 015 CI activation |
| **Security** | 016 password rotation · 017 stored-XSS fix · 020 JWT fail-fast · 021 appstate lock |
| **Technical debt** | 022 System B retire/gate · 023 config/env hygiene (wrong Zoho org in render.yaml/.env.example) · 024 frontend consolidation bundle (apiBase/headers dedupe, legacy S-views retirement, catalog-drift guard, Leaflet offline) |
| **AI automation** | 025 AI Orchestrator — **POSTPONED behind gates** (DEC-014) · (existing: Muhammed, daily ping, audit exporter — running/optional) |

## 2. Phases & execution order

### Phase 0 — Business continuity (protect what exists) · target: this week
*Rationale: a disk failure or credential abuse halts the entire business; these are the highest value-per-effort items on the board and everything later depends on them.*

| # | Task | Effort | Build | Implement | Validate | Human |
|---|---|---|---|---|---|---|
| 0.1 | **014 backups** (/var/data → off-box, restore tested) | M | Claude | — | Gemini (restore drill review) | **Owner approves off-box target first** |
| 0.2 | **016 seeded-password rotation + forced first-login change** | S/M | Claude | — | — | **Owner rotates live creds; receives new secrets out-of-band** |
| 0.3 | 020 JWT fail-fast (kill 'dev-secret' fallback) | S | Claude | Codex (mechanical 11-site sweep to shared source) | — | Owner informed |
| 0.4 | 021 lock PUT /api/appstate | S | Claude | — | Gemini (verify sync.js clients unaffected) | Owner informed |
| 0.5 | 015 activate CI (docs-check + build/tests) | S | — | Codex (wire templates) | — | Owner flips it on |

**Exit criteria:** restore drill succeeded from a real backup; no default credentials work; CI green on a test PR; prod boot fails loudly without JWT_SECRET.
**Owner approvals needed:** backup destination (data leaves the box) · credential handover channel.

### Phase 1 — Close the books loop (core business) · target: next 1–2 weeks
*Rationale: the app captures live money daily but Zoho only has July — the longer the gap runs, the bigger the manual catch-up. Owner-input tasks cost minutes each and unblock exactness.*

| # | Task | Effort | Build | Implement | Validate | Human |
|---|---|---|---|---|---|---|
| 1.1 | 001 opening floats (batch with 002, 005, 006, 007, 009 — one owner message) | S each | Claude (Zoho posts) | — | — | **Owner supplies inputs + approves each posting** |
| 1.2 | 008 vehicle-loan journals | S | Claude drafts | — | — | **CA figures + owner approve** |
| 1.3 | **012 app→Zoho daily sync** — design doc → owner sign-off → build | **L** | Claude (design + money-path build) | Codex (test harness) | **Gemini (adversarial review: idempotency, DEC-007 july-import exclusion, double-post scenarios)** | **Owner approves design BEFORE build; Zoho writes stay env-locked until first supervised run** |
| 1.4 | 003 voice verify → 018 handbook v3 | S | Claude | — | — | Owner does the 2-min key check |
| 1.5 | 010 TRNs · 011 Al Maha merge (guide) | S | Claude guide | — | — | Owner/Shanu execute |

**Exit criteria:** Zoho current within 24h of app activity for 14 consecutive days, weekly reconciliation report clean; zero july-import records in any sync payload (tested); floats three-way-match (bookkeeper = app = Zoho).
**Owner approvals:** sync design sign-off (the one gate that matters most in this whole roadmap) · every Zoho posting in 1.1/1.2.

### Phase 2 — Sell more, operate better · target: following 2–4 weeks

| # | Task | Effort | Build | Implement | Validate | Human |
|---|---|---|---|---|---|---|
| 2.1 | 004 item-wise July analytics (when file arrives) | M | Claude | — | — | Owner uploads report |
| 2.2 | 013 barcode capture in field app → feeds image/enrichment workstream | M | Claude (design) | Codex (scanner UI) | — | Owner go |
| 2.3 | 017 XSS fix | S | — | Codex (esc sweep, hostile-name test) | Gemini (spot-check) | — |
| 2.4 | 024 frontend consolidation bundle | M | Claude (scope spec) | Codex | — | — |
| 2.5 | 023 config hygiene (purge wrong Zoho org/.ae from render.yaml & .env.example) | S | Claude | — | — | Owner confirms env intent |
| 2.6 | 022 System B decision → implement | S decide / M implement | Claude (options memo) | Codex (removal/flagging) | — | **Owner decides delete vs flag** |

**Exit criteria:** enrichment pipeline has real barcodes flowing; hostile-name test passes; single apiBase helper; no wrong-org config anywhere; System B fate decided and done.

### Phase 3 — AI automation (only after the loops close)

Candidates (each needs an owner go, in value order): scheduled weekly management report auto-generation · automated reconciliation alerts (app vs Zoho drift) · WhatsApp order-to-fulfilment SLA nudges · **025 Orchestrator if and only if the DEC-014 gates fire**.

## 3. The Orchestrator decision (DEC-014): POSTPONED — deliberately

**Decision: do not build an AI Orchestrator now.** Rationale:
1. **It doesn't ship anything NTBF needs.** Every open item above is either owner-input-bound, a single-agent-sized build, or gated on approvals an orchestrator cannot grant. Orchestration overhead would compete with Phase 0–1 delivery — exactly what the owner said to avoid.
2. **The /ai file protocol + PR template + CI (once active) *is* the orchestrator today** — coordination via claims, queue, log, and machine-checked conventions. It has zero runtime to maintain and no new failure modes.
3. **There is currently ~one primary acting agent.** An orchestrator earns its complexity only under real multi-agent contention.

**Gates — implement TASK-025 only when ALL are true:**
- **G1** ≥2 different agents (any vendor) are completing queue tasks in the same week, sustained for 2+ weeks.
- **G2** CI is active (TASK-015) so orchestrated merges are machine-validated.
- **G3** Backups are live and drilled (TASK-014) — no automation over an unprotected single copy of the business.
- **G4** App→Zoho sync (TASK-012) stable ≥2 weeks — close the biggest loop before meta-work.
- **G5** Evidence the file protocol is the bottleneck: ≥2 claim collisions or stale-claim incidents in AGENT_LOG within a month, or the owner wants more parallel workstreams than the queue serves.
When gates fire: orchestrator scope = queue-watcher that assigns/verifies via the SAME /ai files (no new state store), read-only over production, all writes still through PRs + owner gates.

## 4. Role model — used honestly

- Most tasks here are **single-agent-sized**: routing them through three vendors adds handoff cost, not quality — hence the many "—" cells.
- **External models earn their seat in exactly two places:** (a) **Gemini as independent adversarial validator** on the highest-risk diffs (the Zoho sync, security changes, backup/restore) — independence catches what the author can't; (b) **Codex on tightly-specced mechanical sweeps** (multi-site refactors, test harnesses, CI wiring) where the spec is complete and creativity is a liability.
- **Human (owner/CA) is the only approver** for: Zoho writes, money postings, credentials, data leaving the box, System B's fate, and every phase exit.
- Any agent claiming a task follows HANDOFF.md regardless of vendor.

## 5. Recommended immediate order (the short answer)

**014 → 016 → 015 → 020/021 → [owner input batch: 001+002+005/6/7/9, 003] → 012 design → 012 build → 008/010/011 → 013 → 017/024 → 004 → 023 → 022 → Phase 3.**
First mover: **TASK-014 backups** — pending one owner answer: *where may backups live off-box?*
