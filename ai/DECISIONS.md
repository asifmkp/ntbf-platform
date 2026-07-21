# DECISIONS.md — architecture & business decisions (ADR-lite)

> **FORMAT** · One decision = one `###` block, stable ID `DEC-###` (never reuse; next free ID below).
> Fields: `Date:` ISO +04:00 · `Status:` ACCEPTED | SUPERSEDED(by DEC-xxx) · `Decider:` owner | agent+owner · `Context:` → `Decision:` → `Consequences:`.
> A decision that isn't written here **does not exist** — chat history is not authority. Newest entries appended at the end.
> Superseding: never edit an old decision's Decision text; add the new DEC and flip the old Status.

**Next free ID: DEC-017**

---

### DEC-001 · Repository is the single source of truth for AI coordination
Date: 2026-07-21 · Status: ACCEPTED · Decider: owner
Context: multiple isolated AI chats (Claude/Codex/Gemini/ChatGPT) cannot share memory; chat context is lost on session limits.
Decision: all durable knowledge, tasks, decisions, status and handoffs live in `/ai/*` in this repo; agents must read them before acting and update them as part of every task.
Consequences: `/ai` files carry strict formats + conflict rules (HANDOFF.md); docs-only commits use `[skip render]`; anything not written down is hearsay.

### DEC-002 · System A (file-backed JSON) is the live platform; Prisma ERP is dormant
Date: 2026-07 (historical, codified 2026-07-21) · Status: ACCEPTED · Decider: owner (de facto)
Context: original TRD ERP (System B, Prisma/Postgres) was never operationalized; prod has no DATABASE_URL.
Decision: all live features build on the file-store pattern (atomic save, seq, statusHistory, StaffAuthGuard).
Consequences: single-instance constraint (no horizontal scaling); System B is routable dead code pending TASK-022.

### DEC-003 · Zoho Books org 928751913 (.com DC) is the ONLY ledger
Date: 2026-07-14 · Status: ACCEPTED · Decider: owner
Context: a second org (170000198188 / .ae) exists in stale configs and is WRONG.
Decision: all Zoho reads/writes target 928751913; code hard-guards writes (ZohoService); no Zoho write ever without explicit owner instruction.
Consequences: render.yaml/.env.example still ship the wrong org — latent config debt (KNOWLEDGE §10.9).

### DEC-004 · July 2026 = fresh start, true-zero opening balances
Date: 2026-07-20 · Status: ACCEPTED · Decider: owner
Context: migration from old software; owner chose option A (no carried balances) over importing a 30-Jun trial balance.
Decision: Zoho July books start from zero; pre-July payments surface as unapplied customer credits; pre-July artifacts (SLR225 etc.) handled case-by-case.
Consequences: negative staff-cash balances until TASK-001 opening floats post; 9 old-dues credits await TASK-005.

### DEC-005 · Fresh Zoho document numbering; legacy numbers as reference only
Date: 2026-07-20 · Status: ACCEPTED · Decider: owner
Decision: Zoho assigns its own numbers (PB-####, INV-######, CN-#####); old-software refs (PUR/INV/RCV/PAY/CON/SLR) stored in reference_number only. The 33 originally mis-posted bills were deleted and re-posted clean (with VAT) under this rule.
Consequences: reference_number is the join key between old software, Zoho, and app history.

### DEC-006 · July sales posted as summary invoices (not item-wise)
Date: 2026-07-20 · Status: ACCEPTED · Decider: owner (agent recommendation)
Context: item-level posting required building a sales item master first.
Decision: 255 July invoices post as single-line summaries via a generic "General Sales" item; per-product analytics deferred to TASK-004 report.
Consequences: no per-item stock movement in Zoho for July; financially exact.

### DEC-007 · `origin:'july-import'` records are display-only and NEVER sync to Zoho
Date: 2026-07-21 · Status: ACCEPTED · Decider: owner+agent
Context: July history was imported into the app (server stores) for visibility, but the same month already exists in Zoho.
Decision: every imported record carries `origin:'july-import'`; EOD + attention exclude it; **any future app→Zoho sync MUST exclude it** or the month double-posts.
Consequences: hard contract on TASK-012; enforced today only by convention — sync design must test it.

### DEC-008 · July history enters the app SERVER-ONLY
Date: 2026-07-21 · Status: ACCEPTED · Decider: owner ("GO SERVER-ONLY")
Decision: backfill writes only server stores (oversight/receipts/expenses/orders lists); the client KPI dataset (appstate/S) is untouched — Overview tiles show live-only.
Consequences: July KPIs live in Zoho/dashboard, not app Overview; avoids permanent sync-payload bloat.

### DEC-009 · Demo dataset removed; app seeds empty (production mode)
Date: 2026-07-20 · Status: ACCEPTED · Decider: owner (via "clear old data")
Decision: store.js SEED_VERSION=2 empty seed; load-time discard of older blobs; sync refuses older seedVersions (PR #18) + admin clear-test-data endpoint (PR #17).
Consequences: any future seed change must bump SEED_VERSION; legacy demo views (custody/cash/acash) remain wired but empty — retirement candidate.

### DEC-010 · Vansale UAQ–Haris is the main current cash account
Date: 2026-07-21 · Status: ACCEPTED · Decider: owner
Decision: keep "Vansale Uaq-Cash in hand -Haris" as the primary operating cash account; do NOT merge/clear the old Haris account now — set-off later on owner instruction.
Consequences: TASK-001 floats map to this account for Haris.

### DEC-011 · clientRef idempotency is the standard for retried writes
Date: 2026-07-21 · Status: ACCEPTED · Decider: agent (shipped PR #22, owner-directed feature)
Decision: money-entry creates accept optional `clientRef`; same clientRef ⇒ return existing record. Offline outbox queues ONLY network failures; 4xx surfaces to the user; failed flush entries require explicit discard.
Consequences: any new write path that clients may retry should adopt the same pattern (incl. TASK-012 sync).

### DEC-012 · PWA cache-bump convention
Date: 2026-07-19 · Status: ACCEPTED · Decider: agent+owner practice
Decision: any frontend change staff must receive immediately bumps `apps/sw.js` CACHE (`ntbf-pwa-vNN` + one-line comment). Currently v16.
Consequences: version history doubles as a frontend changelog; forgetting the bump = one-reload-late rollout (stale-while-revalidate).

### DEC-013 · /ai/ROADMAP.md owns execution order (business-first)
Date: 2026-07-21 · Status: ACCEPTED · Decider: owner (directive) + agent (ordering)
Context: owner directed re-prioritization of all open work as a business-first roadmap before any orchestrator work.
Decision: ROADMAP.md is the authority on execution order and category of queue tasks; TASK_QUEUE.md stays the authority on task detail/state. Order: Phase 0 continuity (014→016→015→020/021) → Phase 1 books loop (owner-input batch, 012 sync design→build, 008/010/011) → Phase 2 ops/debt (013, 017/024, 004, 023, 022) → Phase 3 AI automation.
Consequences: agents pick tasks in roadmap order unless the owner overrides; roadmap updates are docs-only PRs.

### DEC-014 · AI Orchestrator is POSTPONED behind explicit gates
Date: 2026-07-21 · Status: ACCEPTED · Decider: owner (directive to decide) + agent (recommendation)
Context: an orchestrator would compete with Phase 0–1 delivery; the /ai file protocol + PR template + CI (once active) already coordinates agents with zero runtime; currently ~one primary acting agent.
Decision: do NOT build TASK-025 until ALL gates in ROADMAP.md §3 fire (G1 sustained multi-agent activity · G2 CI active · G3 backups drilled · G4 sync stable 2 weeks · G5 evidence the file protocol is the bottleneck). When built: queue-watcher over the SAME /ai files, no new state store, read-only over production, writes via PRs + owner gates.
Consequences: no orchestrator code/runtime now; revisit only with gate evidence recorded in AGENT_LOG.md.

### DEC-015 · Enterprise-discovery evidence protocol (mandatory)
Date: 2026-07-21 · Status: ACCEPTED · Decider: owner
Context: master-plan/architecture work risks building on unverified claims; owner mandates an evidence discipline before strategic conclusions.
Decision: five registers are canonical — FACT_REGISTER.md, UNKNOWNS.md, ASSUMPTIONS.md, RISKS.md, ENTERPRISE_SYSTEM_MAP.md. Every durable statement carries exactly one evidence level (VERIFIED / USER CONFIRMED / INFERRED with linked FACT ids / ASSUMED with validation owner), stable IDs and timestamps. Unknown fields stay explicitly UNKNOWN — never guessed. Contradictions mark facts CONTESTED and block all downstream conclusions citing them until resolved. Chat history is never a VERIFIED source. Strategic docs (BUSINESS_AI_MASTER_PLAN and architecture recommendations) are PAUSED until grounded in these registers.
Consequences: HANDOFF §0/§2.8 + TASK_QUEUE header enforce the protocol; seed facts cite only repository /ai docs; register maintenance is part of every task's Definition of Done where facts change.

### DEC-016 · Permanent traceability standard — /ai KB is the single source of truth, full chain per change
Date: 2026-07-21 · Status: ACCEPTED · Decider: owner
Context: owner mandates a permanent operating standard so every change is auditable end-to-end and documentation never conflicts.
Decision: every feature, bug, audit, decision, AI recommendation and process change records the chain Business Objective → Requirement → Rule → Evidence → System(s) → Data Owner → Implementation → Test Evidence → Deployment → Business Validation → KB Update, as a TRACE-### record per ai/TRACEABILITY.md (minimal fields, existing register IDs as link targets, `N/A (reason)` allowed, `pending` allowed only while in flight). A task is not complete until every applicable link is recorded. Invalidated conclusions are corrected in place with an appended change-history line citing old and new evidence; conflicting documentation is never left standing (AGENT_LOG stays append-only — corrections there are new entries).
Consequences: HANDOFF Definition of Done extended; TASK_QUEUE completion gate extended; FACT-017 registers the standard; first worked example TRACE-001.
