# UX_AUDIT.md — owner-facing UX findings & rulings

> **Scope note (honest):** the full new-staff live UX audit the owner once commissioned was superseded before execution and has NOT been performed — this file does not pretend otherwise. It records owner-observed UX findings and their rulings, one entry per finding, under the DEC-015 evidence protocol.
> IDs `UXF-###` stable. Next free ID: **UXF-002**

---

## UXF-001 · Owner Overview: live vs historical data discrepancy — RESOLVED BY RULE

- **Observed:** during go-live the owner experienced the Overview/dashboard as ambiguous about what is "live" — historical/imported figures risked reading as current activity. Discrepancy existence: USER CONFIRMED (owner directive message, 2026-07-21, which declares it "now resolved by this rule").
- **Ruling that resolves it:** **FACT-016** — Owner Overview represents current live operational activity only; historical imports (including July) remain available for reporting, reconciliation and audit but must not make live KPIs appear active.
- **Current technical state (context):** Overview KPI tiles are already live-only by construction — July history entered server stores only, tagged `origin:'july-import'`, excluded from client KPI dataset (DEC-008, FACT-008). The gap the rule addresses is *presentation*: nothing labels the period or surfaces the historical data deliberately.
- **Status:** rule recorded and ACTIVE; UI implementation is a FUTURE, SEPARATELY APPROVED feature (below). No production code changed by this entry.

### Approved-in-principle UX requirement (future feature — TASK-026, build gated on separate owner approval)

USER CONFIRMED spec (owner directive message, 2026-07-21):
1. Label the Overview period explicitly: **"Live Operations / Since Go-Live"**.
2. Add a **"Historical Imported Data" card** showing: imported period, record count, revenue, collections, and import date.
3. Provide three views: **Live Operations** (default) · **Historical Import** · optional **Combined View**.
4. Imported history NEVER mixes into live KPIs unless the owner actively selects Combined View.

Traceability: TRACE-001 in ai/TRACEABILITY.md carries this finding's full chain (objective → rule → systems → implementation → validation).
