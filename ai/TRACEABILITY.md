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
Next free ID: **TRACE-002**

## 4. Trace records

### TRACE-001 · Owner Overview live-vs-historical separation
- Objective: owner can trust dashboards — live figures mean live business, history is deliberate, not accidental
- Requirement: Overview KPIs reflect only live operations; imported history visible only in labeled, separate views
- Rule: FACT-016
- Evidence: owner directive message 2026-07-21 (USER CONFIRMED); technical baseline DEC-008/FACT-008 (VERIFIED)
- System(s): SYS-01
- Data Owner: Asif
- Implementation: TASK-026 — pending (build gated on separate owner approval)
- Test Evidence: pending
- Deployment: pending
- Business Validation: pending
- KB Update: FACT_REGISTER (FACT-016/017) · UX_AUDIT (UXF-001) · ENTERPRISE_SYSTEM_MAP (SYS-01 data-view semantics) · this file — PR #27
