# TRACEABILITY.md — end-to-end traceability protocol (DEC-016, permanent standard)

> **Owner standard (USER CONFIRMED 2026-07-21):** the /ai Enterprise Knowledge Base is the single source of truth. Every feature, bug, audit, decision, AI recommendation and process change records the full chain below. **A task is not complete until every applicable link is recorded.** Links that genuinely don't apply are written `N/A (reason)` — never left blank, never guessed.

## 1. The chain (one `TRACE-###` record per change)

`Business Objective → Business Requirement → Business Rule → Evidence → System(s) → Data Owner → Implementation → Test Evidence → Deployment → Business Validation → Knowledge Base Update`

**Minimal fields** (reuse existing register IDs as link targets — do not duplicate content):

| Field | What goes in it |
|---|---|
| Objective | one line: the business outcome this serves |
| Requirement | one line: what must be true for the objective |
| Rule | FACT-### (USER CONFIRMED rules live in FACT_REGISTER) or DEC-### |
| Evidence | FACT/UNK/ASM ids or direct source+date (DEC-015 levels apply) |
| System(s) | SYS-## ids from ENTERPRISE_SYSTEM_MAP.md |
| Data Owner | named human (per system map) |
| Implementation | TASK-### / PR # / commit sha — or `pending` |
| Test Evidence | verification output location (PR body per HANDOFF §2.6) — or `pending` |
| Deployment | merge sha + date (merge = deploy, FACT-002) — or `pending` |
| Business Validation | owner/staff confirmation it works in the business + date — or `pending` |
| KB Update | which /ai files were updated, in which PR |

`pending` fields are allowed while work is in flight; **completion means no `pending` remains on applicable links.**

## 2. Corrections & change history (no conflicting documentation — ever)

When new evidence invalidates a recorded conclusion:
1. **Update the original record in place** to the corrected content (registers stay current — a reader never meets the stale claim as truth).
2. **Append a `Change history:` line to that record:** date · what changed · OLD evidence cited · NEW evidence cited · why.
3. Cascade: re-check every record linking to it (trace records, RISKS, tasks); fix or mark CONTESTED per DEC-015.
4. AGENT_LOG gets the narrative entry. AGENT_LOG itself stays append-only (corrections are new entries) — it is the only exception to update-in-place.

## 3. Where records live

Trace records: in this file, §4, newest last. IDs `TRACE-###`, stable, never reused. Small changes may share one trace record per task; don't fragment.
Next free ID: **TRACE-003**

## 4. Trace records

### TRACE-001 · Live-vs-historical separation (platform-wide standard)
- Objective: owner and staff can trust every screen — live figures mean live business, history is deliberate, not accidental
- Requirement: ALL operational KPIs and default lists reflect only live operations; imported history visible only in labeled, separate views (Combined only by explicit choice). *Change history: 2026-07-21 — widened from "Owner Overview" to platform-wide per FACT-022/023/024/025 (old evidence: owner-Overview directive only; new: sales+driver live observations, confirmed sales rule, full surface trace)*
- Rule: **FACT-026 (authoritative, DEC-017)** — subsumes FACT-016 + FACT-023
- Evidence: owner directives 2026-07-21 (USER CONFIRMED, incl. the "GO 026+027" authorization); technical baseline DEC-008/FACT-008 (VERIFIED); live-audit + code-trace evidence FACT-018/019/020/021/022/024/025 (VERIFIED 2026-07-21)
- System(s): SYS-01
- Data Owner: Asif
- Implementation: TASK-026 + TASK-027 (PR #31 `cdc3ef3`) + correction TASK-028 option A (PR #34, finance list endpoints + hub controls, v18) — server `view=live|historical|combined` convention on /api/portal/orders/all + /api/finance/summary, new /api/admin/july-history/summary, Owner Overview label + Historical Imported Data card + view switcher, salesman Online + finance Overview labelled views, assistant live-only declarations, sw.js v17 (FACT-027)
- Test Evidence: backend/tools/test-live-standard.mjs — 21/21 PASS twice (PR #31), extended to **32/32 PASS twice** after the finance-list correction (TASK-028/PR #34); full endpoint enumeration incl. per-role checks. *Change history: 2026-07-21 — suite extended after FACT-028 exposed the enumeration gap.*
- Deployment: PR #31 `cdc3ef3` + correction PR #34 `83966eb` (2026-07-21, Render auto-deploy, FACT-002)
- Business Validation: **PENDING — HELD (owner STOP #2, 2026-07-21)**: v18 fresh-load defaults verified clean by owner reproduction, but role-switch contamination found (FACT-031/032 → TASK-029). Previous hold note:  post-deploy live regression passed Sales + Driver but found the finance Receipts default list showing imported history (FACT-028) — contradiction traced (FACT-029), fix queued (TASK-028). Validation completes only after TASK-028 ships and the owner re-checks the Finance hub. *Change history: 2026-07-21 — was a simple pending-owner check; held on contradiction evidence (old: PR #31 checks green; new: FACT-028 live observation).*
- KB Update: FACT_REGISTER (FACT-026/027 + change histories) · DECISIONS (DEC-017) · UX_AUDIT (UXF-001..004 implemented) · ENTERPRISE_SYSTEM_MAP (compliance matrix) · RISKS (009/010 closed) · UNKNOWNS (UNK-012 opened) · TASK_QUEUE (026/027 done, removed) — PRs #27/#29/#30 + implementation PR

### TRACE-002 · Backup design for /var/data (TASK-014, Phase 0)
- Objective: the business's only live data copy (/var/data) survives a disk/platform failure — RISK-001 closed
- Requirement: nightly encrypted off-box backup with documented, drill-verified restore, retained on a defined schedule
- Rule: DEC-019 (Supabase Storage destination; "done" = demonstrated restore)
- Evidence: FACT-006 (VERIFIED — /var/data is the only copy, no backup exists); render.yaml (VERIFIED — 1 GB disk, STATE_DIR mount); 14 STATE_DIR call sites across backend/src (VERIFIED — defines backup scope); growth estimate ASSUMED (ASM-004, pending UNK-013)
- System(s): SYS-01 (backend/Render), Supabase Storage (external, WhatsApp-bot project `wvsgeumafnqelspcqivo` — reuse approved by owner 2026-07-22)
- Data Owner: Asif (owner)
- Implementation: TASK-014 · design doc `ai/BACKUP_DESIGN.md` (PR #40, merged `40f5fc0`) · code `backend/src/backup/*` (branch `feature/task-014-backup-build`, PR pending) — `SupabaseStorageClient`, `BackupStore`, `BackupService` (cron + tar + AES-256-GCM + upload/retention), `BackupController` (manual trigger + status), wired in `app.module.ts`
- Test Evidence: `npx nest build` exit 0; Jest 9/9 green (`backend/src/backup/backup.service.spec.ts`) — encrypt/decrypt round-trip incl. tamper/wrong-key rejection, retention-window selection, and a Dubai-local-vs-UTC day-boundary regression test for a promotion-logic bug caught in review before merge
- Deployment: pending (feature branch not yet merged to `main`; will auto-deploy on merge per FACT-002, but ships fail-safe — inert until Supabase env vars are set)
- Business Validation: design approved 2026-07-22 (owner resolved all 3 §8 questions). Code built and reviewed, not yet merged. Restore drill (§6) — the actual DEC-019 "done" criterion — still pending: needs owner Supabase provisioning first, then a live manual-trigger run, then a documented restore. *Change history: 2026-07-22 — was "design approved, build pending"; build now complete and tested (evidence: nest build + Jest output this session), TASK-014 moved IN_PROGRESS→BLOCKED(owner) pending Supabase-side provisioning*
- KB Update: ai/BACKUP_DESIGN.md (§8a build-status section added) · TASK_QUEUE (TASK-014 IN_PROGRESS→BLOCKED, new blocker text) · STATUS (As of, Recently completed, In-flight, Blocked-on-owner, Standing cautions) · AGENT_LOG (build entry) — feature/task-014-backup-build
