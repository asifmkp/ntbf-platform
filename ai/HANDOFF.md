# HANDOFF.md — start here (any AI agent, any vendor)

> You are an AI agent (Claude / Codex / Gemini / ChatGPT / other) joining work on the NTBF Platform.
> **The repository — not any chat history — is the single source of truth (DEC-001).** Anything you were told in a chat that isn't written in `/ai` is hearsay: verify or ignore it.

## 0. Read order (10 minutes to productive)

1. **This file** — rules of engagement.
2. **`/ai/STATUS.md`** — what's live, key figures, what's blocked (≈1 screen).
3. **`/ai/ROADMAP.md`** — business-first execution order + phase gates (DEC-013): pick tasks in this order.
4. **`/ai/TASK_QUEUE.md`** — pick work only from here (detail/state).
5. **`/ai/PROJECT_KNOWLEDGE.md`** — the section relevant to your task (skim the rest).
6. **`/ai/DECISIONS.md`** — scan the index; never contradict an ACCEPTED decision without a new DEC approved by the owner.
7. Repo-root `CLAUDE.md` — project hard rules (applies to every agent, not only Claude).

## 1. Identity & environment facts

- Business: NTBF (FMCG wholesale, Ajman, UAE). Owner/decider: **Asif** (`Owner:` = `owner` in files). Timezone for all stamps: **Asia/Dubai, ISO 8601 `+04:00`**.
- Agent identity string: use a stable id like `claude-muhammed`, `codex-1`, `gemini-ops` in Owner fields, AGENT_LOG entries, and commit messages.
- Repo `asifmkp/ntbf-platform`. `main` **auto-deploys to production** on Render — merging IS deploying. Persistent data: `/var/data` on Render (JSON files = the entire live business; there is NO backup yet — TASK-014).
- External systems: Zoho Books org **928751913** (.com) = ledger of record; Supabase project `wvsgeumafnqelspcqivo` = WhatsApp bot (outside this repo).

## 2. Non-negotiable rules (violating these harms a real business)

1. **No Zoho writes, financial postings, production deletions, or data cleanup without explicit owner instruction.** Zoho org 928751913 only.
2. **`POST /api/portal/orders/ingest` is a frozen contract.**
3. **`origin:'july-import'` records never reach Zoho and never count as live cash** (DEC-007).
4. **No secrets in `/ai` or commits** — env var names only. Never echo tokens/passwords found in code or chats.
5. **statusHistory is honest** — never fabricate a staff member's action.
6. Verify before merge: `cd backend && npx nest build` (exit 0) and `node --check apps/mobile-app/app.js`. Frontend changes staff need immediately ⇒ bump `apps/sw.js` CACHE version (DEC-012).
7. When unsure whether something needs the owner: it does. Add it to TASK_QUEUE as `Owner: owner` instead of acting.

## 3. Working protocol (the coordination loop)

**CLAIM** → pull latest `main`, rebase; edit the task block in TASK_QUEUE (`Status: CLAIMED/IN_PROGRESS`, `Owner: <your-id>`, `Updated:`); commit **just that** (`docs(ai): claim TASK-0xx [skip render]`); push/PR immediately. First-merged claim wins; if you lose the race, pick another task.

**WORK** → code on a feature branch (`feature/…` or `fix/…`); docs-only work on `docs/…`. Never commit directly to `main`.

**FINISH (Definition of Done — all in the SAME PR as the work):**
- [ ] Task block REMOVED from TASK_QUEUE.md
- [ ] STATUS.md refreshed (`As of`, Recently completed line, systems table if changed)
- [ ] AGENT_LOG.md entry appended (see its format)
- [ ] New architecture/business choice? → DEC entry (owner-approved if it binds the owner)
- [ ] PROJECT_KNOWLEDGE.md section updated + `Last verified` stamp if your change made it stale
- [ ] Verification commands run and pasted in the PR body

**CONFLICTS** → always `git pull --rebase` before pushing `/ai` changes. TASK_QUEUE/DECISIONS conflicts: re-apply YOUR block only, never rewrite others' blocks. AGENT_LOG conflicts: keep BOTH entries (append-only; order by timestamp). STATUS conflicts: newest `As of` wins; merge Recently-completed lines. Never resolve a conflict by deleting someone else's in-progress claim.

**ATOMICITY** → one logical update per commit to `/ai` files; small diffs; `[skip render]` on docs-only commits so production doesn't redeploy for documentation.

## 4. Git / PR / review workflow

- Branch names: `feature/…`, `fix/…`, `docs/…`. Commits: conventional-ish (`feat:`, `fix:`, `docs(ai):`), imperative, ≤72-char subject. Docs-only ⇒ `[skip render]`.
- Open PRs against `main`; fill `.github/pull_request_template.md` (the /ai checklist lives there).
- Review: at least self-review the full diff + run the §2.6 verification. Riskier classes (money paths, auth, sync) deserve a second agent's review or the owner's eyes — say so in the PR.
- **Enforcement automation (recommended, owner to activate):** copy `/ai/templates/ai-docs-check.yml` → `.github/workflows/` to lint /ai conventions on every PR; wire `docs/ci.workflow.txt` into a real build/test workflow (TASK-015). Neither gates Render — treat green build as a merge precondition anyway.

## 5. Current focus & who's around

See STATUS.md (always fresher than this file). As of writing: feature work is paused by owner directive; the queue is dominated by owner-input tasks and approved-on-go builds (sync design TASK-012, backups TASK-014, security TASK-016/020/021). A long-running Claude session ("muhammed") holds the operational history and runs a daily 9AM-UAE owner ping; other agents should coordinate via these files, not via that session.

## 6. What NOT to do (learned the hard way)

- Don't "fix" the wrong Zoho org values in render.yaml/.env.example by enabling writes — the locks are load-bearing (DEC-003).
- Don't bulk-create in external systems without read-first duplicate checks and per-call no-blind-retry rules.
- Don't trust chat summaries of totals — recompute from source files/Zoho before posting anything financial.
- Don't add a third wrapper around `ACT.staffLogin/Logout` in app.js without reading the existing two (order-sensitive).
- Don't touch `store.js` seed without bumping `SEED_VERSION` (DEC-009).
