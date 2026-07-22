# TASK_QUEUE.md — unfinished work only

> **ORDERING** · Execution order and category live in `/ai/ROADMAP.md` (DEC-013); this file owns task detail + state only.
> **EVIDENCE (DEC-015)** · Task context lines must cite FACT/UNK/ASM/RISK ids where they exist; a task resting on a CONTESTED fact is BLOCKED until the contradiction resolves. Facts discovered while working a task are registered in FACT_REGISTER.md in the same PR.
> **FORMAT** · One task = one `###` block with a stable ID `TASK-###` (never reuse; next free ID at the top).
> Fields (exact names): `Status:` OPEN | CLAIMED | IN_PROGRESS | BLOCKED | REVIEW · `Owner:` agent/human id or `—` ·
> `Priority:` P1..P4 · `Created:`/`Updated:` ISO 8601 +04:00 · `Blocker:` · `Depends-on:` TASK/DEC ids · `Done-when:` acceptance criteria.
> **Claiming**: pull+rebase, set Status/Owner in ONE small commit (`docs(ai): claim TASK-0xx [skip render]`), push immediately. If your claim conflicts, the first-merged claim wins — pick another task.
> **Finishing**: move the block OUT of this file; record completion in STATUS.md + AGENT_LOG.md (same PR as the work). DONE tasks do not live here.
> Owner (Asif) inputs are tasks too — marked `Owner: owner`.

**Next free ID: TASK-032**

---

### TASK-001 · Opening staff cash floats (as at 1 Jul 2026)
Status: BLOCKED · Owner: owner · Priority: P1 · Created: 2026-07-20T21:00+04:00 · Updated: 2026-07-21T02:00+04:00
Blocker: owner to supply the 6 float amounts (Musthafa, Vansale-Haris, Office, Rashid, Asif, Dhanish)
Depends-on: — · Note: DEC-010 (Vansale-Haris stays main account; old Haris account set-off deferred)
Done-when: opening journal posted in Zoho (owner-confirmed), negative cash balances resolved, app opening advances issued matching bookkeeper figures (3-way reco documented in STATUS).

### TASK-002 · hybrid general trading receivable AED 9,399.60
Status: BLOCKED · Owner: owner · Priority: P1 · Created: 2026-07-20T21:00+04:00
Blocker: owner confirmation — paid (when/how/by whom) or genuinely due (INV2519 / Zoho INV-000049)
Done-when: receipt recorded in Zoho (if paid, owner-approved) or task closed as "due — collection target".

### TASK-003 · Verify WhatsApp voice notes live
Status: BLOCKED · Owner: owner→agent · Priority: P1 · Created: 2026-07-20T09:00+04:00
Blocker: owner re-opens the bot `health=voice` check URL; last check showed `groq_key_present:false`, secret since added but unverified
Done-when: check shows key present + HTTP 200, a real voice note transcribes end-to-end (verified in Supabase wa_messages), handbook updated (TASK-018).

### TASK-004 · Item-wise July sales report
Status: BLOCKED · Owner: owner · Priority: P2 · Created: 2026-07-20T21:00+04:00
Blocker: owner to upload the report from the old software
Done-when: per-product July analytics produced; feeds item enrichment workstream.

### TASK-005 · Old-dues customer credits AED 1,510.87 (9 receipts)
Status: BLOCKED · Owner: owner · Priority: P2 · Created: 2026-07-20T21:00+04:00
Blocker: owner decision — leave as customer credits (default) or offset/refund
Done-when: decision recorded in DECISIONS.md; any Zoho action owner-approved and executed.

### TASK-006 · INV2523 — "Urban nest" as customer (AED 720)
Status: BLOCKED · Owner: owner · Priority: P2 · Created: 2026-07-20T21:00+04:00
Blocker: owner call — purchase return (→ vendor credit) or genuine sale (→ create customer + invoice)
Done-when: corrected in Zoho per decision; held voucher resolved.

### TASK-007 · SLR225 — Palm Discount pre-July return (AED 35.99)
Status: BLOCKED · Owner: owner · Priority: P3 · Created: 2026-07-20T21:00+04:00
Blocker: owner call — manual Zoho UI entry vs settle outside books (Zoho refuses CN without invoice; recommended: outside books, note with Palm's old-balance credit 90.00)
Done-when: decision in DECISIONS.md, executed.

### TASK-008 · Vehicle-loan liability journals
Status: BLOCKED · Owner: CA (accountant) · Priority: P2 · Created: 2026-07-21T00:30+04:00
Blocker: loan figures from CA. Context: published OB-FIXEDASSETS-30JUN26 (983,997.04) notes loans to follow; Shanu Capital (~1,004,062 Cr) overstated until posted
Done-when: journals drafted, owner/CA-approved, posted; Shanu Capital corrected.

### TASK-009 · Supplier payables 907.71 — real or paid post-20-Jul?
Status: BLOCKED · Owner: owner · Priority: P3 · Created: 2026-07-20T21:00+04:00
Blocker: owner confirmation (Al sahab 621.57, Al Maha 285.30)
Done-when: payments recorded in Zoho if paid (owner-approved) or confirmed as open payables.

### TASK-010 · Supplier TRNs
Status: BLOCKED · Owner: owner · Priority: P3 · Created: 2026-07-19T00:00+04:00
Blocker: TRNs from suppliers · Done-when: 6 vendor records updated in Zoho (owner-approved write).

### TASK-011 · Al Maha customer/vendor contact merge
Status: BLOCKED · Owner: owner/Shanu · Priority: P3 · Created: 2026-07-16T00:00+04:00
Blocker: must be done in Zoho UI (merge direction invisible/uncontrollable via API)
Done-when: single contact remains; agent provides click-by-click guide on request.

### TASK-012 · Design + build daily app→Zoho sync
Status: OPEN · Owner: — · Priority: P2 (P1 once TASK-001 lands) · Created: 2026-07-21T00:00+04:00
Depends-on: DEC-007 (MUST exclude origin:'july-import'), DEC-011 (clientRef idempotency pattern)
Blocker: needs owner "go" on the design before any Zoho write path is built
Done-when: written design approved by owner; sync ships with idempotency + exclusion tests; first sync reconciles against app totals.

### TASK-013 · Barcode capture in field app
Status: OPEN · Owner: — · Priority: P3 · Created: 2026-07-21T00:00+04:00
Context: 0/1,490 Zoho items have barcodes; blocks image/enrichment workstream (other AI session)
Done-when: staff can scan a product barcode against a catalog item; export path for enrichment exists. Needs owner go.

### TASK-014 · Backups for /var/data → Supabase Storage (DEC-019)
Status: BLOCKED · Owner: owner · Priority: **P1 (risk)** · Created: 2026-07-21T02:00+04:00 · Updated: 2026-07-22T07:00+04:00
Context: single 1 GB Render disk = only copy of all business data + photos (RISK-001). Design approved (`ai/BACKUP_DESIGN.md`, all §8 decisions resolved). **Code built and merged** (`feature/task-014-backup-build`): `backend/src/backup/*` — nightly `@Cron` (02:00 Asia/Dubai), tar+AES-256-GCM encrypt, Supabase Storage upload/retention (14d/8w/6m, Dubai-local promotion — a UTC-day-boundary bug in the weekly/monthly promotion logic was caught and fixed in review, see AGENT_LOG), admin manual-trigger + status endpoints. `nest build` exit 0, 9/9 Jest green. Ships fail-safe: no-ops cleanly if unconfigured.
Blocker: **owner must provision Supabase-side resources** — a Storage bucket (e.g. `ntbf-backups`) in project `wvsgeumafnqelspcqivo` + a service-role key scoped to it — then set `BACKUP_ENCRYPTION_KEY`/`SUPABASE_URL`/`SUPABASE_SERVICE_KEY` in Render env (`ai/BACKUP_DESIGN.md` §8a). Until then the cron is live but inert (logs "not configured" nightly, no actual backups produced).
Depends-on: owner env provisioning above, THEN the restore drill (§6/§9)
Done-when: nightly encrypted backup landing in Supabase Storage (MCP-verified), retention active, and a SUCCESSFUL DOCUMENTED RESTORE DRILL demonstrated (logged in `ai/BACKUP_DESIGN.md` §9) — not before. Code being merged does NOT close this task.

### TASK-015 · Activate CI (build + tests + /ai docs check)
Status: OPEN · Owner: — · Priority: P2 · Created: 2026-07-21T02:00+04:00
Context: no CI exists; `docs/ci.workflow.txt` never wired; lint script broken; main auto-deploys ungated
Done-when: workflow runs on PRs (backend build, store.test.js, ai-docs conventions per /ai/templates/ai-docs-check.yml) + Playwright role-transition smoke (owner-approved 2026-07-21, bundled here from TASK-029); owner informed it does NOT gate Render.

### TASK-016 · Rotate seeded staff passwords + enforce first-login change
Status: OPEN · Owner: — · Priority: **P1 (security)** · Created: 2026-07-21T02:00+04:00
Context: real weak passwords in source (staff-auth.module.ts:56-61); CLAUDE.md marks rotation OVERDUE (also Zoho OAuth creds + PS history — owner-side)
Done-when: seeds neutralized (e.g. random on first boot, delivered to owner out-of-band), force-change flow shipped, owner rotates live passwords.

### TASK-017 · Fix stored-XSS vector in S-fed views
Status: OPEN · Owner: — · Priority: P2 (security) · Created: 2026-07-21T02:00+04:00
Context: esc() misses `>`; customer/product names interpolated unescaped in staff views (frontend audit §7.7)
Done-when: esc() complete, all S-fed interpolations escaped, verified with a hostile-name test.

### TASK-018 · Handbook v3 (voice notes, bilingual option, quick-start card)
Status: BLOCKED · Owner: — · Priority: P4 · Depends-on: TASK-003 · Created: 2026-07-20T09:00+04:00
Done-when: updated PDF delivered to owner.

### TASK-019 · Zoho hygiene: delete ZZ_TEST probe item, review 2 no-tax items
Status: BLOCKED · Owner: — · Priority: P4 · Created: 2026-07-21T00:00+04:00
Blocker: small Zoho write — needs owner ok · Done-when: cleaned, noted in log.

### TASK-020 · Harden JWT_SECRET handling (fail-fast, kill 'dev-secret' fallback)
Status: OPEN · Owner: — · Priority: P2 (security) · Created: 2026-07-21T02:00+04:00
Done-when: app refuses to boot in production without JWT_SECRET; single shared secret source; 11 fallback sites consolidated.

### TASK-021 · Lock down PUT /api/appstate
Status: OPEN · Owner: — · Priority: P2 (security) · Created: 2026-07-21T02:00+04:00
Context: whole shared dataset writable with only ApiGateGuard (open when PUBLIC_API_TOKEN unset) — audit §10.5
Done-when: staff JWT (or set token) required in prod without breaking sync.js clients; verified on device.

### TASK-022 · Remove System B (Prisma ERP) — decision made: DELETE (DEC-018)
Status: OPEN · Owner: — · Priority: P3 (sequenced after 014/016/020/021/015/012) · Created: 2026-07-21T02:00+04:00 · Updated: 2026-07-21T15:00+04:00
Context: owner approved retirement + removal (DEC-018), conditional on verified zero production dependencies; document anything historically valuable first (salvage note)
Done-when: dependency-verification evidence in the PR; salvage note committed; System B modules/routes removed; app boots + suite green.

### TASK-023 · Config/env hygiene — purge wrong Zoho org from repo configs
Status: OPEN · Owner: — · Priority: P3 · Created: 2026-07-21T04:30+04:00
Context: render.yaml + .env.example still ship org 170000198188 / .ae values (WRONG per DEC-003); latent trap for any future env rebuild (KNOWLEDGE §10.9)
Blocker: owner to confirm intended env values before edit (config touches deploy)
Done-when: no wrong-org value anywhere in repo; .env.example documents correct names (values env-only); owner confirms Render env matches.

### TASK-024 · Frontend consolidation bundle
Status: OPEN · Owner: — · Priority: P3 · Created: 2026-07-21T04:30+04:00
Context: bundled debt from audit — apiBase/headers duplicated across app.js call sites; legacy S-fed demo views (custody/cash/acash) wired but empty since DEC-009; catalog drift unguarded; Leaflet loaded from CDN (breaks offline)
Done-when: single apiBase/auth-headers helper; legacy views retired or hidden; catalog-drift guard added; Leaflet vendored or gracefully degraded; `node --check` + on-device verification; sw.js CACHE bumped (DEC-012).

### TASK-025 · AI Orchestrator — POSTPONED behind gates
Status: BLOCKED · Owner: — · Priority: P4 · Created: 2026-07-21T04:30+04:00
Blocker: gates G1–G5 in ROADMAP.md §3 (DEC-014) — do not build until ALL fire
Depends-on: TASK-014, TASK-015, TASK-012 (gates G2–G4)
Done-when: gates verified true in AGENT_LOG evidence; then scope per DEC-014 (queue-watcher over the SAME /ai files, read-only over production, all writes via PRs + owner gates).

### TASK-030 · Muhammed assistant: read-only "Pending Decisions" tool (owner feature)
Status: BLOCKED · Owner: — · Priority: P3 (Phase 3) · Created: 2026-07-21T15:00+04:00
Context: owner-approved concept — assistant gains a server-fed read-only view of pending owner decisions/tasks (from TASK_QUEUE + ping list) so "what's pending?" works in-app. Part of the Muhammed → intelligent business assistant evolution.
Blocker: Phase 3 opening + owner go on design
Done-when: admin-role tool returns the current pending/decision list read-only; no write path; trace chain complete.

### TASK-031 · Owner training program — 5 end-to-end business scenarios
Status: OPEN · Owner: claude-muhammed · Priority: P2 (after handover doc) · Created: 2026-07-21T15:00+04:00
Context: owner-commissioned training (owner directive 2026-07-21): teach the business through the software — WhatsApp → App → Backend → Zoho, with realistic data. Scenarios: (1) WhatsApp order→delivery→Zoho; (2) van sale cash→EOD reco→Zoho; (3) credit sale→payment→reco; (4) supplier purchase→stock→payment; (5) return/damage→inventory+financial impact. Each: customer view, staff actions, app automation, DB writes, Zoho entries, accounting/inventory impact, reports, audit trail, common mistakes, validation checks, independent owner verification.
Done-when: training document delivered (ai/ or PDF per owner preference) + owner walks scenarios live; treated as owner training, not software docs.
