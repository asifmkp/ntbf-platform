# UX_AUDIT.md — owner-facing UX findings & rulings

> **Scope note (honest):** the full new-staff live UX audit the owner once commissioned was superseded before execution and has NOT been performed — this file does not pretend otherwise. It records owner-observed UX findings and their rulings, one entry per finding, under the DEC-015 evidence protocol.
> IDs `UXF-###` stable. Next free ID: **UXF-006**

---

## UXF-001 · Owner Overview: live vs historical data discrepancy — RESOLVED BY RULE

- **Observed:** during go-live the owner experienced the Overview/dashboard as ambiguous about what is "live" — historical/imported figures risked reading as current activity. Discrepancy existence: USER CONFIRMED (owner directive message, 2026-07-21, which declares it "now resolved by this rule").
- **Ruling that resolves it:** **FACT-016** — Owner Overview represents current live operational activity only; historical imports (including July) remain available for reporting, reconciliation and audit but must not make live KPIs appear active.
- **Current technical state (context):** Overview KPI tiles are already live-only by construction — July history entered server stores only, tagged `origin:'july-import'`, excluded from client KPI dataset (DEC-008, FACT-008). The gap the rule addresses is *presentation*: nothing labels the period or surfaces the historical data deliberately.
- **Status:** rule recorded and ACTIVE. *Change history: 2026-07-21 — rule subsumed into the authoritative platform standard FACT-026 (DEC-017); UI IMPLEMENTED same day under owner "GO 026+027" (FACT-027, sw.js v17): Live-Operations label, Historical Imported Data card, Live/Historical/Combined switcher. Owner live-screen validation pending (TRACE-001).*
- **Live-audit evidence (2026-07-21, FACT-018):** owner's live session (app.ntbfllc.com/mobile-app/, Owner → Documents) showed 351 imported records, AED 159,692.26 total, categorised expenses/receipts/payments/transfers/advances, with imported July references visible — confirming historical records are accessible in Documents as the rule requires. **Deliberately NOT asserted:** that imported records never affect any live KPI — that end-to-end check is pending (UNK-011).
- **Live-audit evidence (2026-07-21, FACT-019):** Owner → Muhammed assistant, read-only suggestion "Today's sales" → Orders 0 / Revenue 0 / Collected 0 / Outstanding 0 while July history stayed in Documents — the assistant reflected zero live activity and did not surface imported history in this query. Structural cause verified in code (assistant reads client appstate, which July never entered — DEC-008).
- **Reconciliation closed (FACT-020):** Documents' 351 / AED 159,692.26 = exactly the four non-order money categories of the 606-record backfill (216 receipts + 45 payments + 47 expenses + 43 transfers); the other 255 are orders. UNK-011 RESOLVED.

---

## UXF-002 · Finance hub "Overview" segment mixes imported history into live KPIs — OPEN COMPLIANCE GAP (FACT-021, RISK-009)

- **Found by:** read-only repository trace, 2026-07-21 (owner-directed audit). NOT yet observed on a live screen — code-level finding.
- **What:** `GET /api/finance/summary` (Finance hub → Receipts tab → "Overview" segment; finance + admin roles) sums ALL CONFIRMED receipts and APPROVED payments with no `origin:'july-import'` filter — and imported records carry exactly those statuses. Money in / Money out / Net / Receipts / Payments counts therefore include July history (≈52,349.88 in / 35,380.38 out, 216 + 45 records) mixed with live figures.
- **Contrast (clean surfaces, code-verified):** owner home KPIs and Muhammed assistant (client appstate — structurally clean), driver/staff EOD and attention badges (explicit origin filters).
- **Status:** RESOLVED — owner chose "GO 026+027"; /api/finance/summary now defaults live-only with explicit historical/combined views, regression-tested (FACT-027). RISK-009 closed. Owner live-screen validation pending (TRACE-001).

---

## UXF-003 · Salesman Online → "Completed (255)" filled by imported history — RULE CONFIRMED (FACT-022/023)

- **Observed (owner, live, 2026-07-21 — FACT-022):** Salesman role: Sales Home today-KPIs zero (clean ✓); Sales → Online: Incoming (0), **Completed (255)** — populated by July imports (e.g. ORD-1277, "Delivered", "1× July 2026 sale — INV…").
- **Ruling (FACT-023, USER CONFIRMED):** Completed defaults to Live Operations only; imported orders never in the default operational list; accessible via a dedicated "Historical Import" filter/view; optional clearly labelled Combined View. Rationale: history serves audit/reconciliation/migration-validation/reporting, not day-to-day workload.
- **Mechanism (FACT-025):** client buckets the unfiltered `/api/portal/orders/all` feed by status; imports are all DELIVERED → they own the Completed bucket.
- **Status:** RESOLVED — orders feed defaults live-only server-side; salesman Online gained Live/Historical Import/Combined labelled views (FACT-027). Owner live-screen validation pending (TRACE-001).

## UXF-004 · Driver landing dashboard reports "Delivered 255" from imported history (FACT-024, RISK-010)

- **Observed (owner, live, 2026-07-21 — FACT-024):** Delivery driver role: Stops left 0 ✓ · **Delivered 255** ✗ · Cash to collect AED 0.00 ✓ · Your stops (0) ✓.
- **Mechanism (FACT-025):** the route view's Delivered KPI counts ALL DELIVERED orders in the same unfiltered feed (`app.js:276`) — the 255 imports are today the only DELIVERED records, so history reads as current delivery performance. The stops list and cash tiles are OUT_FOR_DELIVERY-scoped, hence correct zeros. Driver Collect/EOD tabs are safe via the server EOD override (origin-filtered), but the legacy unfiltered view functions remain as dead code (latent risk noted in FACT-025/RISK-010).
- **Status:** RESOLVED — the live-default feed makes the driver Delivered tile live-only automatically (FACT-027). Latent dead-code note stands (FACT-025). Owner live-screen validation pending (TRACE-001).

### Approved-in-principle UX requirement (future feature — TASK-026, build gated on separate owner approval)

USER CONFIRMED spec (owner directive message, 2026-07-21):
1. Label the Overview period explicitly: **"Live Operations / Since Go-Live"**.
2. Add a **"Historical Imported Data" card** showing: imported period, record count, revenue, collections, and import date.
3. Provide three views: **Live Operations** (default) · **Historical Import** · optional **Combined View**.
4. Imported history NEVER mixes into live KPIs unless the owner actively selects Combined View.

Traceability: TRACE-001 in ai/TRACEABILITY.md carries this finding's full chain (objective → rule → systems → implementation → validation).

---

## UXF-005 · Finance hub Receipts/Payments/Transfers lists show imported history by default — POST-DEPLOY CONTRADICTION (FACT-028/029, RISK-011)

- **Observed (owner, live, 2026-07-21, post-PR-#31):** Finance tab opens Receipts segment: To approve 0 · To confirm 0 · **Done 40 / Recent (40)** filled with July imported receipts (Zahrat Al Reef 278.00/80.00, Al Karam 2,399.98, Rubel Grocery 1,559.88 …), no view control/labels. Landing KPIs zero ✓. Sales + Driver post-deploy regressions PASSED.
- **Root cause (FACT-029):** the finance segment LIST endpoints (`/api/finance/receipts`, `/payments`, `/transfers/mine`) predate the view convention and were outside PR #31's scope AND its regression suite — the suite tested the summary KPIs and orders feed, not these lists. Client caps "Recent" at 40, exactly matching the observed counts. Actionable queues are structurally clean (imported records are terminal).
- **Provenance:** the observed rows trace to backfill refs RCV2093/RCV2033/RCV2087/RCV2031 — "these are imported" upgraded from INFERRED to VERIFIED.
- **Status:** RESOLVED — owner chose "GO 028 A"; all finance list endpoints now live-default with labelled controls (FACT-030, v18, suite 32/32 ×2). TRACE-001 Business Validation remains PENDING until the owner's live re-check + Codex cross-role audit.
