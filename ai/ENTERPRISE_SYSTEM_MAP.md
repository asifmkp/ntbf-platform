# ENTERPRISE_SYSTEM_MAP.md — systems, integrations, ownership

> **PROTOCOL (DEC-015)** · One block per system. Every field cites a FACT/UNK/ASM ID or is explicitly **UNKNOWN** — an UNKNOWN field is never filled by guesswork; resolving it goes through UNKNOWNS.md → FACT_REGISTER.md. Integration rows list transport, auth, and failure/recovery behavior.
> Last updated: 2026-07-21T06:00+04:00 · by claude-muhammed. System IDs `SYS-##` stable.

## Systems

### SYS-01 · NTBF Field App + Backend (app.ntbfllc.com)
- **What:** staff PWA (vanilla JS) + NestJS backend, System A file-store architecture (FACT-001)
- **Hosting:** Render, auto-deploy from `main` (FACT-002) · **Data:** /var/data JSON stores — SOURCE OF TRUTH for live operational records (orders, receipts, expenses, advances, staff) (FACT-001, FACT-006)
- **Auth:** staff JWT (StaffAuthGuard); seeded passwords unrotated (FACT-007); appstate gate depends on PUBLIC_API_TOKEN (FACT-015, UNK-001)
- **Failure recovery:** **NONE — no backup of /var/data (FACT-006, RISK-001).** Restore procedure: does not exist.
- **Human owner:** Asif (business); agent maintainers via /ai protocol
- **Monitoring/alerting:** UNKNOWN (none documented)
- **Data-view semantics (FACT-016, USER CONFIRMED):** Owner Overview = current LIVE operational activity only. Records tagged `origin:'july-import'` (FACT-008) are historical: available for reporting/reconciliation/audit views, excluded from live KPIs, and may appear combined with live figures only when the owner explicitly selects a Combined View (future TASK-026; UX spec in ai/UX_AUDIT.md UXF-001). Live-audit evidence (FACT-018, 2026-07-21): Owner → Documents observed showing 351 imported records / AED 159,692.26 across the five money categories with July references — historical availability confirmed; KPI non-mixing end-to-end verification still pending (UNK-011)

### SYS-02 · Zoho Books org 928751913 (.com)
- **What:** ledger of record — SOURCE OF TRUTH for accounting/VAT (FACT-003); July 1–20 imported and reconciled (FACT-005)
- **Auth:** OAuth via the 7-server NATIONAL MCP connector suite (FACT-013); org-level connector auth state UNKNOWN (UNK-008)
- **Failure recovery:** Zoho SaaS-managed (vendor). Data-entry recovery = re-post from app/records; no automated sync yet (TASK-012)
- **Human owner:** Asif + Shanu (books); CA for statutory items (UNK-005)
- **Zoho-side users/roles:** UNKNOWN

### SYS-03 · WhatsApp Bot (Supabase project wvsgeumafnqelspcqivo)
- **What:** edge function `whatsapp-webhook` v41, customer + staff routing; source lives OUTSIDE this repo (FACT-011) — repo copy is a scratch snapshot only
- **Data:** `wa_messages` et al. in Supabase Postgres — SOURCE OF TRUTH for chat history
- **Auth:** Meta WhatsApp webhook → edge function (verify_jwt false per deploy config, FACT-011 context); secrets in Supabase env (names only: ANTHROPIC_API_KEY, GROQ_API_KEY)
- **Failure recovery:** Supabase-managed DB; function redeploy from last source. Voice path health UNVERIFIED (UNK-002)
- **Human owner:** Asif · **Code canonical location:** UNKNOWN (no VCS for the edge function is documented — gap)

### SYS-04 · GitHub `asifmkp/ntbf-platform`
- **What:** SOURCE OF TRUTH for code + all AI coordination (/ai, DEC-001)
- **Auth:** GitHub MCP connector (FACT-013) · **CI:** none (FACT-002, RISK-004) · **Webhooks:** PR-activity subscriptions per session (FACT-013 context)
- **Failure recovery:** git history + GitHub SaaS
- **Human owner:** Asif (repo owner); merges = production deploys (FACT-002)

### SYS-05 · Claude account layer (claude.ai + Claude Code)
- **What:** 17 connectors / 18 plugins / 10 skills / 2 cloud environments / 1 daily Routine (9:00 UAE ping) (FACT-013); sandbox cannot reach production app (FACT-014)
- **Auth:** account asifmkp82@gmail.com; connector org-auth state UNKNOWN (UNK-008); UI feature state (Projects/Memory/team/betas/plan) UNKNOWN (UNK-009)
- **Failure recovery:** stateless — durable knowledge lives in this repo (DEC-001); session loss costs context only
- **Human owner:** Asif

### SYS-06 · Old bookkeeping software (retired)
- **What:** pre-July system; numbers kept as reference only via `reference_number` join key (FACT-009)
- **Status:** read-only historical source; completeness of its July exports is ASM-002
- **Access method / hosting / retention:** UNKNOWN
- **Human owner:** Asif/bookkeeper

## Integrations (transport · auth · failure behavior)

| # | From → To | Transport | Auth | Failure / recovery | Evidence |
|---|---|---|---|---|---|
| I-01 | Field app PWA → Backend | HTTPS REST (`/api/*`) | staff JWT; offline outbox retries network failures with clientRef idempotency | queued client-side; 4xx surfaces to user | ai/DECISIONS.md DEC-011 |
| I-02 | GitHub main → Render | auto-deploy on merge | Render↔GitHub link | no CI gate; `[skip render]` skips docs deploys | FACT-002 |
| I-03 | WhatsApp (Meta) → Supabase edge fn | webhook POST | Meta webhook token (env) | UNKNOWN retry semantics (Meta-side) | FACT-011 |
| I-04 | Supabase edge fn → Anthropic API | HTTPS | ANTHROPIC_API_KEY (env name) | fallback text to customer on failure | FACT-011 context |
| I-05 | WhatsApp bot → Backend (staff routing `/api/muhammed/wa`) | HTTPS | token env (names only) | UNKNOWN retry/queue behavior | ai/PROJECT_KNOWLEDGE.md §5 |
| I-06 | Claude sessions → Zoho Books | MCP (NATIONAL suite) | OAuth (state UNK-008) | manual re-run; no blind retries on writes (HANDOFF §6) | FACT-013 |
| I-07 | Claude sessions → Supabase / GitHub / Google / Canva / Figma | MCP | per-connector OAuth | session-level retry only | FACT-013 |
| I-08 | App → Zoho daily sync | **DOES NOT EXIST YET** (TASK-012) | — | must exclude `origin:'july-import'` (RISK-005) | FACT-008 |
| I-09 | Backend audit trail → off-box export | disabled (env unset) | — | export OFF | ai/STATUS.md Systems |

## Source-of-truth summary

| Domain | Truth lives in | Evidence |
|---|---|---|
| Live operational money/orders | SYS-01 /var/data | FACT-001 |
| Accounting / VAT | SYS-02 Zoho org 928751913 | FACT-003 |
| Customer chat | SYS-03 wa_messages | FACT-011 |
| Code + AI coordination | SYS-04 repo (/ai) | DEC-001 |
| Pre-July history | SYS-06 (reference only) | FACT-009 |
