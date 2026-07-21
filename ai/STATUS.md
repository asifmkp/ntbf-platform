# STATUS.md — current state snapshot

> **FORMAT** · This file is a REPLACEABLE snapshot (not a log — history lives in AGENT_LOG.md).
> Update it in the SAME PR as any completed task: refresh `As of`, move your task from In-flight, add one line to Recently completed (keep ≤10; older lines drop — the log keeps them).
> Keep it under ~80 lines so any agent can load it first and cheaply.

**As of: 2026-07-21T14:00+04:00 · main @ `72ff0fa`+PR#37 · updated by: claude-muhammed**

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
- Feature work paused by owner. Execution order lives in /ai/ROADMAP.md (DEC-013); orchestrator postponed behind gates (DEC-014). Awaiting owner: Phase 0 gos (backups destination first) + input batch.

## Blocked on owner (see TASK_QUEUE for details)

TASK-001 floats · TASK-002 hybrid 9,399.60 · TASK-003 voice key check · TASK-004 item-wise report · TASK-005/006/007/009 small accounting calls · TASK-008 CA loan figures · gos for TASK-012 sync design, TASK-013 barcodes, TASK-014 backups.

## Recently completed

- 2026-07-21 · **Role-switch fix SHIPPED (GO 029 A+B)**: guard + reset + defense filter, v19 (FACT-033) — owner 5-step re-check pending; Playwright deferred to TASK-015
- 2026-07-21 · **STOP #2**: role-switch view-state contamination found by owner (Sales Historical → Driver shows Delivered 255 until reload) — FACT-031/032, RISK-012, TASK-029 awaits owner option; TRACE-001 still HELD
- 2026-07-21 · **Finance-list gap CLOSED (GO 028 A)**: all 5 finance list endpoints live-default + hub view controls, suite 32/32 ×2, v18 (FACT-030) — owner live re-check + Codex audit pending
- 2026-07-21 · **Post-deploy contradiction found by owner (STOP)**: finance Receipts/Payments/Transfers LISTS still show imported history (FACT-028/029, RISK-011) — fix TASK-028 awaits owner option A/B; TRACE-001 validation HELD
- 2026-07-21 · **Live Operations vs Historical Import standard SHIPPED** (DEC-017/FACT-026/027): TASK-026+027 in one PR, 21/21 regression checks ×2, v17. Owner live validation pending
- 2026-07-21 · Ops-surface audit: sales rule FACT-023 confirmed; salesman Completed(255) + driver Delivered(255) mixing live-observed & code-confirmed (FACT-022/024/025, RISK-010); TASK-026 now platform-wide standard, P2
- 2026-07-21 · KPI-surface trace: UNK-011 resolved, 351-vs-606 reconciled exactly; **finance summary KPI compliance gap found** (FACT-021, RISK-009, TASK-027 awaiting owner)
- 2026-07-21 · Traceability standard (DEC-016) + Overview live-vs-historical rule (FACT-016, UXF-001, TASK-026 queued)
- 2026-07-21 · Evidence protocol scaffolding (DEC-015): 5 registers seeded from /ai docs, 15 facts / 10 unknowns / 3 assumptions / 8 risks
- 2026-07-21 · Claude account/workspace audit → /ai/CLAUDE_ACCOUNT_AUDIT.md (evidence-only; nothing enabled)
- 2026-07-21 · Business-first roadmap (/ai/ROADMAP.md) + TASK-023/024/025 queued + DEC-013/014 (PR #24)
- 2026-07-21 · /ai collaboration infrastructure shipped (PR #23)
- 2026-07-21 · Full 3-way repository audit (backend/frontend/infra) → /ai/PROJECT_KNOWLEDGE.md
- 2026-07-21 · PR #22 offline outbox + clientRef idempotency (v16)
- 2026-07-21 · PR #21 attention badges + order aging (v15)
- 2026-07-21 · PR #20 server-backed driver EOD + confirmed handovers (v14)
- 2026-07-21 · PR #19 July history backfill → owner ran live import, verified (606 records)
- 2026-07-20 · PR #18 empty production seed (demo removed) · PR #17 clear-test-data
- 2026-07-20 · July Zoho import complete, grand reconciliation PASS
- 2026-07-20 · Ops dashboard artifact + management report PDF + staff handbook v2

## Standing cautions

main auto-deploys (merge = ship) · no backups of /var/data yet (TASK-014) · seeded passwords unrotated (TASK-016) · daily 9AM-UAE owner ping runs from the Claude "muhammed" session.
