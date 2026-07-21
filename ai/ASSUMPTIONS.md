# ASSUMPTIONS.md — working assumptions pending validation

> **PROTOCOL (DEC-015)** · Every ASSUMED-level statement lives here with a named validation owner and what invalidates it. Assumptions may support work but must be flagged wherever used (`per ASM-###`). When validated → promote to FACT_REGISTER (VERIFIED or USER CONFIRMED) and close here; when invalidated → close AND open/flag the affected conclusions as CONTESTED.
> IDs `ASM-###` stable, never reused. Next free ID: **ASM-004**

| ID | Assumption | Why assumed | Validation owner / method | Invalidated-by | Status |
|---|---|---|---|---|---|
| ASM-001 | Render live environment variables point to the correct Zoho org (928751913/.com), i.e. the wrong values exist ONLY in render.yaml/.env.example (FACT-004), not in the live env | Live env is not inspectable from sessions; only repo configs were audited | owner: view Render dashboard env → promote to USER CONFIRMED (also closes part of TASK-023) | Render env showing 170000198188/.ae values | OPEN |
| ASM-002 | The six old-software July reports used for the Zoho migration were complete (no vouchers existed outside them) | Internal cross-report reconciliation passed (FACT-005) but completeness vs reality is unprovable from the reports themselves | owner: confirm no other July record source existed → USER CONFIRMED | any July voucher surfacing outside the imported set | OPEN |
| ASM-003 | Single-instance backend (no horizontal scaling; file-store locking model) is sufficient for current business load | Team-of-~6 scale documented; no load test on record | agent: capture baseline latency/size metrics when TASK-014 backup work touches /var/data; owner accepts | observed contention/latency incidents in production | OPEN |
