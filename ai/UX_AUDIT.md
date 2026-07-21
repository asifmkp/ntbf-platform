# UX_AUDIT.md — owner-facing UX findings & rulings

> **Scope note (honest):** the full new-staff live UX audit the owner once commissioned was superseded before execution and has NOT been performed — this file does not pretend otherwise. It records owner-observed UX findings and their rulings, one entry per finding, under the DEC-015 evidence protocol.
> IDs `UXF-###` stable. Next free ID: **UXF-003**

---

## UXF-001 · Owner Overview: live vs historical data discrepancy — RESOLVED BY RULE

- **Observed:** during go-live the owner experienced the Overview/dashboard as ambiguous about what is "live" — historical/imported figures risked reading as current activity. Discrepancy existence: USER CONFIRMED (owner directive message, 2026-07-21, which declares it "now resolved by this rule").
- **Ruling that resolves it:** **FACT-016** — Owner Overview represents current live operational activity only; historical imports (including July) remain available for reporting, reconciliation and audit but must not make live KPIs appear active.
- **Current technical state (context):** Overview KPI tiles are already live-only by construction — July history entered server stores only, tagged `origin:'july-import'`, excluded from client KPI dataset (DEC-008, FACT-008). The gap the rule addresses is *presentation*: nothing labels the period or surfaces the historical data deliberately.
- **Status:** rule recorded and ACTIVE; UI implementation is a FUTURE, SEPARATELY APPROVED feature (below). No production code changed by this entry.
- **Live-audit evidence (2026-07-21, FACT-018):** owner's live session (app.ntbfllc.com/mobile-app/, Owner → Documents) showed 351 imported records, AED 159,692.26 total, categorised expenses/receipts/payments/transfers/advances, with imported July references visible — confirming historical records are accessible in Documents as the rule requires. **Deliberately NOT asserted:** that imported records never affect any live KPI — that end-to-end check is pending (UNK-011).
- **Live-audit evidence (2026-07-21, FACT-019):** Owner → Muhammed assistant, read-only suggestion "Today's sales" → Orders 0 / Revenue 0 / Collected 0 / Outstanding 0 while July history stayed in Documents — the assistant reflected zero live activity and did not surface imported history in this query. Structural cause verified in code (assistant reads client appstate, which July never entered — DEC-008).
- **Reconciliation closed (FACT-020):** Documents' 351 / AED 159,692.26 = exactly the four non-order money categories of the 606-record backfill (216 receipts + 45 payments + 47 expenses + 43 transfers); the other 255 are orders. UNK-011 RESOLVED.

---

## UXF-002 · Finance hub "Overview" segment mixes imported history into live KPIs — OPEN COMPLIANCE GAP (FACT-021, RISK-009)

- **Found by:** read-only repository trace, 2026-07-21 (owner-directed audit). NOT yet observed on a live screen — code-level finding.
- **What:** `GET /api/finance/summary` (Finance hub → Receipts tab → "Overview" segment; finance + admin roles) sums ALL CONFIRMED receipts and APPROVED payments with no `origin:'july-import'` filter — and imported records carry exactly those statuses. Money in / Money out / Net / Receipts / Payments counts therefore include July history (≈52,349.88 in / 35,380.38 out, 216 + 45 records) mixed with live figures.
- **Contrast (clean surfaces, code-verified):** owner home KPIs and Muhammed assistant (client appstate — structurally clean), driver/staff EOD and attention badges (explicit origin filters).
- **Status:** reported to owner per protocol BEFORE any fix; fix approach is an owner decision — TASK-027 (BLOCKED). No production code changed by this audit.

### Approved-in-principle UX requirement (future feature — TASK-026, build gated on separate owner approval)

USER CONFIRMED spec (owner directive message, 2026-07-21):
1. Label the Overview period explicitly: **"Live Operations / Since Go-Live"**.
2. Add a **"Historical Imported Data" card** showing: imported period, record count, revenue, collections, and import date.
3. Provide three views: **Live Operations** (default) · **Historical Import** · optional **Combined View**.
4. Imported history NEVER mixes into live KPIs unless the owner actively selects Combined View.

Traceability: TRACE-001 in ai/TRACEABILITY.md carries this finding's full chain (objective → rule → systems → implementation → validation).
