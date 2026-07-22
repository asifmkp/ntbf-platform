# STATUS.md — current state snapshot

> **FORMAT** · This file is a REPLACEABLE snapshot (not a log — history lives in AGENT_LOG.md).
> Update it in the SAME PR as any completed task: refresh `As of`, move your task from In-flight, add one line to Recently completed (keep ≤10; older lines drop — the log keeps them).
> Keep it under ~80 lines so any agent can load it first and cheaply.

**As of: 2026-07-22T06:15+04:00 · main @ `61a9e7c` · updated by: claude-openclaw**

## Systems

| System | State |
|---|---|
| Field app (app.ntbfllc.com) | LIVE · PWA cache **v19** · production data · **Live-vs-Historical standard enforced (DEC-017/FACT-026)** — July history only in Documents/Historical/Combined views |
| Backend (Render, auto-deploy from main) | LIVE · persistent disk /var/data · **no CI gate** |
| WhatsApp bot (Supabase, outside repo) | LIVE · **v41** · customer+staff routing OK · voice notes wired, key verification pending (TASK-003) |
| Zoho Books 928751913 (.com) | July 1–20 fully imported & reconciled (grand recon PASS) · writes env-locked |
| Audit trail | Recording (hash-chained) · off-box export OFF (env not set) |

## Key figures (July 1–20, reconciled 2026-07-21)

Sales 63,519.63 · collected 52,349.88 (1,510.87 unapplied old-dues credits) · open receivable **11,193.05** (hybrid general trading 9,399.60 = 84%) · purchases 36,288.09 · supplier payables 907.71 · expenses 10,572.00 · staff cash transfers 61,390.00 · Shanu Capital ~1,004,062 Cr (vehicle-loan journals pending, TASK-008).
Staff cash floats (Zoho): Vansale-Haris 11,095 · Musthafa 4,812.50 · Asif 3,190 · Rashid 330 · Dhanish −1,700 · Office −11,330 (negatives resolve with TASK-001).

## In-flight

- **Enterprise discovery (DEC-015):** evidence registers live (FACT_REGISTER / UNKNOWNS / ASSUMPTIONS / RISKS / ENTERPRISE_SYSTEM_MAP). BUSINESS_AI_MASTER_PLAN + architecture recommendations PAUSED until grounded in them; next step is resolving UNKNOWNS (mostly owner interviews).
- Feature work paused by owner (exception: TASK-014, owner-approved Phase 0 first-mover, now building). Execution order lives in /ai/ROADMAP.md (DEC-013); orchestrator postponed behind gates (DEC-014). Awaiting owner: input batch (floats etc.) + TASK-012 sync design go.
- TASK-014 build in progress: design approved, all 3 owner decisions resolved (bucket reuse, key escrow, schedule), disk-usage check confirms no near-term capacity concern (FACT-034). Next: BackupService implementation, then the restore drill that defines "done" (DEC-019).

## Blocked on owner (see TASK_QUEUE for details)

TASK-001 floats · TASK-002 hybrid 9,399.60 · TASK-003 voice key check · TASK-004 item-wise report · TASK-005/006/007/009 small accounting calls · TASK-008 CA loan figures · gos for TASK-012 sync design, TASK-013 barcodes.

## Recently completed

- 2026-07-22 · **TASK-014 design approved, build unblocked**: owner resolved all 3 open decisions in `ai/BACKUP_DESIGN.md` §8 (reuse WhatsApp-bot Supabase project + dedicated bucket; key escrow = Render env + password manager; nightly 02:00 Asia/Dubai). Owner ran the disk-usage check via Render Shell: live `/var/data` at 0% utilization (716K/973M, FACT-034) — no near-term capacity concern; UNK-013 resolved, ASM-004 de-risked (rate still unconfirmed, re-measure in 1-2 months). TASK-014 REVIEW→IN_PROGRESS; still not built, restore drill still the finish line.
- 2026-07-22 · TASK-014 backup design submitted for owner review: `ai/BACKUP_DESIGN.md` (PR #40) — nightly in-process cron, tar+AES-256-GCM, Supabase Storage upload/retention (14d/8w/6m), documented restore procedure + DR drill plan.
- 2026-07-21 · Section-3 owner decisions: backups→Supabase (DEC-019, design-first), System B delete (DEC-018), weekly Monday owner review approved, Playwright→TASK-015, training program queued (TASK-031)
- 2026-07-21 · **Role-switch fix SHIPPED (GO 029 A+B)**: guard + reset + defense filter, v19 (FACT-033) — owner 5-step re-check pending; Playwright deferred to TASK-015
- 2026-07-21 · **STOP #2**: role-switch view-state contamination found by owner (Sales Historical → Driver shows Delivered 255 until reload) — FACT-031/032, RISK-012, TASK-029 awaits owner option; TRACE-001 still HELD
- 2026-07-21 · **Finance-list gap CLOSED (GO 028 A)**: all 5 finance list endpoints live-default + hub view controls, suite 32/32 ×2, v18 (FACT-030) — owner live re-check + Codex audit pending
- 2026-07-21 · **Post-deploy contradiction found by owner (STOP)**: finance Receipts/Payments/Transfers LISTS still show imported history (FACT-028/029, RISK-011) — fix TASK-028 awaits owner option A/B; TRACE-001 validation HELD
- 2026-07-21 · **Live Operations vs Historical Import standard SHIPPED** (DEC-017/FACT-026/027): TASK-026+027 in one PR, 21/21 regression checks ×2, v17. Owner live validation pending
- 2026-07-21 · Ops-surface audit: sales rule FACT-023 confirmed; salesman Completed(255) + driver Delivered(255) mixing live-observed & code-confirmed (FACT-022/024/025, RISK-010); TASK-026 now platform-wide standard, P2
- 2026-07-21 · KPI-surface trace: UNK-011 resolved, 351-vs-606 reconciled exactly; **finance summary KPI compliance gap found** (FACT-021, RISK-009, TASK-027 awaiting owner)
- 2026-07-21 · Traceability standard (DEC-016) + Overview live-vs-historical rule (FACT-016, UXF-001, TASK-026 queued)

## Standing cautions

main auto-deploys (merge = ship) · no backups of /var/data yet (TASK-014) · seeded passwords unrotated (TASK-016) · daily 9AM-UAE owner ping runs from the Claude "muhammed" session.
