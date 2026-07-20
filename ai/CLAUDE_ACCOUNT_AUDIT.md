# CLAUDE_ACCOUNT_AUDIT.md — capabilities of the owner's Claude account, and how to get more out of them

> **Mission (owner directive, 2026-07-21):** become an expert on the actual Claude account/workspace and maximize its value. Evidence only — every claim below was verified from inside the logged-in environment this session runs in. Nothing was changed, installed, connected, enabled, or authorized during this audit.
> Audited by: claude-muhammed · 2026-07-21T05:00+04:00 · account e-mail asifmkp82@gmail.com (from session context).

## 0. Scope & visibility limits (read first)

This audit was run from a **Claude Code on the web** session (a managed cloud sandbox), not from the claude.ai chat UI. That defines what is *verifiable*:

**Visible and verified here:** connector roster + per-chat enablement, plugin roster, skill roster, scheduled Routines (all of them, account-wide), cloud environments, published artifacts, the session's tool inventory (MCP servers, GitHub tools, Workflow/Agent orchestration, web search/fetch), model identity, sandbox/network constraints.

**NOT visible from this environment — no claims made about them:**
- claude.ai web UI pages: **Projects**, **Memory**, **Settings/Profile**, **Team/workspace membership**, **billing/plan**, **feature-preview (betas) toggles**. I cannot open the claude.ai UI from the sandbox; anything below about these is labeled *recommendation*, not *observation*.
- Private message/chat history of other sessions (not accessed — out of mission scope).
- Connector *org-level auth state*: the connector list API returned `installState: "unknown"` for every entry, so "connected vs merely installed" cannot be asserted; per-chat enabled/disabled IS reliable.
- The `list_repos` enumeration (which GitHub repos the account could attach) was denied by the session's permission classifier mid-audit — repo visibility below comes from this session's scope only.

## 1. Account facts (observed)

| Fact | Evidence |
|---|---|
| Model powering this session | `claude-fable-5` (Fable 5, Claude 5 family) — session config |
| Surface | Claude Code on the web (remote managed container, ephemeral disk, fresh clone per session) |
| Cloud environments | 2, both active `anthropic_cloud`: **NATIONAL** (created 2026-06-23, runs NTBF work incl. the daily ping) and **Default** (created 2026-07-15) — `list_environments` |
| GitHub | Via GitHub MCP server (no `gh` CLI in sandbox). Session-scoped repos: `asifmkp/muhammed` + `asifmkp/ntbf-platform` (added via add_repo). PR create/merge/subscribe verified working this session (PRs #13–#24) |
| Network | Sandbox egress goes through a policy proxy; `app.ntbfllc.com` is blocked (403) from sandboxes — production checks need owner's browser or MCP channels |
| Scheduled Routines | 1 active: "NTBF daily pending-task ping" (`trig_01WCjbjwTtd2LxWQESsoRyMm`, cron `0 5 * * *` UTC = 9:00 UAE, bound to the long-running "muhammed" session, NATIONAL env). Plus 15 expired one-shot `send_later` check-ins from the July 15–16 WhatsApp-fix session (all fired, inert) — `list_triggers` |
| Published artifacts | 3: NTBF Operations Dashboard (2026-07-20) · Makeover Fitness Club page (2026-07-12) · agent-run-multinational (2026-07-13) — `Artifact list`, scope all: nothing shared *to* the account is listed |

## 2. Connectors / MCP servers (17 installed — the account's biggest asset)

Observed via `ListConnectors` + this session's live tool inventory. "In chat" = enabled in this session.

| Connector | In chat | What it gives NTBF | Notes / security |
|---|---|---|---|
| **ZOHO NATIONAL BOOKS** + **NATIONALBOOKSMCP2–6** | yes (6 servers) | Full Zoho Books API for org 928751913: items/CoA/taxes (base), invoices/CNs/payments/journals (2), bills/vendor payments/salesorders/automation (3), banking/projects/blueprints (4), **every financial report** (5), contacts (6). This powered the entire July migration. | The workhorse. Write-capable — governed by the repo hard rule: no Zoho write without owner instruction. Split across 6 servers because of Zoho's tool count. |
| **NATIONALBOOK7** | **no** | 7th slice of the same suite | Installed but toggled off in this session; unknown toolset. Harmless as-is. |
| **Zoho Books** (generic, "Smart Finance Ops") | yes | Overlapping generic Zoho toolset | **Redundant + risk of org ambiguity** — it exposes multi-org tools. All work must keep using the NATIONAL-scoped servers; consider disabling this one in NTBF chats (owner action, §6). |
| **Supabase** | yes | WhatsApp bot ops: edge-function deploys, SQL over `wa_messages`, logs, secrets-adjacent config | Used for every bot fix (v29→v41). Write-capable → deploys are owner-gated by convention. |
| **GitHub** | yes | Repo read/write, PRs, merges, PR-activity webhooks | Merging to `main` deploys production (Render) — the real gate is the /ai workflow, not GitHub. |
| **Gmail** | yes | Read/search/label inbox, **create drafts** (no autonomous send) | Unused for NTBF so far. Candidate: draft supplier TRN request e-mails, statement chasers (TASK-010, receivables). Privacy: grants inbox read — use narrow searches only. |
| **Google Calendar** | yes | Events, scheduling | Unused. Candidate: delivery-schedule / VAT-deadline reminders. |
| **Google Drive** | yes | Search/read/upload files | Unused. Candidate: owner drops old-software reports (e.g. TASK-004 item-wise file) into Drive instead of chat upload — survives chat limits. |
| **Canva** | yes | Design generation/export | Unused for NTBF. Candidate: price flyers, WhatsApp promo images from the catalog. |
| **Figma** | yes | Design context, diagrams | Unused. Candidate: field-app UI mockups before build. |
| **Microsoft 365** | **no** | SharePoint/Outlook/Teams | Off in this chat; only relevant if NTBF adopts M365. Leave off. |
| **Slack** | **no** | Workspace messaging | Off in this chat. Leave off unless the team adopts Slack. |
| **Nexoya** | **no** | Marketing analytics SaaS | Off; no NTBF use case identified. Candidate for uninstall (owner action). |

**Claude Code Remote (built-in):** Routines (cron + one-shot `send_later`), environment/repo management, PR watching. Already carrying the daily 9AM ping — this is the account's automation backbone.

## 3. Skills, plugins, orchestration (what the account can *do* beyond chat)

- **Skills (10 enabled):** document production `pdf` / `docx` / `xlsx` / `pptx` (the handbook + management report used `pdf`), `canvas-design`, `algorithmic-art`, `web-artifacts-builder`, `morning` (daily-brief artifact — unused; overlaps with our custom 9AM ping, which is NTBF-specific and better), **`skill-creator`** and **`mcp-builder`** (meta: the account can mint its own skills/MCP servers — e.g. a future "ntbf-eod-report" skill).
- **Plugins (18 enabled):** the full Cowork role pack (small-business, operations, finance, sales, marketing, HR, legal, engineering, data, product, customer-support, productivity, enterprise-search, design, bio-research), plus qdrant-skills, pdf-viewer, cowork-plugin-management. Broad but idle; they mainly add role workflows in Cowork surfaces. No action needed; bio-research/qdrant are uninstall candidates if the owner wants a tidy roster.
- **Agent orchestration (session tools):** background subagents (`Agent`), deterministic multi-agent `Workflow` (opt-in via "use a workflow"/"ultracode"), read-only Explore/Plan agents. Proven this session: 3-agent repo audit, batched Zoho posting. Guardrail learned: financial writes stay in the main loop (a July sub-agent returned a prompt-injection payload; neutralized, rule captured in HANDOFF).
- **Web:** WebSearch + WebFetch available for research (used sparingly; not needed for books work).
- **Artifacts:** private-by-default hosted pages (ops dashboard lives there). Good channel for boss-facing dashboards without touching the production app.

## 4. What the account is NOT using (highest-value gaps)

1. **Projects + Project knowledge (claude.ai UI — unverifiable from here, recommendation only):** an "NTBF" Project with `/ai/PROJECT_KNOWLEDGE.md` + `STATUS.md` pasted/synced as project knowledge would give every *chat* session the same grounding Code sessions get from the repo. Zero risk; 10 minutes of owner setup (§6.1).
2. **Memory (claude.ai UI — unverifiable):** if enabled, personal chats would stop re-explaining NTBF basics. Check Settings → Features. Keep business *decisions* in `/ai/DECISIONS.md` regardless — repo stays the source of truth (DEC-001).
3. **Google Drive as the report inbox:** every owner upload so far died with its chat. A `NTBF-Reports/` Drive folder + the connector = permanent, re-readable inputs (unblocks TASK-004 style work).
4. **Gmail drafts for collections/TRN chases:** receivable 11,193.05 and TASK-010 both need supplier/customer correspondence; Claude can draft, owner sends.
5. **A second Routine — weekly management report:** the July report pipeline exists in scratch scripts; a Monday-morning Routine could regenerate it from Zoho automatically (Phase 3 in ROADMAP — needs owner go).
6. **CI via GitHub (TASK-015):** the account's GitHub integration can run the already-written workflow template today; it's the roadmap's Phase-0 item, not an account gap per se.

## 5. Token-efficiency & workflow notes (how this account works cheapest)

- **Deferred tools are already saving heavily:** ~900 Zoho/GDrive/etc. tool schemas stay unloaded until `ToolSearch` pulls them. Keep connector count per chat lean anyway — chat surfaces load more schemas up front than Code does. Disabling the redundant generic "Zoho Books" connector in NTBF chats is the single biggest schema saving available (§6.2).
- **Repo-first context (DEC-001) is the cheapest memory:** `/ai/STATUS.md` (≤80 lines) then `TASK_QUEUE`/`ROADMAP` gives any new session full grounding for a few thousand tokens — cheaper and more reliable than long chat histories. Keep enforcing it.
- **One long-lived session + Routines beats many fresh chats** for operations: the daily-ping Routine resumes this session with its cache warm instead of rebuilding context. Reuse the pattern (weekly report, reconciliation alerts) rather than spawning new chats per task.
- **Batch owner inputs:** the queue's owner-blocked items (TASK-001/002/005/006/007/009) cost one message each to answer — answering them in one batch (as ROADMAP Phase 1.1 plans) is cheaper for both sides than six separate threads.

## 6. Safe enablement steps (owner-manual; NOT performed by this audit)

1. **NTBF Project (claude.ai):** claude.ai → Projects → New project "NTBF" → Project knowledge → add the current `/ai/PROJECT_KNOWLEDGE.md` + `STATUS.md` (re-paste after big merges). Start future *chat* work inside it.
2. **Trim per-chat connectors:** in a chat → connector/tools menu → toggle OFF "Zoho Books" (generic) for NTBF work; keep the NATIONAL* set. Optionally uninstall Nexoya (Settings → Connectors) if unused — uninstalling revokes its OAuth grant.
3. **Memory check:** claude.ai → Settings → Features → review Memory toggle. Enable if the owner wants cross-chat recall; decisions still go to `/ai/DECISIONS.md`.
4. **Drive report inbox:** create `NTBF-Reports/` in Google Drive; drop old-software exports there; tell any session "read <filename> from Drive".
5. **Routine hygiene:** the 15 expired one-shot `send_later` triggers are inert; optional cleanup via delete_trigger. **Do not touch** `trig_01WCjbjwTtd2LxWQESsoRyMm` (the live 9AM ping).
6. **When adding future MCP connectors:** prefer narrow, org-scoped servers (like the NATIONAL* pattern) over broad multi-tenant ones; connect via Settings → Connectors and enable per chat only where needed.

## 7. Security implications (observed)

- **Write-capable connectors are the blast radius:** Zoho (ledger), Supabase (live bot), GitHub (main = production deploy). The protections are procedural — /ai hard rules + owner gates — plus the permission classifier (observed blocking actions this session). Keep the "no Zoho write without owner instruction" rule absolute; CI (TASK-015) adds the missing machine gate on GitHub.
- **Routine prompts are stored account-visible:** old `send_later` prompts from the July-15 bot incident embed a since-flagged dashboard review token value. That token was already marked exposed-and-rotate in that incident; rotation remains on the owner (Supabase `bot_settings.review_token`). Lesson (now practiced): reference secrets by *name* only in Routine prompts, never by value.
- **Google/Gmail scopes are broad:** the connectors can read the whole inbox/Drive. Sessions should query narrowly and never quote private content into repo files. No such access was made in this audit.
- **Artifacts are private by default** but shareable; the ops dashboard contains business figures — share links deliberately, not broadly.
- **Sandbox isolation is working as designed:** production app unreachable from sandboxes (proxy 403), secrets live only in Render/Supabase env, none present in the repo (CI template §7 scans for leaks once activated).
