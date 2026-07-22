# BACKUP_DESIGN.md — TASK-014 design (nightly /var/data → Supabase Storage)

> Status: **DESIGN — awaiting owner approval before build** (per DEC-019: "Implementation must present BEFORE build ... A backup is complete ONLY after a successful, documented restore drill.")
> Owner of this doc: claude-openclaw (session, 2026-07-22). Supersedes nothing; implements DEC-019.

## 1. Scope — what gets backed up

Everything under `STATE_DIR` (`/var/data` in production; `render.yaml` mounts a 1 GB persistent disk there). Concretely, `STATE_DIR/data/` holds the **entire live business**, per current `path.join(process.env.STATE_DIR, 'data', ...)` call sites (14 across `backend/src/**`):

- JSON stores: `appstate.json` (shared field-app state — customers, orders, products, payments, cash, requisitions, POs, GRNs, renewals, EOD), `customers.json` (portal accounts), `staff.json`, `muhammed-log.json`, `suggestions.json`, `expenses.json`, `advances.json`, `audit-log.json`, `audit-export.json`, plus any finance store file(s) under `finance.module.ts`'s dynamic `fileName`.
- Photo/document subdirectories: `finance-bills/`, `expense-bills/` (bill/receipt photos referenced by `billPhoto` fields).

Design principle: back up the **whole `STATE_DIR/data/` tree**, not an enumerated file list. New JSON stores get added as features ship (e.g. `rashid` module added `expenses.json`/`advances.json` after the original set) — an allow-list would silently miss the next one. A directory-level archive has no such gap.

**Out of scope:** application code (in git already), Zoho data (backed up by Zoho itself, system of record), Supabase WhatsApp-bot data (separate system, own backup surface — not this repo).

## 2. Architecture

**Nightly scheduled job, inside the existing NestJS backend process** (no new service to operate):

- A `BackupService` (new, `backend/src/backup/`) registered with `@nestjs/schedule`'s `@Cron()` — the backend already runs as a single long-lived Render Starter instance, so an in-process cron avoids standing up separate infrastructure. Schedule: nightly at a low-traffic UAE hour (e.g. `0 2 * * *` Asia/Dubai ≈ 22:00 UTC — after EOD/driver cash-handover activity, before next business day).
- Steps per run: (1) `tar` the `STATE_DIR/data/` directory into a single archive in a scratch dir on the same disk, (2) encrypt the archive (§3), (3) upload to Supabase Storage via the Storage REST API (`PUT /storage/v1/object/{bucket}/{path}`) using `fetch` — no new heavy SDK dependency needed for a single upload call, (4) delete the local scratch archive, (5) apply retention (§4) by listing and deleting expired objects via the Storage REST API, (6) write a structured result (success/failure, size, duration, object path) to the existing `audit-log.json` via `AuditStore` (reuse, don't invent a second log) and to a small `backups.json` status file (last-N run summaries) so `/api/admin/*` can surface "last successful backup: <date>" without needing Supabase creds client-side.
- Failure handling: on any step failure, log to `audit-log.json` with `severity: error` and leave the previous night's backup untouched (never delete an old backup before the new one is confirmed uploaded — see §4). No silent failures: a failed run is a visible, queryable record.
- Manual trigger: an admin-only, `@Public()`-gated-by-`StaffAuthGuard` endpoint (`POST /api/admin/backup/run`, admin role only, mirroring the `assertAdmin` pattern already used in `muhammed.controller.ts`) to run a backup on demand — needed for the restore-drill verification in §6 without waiting for the nightly schedule.

**Bucket/project:** reuse the **existing** Supabase project already trusted by this system — `wvsgeumafnqelspcqivo` (the WhatsApp-bot project, per `ai/HANDOFF.md` §1 and FACT-011) — rather than provisioning a new Supabase project. Rationale: DEC-019 says "Option 1 — existing vendor, MCP-verifiable"; a second Supabase project would mean a second set of credentials to manage for marginal isolation benefit, and Storage buckets are already namespace-isolated from the bot's Postgres tables. A new bucket `ntbf-backups` (private, not public) inside that project keeps blast radius contained to Storage-API-scoped credentials.
**Owner decision needed (flagged in §8):** confirm reusing the WhatsApp-bot Supabase project is acceptable, vs. provisioning an isolated project. Both are compatible with DEC-019's "Option 1"; this doc recommends reuse for lower operational overhead.

## 3. Encryption

- **At rest in Supabase Storage:** Supabase Storage encrypts at rest by default (platform-level, AES-256) — this covers "data at rest on the vendor," but DEC-019's "encryption approach" is about *our* control over confidentiality independent of vendor trust (the backup contains bill photos, expense records, staff data — full business data).
- **Application-level encryption before upload:** encrypt the tar archive with a symmetric key before it ever leaves the Render box, using Node's built-in `crypto` (AES-256-GCM — authenticated encryption, no extra dependency). Key stored as a new Render env var `BACKUP_ENCRYPTION_KEY` (32-byte, generated once via `openssl rand -hex 32`, entered directly into Render — never in the repo, matching the existing secrets convention). This means a compromised Supabase Storage credential alone cannot read historical backups — the decryption key lives only in Render env + wherever the owner keeps an out-of-band copy for disaster recovery (see §8: key escrow is an open question, since if Render itself is lost, the key must be recoverable from somewhere else).

## 4. Retention

- **Daily backups:** keep last 14 nightly archives.
- **Weekly backups:** keep last 8 (promote the Sunday-night daily to a `weekly/` prefix instead of duplicating storage).
- **Monthly backups:** keep last 6 (promote the 1st-of-month nightly to a `monthly/` prefix).
- Total steady-state count: ~28 archives. At the growth estimate in §7 (small JSON + a growing photo set, currently well under the 1 GB disk cap), this stays inside Supabase's free-tier storage easily — consistent with DEC-019's "~free at ≤1GB" framing.
- **Never delete the most recent successful backup**, even if retention math would otherwise expire it — a broken retention rule must not leave zero recoverable backups.
- Pruning runs as the last step of the nightly job (§2), operating only on objects whose upload was previously confirmed (never guesses).

## 5. Restore procedure

Documented, human-executable steps (no fully-automated restore in this design — the disaster scenario is rare enough that a documented manual procedure, verified once by drill, is the right tradeoff over building/maintaining an automated restore path):

1. Identify the target archive in Supabase Storage (`ntbf-backups/daily|weekly|monthly/<timestamp>.tar.enc`) via the Supabase dashboard or Storage API.
2. Download the archive locally (or to a scratch Render shell if restoring in place).
3. Decrypt with `BACKUP_ENCRYPTION_KEY` (a small documented one-liner using Node `crypto` — the same routine the backup job uses, exposed as a CLI script `backend/scripts/restore-backup.ts` so the decrypt logic isn't hand-typed under pressure).
4. Extract the tar archive.
5. **If restoring to a fresh disk/instance:** stop the backend, replace `STATE_DIR/data/` with the extracted contents, restart. **If restoring individual files** (e.g. one corrupted JSON store): extract only the needed file, back up the current (possibly-corrupt) copy alongside it with a `.pre-restore` suffix (never overwrite blind), then replace.
6. Verify: hit `/api/dashboard/health` and a handful of read endpoints (`/api/appstate`, `/api/admin/*` summaries) to confirm the app boots and data looks sane; compare record counts against the pre-incident audit-log snapshot if available.
7. Log the restore event in `audit-log.json` and `ai/AGENT_LOG.md` (who, when, why, what was restored, verification result).

## 6. Disaster-recovery test plan (the drill that defines "done" per DEC-019)

TASK-014 is explicitly **not done** until this drill has run successfully and is documented:

1. Trigger a manual backup via `POST /api/admin/backup/run` against the live system (read-only from the app's perspective — a backup run never mutates `STATE_DIR/data/`).
2. Confirm the archive lands in Supabase Storage (MCP-verifiable per DEC-019 — list the bucket via Supabase MCP and confirm the new object, size, and timestamp).
3. In an **isolated environment** (a local checkout with a scratch `STATE_DIR`, or a disposable Render instance — never the live production disk), run the restore procedure (§5) end-to-end against that backup.
4. Boot the backend against the restored `STATE_DIR/data/` and verify: app starts clean, `/api/dashboard/health` green, spot-checked record counts match what was backed up (e.g. order count, staff count), no corruption.
5. Time the drill (upload confirm → restore-verified) to get a real RTO figure instead of an assumed one.
6. Document the drill: date, operator, archive used, steps followed, verification results, timing — appended to this file (§9) and `ai/AGENT_LOG.md`, and only then can TASK-014's Done-when be marked complete.

## 7. Storage growth estimate

**VERIFIED (FACT-034, 2026-07-22, owner-run Render Shell):** the live `/var/data` mount (`/dev/nvme15n1`, 973.4M capacity) is at **0% utilization — 716.0K used, 956.7M available.** This is ~3 weeks post-restart (business restarted 1 Jul 2026), so it's an early-curve reading, not a full-year trend — but it settles the operationally important question: **current usage poses no near-term capacity concern**, against either the 1 GB disk or Supabase Storage's free tier holding ~28 retained archive copies.

Per-subdirectory breakdown (`finance-bills/` vs `expense-bills/`) was not captured — the measurement commands were run from `/app/backend` (the app code directory: 165.2M, mostly `node_modules`) instead of `/var/data/data`, so `du`/`find` there measured the wrong tree. At 716K total, this breakdown is low-value right now (there's very little to break down) — not worth a second round trip before build, but worth a precise pass once volume grows (see re-measure note below).

**Original reasoned estimate (ASM-004, still open as a rate — not disproven, just not yet trend-confirmed):** JSON stores stay small (single-digit MB even at scale); photo directories (`finance-bills/`, `expense-bills/`) are the real long-term driver — reasoned at ~250–750 MB/year once the business is at steady-state document volume. The 716K reading is consistent with "very early on this curve," not with the estimate being wrong.
**Action:** re-measure `/var/data/data` (correct path this time) in 1–2 months once more order/expense volume has accumulated, to fit an actual growth rate instead of a single point-in-time reading. Not a blocker for starting the build.

## 8. Owner decisions (2026-07-22 — RESOLVED, build unblocked)

1. **Bucket/project choice:** ✅ reuse the existing WhatsApp-bot Supabase project (`wvsgeumafnqelspcqivo`) with a dedicated backup bucket, per the recommendation in §2.
2. **Key escrow:** ✅ `BACKUP_ENCRYPTION_KEY` stored as (a) a Render environment variable, and (b) an offline copy in the team's password manager (1Password, or Bitwarden if that's the standard) — so a Render-loss disaster doesn't also make backups undecryptable.
3. **Nightly schedule time:** ✅ 02:00 Asia/Dubai, as proposed in §2.

All three open questions are resolved — nothing further blocks starting the build (BackupService, cron, encryption, upload/retention, admin trigger endpoint) per §2–§6 of this doc.

## 9. Drill log (append after each restore drill — empty until the first drill runs)

*(none yet — TASK-014 is not done until an entry appears here)*
