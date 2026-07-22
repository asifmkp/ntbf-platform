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

**Known, VERIFIED inputs:** Render disk capacity 1 GB (`render.yaml`); `STATE_DIR/data/` holds JSON stores (small — text, typically single-digit MB even at thousands of records) plus two photo directories (`finance-bills/`, `expense-bills/`) whose growth tracks document-capture and expense-claim volume.

**Not currently measurable from this session** — no MCP/shell access to the live Render disk in this session (unlike the "claude-muhammed" long-running session, which may have it). This is recorded as an open unknown (§8) rather than guessed.

**Reasoned estimate (ASSUMED, ASM — needs promotion to VERIFIED before the growth curve is trusted for capacity planning):** JSON stores are unlikely to exceed tens of MB even at a full year of order/expense volume for a 4–6-person team (each order/expense record is a few hundred bytes to ~1 KB of JSON). Photo directories are the real driver — if bill/expense photos average ~200–500 KB each (typical phone-camera JPEG, possibly pre-compressed client-side) and the business captures on the order of a few dozen documents/week, that's roughly 5–15 MB/week, or **~250 MB–750 MB/year** — within the 1 GB disk itself, and well within Supabase Storage's free tier even holding ~28 retained archive copies, *provided archives compress reasonably* (JSON compresses well; JPEGs don't compress much further, so archive size ≈ live disk size, not smaller).
**Action before build:** capture a real `du -sh /var/data/data` (and a breakdown of `finance-bills/` + `expense-bills/` specifically) via Render shell or MCP as the first step of implementation, to replace this estimate with a VERIFIED figure and confirm the free-tier ceiling isn't already close.

## 8. Open questions for owner sign-off (before build starts)

1. **Bucket/project choice** (§2): reuse the WhatsApp-bot Supabase project (`wvsgeumafnqelspcqivo`), or provision an isolated project for backups? (Recommendation: reuse.)
2. **Key escrow** (§3): `BACKUP_ENCRYPTION_KEY` lives in Render env. If Render itself is lost (the disaster this whole task defends against), where does the owner keep a second copy of that key so backups remain decryptable? (Recommendation: owner stores it in a password manager or equivalent outside Render — needs an explicit owner answer, this is the one place where losing a secret means losing everything.)
3. **Nightly schedule time** (§2): 02:00 Asia/Dubai proposed (after EOD/cash handover) — confirm no conflicting nightly job (e.g. the existing Supabase `pg_cron` WhatsApp reminder job runs 04:00 UTC / 08:00 UAE — different system, no conflict, noted for awareness).
4. **Real disk-usage figure** (§7) — needs MCP/shell access this session doesn't have; flag for whichever agent/owner can run `du -sh` against the live disk before implementation starts.

## 9. Drill log (append after each restore drill — empty until the first drill runs)

*(none yet — TASK-014 is not done until an entry appears here)*
