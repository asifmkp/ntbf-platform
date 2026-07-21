# FACT_REGISTER.md — canonical facts with evidence levels

> **PROTOCOL (owner-mandated, DEC-015)** · Every durable statement any agent relies on is recorded here with **exactly one** evidence level:
> - **VERIFIED** — directly observed/tested; cite direct source (file/tool/output path) + date.
> - **USER CONFIRMED** — stated by the owner/staff in an interview/response; cite where recorded + date.
> - **INFERRED** — derived; MUST link the supporting FACT-IDs it derives from.
> - **ASSUMED** — unvalidated; MUST also appear in ASSUMPTIONS.md with a validation owner.
> IDs `FACT-###` are stable, never reused. `Status:` ACTIVE | CONTESTED | RETIRED(date). **A CONTESTED fact blocks every conclusion citing it until resolved** (log resolution in AGENT_LOG, retire or re-verify here).
> Chat history is NOT a source: a claim only remembered from chat enters as ASSUMED or an UNKNOWN, never VERIFIED. Seeded 2026-07-21 exclusively from repository `/ai` docs, cited per row.
> Next free ID: **FACT-016**

| ID | Statement | Level | Source | Date | Status | Owner |
|---|---|---|---|---|---|---|
| FACT-001 | Live platform is System A (file-backed JSON stores on Render disk); Prisma ERP (System B) is dormant, routable dead code | VERIFIED | ai/DECISIONS.md DEC-002; ai/PROJECT_KNOWLEDGE.md §2 | 2026-07-21 | ACTIVE | claude-muhammed |
| FACT-002 | Merging to `main` auto-deploys production (Render); there is no CI gate | VERIFIED | ai/HANDOFF.md §1; ai/STATUS.md Systems; ai/TASK_QUEUE.md TASK-015 | 2026-07-21 | ACTIVE | claude-muhammed |
| FACT-003 | Zoho Books org 928751913 (.com DC) is the only ledger of record; a second org (170000198188/.ae) in stale configs is wrong | USER CONFIRMED | ai/DECISIONS.md DEC-003 (Decider: owner, 2026-07-14) | 2026-07-14 | ACTIVE | owner |
| FACT-004 | render.yaml and .env.example still ship the wrong Zoho org 170000198188 + .ae hosts, neutralized by write-lock + org guard | VERIFIED | ai/PROJECT_KNOWLEDGE.md §10.9 | 2026-07-21 | ACTIVE | claude-muhammed |
| FACT-005 | July 1–20 books are fully imported to Zoho and reconciled: sales 63,519.63 · collected 52,349.88 · open receivable 11,193.05 · purchases 36,288.09 · payables 907.71 · expenses 10,572.00 (AED) | VERIFIED | ai/STATUS.md Key figures (reconciled 2026-07-21) | 2026-07-21 | ACTIVE | claude-muhammed |
| FACT-006 | /var/data (Render persistent disk) is the only copy of all live business data; no backup exists | VERIFIED | ai/PROJECT_KNOWLEDGE.md §10.6; ai/TASK_QUEUE.md TASK-014; ai/STATUS.md cautions | 2026-07-21 | ACTIVE | claude-muhammed |
| FACT-007 | Real weak seeded staff passwords exist in source (staff-auth.module.ts:56-61); rotation overdue | VERIFIED | ai/TASK_QUEUE.md TASK-016; ai/PROJECT_KNOWLEDGE.md §10 | 2026-07-21 | ACTIVE | claude-muhammed |
| FACT-008 | July history lives in the app server stores tagged `origin:'july-import'`; contract: these records never sync to Zoho and never count as live cash | USER CONFIRMED | ai/DECISIONS.md DEC-007 (owner+agent, 2026-07-21) | 2026-07-21 | ACTIVE | owner |
| FACT-009 | July 2026 Zoho start is true-zero (no carried opening balances); fresh Zoho numbering with legacy refs in reference_number | USER CONFIRMED | ai/DECISIONS.md DEC-004, DEC-005 (Decider: owner) | 2026-07-20 | ACTIVE | owner |
| FACT-010 | "Vansale Uaq-Cash in hand -Haris" is the main current cash account; old Haris account set-off deferred | USER CONFIRMED | ai/DECISIONS.md DEC-010 (Decider: owner) | 2026-07-21 | ACTIVE | owner |
| FACT-011 | WhatsApp bot runs as Supabase edge function (project wvsgeumafnqelspcqivo), v41, outside this repo; customer+staff routing live | VERIFIED | ai/STATUS.md Systems; ai/HANDOFF.md §1 | 2026-07-21 | ACTIVE | claude-muhammed |
| FACT-012 | PWA frontend rollout convention: bump apps/sw.js CACHE (currently v16) for any change staff need immediately | VERIFIED | ai/DECISIONS.md DEC-012; ai/STATUS.md Systems | 2026-07-21 | ACTIVE | claude-muhammed |
| FACT-013 | Claude account has 17 MCP connectors (7-server Zoho NATIONAL suite, Supabase, GitHub, Gmail/Calendar/Drive, Canva, Figma, +3 disabled), 18 plugins, 10 skills, 2 cloud environments, 1 active daily Routine (9:00 UAE ping) | VERIFIED | ai/CLAUDE_ACCOUNT_AUDIT.md §1–§3 (enumerated 2026-07-21) | 2026-07-21 | ACTIVE | claude-muhammed |
| FACT-014 | Claude Code sandboxes cannot reach app.ntbfllc.com (network policy 403); production checks need owner's browser or MCP channels | VERIFIED | ai/CLAUDE_ACCOUNT_AUDIT.md §1 | 2026-07-21 | ACTIVE | claude-muhammed |
| FACT-015 | `PUT /api/appstate` is effectively open (whole shared dataset writable) when PUBLIC_API_TOKEN is unset; whether it IS set in prod is UNK-001 | VERIFIED | ai/PROJECT_KNOWLEDGE.md §10.5 (code behavior); prod state → ai/UNKNOWNS.md UNK-001 | 2026-07-21 | ACTIVE | claude-muhammed |
