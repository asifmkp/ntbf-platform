## What & why

<!-- One paragraph. Link the task: TASK-0xx (and DEC-0xx if this implements a decision). -->

Task: TASK-___

## Verification (paste real output/results)

- [ ] `cd backend && npx nest build` → exit 0
- [ ] `node --check apps/mobile-app/app.js` → OK (if app.js touched)
- [ ] Frontend change staff need now → `apps/sw.js` CACHE bumped (DEC-012)
- [ ] Feature exercised end-to-end (describe how; local boot for backend, device/preview for UI)

## /ai coordination (Definition of Done — HANDOFF.md §3)

- [ ] TASK_QUEUE.md: my task block removed (or Status updated if partial)
- [ ] STATUS.md refreshed (As of + Recently completed)
- [ ] AGENT_LOG.md entry appended
- [ ] DECISIONS.md: new DEC added (only if an architecture/business choice was made) — N/A ☐
- [ ] PROJECT_KNOWLEDGE.md updated + `Last verified` stamp (only if this change made it stale) — N/A ☐

## Safety checklist

- [ ] No Zoho writes / financial postings / deletions beyond what the owner explicitly approved
- [ ] `origin:'july-import'` exclusion respected (DEC-007) — N/A ☐
- [ ] No secrets in the diff (env var names only)
- [ ] Remember: merging to `main` deploys to production
