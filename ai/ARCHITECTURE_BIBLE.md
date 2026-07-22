# NTBF AI OPERATING SYSTEM — ARCHITECTURE BIBLE

**National Trading of Beverage & Foodstuff LLC · Ajman, UAE**

| Field | Value |
|---|---|
| Document ID | `ai/ARCHITECTURE_BIBLE.md` |
| Status | **DRAFT — Session 1 of 4** (§0, §1, §2, §20, §21 complete) |
| Version | 0.1 |
| Date | 2026-07-22 |
| Author | Claude (Opus 4.8), acting as enterprise architect |
| Owner | Asif (asifmkp82@gmail.com) |
| Canonical repo | `asifmkp/ntbf-platform` — **owner-confirmed 2026-07-22** |
| Supersedes | Nothing. This document **cites** the `ai/` registers; it does not replace them. |

---

# §0 · HOW TO READ THIS DOCUMENT

## 0.1 Why this document exists

The `ai/` registers (`FACT_REGISTER`, `DECISIONS`, `RISKS`, `UNKNOWNS`, `ASSUMPTIONS`,
`ENTERPRISE_SYSTEM_MAP`, `TASK_QUEUE`, `TRACEABILITY`, …) are excellent at recording
**what is true and what was decided**. They are deliberately atomic and evidence-graded.

They are not designed to carry **judgment**: why the architecture has the shape it has,
what it should become over ten years, which properties must never be violated, and what
would destroy the project if ignored.

That is this document's only job.

**Architectural rule for this document (OD-002, Option B):**

> The Bible holds judgment. The registers hold facts.
> Every factual claim here **cites a register ID**. No fact is restated in prose without
> its citation, because a restated fact is a forked fact, and a forked fact drifts.

**Evidence that this rule is necessary, not theoretical:** `MUHAMMED-HANDOFF.md` records the
WhatsApp edge function at **v22**; `ENTERPRISE_SYSTEM_MAP.md` records **v41** [V]. Two
existing documents already disagree. A third uncited narrative layer would compound this.

## 0.2 Evidence taxonomy

Every statement in this document carries exactly one tag.

| Tag | Meaning | Standard of proof |
|---|---|---|
| **[V] Verified** | Read from source code, config, or a register entry with VERIFIED grade | Cites file/line or FACT-### |
| **[O] Observed** | Seen in a running system or live screen this session | Cites the observation |
| **[I] Inferred** | Reasoned from [V]/[O] but not directly confirmed | Reasoning shown; must be promotable to [V] or demotable |
| **[R] Recommended** | Author's architectural judgment | Trade-offs stated; not a fact |
| **[F] Future Vision** | Target state, not committed work | Explicitly aspirational |

**An [I] statement is a liability, not an asset.** Each one in this document should either be
promoted to [V] via the UNKNOWNS → FACT_REGISTER path (DEC-015) or removed. Section 19 tracks
the open ones.

## 0.3 Relationship to the register protocol (DEC-015)

This document is **subordinate** to DEC-015. Where the Bible and a register disagree, the
register wins and the Bible is amended. The Bible is never the place a new fact is born.

New facts discovered while writing this document go through the normal path:
`UNKNOWNS.md` → verification → `FACT_REGISTER.md` → cited here.

## 0.4 Document map

| § | Title | Session | Status |
|---|---|---|---|
| 0 | How to read this document | 1 | ✅ |
| 1 | Executive Summary | 1 | ✅ |
| 2 | Business Vision (1/3/5/10 yr) | 1 | ✅ |
| 3 | Current System Inventory | 2 | ⬜ |
| 4 | Architecture Assessment | 2 | ⬜ |
| 5 | Muhammed | 2 | ⬜ |
| 6 | OpenClaw | 2 | ⬜ |
| 7 | Claude Code | 2 | ⬜ |
| 8 | ERP | 3 | ⬜ |
| 9 | Capability Layer | 3 | ⬜ |
| 10 | AI Organization | 3 | ⬜ |
| 11 | Knowledge Architecture | 3 | ⬜ |
| 12 | Data Architecture | 3 | ⬜ |
| 13 | Automation Strategy | 4 | ⬜ |
| 14 | Security Architecture | 4 | ⬜ |
| 15 | Infrastructure | 4 | ⬜ |
| 16 | Development Architecture | 4 | ⬜ |
| 17 | Roadmap | 4 | ⬜ |
| 18 | Decision Register (Bible-level) | 4 | ⬜ |
| 19 | Risk Register (Bible-level) | 4 | ⬜ |
| 20 | Architecture Principles | 1 | ✅ |
| 21 | Final Assessment | 1 | ✅ |

---

# §1 · EXECUTIVE SUMMARY

## 1.1 The company today

NTBF is a wholesale FMCG and beverage distributor in Ajman, UAE [V: CLAUDE.md]. The business
**restarted fresh on 1 July 2026** [V: CLAUDE.md] and runs with a team of four: Asif (owner),
Tahir (sales/invoicing), Haris (purchasing/warehouse), and Musthafa (delivery/cash) [V: CLAUDE.md].

It operates a custom ERP — a NestJS backend with a vanilla-JS PWA — hosted on Render, serving
customer ordering, staff operations, and driver workflows on one codebase [V: FACT-001, FACT-002].
Zoho Books org `928751913` is the ledger of record [V: FACT-003]. A Claude-powered WhatsApp bot
on Supabase serves customers and routes staff to Muhammed [V: FACT-011].

**This is a genuinely unusual company.** A four-person distributor with a bespoke ERP, an AI
colleague in production, a formal evidence protocol governing its own documentation, and a
32-check regression suite guarding a data-display standard [V: FACT-030] is not what four-person
distributors normally look like. That matters for everything that follows: the constraint here
is not sophistication. It is **operational resilience and the absence of trustworthy data**.

## 1.2 Current AI maturity

**Level 3 of 5 — "AI in production, not yet trusted infrastructure."** [R]

| Level | Definition | NTBF |
|---|---|---|
| 1 | Experimentation, no production use | passed |
| 2 | AI in a single workflow | passed |
| 3 | **AI in production across several workflows, human-verified** | **← here** |
| 4 | AI as trusted operational infrastructure; humans approve, AI executes | target 12–18 mo |
| 5 | AI as the coordination substrate; multi-entity, multi-agent | target 3–5 yr |

Evidence for Level 3: Muhammed serves staff in production over two channels with 24 read-only
tools and capability-gated role security [V: `muhammed.tools.ts`, `muhammed.service.ts`]. Bill
OCR runs through Claude [V: CLAUDE.md]. The WhatsApp customer bot handles ordering end-to-end
with a frozen ingest contract [V: CLAUDE.md].

Evidence against Level 4: no backup exists for the system of record [V: RISK-001, CRITICAL], no
CI gates production deploys [V: RISK-004, FACT-002], and the AI layer reads a data surface that
has been observed returning zeros [V: FACT-019].

## 1.3 The single most important finding of this review

**Muhammed's knowledge does not come from the system of record.**

- `/var/data` JSON stores are the **source of truth** for live operational records — orders,
  receipts, expenses, advances, staff [V: FACT-001, FACT-006].
- Muhammed's tools read `AppStateService.get()?.state` — the **appstate blob**
  [V: `muhammed.service.ts:105`].
- The appstate blob is written by **`PUT /api/appstate`**, a client-push endpoint whose
  authorization depends on `PUBLIC_API_TOKEN` being set in production — which is itself an open
  unknown [V: RISK-003, FACT-015, UNK-001].
- `ENTERPRISE_SYSTEM_MAP` records Muhammed as reading "client appstate," with **observed zeros**
  [V: FACT-019].

```
   AUTHORITATIVE                      WHAT MUHAMMED READS
   ┌────────────────────┐             ┌────────────────────┐
   │ /var/data/*.json   │             │  appstate blob     │
   │ orders, receipts,  │  ──?──▶     │  (client-pushed    │
   │ expenses, advances │   no        │   mirror)          │
   │ FACT-001           │  direct     │  RISK-003          │
   └────────────────────┘   read      └─────────┬──────────┘
                                                │
                                                ▼
                                         Muhammed's 24 tools
                                         observed zeros (FACT-019)
```

Per owner instruction (2026-07-22), this is to be treated as **a known implementation issue
requiring resolution before production maturity — not a reason to redesign Muhammed.** That
instruction is correct, and this document follows it.

But the architectural lesson must be recorded, because it generalises [R]:

> **The AI layer must bind to the system of record, never to a client-maintained mirror.**
> A mirror introduces a freshness dependency on client behaviour that no amount of prompt
> engineering, memory, or model capability can compensate for. An assistant reading a stale
> mirror is not "sometimes wrong" — it is **structurally untrustworthy**, and trust is the
> entire product.

This single binding decision determines whether Muhammed can ever become the Chief of Staff.

## 1.4 Major recommendations

Ranked by consequence. Full detail in §17.

| # | Recommendation | Why | Risk if ignored |
|---|---|---|---|
| **R1** | **Backup and restore for `/var/data`, with a proven restore drill** | RISK-001 is CRITICAL and unmitigated; restore procedure does not exist [V] | Total, unrecoverable loss of the business's operational record |
| **R2** | **Rebind Muhammed's read path to the system of record** | §1.3; FACT-019 zeros | The AI layer can never be trusted; every downstream investment is wasted |
| **R3** | **Rotate all burned credentials; separate the shared ingest secret** | Four burned credentials [V: CLAUDE.md, MUHAMMED-HANDOFF, RISK-002, RISK-008]; one token grants role assertion [V: `muhammed.service.ts:72`] | Silent compromise; blast radius grows with every capability added |
| **R4** | **Introduce a time dimension to operational data** | `company_sales` states orders carry no date [V: `muhammed.tools.ts:147`] | No trends, no forecasting, no anomalies — Priority 3 unreachable |
| **R5** | **Build the Capability Layer (read-only first, time-aware from v1)** | Decouples consumers from storage; the mechanism for 10-year scale without rewrite | Every agent re-implements business logic; duplication becomes permanent |
| **R6** | **Activate CI before adding capabilities** | RISK-004: merge = production deploy, ungated [V] | A bad merge reaches production with no gate, while the surface area is growing |
| **R7** | **Durable memory for Muhammed** | Working memory dies on redeploy [V: `muhammed.service.ts:44`]; durable log exists but is never read back [V: `muhammed.log.ts`] | Assistant cannot accumulate context; feels disposable to staff |

**Note the ordering.** R1–R3 are *protective* and mostly measured in days. R4–R7 are *constructive*
and measured in months. **Protective work precedes constructive work**, because every capability
added on top of an unbacked, uncredentialed, untrusted base increases the cost of the eventual
correction. This ordering is a deliberate reversal of the intuition to "build the exciting thing first."

## 1.5 Major risks

Sourced from `RISKS.md` [V], plus Bible-level additions marked [R].

| ID | Risk | Severity | Status |
|---|---|---|---|
| RISK-001 | Total loss of live business data — `/var/data` unbacked, no restore procedure | **CRITICAL** | OPEN |
| RISK-002 | Weak seeded staff passwords in source control | HIGH | OPEN |
| RISK-003 | Unauthorised full-dataset write via open `PUT /api/appstate` | HIGH | OPEN |
| RISK-004 | Bad merge ships straight to production — no CI | HIGH | OPEN |
| RISK-005 | July double-posting if a future Zoho sync omits the `origin:'july-import'` exclusion | HIGH | OPEN |
| RISK-006 | Stored XSS via unescaped names | MED | OPEN |
| RISK-007 | Wrong-Zoho-org config trap on env rebuild | MED | OPEN |
| RISK-008 | Review-token embedded in stored Routine prompts | MED | OPEN |
| **B-R01** | **AI trust collapse** — staff stop believing Muhammed after wrong numbers; trust is far harder to regain than to establish | **HIGH** [R] | new |
| **B-R02** | **Owner as single point of failure** — one person holds all credentials, decisions, and system knowledge | **HIGH** [R] | new |
| **B-R03** | **Laptop-as-infrastructure** — if OpenClaw becomes load-bearing for operations, a desktop becomes production | MED [R] | new |

**B-R01 deserves emphasis.** A four-person team that receives one confidently wrong cash figure
from Muhammed will stop asking him. Adoption is the scarce resource, not capability. This is why
R2 outranks every feature.

## 1.6 Architectural philosophy

Five commitments that shape every recommendation in this document [R].

**1. Evolve, never replace.** The current architecture has solved hard problems well —
capability-based authorization, role-enforced state transitions, a live-vs-historical data
standard with regression tests [V: FACT-026, FACT-030]. Those are preserved. Change enters
through seams, not rewrites. *(Owner instruction, 2026-07-22.)*

**2. Trust before capability.** An AI that is occasionally wrong is worse than one that is
narrowly right. Every expansion of scope must be preceded by a proof of correctness at the
existing scope.

**3. The business runs without the AI.** Warehouse, delivery, and invoicing must function if
every AI system is offline. AI is an interface and an accelerant, never a dependency in the
critical path. *(This is the corrected form of "everything flows through Muhammed" — see §1.7.)*

**4. Humans approve what cannot be undone.** AI may read, analyse, draft, and recommend without
limit. Irreversible effects — money movement, ledger posts, customer communication — require a
human. This is not distrust of models; it is segregation of duties, which is an audit
requirement independent of who or what performs the work.

**5. Capabilities are owned once and consumed many times.** Business logic lives with the system
that owns the data. Every consumer — Muhammed, OpenClaw, a future agent, a mobile app — calls the
same capability. Duplicated business logic is the failure mode that ends architectures.

## 1.7 One correction to the stated vision

The owner's framing has been *"everything should eventually flow through Muhammed."*

**As literally stated, this is an anti-pattern** [R]. A mandatory orchestrator is a single point
of failure, a throughput bottleneck, and a blast-radius maximiser. If Muhammed is down, the
company is blind; if he is compromised, everything is.

**The defensible form:**

> Muhammed is the **primary human interface** to the business, not the mandatory execution path.
> Systems continue to operate when he is unavailable. He coordinates, observes, escalates,
> and increasingly acts — but never becomes the only road.

This distinction is load-bearing for §9, §10 and §15, and is recorded as Principle P-06 in §20.

---

### §1 Executive Summary — in one paragraph

NTBF is an unusually sophisticated four-person distributor with AI already in production and a
disciplined documentation protocol. Its AI maturity is Level 3 of 5. The binding constraint is
not capability but **trust**: the AI layer reads a client-pushed mirror rather than the system of
record, and the system of record has no backup. Fix the protective layer (backup, credentials,
data binding), then build the Capability Layer as the mechanism that permits ten-year scale
without a disruptive migration. Preserve the capability-based security model at all costs — it is
the crown jewel. Reframe "everything flows through Muhammed" as "Muhammed is the primary
interface, not the mandatory path."

---

# §2 · BUSINESS VISION

## 2.1 Where the company is today

**The owner's stated problem, verbatim (2026-07-22):**

> *"The owner lacks a single, trustworthy, real-time operational view of the business, while too
> much operational work still depends on manual coordination."*

This is the correct problem statement, and it is notable for what it is **not**. It is not
"we need more AI." It is a **situational-awareness and coordination-cost** problem. That framing
should be preserved through every subsequent phase, because it is the test against which
features are judged.

Decomposed by the owner into four priorities:

| Priority | Problem | Architectural implication |
|---|---|---|
| **P1** | Cannot instantly know sales, collections, receivables, inventory, warehouse, driver, purchase, cash, risks | Requires trusted read binding (R2) + unified capability surface (R5) |
| **P2** | Routine work needs manual coordination — WhatsApp, purchase follow-up, warehouse questions, approvals, OCR, reports | Requires T2 draft capabilities + scheduled automation |
| **P3** | BI is weak — needs trends, comparisons, forecasting, anomalies, alerts | **Requires a time dimension (R4)** — currently impossible |
| **P4** | AI systems are disconnected — Muhammed, ERP, Zoho, WhatsApp, Claude Code, OpenClaw operate individually | Requires the Capability Layer as shared substrate (R5) |

**Critical observation** [R]: P1 and P3 are blocked by the same root cause — data. P1 needs the
read path bound to truth; P3 needs history to exist at all. **Neither is an AI problem.** Adding
model capability, memory, or agents moves neither. This is the most important scoping insight in
this document, and it should discipline the roadmap against the temptation to build agents.

## 2.2 One year — *"Trusted awareness"*

**Target state** [F]:

- The owner opens one interface and sees the true current position of the business: sales,
  cash, receivables, stock, dispatch, deliveries, purchase pipeline, and exceptions.
- Every number is reconciled against Zoho or explicitly labelled as operational-only.
- Muhammed answers "what happened today / this week / vs last month" — the time dimension exists.
- Staff use Muhammed daily and **trust him**, measured by `team_summary` and the unanswered-gap
  rate [V: these instruments already exist in `muhammed.tools.ts`].
- Backups run nightly with at least one proven restore drill [V: TASK-014, `BACKUP_DESIGN.md` §9].
- Routine reports and alerts are generated, not requested.

**What is deliberately NOT in year one** [R]: multi-agent organisations, autonomous execution of
irreversible actions, multi-company support, and predictive ML. Each would consume the capacity
required to make the foundation trustworthy.

**Business outcome:** the owner stops asking staff for numbers. That is the whole year-one goal,
and it is sufficient.

## 2.3 Three years — *"Coordinated operations"*

**Target state** [F]:

- The Capability Layer is the sole interface to business operations; every consumer uses it.
- T2 (draft) capabilities are pervasive: draft POs, draft bills from OCR, draft quotes, draft
  replies. Humans approve; almost nobody types.
- Two to four specialist agents exist — created **only where a measured human bottleneck was
  demonstrated**, not pre-emptively (§10).
- Zoho synchronisation is bidirectional and automatic, with the `origin:'july-import'` exclusion
  permanently enforced by test [V: RISK-005 mitigation].
- Anomaly detection is live: unusual cash variances, margin drift, stock-out risk, credit
  exposure — pushed, not pulled.
- The business could add a second warehouse without an architecture change.

**Organisational outcome:** the company handles materially more volume per person. For a
distributor, this is the entire economic argument for the programme.

## 2.4 Five years — *"AI-first enterprise"*

**Target state** [F]:

- Multi-entity: multiple companies or branches on one platform, with tenant isolation as a
  first-class concept rather than a retrofit.
- The AI layer executes routine T3 operations under standing policy, with humans on exception
  handling rather than on approval of every case.
- Institutional knowledge is durable: policies, supplier terms, pricing history, and decisions
  are retrievable and versioned — the company's memory survives staff turnover.
- New markets or product lines onboard through configuration, not code.

**The strategic claim** [R]: by year five, the AI operating layer — not the ERP — is the
company's durable asset. ERPs are replaceable commodities. A well-governed capability layer
with ten years of institutional decision history is not.

## 2.5 Ten years — *"The platform is the product"*

**Target state** [F]:

- The capability layer, approval fabric, and agent governance model are **productisable** —
  operable by other distributors in the region.
- NTBF becomes a reference implementation rather than a bespoke build.

**Honest caveat** [R]: this is a genuine option, not a plan. It requires deliberate investment in
multi-tenancy, documentation, and support that a four-person distributor cannot fund from
operations alone. The architecture should **preserve the option** without paying for it now —
which is exactly what the capability layer and strict ownership boundaries buy.

## 2.6 How AI changes the company

| Dimension | Before | After [F] |
|---|---|---|
| Owner's day | Asks staff, checks systems, assembles the picture manually | Reads one briefing; intervenes on exceptions |
| Staff work | Coordinate, chase, re-key, report | Decide, handle exceptions, serve customers |
| Knowledge | In people's heads; leaves when they leave | In the capability layer and knowledge store |
| Decisions | Reactive, from stale snapshots | Proactive, from trends and anomalies |
| Scale limit | The owner's attention | Capability coverage |
| Error mode | Silent — nobody notices | Surfaced — anomalies are pushed |

**The honest counter-argument** [R]: none of this materialises if the data is wrong. A dashboard
built on a stale mirror produces confident bad decisions faster than manual coordination
produced slow correct ones. **AI amplifies data quality in both directions.** This is the
justification for the ordering in §1.4.

---

### §2 Business Vision — in one paragraph

The problem is situational awareness and coordination cost, not insufficient AI. Year one buys
**trust**; year three buys **coordination**; year five buys **scale and institutional memory**;
year ten preserves the **option** to productise. Priorities P1 and P3 are blocked by data, not by
models — which means the correct first investments are unglamorous: backup, data binding, a time
dimension, and a capability layer. Build those and the agents become easy. Skip them and no
number of agents will help.

---

## §2.7 · CORRECTIONS TO SESSION 1

Per DEC-016, invalidated conclusions are corrected in place with a change-history line. Two
corrections arising from `STATUS.md` (as of 2026-07-22T07:33+04:00, `main@9081231`):

**C-01 · RISK-001 severity is unchanged, but its nature has changed.**
Session 1 §1.4 R1 read as though backup were an engineering task. It is not, as of today.

- Backup code is **MERGED and live in production** — PR #41, `main@9081231` [V: STATUS.md]
- `backend/src/backup/*`: nightly `@Cron` 02:00 Asia/Dubai, tar + AES-256-GCM, Supabase Storage
  upload with retention, admin manual-trigger and status endpoints [V: STATUS.md]
- `nest build` exit 0, 9/9 Jest green — including a **Dubai-local-vs-UTC day-boundary bug in the
  weekly/monthly promotion logic caught and fixed before merge** [V: STATUS.md]
- It **ships fail-safe: no-ops if unconfigured.** It is live but **inert.**

> **RISK-001 is now blocked on a single owner action: provision a Supabase Storage bucket and
> service key (`BACKUP_DESIGN.md` §8a), then run the restore drill.** [V: STATUS.md]

This is the highest-leverage unclaimed action in the entire estate [R]. The CRITICAL risk to
company survival is separated from mitigation by a provisioning step measured in minutes, not a
build measured in weeks. **Per DEC-019, "done" means a demonstrated restore — code being live
does not close it** [V].

**C-02 · The orchestrator question is already decided, and correctly.**
Session 1 argued against premature multi-agent construction. That argument was already company
policy: **DEC-014 postpones the AI Orchestrator behind five explicit gates** — G1 sustained
multi-agent activity · G2 CI active · G3 backups drilled · G4 sync stable two weeks · G5 evidence
that the file protocol is the bottleneck [V: DEC-014]. The Bible adopts DEC-014 rather than
restating it, and §10 is written subordinate to those gates.

---

# §3 · CURRENT SYSTEM INVENTORY

Systems carry their `ENTERPRISE_SYSTEM_MAP` IDs where they exist. Fields marked **UNKNOWN** are
explicitly unresolved per DEC-015 — never guessed.

## 3.1 Inventory at a glance

| # | System | Layer | Maturity | Critical issue |
|---|---|---|---|---|
| SYS-01 | NTBF Field App + Backend | Core ERP | **Production** | Unbacked source of truth (RISK-001) |
| SYS-02 | Zoho Books org 928751913 | Ledger of record | **Production** | No automated sync (I-08) |
| SYS-03 | WhatsApp Bot (Supabase) | Customer + staff channel | **Production** | Source outside VCS (FACT-011) |
| SYS-04 | GitHub `asifmkp/ntbf-platform` | Code + AI coordination | **Production** | No CI (RISK-004) |
| SYS-05 | Claude account layer | AI substrate | **Production** | Connector auth state UNKNOWN (UNK-008) |
| SYS-06 | Old bookkeeping software | Historical reference | Retired | Completeness is ASM-002 |
| — | **Muhammed** | AI colleague | **Production** | Reads client mirror (§1.3) |
| — | **OpenClaw** | Owner AI OS | Beta / laptop | Not production-grade by design |
| — | **Claude Code** | Development agent | Production | — |
| — | **Backup subsystem** | Continuity | **Live but inert** | Awaiting owner provisioning |
| — | System B (Prisma ERP) | Dormant | **Retiring** | DEC-018: remove |

## 3.2 SYS-01 · NTBF Field App + Backend

| Field | Value |
|---|---|
| **Purpose** | Staff PWA + NestJS backend; customer ordering, staff operations, driver workflows |
| **Owner** | Asif (business); agent maintainers via `/ai` protocol [V] |
| **Hosting** | Render, Docker, Starter plan, auto-deploy from `main` [V: FACT-002] |
| **Data** | `/var/data` JSON stores — **SOURCE OF TRUTH** for orders, receipts, expenses, advances, staff [V: FACT-001, FACT-006] |
| **Disk** | 1 GB provisioned; **716 K used / 973 M / 0%** as of 2026-07-22 [V: FACT-034] |
| **Auth** | Staff JWT via `StaffAuthGuard`; `ApiGateGuard` accepts `x-api-key` OR staff Bearer [V] |
| **Dependencies** | Anthropic API, Zoho API, Supabase (bot ingress), Render |
| **Maturity** | Production, actively developed, regression-tested (32 checks) [V: FACT-030] |
| **Monitoring** | **UNKNOWN — none documented** [V: ENTERPRISE_SYSTEM_MAP] |
| **Problems** | RISK-001 unbacked · RISK-002 seeded passwords · RISK-003 open `PUT /api/appstate` · RISK-006 XSS · single-instance (DEC-002) |
| **Future** | Evolve System A patterns toward multi-warehouse/branch/company [V: DEC-018 context]; persistence swap **behind** the capability layer [R] |

**Architectural note** [R]: this system carries an unusual property — it is simultaneously the
most business-critical asset and the least protected. Every other item in this inventory is
either vendor-managed (Zoho, Supabase, GitHub) or reconstructible (Muhammed, OpenClaw, Claude
Code). `/var/data` is the only irreplaceable thing NTBF owns.

## 3.3 SYS-02 · Zoho Books org 928751913 (.com)

| Field | Value |
|---|---|
| **Purpose** | Ledger of record — **SOURCE OF TRUTH for accounting and VAT** [V: FACT-003] |
| **Owner** | Asif + Shanu (books); CA for statutory items [V] |
| **State** | July 1–20 fully imported and reconciled, grand reconciliation PASS [V: STATUS.md] |
| **Plan** | Professional — stock tracking ON, POs enabled [V: CLAUDE.md] |
| **Auth** | OAuth via the 7-server NATIONALBOOKS MCP connector suite [V: FACT-013]; org-level connector auth state **UNKNOWN** [V: UNK-008] |
| **Guards** | Hard org guard + write-lock at the single `ZohoService.post()` choke point, fail-closed; verified 403 for any org ≠ 928751913 [V: CLAUDE.md Gate 2] |
| **Write state** | `ZOHO_WRITES_ENABLED=false`; drafts-only path proven end-to-end (PO-00001 written then deleted) [V: CLAUDE.md Gate 3] |
| **Problems** | No app→Zoho sync (I-08, TASK-012) · wrong org in `render.yaml`/`.env.example` (RISK-007, DEC-003) · **burned OAuth credentials, rotation OVERDUE** [V: CLAUDE.md] |
| **Future** | Bidirectional sync with permanent `origin:'july-import'` exclusion, test-enforced [V: DEC-007, RISK-005] |

**Assessment** [R]: the Zoho write path is the **best-engineered integration in the estate.**
A single choke point, fail-closed, hard org guard, write-lock, drafts-only, and an end-to-end
proof that was then deleted to avoid ledger impact. This is the pattern every future write
capability should copy — and §9 will name it as the reference implementation.

## 3.4 SYS-03 · WhatsApp Bot (Supabase `wvsgeumafnqelspcqivo`)

| Field | Value |
|---|---|
| **Purpose** | Customer ordering bot + staff routing to Muhammed |
| **Version** | Edge function `whatsapp-webhook` **v41**, `verify_jwt=false` [V: STATUS.md] |
| **Number** | +971 58 980 0236 via 360dialog Cloud API [V: CLAUDE.md] |
| **Data** | `wa_messages`, `wa_orders`, `opt_ins`, `bot_settings` — **SOURCE OF TRUTH for chat history** [V] |
| **Staff routing** | Pre-check reads `bot_settings.staff_roster`; matched sender → `POST /api/muhammed/wa` → reply → return. Fail-open; 5-min cache [V: MUHAMMED-HANDOFF] |
| **Voice** | Voice notes wired; **key verification pending** [V: TASK-003, UNK-002] |
| **Problems** | **Source lives OUTSIDE the repo; canonical location UNKNOWN — no VCS documented** [V: FACT-011] · `MUHAMMED-HANDOFF` records v22 vs actual v41 (stale doc) [V] |
| **Future** | Bring under version control [R]; migrate staff routing to the capability layer [F] |

**The VCS gap is the most under-rated risk in this inventory** [R]. A production system processing
customer orders, with no version control and no documented canonical source, cannot be reviewed,
rolled back reliably, or safely handed to another maintainer. It is a **single-person dependency**
(B-R02) expressed in code.

## 3.5 SYS-04 · GitHub `asifmkp/ntbf-platform`

| Field | Value |
|---|---|
| **Purpose** | **SOURCE OF TRUTH for code and all AI coordination** (`/ai`) [V: DEC-001] |
| **Canonical** | Owner-confirmed 2026-07-22. Other copies are consumers or temporary workspaces |
| **CI** | **NONE** [V: FACT-002, RISK-004] — merge to `main` = production deploy |
| **Branches** | `main`, `feature/*`, `muhammed/*` worktrees, `origin/docs/*` convention [V: git] |
| **Problems** | No CI gate · three local copies (`ntbf-platform`, OpenClaw workspace, `foodstuffs-app`) |
| **Future** | TASK-015 activate CI (template exists) [V]; archive `foodstuffs-app` after salvage check [R] |

## 3.6 SYS-05 · Claude account layer

| Field | Value |
|---|---|
| **Composition** | 17 connectors · 18 plugins · 10 skills · 2 cloud environments · 1 daily Routine (9:00 UAE owner ping) [V: FACT-013] |
| **Isolation** | Sandbox cannot reach the production app [V: FACT-014] |
| **Problems** | Connector org-auth state **UNKNOWN** [V: UNK-008] · UI feature state **UNKNOWN** [V: UNK-009] · a stored Routine prompt embeds a dashboard review-token [V: RISK-008] |
| **Recovery** | Stateless — durable knowledge lives in the repo [V: DEC-001] |

## 3.7 Cross-cutting subsystems

| Subsystem | State | Evidence |
|---|---|---|
| **Backups** | Code merged and live, **INERT** pending Supabase provisioning; DEC-019 defines done = demonstrated restore | [V: STATUS.md] |
| **Audit trail** | Recording, **hash-chained**; off-box export **OFF** (env unset) | [V: STATUS.md, I-09] |
| **RBAC** | Staff JWT + role-enforced transitions with server-side 403s; `StaffAuthGuard` + inline admin gates | [V: CLAUDE.md] |
| **OCR** | `POST /api/bills/extract` (Claude), reused by the Rashid expense module to prefill | [V: CLAUDE.md] |
| **Approvals** | Department submit → approve, Super Admin override; `statusHistory[]` on every record | [V: CLAUDE.md Phase 0] |
| **Idempotency** | `clientRef` standard for retried writes; offline outbox queues network failures only | [V: DEC-011] |
| **Monitoring/alerting** | **UNKNOWN — none documented** | [V: ENTERPRISE_SYSTEM_MAP] |
| **Knowledge/memory** | `/ai` registers (durable, git-versioned) + Muhammed's volatile session map + write-only Q&A log | [V] |
| **System B (Prisma)** | Dormant, routable dead code; **decision made to remove** | [V: DEC-002, DEC-018] |

---

### §3 Inventory — executive summary

Eleven systems, of which five are production-critical. The estate is **more mature than its size
suggests** — hash-chained audit, regression-guarded display standards, a fail-closed ledger write
path, and a formal evidence protocol. Its weaknesses cluster in **continuity and observability**,
not in features: an unbacked source of truth (mitigation live but inert), no CI, no monitoring
documented anywhere, and a production system with no version control. Three of those four are
days of work.

---

# §4 · ARCHITECTURE ASSESSMENT

## 4.1 What is excellent

| Item | Why it is excellent |
|---|---|
| **Capability-based tool gating** [V: `muhammed.tools.ts:342`] | Security by construction. Out-of-scope data is never fetched, not merely hidden. A jailbreak cannot exfiltrate what was never handed to the model. Most production LLM apps fail this. |
| **Zoho write path** [V: CLAUDE.md] | Single choke point, fail-closed, org-guarded, write-locked, drafts-only, proven then reverted. Reference-grade. |
| **Evidence protocol (DEC-015)** [V] | Documentation that cannot silently lie. Contradictions mark facts CONTESTED and **block downstream conclusions**. This is stronger than most enterprise ADR practice. |
| **Live-vs-Historical standard (DEC-017)** [V] | One enterprise rule replacing per-screen fixes, enforced by a 32-check suite. Exactly how a data-semantics defect should be handled. |
| **`note_gap`** [V] | Every failure becomes structured product signal, free and continuous. |
| **Traceability standard (DEC-016)** [V] | Business Objective → … → KB Update per change. Rare even in regulated enterprises. |
| **DEC-014 gating discipline** [V] | Refusing to build an orchestrator until five evidence gates fire is the single most mature decision in the register. |

## 4.2 What is good

- **Role-enforced state transitions** with server-side 403s and hidden buttons [V]
- **`clientRef` idempotency** as a standard, not an afterthought [V: DEC-011]
- **Atomic file writes** (tmp + rename) consistently applied [V: `muhammed.log.ts:37`]
- **PWA cache-bump convention** doubling as a frontend changelog [V: DEC-012]
- **Hash-chained audit trail** [V]
- **Muhammed's one-persona / role-scoped design** — staff meet one colleague, not five bots [V]

## 4.3 What is acceptable

- **File-backed JSON stores** — correct for today's scale, explicitly chosen (DEC-002), with a
  known ceiling. Acceptable *because* it is documented as a constraint rather than believed to be
  a strategy.
- **`max_tokens: 800` / 10-turn session cap** [V] — right for WhatsApp, limiting for analysis.
- **Render Starter single instance** — matches a four-person team; ASM-003 tracks the assumption.

## 4.4 What is dangerous

Ordered by consequence [R].

| # | Item | Why dangerous |
|---|---|---|
| **D1** | **Unbacked source of truth** (RISK-001) | Extinction-level. Mitigation is live but **inert** pending one owner action. |
| **D2** | **AI reads a client-pushed mirror** (§1.3, FACT-019) | Produces confidently wrong numbers. Destroys trust, which is the product. |
| **D3** | **`PUT /api/appstate` may be unauthenticated in prod** (RISK-003, UNK-001) | Full-dataset overwrite by an unauthenticated caller. Both a data-integrity and an availability threat. |
| **D4** | **Shared `WHATSAPP_INGEST_TOKEN` grants role assertion** [V: `muhammed.service.ts:72`] | One secret, two purposes. Holder can assert `roles:["admin"]` and read all company financials. |
| **D5** | **No CI; merge = deploy** (RISK-004) | No gate between a bad diff and production, while surface area grows. |
| **D6** | **Production code outside version control** (FACT-011) | The WhatsApp bot cannot be reliably rolled back or handed over. |
| **D7** | **Four burned credentials, no rotation cadence** | Anthropic, Zoho, admin password, Google OAuth. A pattern, not incidents. |
| **D8** | **No monitoring or alerting documented** | Failures are discovered by humans noticing. Unknown MTTD. |

## 4.5 Debt ledger

**Technical debt.** Three repo copies · System B dead-but-routable (DEC-018 pending execution) ·
legacy demo views wired but empty (DEC-009) · unfiltered legacy `collect()`/`eod()` dead code
kept alive only by an override (FACT-025) · tool results truncated at 1500 chars without error
[V: `muhammed.service.ts:143`] · `render.yaml` ships the wrong Zoho org (DEC-003).

**Operational debt.** No monitoring · no alerting · no restore drill · off-box audit export
disabled · no documented runbook · MTTD/MTTR unknown.

**Security debt.** Four burned credentials · seeded passwords in source control (RISK-002) ·
shared multi-purpose token (D4) · possible open `PUT /api/appstate` (RISK-003) · stored XSS
(RISK-006) · review-token embedded in a stored Routine prompt (RISK-008).

**Business debt.** 1,160 of 1,407 items unpriced [V: CLAUDE.md] · opening staff floats unposted
(UNK-004) · AED 9,399.60 receivable unresolved — **84% of open AR** (UNK-003) · vehicle-loan
figures pending (UNK-005) · supplier TRNs missing (UNK-010).

**AI debt** [R] — the category most teams omit:
- **No accuracy measurement.** `answered: !gap` counts a confidently wrong answer as success [V]
- **No cost accounting.** No token telemetry anywhere in the code [V]
- **No evaluation set.** No regression suite for AI behaviour, unlike the 32-check data suite
- **No memory retrieval.** Durable log written, never read back [V]
- **No prompt versioning.** System prompt is composed inline; changes are untracked as artifacts
- **Unread telemetry.** `team_unanswered` exists and has apparently never been consulted [I]

**AI debt is the fastest-compounding category here** [R], because every capability added
multiplies the surface over which accuracy is unmeasured.

---

### §4 Assessment — executive summary

The architecture is **strong where it was designed deliberately and weak where it grew by
default**. Deliberate areas — authorization, ledger writes, data-display semantics, documentation
protocol — are at or above enterprise standard. Default areas — continuity, observability,
credential lifecycle, AI accuracy measurement — are absent rather than poor. This is a favourable
pattern: absence is cheaper to fix than bad design, and none of the eight dangerous items requires
re-architecture.

---

# §5 · MUHAMMED

## 5.1 Current architecture

```
  WhatsApp +971 58 980 0236            In-app "Muhammed" tab
            │                                    │
   Supabase edge fn v41                          │
   staff_roster pre-check                        │
            │ x-ingest-token                     │ staff JWT
            ▼                                    ▼
      POST /api/muhammed/wa            POST /api/muhammed/ask
            └──────────────┬─────────────────────┘
                           ▼
                   MuhammedService.handle()
                           │
        ┌──────────────────┼───────────────────┐
        ▼                  ▼                   ▼
   system(identity)   toolsForRoles()     sessions Map
   role · menu ·      24 tools,           10 turns,
   tool list · time   role-filtered       VOLATILE
                           │
                           ▼
              tool loop · MAX_ROUNDS 6 · MAX_TOOL_CALLS 15
                           │
                           ▼
                appstate blob  ← ⚠ NOT the source of truth
                           │
                           ▼
                   MuhammedLog (durable, write-only)
```

## 5.2 Strengths

1. **Capability-gated confidentiality** — the boundary is the tool array, not the prompt [V]
2. **One persona, many roles** — organisationally elegant; staff meet a colleague [V]
3. **Multilingual by script detection** — EN/ML/HI/UR/AR, matching a UAE workforce [V]
4. **Grounded time** — UAE-localised `now` injected per request, so "today" is anchored [V]
5. **Honest-by-construction** — *"every number comes from a tool; NEVER invent data"*, backed by
   `note_gap` [V]
6. **Clean history hygiene** — only text turns persisted, no tool scaffolding, keeping replays
   valid and small [V: `muhammed.service.ts:150`]
7. **WhatsApp dedupe** via `waSeen` [V]

## 5.3 Weaknesses

| # | Weakness | Evidence | Severity |
|---|---|---|---|
| W1 | **Reads client mirror, not source of truth** | §1.3, FACT-019 | **Critical** |
| W2 | **No time dimension** — "orders carry no date yet" | `muhammed.tools.ts:147` | **Critical** |
| W3 | **Volatile working memory** — dies on redeploy | `service.ts:44` | High |
| W4 | **Durable log never read back** — memory exists, unused | `muhammed.log.ts` | High |
| W5 | **Tool results truncated at 1500 chars, silently** | `service.ts:143` | High |
| W6 | **Role assertion via shared secret** | `service.ts:72` | High |
| W7 | **Split identity across channels** — `s.id` vs `wa-<phone>` | `service.ts:71-72` | Medium |
| W8 | **No accuracy measurement** — `answered: !gap` | `service.ts:168` | Medium |
| W9 | **Single-instance state** — sessions + dedupe in process | `service.ts:45,47` | Medium |
| W10 | **No knowledge beyond appstate** — no Zoho, documents, policies | `service.ts:105` | Medium |

**On W5**, which is easy to under-rate: `collections` over ~40 customers will exceed 1500 chars.
The model then receives **truncated, syntactically invalid JSON** and answers anyway. This is a
live correctness risk on the tool most likely to inform a credit decision.

**On W7**: the same human messaging via WhatsApp versus the in-app tab can receive two different
session keys, so continuity silently splits by channel [I — follows from the code path; not yet
observed in production].

## 5.4 Memory, knowledge, reasoning

| Layer | Present | Assessment |
|---|---|---|
| **Working memory** | 10 turns, in-process | Volatile; adequate for single exchanges only |
| **Episodic memory** | `muhammed-log.json`, capped 5000 rows | **Written, never retrieved** — the largest cheap win |
| **Semantic memory** | none | No policies, supplier terms, pricing history |
| **Knowledge** | appstate blob | Wrong binding (W1), no history (W2) |
| **Reasoning** | 6 rounds × 15 tool calls, 800 output tokens | Adequate for lookup; insufficient for analysis |

## 5.5 Evolution — the Chief of Staff path

Five stages [F]. Each is gated on the previous, and none requires rewriting Muhammed.

| Stage | Capability | Precondition |
|---|---|---|
| **M1 · Trusted** | Correct numbers from the source of truth | Rebind read path (R2) |
| **M2 · Temporal** | "today / this week / vs last month", trends, anomalies | Time dimension (R4) |
| **M3 · Continuous** | Remembers across sessions and channels; one identity | Durable memory + identity unification |
| **M4 · Proactive** | Pushes briefings and alerts unprompted | Scheduled capability invocation |
| **M5 · Acting** | Drafts (T2) then executes approved actions (T3) | Capability layer + approval fabric |

**M1 and M2 are not AI work.** They are data work. This is the single most important sentence in
§5 [R].

## 5.6 Relationship to every other system

| System | Relationship | Target [F] |
|---|---|---|
| **ERP (SYS-01)** | Reads appstate mirror | Consumes capabilities bound to source of truth |
| **Zoho (SYS-02)** | None | Reads reconciled financials via capability |
| **WhatsApp (SYS-03)** | Ingress via shared secret | Ingress via per-consumer service account |
| **OpenClaw** | None | Peer consumer of the same capability layer — never a dependency |
| **Claude Code** | None (build-time only) | Unchanged — builds Muhammed, is not called by him |
| **Backup subsystem** | None | Muhammed's log becomes backed-up business data |

---

### §5 Muhammed — executive summary

Muhammed is a well-engineered read-only assistant with an excellent security model and two
critical data defects: he reads a client mirror rather than the system of record, and his data
has no time dimension. Neither is an AI problem and neither requires redesign — they are
implementation and schema work respectively. Fix those and Muhammed reaches M2 (trusted +
temporal), which is roughly 70% of the perceived value of a Chief of Staff. Memory, proactivity
and action follow naturally and cheaply afterwards.

---

# §6 · OPENCLAW

## 6.1 What it is

An always-on Gateway process routing between chat channels, models, and tools, plus a CLI and
Control UI [V]. Version `2026.7.1-2` [V]. On this machine: Gateway on `:18789`, loopback-bound,
token auth, `allowInsecureAuth: false`; one agent (`main`); default model
`anthropic/claude-sonnet-5`; **0 fallbacks**; 17 of 53 skills ready; **0 channels installed**;
**0 OpenClaw-managed MCP servers**; tool profile `coding` [V, observed 2026-07-22].

**Critical property:** all five configured models use `agentRuntime: claude-cli` — OpenClaw
**spawns Claude Code as a subprocess** rather than calling the API directly [V].

## 6.2 Why OpenClaw exists

It provides what neither Muhammed nor Claude Code does [R]: **owner-side orchestration** — cron
scheduling, durable background tasks, multi-channel ingress, MCP management, browser automation,
node/device pairing, and an OpenAI-compatible Gateway API.

## 6.3 Strengths

- Cron, TaskFlow durable tasks, hooks, heartbeat, standing orders [V/D]
- MCP lifecycle management with **per-server tool include/exclude filters** [V]
- 28-channel catalogue; profile and Gateway-level isolation [V]
- **Gateway exposes `/v1/chat/completions`, `/v1/models`, `/v1/embeddings`, `/v1/responses`** [D]
- Metadata-only audit records [V]

## 6.4 Limitations

| # | Limitation | Consequence |
|---|---|---|
| L1 | **Laptop-hosted** | Not available when the machine is off — cannot serve operations |
| L2 | **Beta** — security/auth/secrets and automation rated **M3 Beta ~79%** [D] | Unsuitable as a production dependency |
| L3 | **Single-user** | No staff-facing multi-tenancy |
| L4 | **Runtime coupling to Claude Code** | A Claude Code prompt becomes an OpenClaw hang [V — observed: the 180s trust-dialog hang, 2026-07-22] |
| L5 | **0 fallbacks configured** | One provider hiccup halts all owner automation |

## 6.5 What OpenClaw should own — and never own

**Should own** [R]: owner cockpit and briefings · research and long-running analysis · development
orchestration · MCP and browser automation · cross-system investigation · experimentation before
promotion to production.

**Should never own** [R]:
1. **Any capability staff depend on** — violates P-06; L1 makes the laptop a SPOF
2. **Business logic** — violates P-03; logic belongs with the data owner
3. **Source of truth for anything** — owner-confirmed 2026-07-22
4. **Production credentials for write operations** — Beta software (L2) must not hold write keys
5. **Customer-facing channels** — no availability guarantee

## 6.6 Relationships

| To | Relationship |
|---|---|
| **Muhammed** | **Peers, not parent/child.** Both consume the capability layer. Neither depends on the other. This is the federation (OD-001, Option C) |
| **Claude Code** | Host/runtime — OpenClaw spawns it. Explains why Claude Code faults present as OpenClaw faults (L4) |
| **ERP** | Read-only consumer via capabilities; **never direct database access** (P-03) |

---

### §6 OpenClaw — executive summary

OpenClaw is the owner's orchestration cockpit and should remain exactly that. It is Beta,
laptop-hosted, and single-user — three properties that permanently disqualify it from owning
anything staff or customers depend on. Its correct role is to *consume* the same capability layer
Muhammed consumes, giving the owner reach without making a desktop into production infrastructure.
The most valuable unexplored asset is its OpenAI-compatible Gateway API, which would let the NTBF
backend call AI through one governed path.

---

# §7 · CLAUDE CODE

## 7.1 Role

The **development and architecture agent**. It builds the platform; it is not part of the
platform's runtime. Version 2.1.217 [V].

## 7.2 Responsibilities

| Area | Current [V] | Target [F] |
|---|---|---|
| Implementation | Feature build under plan-first → approval → code gates | Unchanged — the gate discipline is correct |
| Architecture | This document; audits | Formal review of every capability contract |
| Testing | Regression suites (32-check standard, 9/9 Jest on backup) | AI evaluation sets — currently absent |
| Documentation | `/ai` register maintenance under DEC-015/016 | Unchanged |
| Automation | Worktrees, `gh-issues`, PR flow | CI authorship once TASK-015 activates |

## 7.3 The workflow that works, and why

Observed in the registers [V]: **plan-first → written owner approval → small staged change →
test evidence → PR → register update.** `CLAUDE.md` states it as a hard rule; `DEC-016` makes it
auditable; `STATUS.md` shows it being followed — including a Dubai-local-vs-UTC day-boundary bug
caught *before* merge on the backup module.

**This is the single strongest process asset in the company** [R], and it is worth more than any
individual system. It should not be relaxed as AI capability increases; it should be tightened,
because increasing autonomy raises the cost of an ungated error.

## 7.4 Long-term role

Claude Code remains a **build-time agent**, never a runtime dependency [R]. As the capability
layer matures, its work shifts from writing endpoints to **authoring and reviewing capability
contracts** — the highest-leverage artefacts in the architecture. It should never be granted
production write credentials; it proposes, humans and CI merge (P-05).

---

### §7 Claude Code — executive summary

Claude Code is the build-time agent and should stay strictly build-time. Its plan-first,
evidence-recorded workflow is the company's strongest process asset and the reason this
architecture is auditable at all. Its long-term evolution is upward in abstraction — from writing
code to authoring capability contracts — not outward into runtime.

---

**END OF SESSION 2** · §3, §4, §5, §6, §7 complete.
Session 3: §8 ERP · §9 Capability Layer · §10 AI Organization · §11 Knowledge · §12 Data.
Open [I] statements to resolve: W7 (split identity, unobserved), AI-debt item "telemetry unread".
# §8 · THE ERP

## 8.1 Two systems, one decision

| | System A — LIVE | System B — DORMANT |
|---|---|---|
| Storage | File-backed JSON, `STATE_DIR/data/*.json` | Prisma / Postgres schema |
| Status | All live features [V: DEC-002] | Never operationalised; no `DATABASE_URL` in prod [V: DEC-002] |
| Fate | Evolve | **Retire and remove** [V: DEC-018] |

**A clarification the Bible must make explicit** [R], because it is the single most
misreadable decision in the register:

> **DEC-018 retires System B's *unmaintained code*. It does not commit NTBF to JSON files
> forever.**

DEC-018's own context states the owner's 1–3 year vision as "an AI-first enterprise OS built by
evolving System A's patterns (**multi-warehouse/branch/company-ready**, commercialization-possible)"
[V]. Multi-warehouse, multi-branch and multi-company are **not achievable on a single-instance
last-write-wins JSON blob** — for reasons proven at source in §8.3. Removing a dead skeleton and
later adopting a properly-designed relational store behind a stable contract are entirely
compatible acts. Conflating them would freeze the architecture at its current ceiling.

## 8.2 Current design

**Stack** [V]: NestJS + TypeScript backend; vanilla-JS PWA/TWA frontend; Docker on Render
(Starter, single instance); persistent disk at `/var/data`.

**Persistence pattern** [V], applied consistently across `StaffStore`, `AppStateService`,
`MuhammedLog`, and the money stores:

- One JSON file per domain under `STATE_DIR/data/`
- Atomic write: serialise → `.tmp` → `fs.renameSync`
- Monotonic `seq` for ID allocation; `statusHistory[]` on business records
- Errors on persist are **swallowed** with a memory-only fallback
  [V: `appstate.module.ts:54`, `muhammed.log.ts:43`]

**Assessment** [R]: the atomic-rename pattern is correct and consistently applied — genuinely
good practice. The **silent persist failure is not**. A disk-full or permission error degrades the
system to memory-only with no alarm, and the next restart loses everything written since. This
belongs in the Operational debt ledger (§4.5) and is a candidate for the first alerting rule the
company ever writes.

## 8.3 The appstate architecture — traced at source

This subsection is the most consequential technical content in the document, because it explains
FACT-019 and constrains every scaling ambition.

```
   Devices (staff PWA, customer portal)
        │  PUT /api/appstate   { state: <ENTIRE dataset> }
        ▼
   AppStateService.put(state)
        mem = { rev: mem.rev + 1, state }     ← FULL REPLACE, no merge
        persist() → tmp → rename              ← errors swallowed
        │
        ├────────────▶ data/appstate.json     ← what Muhammed reads
        │
   (separate, unrelated)
   Server money/order stores  ────────────────▶ data/*.json   ← FACT-001 source of truth
```

**Verified properties** [V: `appstate.module.ts`]:

1. **Initial state is `{ rev: 0, state: null }`** (line 24)
2. **`put()` replaces the entire blob** — `this.mem = { rev: this.mem.rev + 1, state }` (line 35).
   There is no merge, no field-level update, no conflict detection. The header comment names it:
   *"Pragmatic last-write-wins with client re-sync — right-sized for a small team."*
3. **`clear()` resets to `{ rev: 0, state: null }`** (line 43) — the admin clear-test-data path
4. **The authors documented the ceiling themselves** (line 19):
   *"(For heavier concurrency, migrate to the relational Prisma models.)"*

### 8.3.1 Root cause of Muhammed's zeros — closed

The chain, fully traced [V]:

| Step | Evidence |
|---|---|
| `appstate.state` initialises to **`null`** | `appstate.module.ts:24` |
| DEC-008 wrote July history to **server stores only** — "the client KPI dataset (appstate/S) is untouched" | DEC-008 |
| Muhammed reads `this.appstate.get()?.state` | `muhammed.service.ts:105` |
| Tools degrade defensively: `arr(state,'orders')` returns `[]` when state is null | `muhammed.tools.ts:33` |
| ⇒ every admin figure computes to **zero**, reported confidently | FACT-019 |

**This closes the root-cause question raised in §1.3.** It is an implementation defect exactly as
the owner characterised it — and the remedy is a read-binding change, not a redesign. But note
what the defensive coding does: `arr()` returning `[]` on null converts *"I have no data"* into
*"the answer is zero."* **Defensive defaults that are indistinguishable from real answers are an
anti-pattern in any system feeding a language model** [R]. The correct behaviour is to raise, so
`note_gap` fires and the user is told the truth.

### 8.3.2 Why last-write-wins caps the scaling vision

Two devices syncing concurrently: device A reads rev 5, device B reads rev 5, A puts (rev 6), B
puts (rev 7) — **A's changes are silently gone.** The `rev` counter increments but is never
compared on write [V: line 35]; nothing rejects a stale base.

At four staff on one warehouse this is tolerable and was a defensible choice. At **multi-warehouse
or multi-company scale it is a guaranteed data-loss mechanism**, and no amount of client re-sync
logic fixes a protocol that cannot detect conflict. This is the concrete, code-level reason the
persistence layer must eventually change — and the reason §9 exists.

## 8.4 Authentication and authorization

**`ApiGateGuard`** [V: `api-gate.guard.ts`] — protects the public-facing endpoints:

- If `PUBLIC_API_TOKEN` **is set**: require matching `x-api-key` **OR** a valid staff JWT
- If **unset**: *the gate is open* (line 36 — the `if (token)` branch is simply skipped)
- Per-IP rate limit, default 30 requests / 60 s

**Two findings** [V]:

**F1 — `@Public()` does not disable this guard.** `ApiGateGuard` has no `Reflector` and performs
no `IS_PUBLIC_KEY` lookup. The `@Public()` decorators on the appstate routes affect some *other*
(global) guard, not this one. So `PUT /api/appstate` **is** gated by `ApiGateGuard` — and its
protection reduces entirely to whether `PUBLIC_API_TOKEN` is set in production. That is precisely
**UNK-001**, still unresolved, and it is why **RISK-003 cannot be downgraded without an answer.**

**F2 — the `dev-secret` fallback creates a second, independent bypass.**
Line 69: `const secret = this.config.get('JWT_SECRET') || 'dev-secret';`

If `JWT_SECRET` were unset in production, **anyone can mint a JWT signed with the literal string
`dev-secret`, set `typ:'staff'`, and satisfy `hasValidStaffSession()`** — bypassing the API gate
*even when `PUBLIC_API_TOKEN` is correctly set*. This is TASK-020 ("JWT fail-fast, kill the
`dev-secret` fallback"), ranked Phase 0.3 [V: ROADMAP].

**The chain that matters** [R]: full-dataset overwrite via `PUT /api/appstate` is protected by
**two environment variables, neither of which has been verified in production.** Defence in depth
requires the layers to be independent; here both layers fail to the same condition — an unset env
var. TASK-020 and TASK-021 should be treated as **one change**, not two.

## 8.5 Business rules and the approval system

**Approvals** [V: CLAUDE.md]: department submit → approve, with Super Admin override. Order
transitions are role-enforced server-side with 403s and hidden buttons: PLACED→CONFIRMED
(Tahir/admin, blocked while `needsReview`), CONFIRMED→PACKED (Haris/admin), →OUT_FOR_DELIVERY
(Haris/Musthafa/admin), →DELIVERED with real collected-cash (Musthafa/admin). Admin overrides are
flagged. Every order carries a full `statusHistory[]`.

**Expenses** [V]: SUBMITTED → APPROVED | REJECTED, auto-approve ≤ AED 50 (admin-editable),
`statusHistory[]`, OCR prefill via `POST /api/bills/extract`.

**Assessment** [R]: **this is the asset the entire AI programme should be built on.** A working,
role-enforced, server-side, audit-trailed approval chain already exists. §9's most important
design rule follows directly: the capability layer must **delegate to this**, never reimplement
it. Building a parallel AI approval system beside a working human one is the single most likely
architectural mistake available to this project.

## 8.6 What the ERP lacks

| Gap | Consequence | Priority [R] |
|---|---|---|
| **No time dimension on orders** [V] | No trends, comparisons, forecasting, anomalies — Priority 3 unreachable | **Critical** |
| **No event system** | Every integration is a poll or a manual trigger; no reactive automation | High |
| **No conflict detection on writes** [V: §8.3.2] | Silent data loss above single-warehouse scale | High |
| **No monitoring/alerting** [V] | Failures found by humans; MTTD unknown | High |
| **Silent persist failures** [V] | Degrades to memory-only with no alarm | Medium |
| **No app→Zoho sync** [V: I-08, TASK-012] | Books lag operations; manual catch-up grows daily | High |

**On the event system** [R]: NTBF currently has no way to say *"when an order is delivered, do
X."* Every automation must poll or be manually invoked. An internal event bus — even a trivial
in-process emitter persisted to disk — would unlock reactive automation across §13 at a fraction
of the cost of the alternatives. This is a **strong candidate for the highest-leverage
architectural addition after the capability layer**, and it should be designed *with* the
capability layer, since capability invocations are the natural event source.

---

### §8 ERP — executive summary

System A is a well-executed file-store ERP with a genuinely good approval chain, consistent atomic
writes, and a documented, honest awareness of its own limits. Its ceiling is proven at source:
last-write-wins with no conflict detection cannot support multi-warehouse or multi-company
operation. Muhammed's zeros are fully explained — appstate initialises to `null` and DEC-008
deliberately wrote history to server stores only. Two independent auth bypasses (unset
`PUBLIC_API_TOKEN`, `dev-secret` JWT fallback) both gate a full-dataset overwrite endpoint and
should be fixed as one change.

---

# §9 · THE CAPABILITY LAYER

*The heart of the future architecture.*

## 9.1 Why it exists

Four forces converge on one solution [R]:

1. **Multiple consumers, one truth.** Muhammed, OpenClaw, the WhatsApp bot, the PWA, and future
   agents all need business operations. Without a shared layer, each re-implements them — and
   they will diverge. This violates P-03 and is how architectures die.
2. **Storage must change; consumers must not.** §8.3.2 proves the JSON store has a hard ceiling.
   P-09 forbids a disruptive migration. **The only way to satisfy both is a stable contract
   between consumers and storage.** That contract is the capability layer.
3. **Authorization belongs in one place.** Muhammed's role→tool gating is excellent but
   *hardcoded in Muhammed* [V: `muhammed.tools.ts:342`]. A second consumer would duplicate it.
4. **Autonomy requires attribution.** Granting AI more authority is only safe if every invocation
   is attributable and auditable (P-12).

> **The capability layer is not "Muhammed's tools promoted." It is a separate tier that Muhammed
> becomes a consumer of.**

## 9.2 Ownership model

**Principle: the system that owns the data owns the capability** (P-03).

| Domain | Owner | Consumers |
|---|---|---|
| Orders, receipts, expenses, advances, staff | **NTBF backend** (FACT-001) | Muhammed, OpenClaw, PWA, agents |
| Ledger, VAT, bills, POs | **Zoho** via NTBF's `ZohoService` | as above |
| Customer chat history | **Supabase** (FACT-011) | Muhammed, OpenClaw |
| Code, decisions, knowledge | **Repo `/ai`** (DEC-001) | all agents |

**Neither Muhammed nor OpenClaw owns any business capability.** Both are pure consumers. This is
what makes the OD-001 federation real rather than decorative, and it is why either can fail
without stopping operations (P-06).

## 9.3 Trust tiers

Every capability is assigned exactly one tier at definition time. **The tier mechanically
determines the approval requirement** — approval is never a per-capability judgment call.

| Tier | Semantics | Approval | Reversible | Examples |
|---|---|---|---|---|
| **T0** | Public read | none | n/a | catalog lookup, price list |
| **T1** | Scoped read | role grant | n/a | `collections`, `my_route`, `cash_in_hand` |
| **T2** | **Draft / propose** | **none** | fully | draft PO, draft bill from OCR, draft quote, draft reply |
| **T3** | Commit — business effect | async human approval | via audit trail | confirm order, approve expense, post GRN |
| **T4** | Irreversible / external | synchronous explicit confirm | no | ledger post, payment, customer message, deletion |

**The strategic significance of T2** [R]: it is the tier where AI creates most of its value at
**zero business risk**, and it needs **no approval workflow at all**. A drafted PO that a human
reviews removes the typing, the lookup, and the arithmetic — the actual labour — while the human
retains the decision. Most programmes lump all writes into one frightening bucket and defer them
together. **NTBF should ship T2 capabilities early and defer T3/T4 machinery.** This single
insight can pull most of the roadmap's business value forward by months.

## 9.4 Capability lifecycle

```
  DEFINE ──▶ AUTHORIZE ──▶ INVOKE ──▶ [T2 DRAFT] ──▶ [T3/T4 APPROVE] ──▶ EXECUTE ──▶ AUDIT
     │           │            │            │                │               │          │
  contract   principal    args valid   artifact         existing         effect    principal,
  + tier     + grants     + rate       created,         NestJS           applied   capability,
  + version               limited      no effect        approval                   version,
                                                        chain (§8.5)               args hash,
                                                                                   outcome,
                                                        ROLLBACK ◀────────────────  correlation
```

**Rollback** [R]: T3 effects must be compensable — every T3 capability declares its inverse at
definition time, or it is reclassified T4. This is stricter than typical practice and deliberately
so: a capability whose author cannot describe how to undo it does not understand it well enough to
let an AI invoke it.

## 9.5 Authorization

Grants are `(principal, capability, constraints)`. Principals are **service accounts, never shared
secrets** — directly closing the D4 finding, where one `WHATSAPP_INGEST_TOKEN` currently permits
role assertion [V: `muhammed.service.ts:72`].

Muhammed's existing model is **re-based, not discarded**: `toolsForRoles()` becomes a projection
over the layer's grants rather than a hardcoded map. The security property (the model only ever
receives permitted capabilities) is preserved exactly — it simply becomes shared infrastructure
instead of one application's private virtue.

## 9.6 Versioning

Capabilities are contracts. Additive changes are minor; breaking changes mint a new major with
both served during migration. NTBF already demonstrates the discipline: the
`/api/portal/orders/ingest` contract is **frozen and genuinely respected** [V: CLAUDE.md].

**Time-awareness must be designed into v1** [R]. Freezing v1 contracts that can only return
"current snapshot" would force either a breaking change or a permanent parallel family of
`*_by_date` capabilities. This is why R4 (time dimension) must precede capability freeze, and it
is the strongest argument for reordering the owner's roadmap (§17).

## 9.7 Audit

Every invocation records principal, capability, version, argument hash, outcome, timestamp,
correlation ID. Two existing precedents [V]: the backend audit trail is **hash-chained**, and
OpenClaw's audit is deliberately **metadata-only**. Adopt both properties — tamper-evidence from
the first, content-minimisation from the second.

## 9.8 The reference implementation already exists

**`ZohoService.post()`** is the pattern every write capability should copy [V: CLAUDE.md Gate 2/3]:

- A **single choke point** for all writes
- **Fail-closed** org guard — verified 403 against a real second org
- **Write-lock** via `ZOHO_WRITES_ENABLED`, default false
- **Drafts-only** proven end-to-end (PO-00001 written, verified, then deleted)

Choke point + fail-closed + kill switch + drafts-only is exactly the T2/T3/T4 discipline
generalised. **NTBF does not need to invent its capability-write pattern — it needs to
generalise the one it already proved.**

## 9.9 MCP compatibility

MCP is a **transport and description format**, not the capability layer itself [R]. Capabilities
are defined once, in the backend; MCP is one projection of them for AI consumers. Muhammed's tool
definitions are another; REST for the PWA is a third.

This ordering matters. Defining capabilities *as* MCP tools would couple business logic to an AI
protocol and make the PWA a second-class consumer. **The capability layer must be protocol-neutral
at its core.** OpenClaw's per-server tool include/exclude filters [V] then become the safe way to
expose a subset to owner-side tooling.

---

### §9 Capability Layer — executive summary

The capability layer is the mechanism that makes the owner's two hardest constraints
simultaneously satisfiable: design for ten-year multi-entity scale (P-10) while never performing a
disruptive migration (P-09). It achieves this by placing a stable contract between consumers and
storage, so persistence can change beneath it. Ownership follows the data; trust tiers
mechanically determine approval; T2 drafts deliver most of the value at zero risk and need no
approval machinery; and the write pattern is already proven in `ZohoService.post()`. MCP is a
projection, never the definition.

---

# §10 · THE AI ORGANIZATION

## 10.1 This section is subordinate to DEC-014

The owner has already decided — correctly — to **postpone the orchestrator behind five gates**
[V: DEC-014, ROADMAP §3]:

| Gate | Condition |
|---|---|
| **G1** | ≥2 different agents completing queue tasks in the same week, sustained 2+ weeks |
| **G2** | CI active (TASK-015) |
| **G3** | Backups live **and drilled** (TASK-014) |
| **G4** | App→Zoho sync stable ≥2 weeks (TASK-012) |
| **G5** | Evidence the file protocol is the bottleneck — ≥2 claim collisions, or owner wants more parallel workstreams |

**The Bible adopts these gates unchanged** and adds one [R]:

> **G6 — the capability layer exists with ≥5 T1 capabilities in production.** Agents without a
> shared capability layer must each implement business logic, violating P-03 permanently. Creating
> agents before the layer bakes duplication into the organisation.

The reasoning in DEC-014 is worth preserving verbatim as institutional wisdom: *"the /ai file
protocol + PR template + CI is the orchestrator today — zero runtime to maintain and no new
failure modes"* [V].

## 10.2 Muhammed's position

Muhammed sits at the top of the **human interface**, not the execution path (§1.7, P-06).

```
                     STAFF & OWNER
                          │
                     ┌────▼─────┐
                     │ MUHAMMED │   interface · coordination · escalation
                     └────┬─────┘
                          │  consumes (never owns)
              ┌───────────▼────────────┐
              │   CAPABILITY LAYER     │ ◀── OpenClaw (owner cockpit, peer)
              └───────────┬────────────┘
                          │
        ┌─────────────────┼──────────────────┐
        ▼                 ▼                  ▼
   NTBF backend        Zoho            Supabase
   (orders, cash)      (ledger)        (chat)
```

Specialist agents, when they exist, are **peers of Muhammed at the consumer tier** — not children
beneath him [R]. A hierarchy where every agent's traffic flows through Muhammed reintroduces the
chokepoint P-06 exists to prevent. Muhammed *routes questions* and *escalates*; he does not
proxy every call.

## 10.3 When NOT to create an agent

**The discipline is the deliverable here** [R]. Do not create an agent when:

1. **A capability would suffice.** Most "agent" ideas are one capability plus a schedule.
2. **No human bottleneck has been measured.** `team_unanswered` is the instrument [V] — and has
   apparently never been read. Evidence first.
3. **It would need its own copy of business logic** (P-03 violation).
4. **Its work is bursty or rare.** A cron-triggered capability beats a standing agent.
5. **DEC-014 gates have not fired.**
6. **You cannot name the human whose time it returns.** If no one is freed, nothing was gained.

**The default answer to "should we add an agent?" is no.** For a four-person company with 1,160
unpriced items and an unfinished Zoho migration, coordination overhead is a larger threat than
insufficient parallelism.

## 10.4 The candidate roster — gated, not planned

Not a plan. A **prioritised list of what to consider when gates fire** [F].

| Agent | Purpose | Justified when | Tiers |
|---|---|---|---|
| **Ops Analyst** | Daily brief, anomaly detection, exception surfacing | First — directly serves P1/P3 | T1 read |
| **Finance Reconciler** | App↔Zoho drift detection, variance flagging | After TASK-012 sync stable (G4) | T1 + T2 draft |
| **Procurement Assistant** | Reorder proposals, supplier price comparison, draft POs | After stock data is time-aware | T2 draft |
| **Document Processor** | OCR intake → draft bills/expenses at volume | When manual OCR volume is measured as a bottleneck | T2 draft |
| **Dev Agent** | Already exists as Claude Code | now | build-time only |

**Three agents in year one is an ambitious ceiling, not a target** [R]. The owner's original list
of sixteen would produce more coordination cost than output at current scale — and DEC-014 already
encodes the same judgment.

## 10.5 Decision flow, escalation, coordination

**Decision rights** [R]: agents decide *nothing* with business effect. They read, analyse, draft
and recommend. T3/T4 decisions route to the **existing NestJS approval chain** (§8.5) with the
agent recorded as proposer, never approver. This preserves segregation of duties (P-05) and means
the audit trail already answers "who approved this."

**Escalation ladder:** capability returns no data → `note_gap` → logged → `team_unanswered` →
owner review → task or new capability. **This loop already exists and works** [V]; it needs to be
*read*, not rebuilt.

**Coordination:** the `/ai` file protocol under DEC-001/DEC-015/DEC-016 — claims, queue, log,
traceability. Zero runtime. Replace it only when G5 produces evidence it is the bottleneck.

---

### §10 AI Organization — executive summary

The organisation is deliberately small and gate-driven. DEC-014's five gates are adopted unchanged
and a sixth added: no agents before the capability layer exists, or duplication becomes permanent.
Muhammed is the interface tier, with future agents as his peers rather than his subordinates —
a hierarchy routing all traffic through him would recreate the chokepoint P-06 forbids. The most
valuable content here is the six-point test for **when not to create an agent**, and the default
answer is no.

---

# §11 · KNOWLEDGE ARCHITECTURE

## 11.1 What exists

| Layer | Store | State |
|---|---|---|
| **Decisions** | `ai/DECISIONS.md` DEC-001…019 | ✅ Excellent — ADR-lite, supersede rules, "a decision not written here does not exist" [V] |
| **Facts** | `ai/FACT_REGISTER.md` FACT-001…034+ | ✅ Excellent — evidence-graded, dated, CONTESTED blocks downstream [V] |
| **Unknowns** | `ai/UNKNOWNS.md` | ✅ Excellent — `Blocks:` field makes cost of ignorance explicit [V] |
| **Assumptions** | `ai/ASSUMPTIONS.md` | ✅ With invalidation criteria and validation owners [V] |
| **Risks** | `ai/RISKS.md` | ✅ Evidence-linked; CONTESTED propagates [V] |
| **Traceability** | `ai/TRACEABILITY.md` TRACE-### | ✅ Full chain per change (DEC-016) [V] |
| **Conversations** | `muhammed-log.json`, 5000-row cap | ⚠️ **Written, never retrieved** [V] |
| **Working memory** | in-process Map, 10 turns | ❌ Volatile, dies on redeploy [V] |
| **Policies / SOPs** | — | ❌ **Absent** |
| **Supplier terms, pricing history** | — | ❌ Absent (1,160 of 1,407 items unpriced) [V] |
| **Retrieval / search** | — | ❌ No semantic search over any of it |

## 11.2 The asymmetry

**NTBF's *organisational* knowledge architecture is stronger than most enterprises. Its
*operational* knowledge architecture barely exists.** [R]

Decisions, facts, risks and traceability are rigorously governed. But the knowledge staff need
daily — what are this supplier's terms, what did we charge this customer last time, what is the
policy on credit holds — lives nowhere. Muhammed cannot answer those questions not because he
lacks intelligence but because **the company has never written them down.**

## 11.3 The cheapest high-value win in the estate

`MuhammedLog` persists every question, answer, tools used, language and gap reason
[V: `muhammed.log.ts`]. Nothing reads it back into context.

**Retrieval over an existing store is dramatically cheaper than building memory** [R] — the data
is captured, durable, structured and already on the backup path once TASK-014 is provisioned. The
missing piece is a read path, not a new subsystem. Two capabilities — "what did this person ask
recently" and "has this question been asked before" — would convert a write-only log into
genuine institutional memory.

## 11.4 Governance

Extend DEC-015's discipline to operational knowledge [R]: policies and SOPs are versioned in the
repo, carry an owner and a review date, and are retrieved by capability rather than pasted into
prompts. **Prompts are not a knowledge store** — content embedded in a system prompt is unversioned,
unauditable, and invisible to every other consumer.

---

### §11 Knowledge — executive summary

The organisational knowledge layer is exemplary and should be left alone. The operational layer is
absent: no policies, no supplier terms, no pricing history, no retrieval. The highest-value cheap
win is wiring retrieval over the conversation log that is already being written and will shortly
be backed up. Institutional memory that survives staff turnover is one of the three genuine
competitive advantages identified in §21.7.

---

# §12 · DATA ARCHITECTURE

## 12.1 Current state

| Store | Role | Truth? | Problem |
|---|---|---|---|
| `/var/data/*.json` server stores | Live operational records | **YES** — FACT-001 | Unbacked (RISK-001, mitigation inert) |
| `data/appstate.json` | Client-synced blob | **NO** | Last-write-wins; what Muhammed reads (§8.3) |
| Zoho org 928751913 | Ledger, VAT | **YES** — FACT-003 | No automated sync (I-08) |
| Supabase Postgres | Chat history | **YES** — FACT-011 | Source outside VCS |
| Prisma / Postgres | — | Dormant | Being removed (DEC-018) |

**Two server-side representations of the same business reality**, with the AI bound to the wrong
one. That is the defining data problem (§8.3.1).

## 12.2 The time dimension — the deepest gap

*"Orders carry no date yet, so this is the current live snapshot, not a day/range total."*
[V: `muhammed.tools.ts:147`]

Consequences [V/R]: no "today's sales." No week-over-week. No forecasting beyond the crude
velocity heuristic in `forecast()`. No anomaly detection — anomaly requires a baseline, and a
baseline requires history. **Priority 3 is entirely blocked.**

This is not a bug. Orders were never given a temporal dimension. **It is a schema decision, and it
forces the persistence question** — append-only history with correct time semantics is precisely
what relational stores do well and what a single mutable JSON blob does badly.

## 12.3 Target data architecture

```
   WRITE PATH                          READ PATH
   ┌──────────────┐
   │  Capability  │  T2/T3/T4
   │    Layer     │──────────┐
   └──────────────┘          ▼
                    ┌─────────────────┐      ┌──────────────────┐
                    │ Operational     │─────▶│  Analytical      │
                    │ store           │      │  view            │
                    │ (transactional, │      │  (time-series,   │
                    │  time-stamped,  │      │   aggregates,    │
                    │  append-only    │      │   trends)        │
                    │  history)       │      └────────┬─────────┘
                    └────────┬────────┘               │
                             │                        ▼
                             ▼                  Muhammed · OpenClaw · BI
                        Zoho sync
                     (origin exclusion,
                      DEC-007 enforced)
```

**Migration path honouring P-09 (no disruptive migration)** [R]:

| Step | Action | Consumer impact |
|---|---|---|
| 1 | Capability layer over **existing JSON stores** | none |
| 2 | Consumers migrate to capabilities (Muhammed first — fixes §8.3.1 en route) | none |
| 3 | Add timestamps + append-only history **behind** capabilities | none |
| 4 | Swap persistence to relational **behind** capabilities | **none** |
| 5 | Analytical views over the relational store | additive |

**Steps 1–2 alone resolve the trust problem.** Steps 3–5 become routine because no consumer is
coupled to storage. This is the concrete demonstration that P-09 and P-10 are compatible — and it
is why §9 must precede §12 in execution order, despite §12 containing the deeper problem.

## 12.4 On Postgres and DEC-018

Restating §8.1 because it will be misread otherwise [R]:

- **DEC-018 removes System B's unmaintained code.** Correct — it is dead, routable, and a
  liability.
- **DEC-018 does not forbid a future relational store.** The owner's own stated vision within
  DEC-018 is multi-warehouse/branch/company-ready, which §8.3.2 proves the current model cannot
  deliver.

When step 4 arrives it should be a **fresh, deliberately designed schema** built for the
capabilities that exist by then — not a resurrection of the abandoned TRD skeleton. Removing
System B now and designing a new store later are the same decision viewed at two moments.

## 12.5 Reporting and BI

Deliberately deferred [R]. BI over data with no time dimension produces attractive, confident
falsehoods. Sequence: **time dimension → analytical views → BI**. Inverting this is the classic
failure where a dashboard programme consumes a year and erodes trust in the numbers it displays.

Interim: the reconciled July figures in `STATUS.md` [V] demonstrate that manual reporting is
already achievable and reasonably accurate. That is sufficient until step 3.

---

### §12 Data — executive summary

Two server-side representations exist and the AI is bound to the non-authoritative one. The
absence of a time dimension is the deepest gap in the estate and blocks all trend, forecast and
anomaly work regardless of AI capability. The migration path — capability layer first, then
timestamps, then persistence swap, all behind a stable contract — satisfies both the ten-year
scaling instruction and the no-disruptive-migration constraint. Steps 1–2 alone resolve the trust
problem, which is why the capability layer outranks the data model in execution order even though
the data model is the deeper defect.

---

**END OF SESSION 3** · §8, §9, §10, §11, §12 complete.
Session 4: §13 Automation · §14 Security · §15 Infrastructure · §16 Development · §17 Roadmap ·
§18 Decision Register · §19 Risk Register.
New findings this session for register promotion: appstate `@Public()`/`ApiGateGuard` interaction
(§8.4 F1), `dev-secret` JWT fallback bypass chain (§8.4 F2), appstate null→zeros root cause (§8.3.1).
# §13 · AUTOMATION STRATEGY

## 13.1 What automation exists today

| Automation | State | Evidence |
|---|---|---|
| **WhatsApp customer bot** | LIVE — v41, Claude replies 24/7, catalog search, order capture → platform ingest | [V: STATUS.md, CLAUDE.md] |
| **WhatsApp staff routing** | LIVE — roster pre-check → Muhammed | [V: MUHAMMED-HANDOFF] |
| **Bill OCR** | LIVE — `POST /api/bills/extract`, reused by expense prefill | [V: CLAUDE.md] |
| **Nightly backup cron** | **MERGED, INERT** — `@Cron` 02:00 Asia/Dubai, awaiting Supabase provisioning | [V: STATUS.md] |
| **Daily owner ping** | LIVE — 09:00 UAE from the Claude "muhammed" session | [V: STATUS.md] |
| **Reminder engine** | DORMANT — pg_cron 04:00 UTC, `reminders_enabled=false` pending Meta template approval | [V: CLAUDE.md] |
| **Audit trail** | Recording, hash-chained; **off-box export OFF** | [V: STATUS.md, I-09] |
| **App→Zoho sync** | **DOES NOT EXIST** (TASK-012) | [V: I-08] |
| **Monitoring / alerting** | **DOES NOT EXIST** | [V: ENTERPRISE_SYSTEM_MAP] |

**Observation** [R]: NTBF has more automation than most four-person companies and **no observability
over any of it.** Every automation above fails silently. The reminder engine is dormant, the backup
is inert, the audit export is off — three switched-off systems that would each report healthy by
saying nothing.

## 13.2 The automation gap that matters most

**There is no event system** (§8.6). Every automation is either a poll, a cron, or a manual
trigger. NTBF cannot express *"when an order is delivered, do X."*

**Recommendation** [R]: design a minimal internal event bus **together with** the capability layer,
because capability invocations are the natural event source. Emit `capability.invoked` /
`capability.failed` with the audit payload already required by P-12; persist to disk; allow
subscribers. This is a small amount of machinery that unlocks: delivery-triggered actions,
approval-triggered notifications, threshold alerts, reconciliation triggers, and SLA nudges —
none of which are individually worth building bespoke.

## 13.3 Automation tiers

Map automation to the §9 trust tiers, so "what may run unattended" is mechanical, not a judgment
call each time [R]:

| Tier | Unattended? | Examples |
|---|---|---|
| **Observe** (T0/T1 read) | ✅ Always | Daily brief, anomaly detection, drift alerts, health checks |
| **Draft** (T2) | ✅ Always | Draft PO from reorder point, draft bill from OCR, draft reply |
| **Commit** (T3) | ❌ Human approves | Confirm order, approve expense |
| **External** (T4) | ❌ Explicit confirm | Ledger post, payment, customer message |

**The Observe and Draft tiers are where NTBF's automation roadmap lives for the next 12 months**
[R]. Both are unattended-safe, and together they address the owner's P1 (awareness) and P2
(coordination cost) directly.

## 13.4 Ranked automation opportunities

| # | Automation | Serves | Tier | Effort | Precondition |
|---|---|---|---|---|---|
| A1 | **Daily operations brief** — cash, receivables, dispatch, exceptions | P1 | Observe | S | Read binding fixed (R2) |
| A2 | **Health & failure alerts** — cron failures, backup landing, API errors | ops | Observe | S | none |
| A3 | **App↔Zoho drift detection** | P1/P3 | Observe | M | TASK-012 sync |
| A4 | **Reorder-point → draft PO** | P2 | Draft | M | Time-aware stock data |
| A5 | **OCR → draft bill/expense at volume** | P2 | Draft | M | Capability layer |
| A6 | **Anomaly detection** — cash variance, margin drift, credit exposure | P3 | Observe | M | **Time dimension (R4)** |
| A7 | **Weekly management report** | P1/P3 | Observe | S | A1 + time dimension |
| A8 | **WhatsApp SLA nudges** — order-to-fulfilment | P2 | Draft | M | Event system |

**A2 should arguably be first** [R]. It is small, has no preconditions, and every other automation
on this list is worth less without it — an unmonitored automation is a liability that presents as
an asset. NTBF currently has eight automations and zero alerts.

## 13.5 Where OpenClaw fits

OpenClaw runs **owner-side** automation only (§6.5): research, briefing assembly, development
orchestration, cross-system investigation, browser automation. Its `cron`, `tasks` and `hooks`
[V] are appropriate for owner workflows and **must never carry staff-facing or customer-facing
automation** — L1 (laptop-hosted) makes that a P-06 violation by construction.

**Division of labour** [R]: automation that the business depends on runs **in the backend**
(NestJS `@Cron`, as the backup module already demonstrates [V]). Automation that serves the owner's
own thinking runs in OpenClaw. The backup module is the correct precedent and should be the
template.

---

### §13 Automation — executive summary

NTBF has substantial automation and zero observability over it — three of its automated systems
are currently switched off and would each report healthy by staying silent. The missing primitive
is an event system, which should be designed alongside the capability layer since invocations are
the natural event source. Automation should be tiered to §9's trust model so "may this run
unattended?" is mechanical. The Observe and Draft tiers cover the next twelve months, and failure
alerting (A2) should precede everything because it has no preconditions and makes all other
automation trustworthy.

---

# §14 · SECURITY ARCHITECTURE

## 14.1 Threat model

**Assets, ranked by loss consequence** [R]:

| # | Asset | Loss consequence |
|---|---|---|
| 1 | `/var/data` operational record | Business cannot function; irrecoverable |
| 2 | Zoho ledger integrity | VAT exposure, statutory risk |
| 3 | Customer + staff PII (chat, phones, documents) | Regulatory and reputational |
| 4 | Credentials (Anthropic, Zoho, Supabase, 360dialog) | Financial abuse, data access |
| 5 | Code and AI coordination record | Recoverable via git |

**Adversaries** [R]: opportunistic internet scanners (highest likelihood — the app is
internet-facing); a compromised credential from the four burned ones; prompt injection via
customer WhatsApp or supplier documents; and insider error, which at four people is far more
likely than insider malice.

**Prompt injection deserves naming as a first-class threat** [R]. Muhammed's capability gating
means an injection cannot exfiltrate data the role never had — that is genuinely strong. But once
T2/T3 capabilities exist, injection targets *actions*, not data. A supplier invoice containing
instructions, processed by OCR, is a realistic vector. **Mitigation is architectural, not
prompt-based:** T3/T4 require human approval (P-05), and drafts carry no authority.

## 14.2 Current posture

**Strong** [V]: capability-based tool gating · role-enforced transitions with server-side 403s ·
Zoho org guard + write-lock, fail-closed · hash-chained audit trail · rate limiting (30/60s) ·
`@openclaw/fs-safe` root-bounded file ops on the OpenClaw side · secrets referenced by allowlist ·
gateway loopback-bound.

**Weak** [V]:

| # | Weakness | Reference |
|---|---|---|
| S1 | Four burned credentials, no rotation cadence | CLAUDE.md, MUHAMMED-HANDOFF, RISK-008 |
| S2 | Seeded staff passwords in source control | RISK-002, TASK-016 |
| S3 | `PUT /api/appstate` protection depends on unverified env var | RISK-003, UNK-001 |
| S4 | `dev-secret` JWT fallback bypasses the gate | §8.4 F2, TASK-020 |
| S5 | One shared token permits role assertion | `muhammed.service.ts:72` |
| S6 | Stored XSS via unescaped names | RISK-006 |
| S7 | Off-box audit export disabled | I-09 |
| S8 | No backup ⇒ no recovery from destructive compromise | RISK-001 |

## 14.3 The credential problem is systemic

Four credentials burned by the same mechanism — pasted into a chat during troubleshooting
[V: Anthropic, Zoho client secret + refresh token, admin password, Google OAuth secret]. The hard
rule *"treat anything typed into a chat as burned"* exists in `CLAUDE.md` [V] and has been
violated four times.

**A rule violated four times is not a rule; it is an aspiration** [R]. The architectural fix is to
remove the opportunity:

1. **Secrets referenced by name only** in all agent-facing contexts — already the stated practice
2. **Owner-only entry paths** — values typed into Render/Supabase dashboards, never into a terminal
   or chat
3. **Per-consumer service accounts** so a burn is scoped, not total (closes S5)
4. **A rotation cadence with a calendar owner**, not event-driven panic
5. **Fail-fast on missing secrets** (TASK-020) so misconfiguration is loud, not silently permissive

## 14.4 Disaster recovery

**Current RPO/RTO** [V]: RPO = ∞ (no backup exists in effect — code inert). RTO = ∞ (no restore
procedure). *"Restore procedure: does not exist"* [V: ENTERPRISE_SYSTEM_MAP].

**Target on TASK-014 completion** [V: DEC-019, BACKUP_DESIGN]: RPO ≤ 24 h (nightly 02:00 Dubai),
RTO measured by an actual drill. **DEC-019 is explicit that "done" means a demonstrated restore** —
and that criterion should never be relaxed. An untested backup is a belief, not a control.

**Gap beyond TASK-014** [R]: backups cover `/var/data`. They do **not** cover the Supabase edge
function source, which has no VCS at all [V: FACT-011]. That is a second, unaddressed
single-point-of-loss.

## 14.5 Least privilege and service accounts

Target state [R]: every consumer — Muhammed, OpenClaw, the WhatsApp bot, the PWA, each future
agent — holds its own service account with explicit capability grants. No shared secrets. No
role assertion by any caller. Every invocation attributable to a principal (P-12).

This is the precondition for ever granting AI more autonomy. **Autonomy without attribution is
indistinguishable from an unaudited system**, and no amount of model quality compensates.

---

### §14 Security — executive summary

The designed security is strong; the operational security is weak. Capability gating, org guards
and role enforcement are enterprise-grade. Credential lifecycle, environment verification and
recovery are absent. The credential problem is systemic rather than incidental — four burns by one
mechanism, against an existing written rule — and the fix is architectural (remove the opportunity,
scope the blast radius) rather than exhortative. Prompt injection becomes a first-class threat the
moment T2/T3 capabilities ship, and the mitigation is P-05 approval, not prompt hardening.

---

# §15 · INFRASTRUCTURE

## 15.1 Current

| Component | State | Evidence |
|---|---|---|
| **Render** | Docker, Starter, always-on, auto-deploy from `main` | [V: render.yaml, FACT-002] |
| **Disk** | 1 GB persistent at `/var/data`; **716 K used, 0%** | [V: FACT-034] |
| **Instances** | 1 — single-instance by construction | [V: DEC-002, ASM-003] |
| **Supabase** | Edge function + Postgres (chat), soon backup storage | [V] |
| **Health check** | `/api/dashboard/health` | [V: render.yaml] |
| **Monitoring** | **none documented** | [V] |
| **Availability target** | **none defined** | [V] |

## 15.2 Assessment

**Right-sized, and honestly so** [R]. A four-person distributor does not need Kubernetes. Starter
on Render with a persistent disk is a defensible, cheap, low-operations choice, and the disk is at
0% utilisation with no near-term capacity concern [V: FACT-034].

**But three properties are load-bearing and undocumented:**

1. **Single instance is not a deployment choice — it is an architectural constraint.** In-process
   session state (Muhammed), in-process dedupe (`waSeen`), in-process rate-limit counters
   (`ApiGateGuard.hits`), and last-write-wins appstate all break on a second instance [V].
   **Scaling Render's instance count would introduce silent bugs, not more capacity.** This must
   be written where an operator will see it.
2. **No availability target exists**, so there is no way to say whether current uptime is
   acceptable.
3. **`@Cron` in-process** means the nightly backup runs on the single app instance [V]. If that
   instance is down at 02:00, the backup silently does not happen — and nothing reports it. A2
   (alerting) covers this.

## 15.3 Future migration path

**Do not migrate infrastructure yet** [R]. The constraint is not compute; it is data architecture
(§12). Migrating hosting before the capability layer exists moves the problem without solving it.

Sequence, each step justified by a trigger rather than a date [R]:

| Trigger | Step |
|---|---|
| Capability layer live | — (no infra change needed) |
| Time dimension + relational store | Managed Postgres (Supabase or Render) |
| Second warehouse / entity | Horizontal-ready backend — requires externalised session/dedupe state |
| Sustained load or availability requirement | Multiple instances + shared cache |
| Multi-country | Regional considerations, data residency |

**Each step is unlocked by the previous, and none requires a big-bang migration** — which is the
whole point of P-09.

---

### §15 Infrastructure — executive summary

Infrastructure is appropriately sized and not the constraint. Its most important undocumented
property is that single-instance operation is architectural, not incidental: raising the instance
count would produce silent correctness bugs across session state, dedupe, rate limiting and
appstate. No availability target exists, and the in-process nightly cron will silently skip if the
instance is down. Migration should be trigger-driven and follows the data architecture, never
leads it.

---

# §16 · DEVELOPMENT ARCHITECTURE

## 16.1 Current

| Aspect | State | Evidence |
|---|---|---|
| **Canonical repo** | `asifmkp/ntbf-platform` — owner-confirmed | 2026-07-22 |
| **Other copies** | OpenClaw workspace (consumer), `foodstuffs-app` (legacy, archive after salvage) | owner |
| **Branches** | `main` · `feature/*` · `muhammed/*` worktrees · `docs/*` convention | [V: git] |
| **CI** | **NONE** — merge = production deploy | [V: FACT-002, RISK-004] |
| **Testing** | Jest (9/9 on backup), `test-live-standard.mjs` (32 checks), no E2E | [V: STATUS.md] |
| **Review** | Plan-first → owner approval → PR | [V: CLAUDE.md] |
| **Release** | Merge to `main` auto-deploys; `[skip render]` for docs | [V: DEC-001] |
| **Documentation** | `/ai` registers under DEC-015/016 | [V] |

## 16.2 The clone-staleness finding

**Observed 2026-07-22** [O]: the canonical clone's `main` is at `61a9e7c` (PR #39). `STATUS.md`
records `main@9081231` (PR #41). Commit `9081231` is **not a valid object** in the canonical clone,
and `backend/src/backup` is **absent from its `main`**.

The canonical clone is **two PRs behind GitHub**, while the OpenClaw workspace copy — designated
"never the source of truth" — is current.

**This is a policy/practice divergence, not a tooling problem** [R]. The Q1 answer is correct; the
clone simply hasn't caught up. But the failure mode is real: anyone opening the canonical clone and
trusting it would read stale code while believing it authoritative. **Add a "fetch before you
trust" step to the agent protocol**, or better, have CI publish a freshness marker.

## 16.3 What is excellent

**The plan-first workflow** [V]: plan → written owner approval → small staged change → test
evidence → PR → register update. `CLAUDE.md` states it, DEC-016 makes it auditable, `STATUS.md`
shows it working — including a Dubai-local-vs-UTC day-boundary bug caught *before* merge on the
backup module.

**This is the company's strongest process asset** (§7.3) and it is worth more than any individual
system. It should tighten, not relax, as AI autonomy grows.

## 16.4 Priority gaps

| Gap | Consequence | Task |
|---|---|---|
| **No CI** | Bad merge ships to production ungated | TASK-015, Phase 0.5 |
| **No E2E tests** | UI regressions found by the owner in production — observed repeatedly (RISK-010/011/012 were all owner-found) | Playwright, deferred to TASK-015 |
| **No AI evaluation set** | AI behaviour has no regression suite, unlike the 32-check data standard | §4.5 AI debt |
| **Edge function outside VCS** | Cannot review, roll back, or hand over | FACT-011 |

**On E2E** [R]: RISK-009, 010, 011 and 012 were **all discovered by the owner on live screens
after deploy** [V]. That is the strongest possible empirical argument for E2E coverage — the owner
is currently the test suite, and the owner does not scale.

---

### §16 Development — executive summary

The development process is the strongest asset in the company and the tooling around it is the
weakest. Plan-first with owner approval and register updates produces auditable, high-quality
change; the absence of CI means any of it can still ship broken. The owner has personally
functioned as the E2E suite for four consecutive display-semantics defects. The canonical clone is
two PRs stale, which is a practice gap rather than a policy one.

---

# §17 · ROADMAP

## 17.1 This section is subordinate to DEC-013

**`ai/ROADMAP.md` owns execution order** [V: DEC-013]. The Bible does not override it. This
section (a) extends beyond ROADMAP's horizon, which ends at Phase 3, and (b) proposes **two
amendments** for owner consideration.

**Existing order** [V: ROADMAP §5]:
`014 → 016 → 015 → 020/021 → [owner input batch] → 012 design → 012 build → 008/010/011 → 013 → 017/024 → 004 → 023 → 022 → Phase 3`

### Proposed amendment A1 — merge TASK-020 and TASK-021

Both protect `PUT /api/appstate`. Both fail to the same condition — an unset environment variable
(§8.4 F1/F2). Shipping them separately leaves a window where one bypass is closed and the other is
open, and creates the false impression of defence in depth. **Recommend: one change, one PR, one
test.** [R]

### Proposed amendment A2 — add "rebind Muhammed's read path" to Phase 0

Not currently on the queue. Muhammed is live and reporting zeros to staff [V: FACT-019]. Every day
it continues erodes trust (B-R01), and trust is not linearly recoverable. It is a small change —
point tools at server stores instead of appstate — with disproportionate business impact. **Recommend:
Phase 0, alongside 020/021.** [R]

## 17.2 Immediate — this week

| # | Action | Why now |
|---|---|---|
| 1 | **Provision Supabase bucket + service key; run the restore drill** | RISK-001 CRITICAL; code merged and inert; minutes of owner time; DEC-019 done = restore demonstrated |
| 2 | **Rotate all four burned credentials** | Systemic; blast radius grows with every capability |
| 3 | **Read `team_unanswered`** | Free evidence of what staff actually cannot get; re-ranks everything below |
| 4 | **Answer UNK-001** (`PUBLIC_API_TOKEN` set in prod?) | Determines whether RISK-003 is HIGH or moot; one dashboard check |
| 5 | **Fetch the canonical clone** | It is two PRs stale |

**Every item is hours, not days, and items 1–2 protect against irrecoverable outcomes.**

## 17.3 Thirty days

`014 restore drill` → `016 passwords` → `015 CI` → `020+021 merged (A1)` → **`rebind read path (A2)`** →
owner input batch → `012 sync design`.

**Why this order:** continuity before capability. Every item is either irrecoverable-loss
prevention or a gate that all later work depends on. CI before the surface area grows. The read
rebind is added because trust decays daily.

**Exit criteria** [V: ROADMAP Phase 0]: restore drill succeeded from a real backup; no default
credentials work; CI green on a test PR; prod boots loudly without `JWT_SECRET`. **Plus** [R]:
Muhammed returns non-zero, verified figures.

## 17.4 Ninety days

`012 sync build` (the single most valuable business item — closes the books loop) → capability
layer v1, read-only and **time-aware** → daily brief (A1) → failure alerts (A2) → time dimension
design.

**Why:** the books loop is the largest recurring manual cost. The capability layer starts read-only
because reads are safe and establish the contract; time-awareness is designed in from v1 so
contracts are frozen once (§9.6).

## 17.5 Six months

T2 draft capabilities (draft PO, draft bill from OCR, draft quote) → durable memory retrieval over
the existing log (§11.3) → anomaly detection → System B removal (DEC-018) → E2E test suite.

**Why:** T2 is where AI value concentrates at zero business risk and needs no approval machinery
(§9.3). Memory retrieval is cheap because the data is already captured.

## 17.6 One year

Time dimension shipped → analytical views → weekly management reporting → first specialist agent
**if and only if DEC-014 gates G1–G5 plus G6 have fired** → app↔Zoho bidirectional and stable.

**Target state:** the owner opens one interface and sees the true position of the business. That
is the year-one goal from §2.2, and it is sufficient.

## 17.7 Three years

Capability layer as sole operations interface → 2–4 specialist agents, each justified by a
measured bottleneck → T3 execution under approval → relational persistence swapped in behind the
contract → second warehouse addable without architecture change.

## 17.8 Five years

Multi-entity with tenant isolation as a first-class concept → routine T3 under standing policy with
humans on exceptions → institutional knowledge durable across staff turnover → optional
productisation (§2.5), preserved as an option rather than funded as a plan.

## 17.9 Why this ordering is optimal

Three rules govern it [R]:

1. **Protective before constructive.** Everything built on an unbacked, uncredentialed, untrusted
   base must be revisited later at higher cost.
2. **Contracts before implementations.** The capability layer precedes the persistence change, so
   the change is invisible to consumers. This is the only way P-09 and P-10 hold simultaneously.
3. **Evidence before expansion.** Gates (DEC-014, G6) and instruments (`team_unanswered`,
   `note_gap`) decide when to grow. The scarce resource is not capability — it is the discipline
   not to build.

---

### §17 Roadmap — executive summary

Subordinate to DEC-013, extending beyond its Phase 3 horizon and proposing two amendments: merge
TASK-020/021 into one change, and add the Muhammed read-rebind to Phase 0. The immediate week is
five items, all hours-long, two of which protect against irrecoverable outcomes. Thirty days is
continuity; ninety is the books loop and the capability layer; six months is T2 drafts; one year is
trusted temporal awareness. Ordering follows three rules: protective before constructive, contracts
before implementations, evidence before expansion.

---

# §18 · DECISION REGISTER (BIBLE-LEVEL)

Decisions arising from this document. **These are proposals for `ai/DECISIONS.md`** (next free ID
DEC-020) — they do not become decisions until the owner accepts them there, per DEC-015 and the
rule that a decision not written in the register does not exist.

### OD-001 · Federated architecture — **DECIDED 2026-07-22**
**Problem:** Two AI systems with no defined relationship.
**Options:** A Muhammed absorbs · B OpenClaw becomes brain · **C Federated**
**Decision:** **C.** Muhammed = production AI for the company; OpenClaw = owner AI OS; both consume
a shared capability layer; neither depends on the other.
**Consequence:** neither system is discarded; the laptop never becomes production infrastructure
(P-06); capability layer becomes mandatory rather than optional.

### OD-002 · Bible is a synthesis layer — **DECIDED 2026-07-22**
**Problem:** ~18 registers already exist under DEC-015; a narrative document risks forking truth.
**Options:** A standalone narrative · **B synthesis citing register IDs** · C restructure all
**Decision:** **B.**
**Consequence:** the Bible holds judgment, registers hold facts; it stays accurate as registers
update; it is subordinate to DEC-015 and amended when they disagree.

### OD-003 · Capability layer is the architectural centre — **PROPOSED**
**Problem:** P-09 (no disruptive migration) and P-10 (multi-entity scale) appear contradictory;
§8.3.2 proves the current store cannot scale.
**Recommendation:** adopt a protocol-neutral capability layer as the stable contract between
consumers and storage; ownership follows data; trust tiers determine approval mechanically.
**Consequence:** persistence becomes swappable without consumer changes — the only mechanism that
satisfies both constraints. **Long-term:** this becomes the company's durable asset (§2.4).

### OD-004 · Muhammed rebinds to the system of record — **PROPOSED**
**Problem:** Muhammed reads a client-pushed mirror; observed zeros (FACT-019); root cause closed
(§8.3.1).
**Options:** A rebind tools to server stores · B populate appstate reliably · C wait for capability
layer
**Recommendation:** **A now, migrating to the capability layer later.** B preserves the wrong
architecture (P-02 violation); C leaves staff receiving wrong numbers for months.
**Consequence:** trust preserved; P-02 established as permanent.

### OD-005 · Merge TASK-020 and TASK-021 — **PROPOSED**
**Problem:** two bypasses on the same endpoint, both failing to an unset env var.
**Recommendation:** one change, one PR, one test.
**Consequence:** removes a window of false confidence.

### OD-006 · Add gate G6 to DEC-014 — **PROPOSED**
**Problem:** agents created before the capability layer must each implement business logic (P-03).
**Recommendation:** add **G6 — capability layer live with ≥5 T1 capabilities in production.**
**Consequence:** prevents permanent duplication.

### OD-007 · Adopt an internal event system — **PROPOSED**
**Problem:** no way to express "when X happens, do Y"; every automation polls or is manual.
**Recommendation:** minimal event bus designed with the capability layer, sourced from invocations.
**Consequence:** unlocks the reactive half of §13 cheaply.

### OD-008 · Defensive defaults must not mimic real answers — **PROPOSED**
**Problem:** `arr()` returns `[]` on null, converting "no data" into "zero" (§8.3.1).
**Recommendation:** capability reads raise on absent data so `note_gap` fires.
**Consequence:** the AI reports ignorance instead of fabricating confidence — a permanent property.

---

# §19 · RISK REGISTER (BIBLE-LEVEL)

Consolidates `ai/RISKS.md` [V] with risks arising from this document [R]. Register risks retain
their IDs and severities; Bible-level additions are `B-R##`.

## Critical

| ID | Risk | Status |
|---|---|---|
| **RISK-001** | Total loss of live business data — `/var/data` unbacked; **mitigation merged but INERT** pending owner provisioning; no restore ever demonstrated | OPEN |

## High

| ID | Risk | Note |
|---|---|---|
| **B-R01** | **AI trust collapse** — staff stop believing Muhammed after wrong numbers. Live, not hypothetical: zeros are being served now (FACT-019). Trust is not linearly recoverable | new |
| **B-R02** | **Owner as single point of failure** — all credentials, decisions and system knowledge in one person; no continuity plan | new |
| RISK-002 | Weak seeded staff passwords in source control | OPEN |
| RISK-003 | Unauthorised full-dataset write via `PUT /api/appstate`; depends on unverified `PUBLIC_API_TOKEN` (UNK-001) | OPEN |
| **B-R04** | **`dev-secret` JWT fallback** bypasses the API gate even when `PUBLIC_API_TOKEN` is set (§8.4 F2) | new — TASK-020 |
| RISK-004 | Bad merge ships to production — no CI | OPEN |
| RISK-005 | July double-posting if a future sync omits the `origin:'july-import'` exclusion | OPEN |
| **B-R06** | **Edge function has no VCS** — production code that cannot be reviewed, rolled back, or handed over (FACT-011); outside backup scope | new |

## Medium

| ID | Risk | Note |
|---|---|---|
| RISK-006 | Stored XSS via unescaped names | OPEN |
| RISK-007 | Wrong-Zoho-org config trap on env rebuild | OPEN |
| RISK-008 | Review-token embedded in a stored Routine prompt | OPEN |
| **B-R03** | **Laptop-as-infrastructure** — OpenClaw becoming load-bearing for operations | new |
| **B-R05** | **Silent persist failure** — store writes swallow errors and degrade to memory-only with no alarm | new |
| **B-R07** | **Unmonitored automation** — eight automations, zero alerts; three currently switched off would report healthy by staying silent | new |
| **B-R08** | **Owner is the E2E test suite** — RISK-009/010/011/012 were all owner-found post-deploy; does not scale | new |
| **B-R09** | **Canonical clone staleness** — two PRs behind; agents may act on stale code believing it authoritative | new |

## Low

| ID | Risk |
|---|---|
| **B-R10** | Complexity outrunning the maintainer — mitigated today by DEC-014 discipline; would become HIGH if gates were bypassed |

## The concentration observation

**Six of the ten highest risks are closable in under a week**, and four of those are closable in
under a day [R]: provision the backup bucket, rotate credentials, answer UNK-001, merge
TASK-020/021, rebind the read path, add failure alerting.

**The risk profile is unusually front-loaded and unusually cheap to fix.** This is the single most
actionable fact in the entire document, and it is why §21.9 assessed the probability distribution
as shifting materially on ~a week of focused work.

---

### §§18–19 Registers — executive summary

Two decisions are made (OD-001 federated, OD-002 synthesis layer) and six are proposed for owner
acceptance into `ai/DECISIONS.md` as DEC-020+. The risk register consolidates twelve existing
risks with ten Bible-level additions; one remains CRITICAL and its mitigation is merged but inert.
The defining characteristic of NTBF's risk profile is concentration: most of the severe risk is
removable in a week, and almost none of it requires architectural change.

---

**END OF SESSION 4 — DOCUMENT COMPLETE (v1.0)**

All 21 sections written. Outstanding [I] statements for register promotion:
W7 (split identity across channels, unobserved), §16.2 clone staleness (observed, needs FACT entry),
§8.4 F1/F2 (verified at source, need FACT entries), §8.3.1 zeros root cause (verified, closes the
FACT-019 open question).

# §20 · ARCHITECTURE PRINCIPLES

Permanent. A violation is an architectural defect regardless of expediency. Each carries its
justification, because a principle without a reason is dogma and will be discarded under pressure.

| ID | Principle | Why | Violation looks like |
|---|---|---|---|
| **P-01** | **Single source of truth per domain** | Forked truth drifts silently; `ENTERPRISE_SYSTEM_MAP` already maintains an explicit truth matrix [V] | Two systems both authoritative for cash |
| **P-02** | **The AI layer binds to the system of record** | §1.3 — reading a mirror makes an assistant structurally untrustworthy | Muhammed reading a client-pushed blob [V: FACT-019] |
| **P-03** | **Capability ownership: logic lives with the data owner** | Prevents duplicated business logic — the failure mode that ends architectures | An agent computing receivables itself |
| **P-04** | **Least privilege, enforced by capability handout, not prompt** | Already the crown jewel of Muhammed's design [V: `muhammed.tools.ts:342`] | Filtering data in the prompt instead of the tool array |
| **P-05** | **Human approval before irreversible effect** | Segregation of duties is an audit requirement independent of the actor | An agent posting to the ledger |
| **P-06** | **The business operates when AI is unavailable** | Prevents the orchestrator from becoming a SPOF (§1.7) | Warehouse blocked because Muhammed is down |
| **P-07** | **AI augments people; it does not replace judgment** | Preserves accountability; a four-person team cannot absorb unattributable errors | "The AI approved it" |
| **P-08** | **No fact without evidence** | DEC-015 already enforces this and it works [V] | A number in a document with no citation |
| **P-09** | **Incremental adoption; no disruptive migration** | Owner instruction 2026-07-22; a running business cannot absorb a rewrite | A "big bang" persistence migration |
| **P-10** | **Design for multi-entity; do not pay for it yet** | Preserves the 5–10 year option at near-zero present cost | Hardcoding a single company ID everywhere |
| **P-11** | **Reversibility first: prefer draft over commit** | T2 captures most value at near-zero risk (§9) | Auto-posting instead of auto-drafting |
| **P-12** | **Every capability invocation is audited** | Attribution is the precondition for ever granting more autonomy | An action with no principal recorded |
| **P-13** | **Secrets are never typed into a chat, and anything typed is burned** | Already a stated hard rule [V: CLAUDE.md]; violated four times to date | Pasting a `GOCSPX-` value to explain a concern |
| **P-14** | **Maintainability over cleverness** | The team is one owner plus AI agents; nothing survives that cannot be understood quickly | A clever abstraction only its author understands |
| **P-15** | **Instrument the gap, not just the success** | `note_gap` already does this and is the most valuable pattern in the codebase [V] | Shipping a feature with no failure telemetry |

**On P-09 and P-10 together** [R]: these two are in tension with the current persistence model.
File-backed JSON on a single instance [V: FACT-001, ASM-003] cannot scale to multiple companies,
warehouses, or countries. The resolution is **not** to migrate now — it is to place the
Capability Layer between consumers and storage, so that persistence can be swapped **behind a
stable contract** without any consumer changing. The capability layer is precisely the mechanism
that makes P-09 and P-10 simultaneously satisfiable. This is the central architectural argument
of the entire document.

---

# §21 · FINAL ASSESSMENT

*Written as if I were hired as CTO on 2026-07-22 and asked for an unvarnished verdict.*

## 21.1 Would I continue this architecture?

**Yes — with three conditions treated as non-negotiable.**

The instinct to rewrite would be wrong. This system has solved problems that most teams get
wrong: capability-based authorization [V], role-enforced state transitions with server-side 403s
[V: CLAUDE.md], a documented live-vs-historical data standard guarded by 32 regression checks
[V: FACT-030], a frozen integration contract that is genuinely respected [V], and a
self-documenting evidence protocol [V: DEC-015]. That is a stronger foundation than most
Series-A startups have.

The conditions:

1. **RISK-001 is closed within 30 days.** A business whose system of record has no backup and no
   restore procedure is one disk event from ceasing to exist. Nothing else on any roadmap
   matters until this is done. This is not a technical opinion; it is a solvency issue.
2. **Muhammed's read path is rebound to the system of record** before any further AI investment.
3. **All burned credentials are rotated** and the shared ingest secret is split by purpose.

## 21.2 What I would preserve

| Asset | Why it is rare |
|---|---|
| **Capability-based tool gating** [V] | Security by construction, not by instruction. A jailbreak cannot exfiltrate what was never handed to the model. Most production LLM apps get this wrong. |
| **`note_gap`** [V] | Converts every failure into structured product signal. Free, continuous, honest telemetry. Teams pay consultants for less. |
| **The evidence protocol (DEC-015)** [V] | Documentation that cannot silently lie. The single biggest reason this review could be conducted at all. |
| **The frozen ingest contract** [V] | Demonstrated contract discipline. Rare, and the precondition for a capability layer. |
| **Role-enforced transitions with server-side 403s** [V] | Authorization at the right layer. |
| **The "one persona, role-scoped data" model** [V] | Elegant. Staff experience one colleague, not five bots. Preserve this exactly. |

## 21.3 What I would replace

| Item | Replace with | When |
|---|---|---|
| Muhammed reading appstate | Direct binding to the system of record | Immediately (R2) |
| File-backed JSON as the long-term store | Postgres **behind the capability layer** | After the layer exists — never before |
| Shared `WHATSAPP_INGEST_TOKEN` for two purposes | Per-consumer service accounts | With R3 |
| In-process session memory | Durable, retrievable memory | After R1–R4 |
| Three repo copies | One canonical; others archived or clearly labelled consumers | 30 days |

## 21.4 What I would redesign

**The data model, specifically the absence of time.** [V: `muhammed.tools.ts:147`] This is the
deepest issue in the estate. It is not a bug; orders were simply never given a temporal
dimension. Every Priority-3 ambition — trends, comparisons, forecasting, anomalies — is
unreachable until it exists, and no amount of AI compensates. **This is a schema decision, and it
forces the Postgres question that has been deferred since Phase 0** (schema exists, unused;
`Database unavailable` treated as expected noise [V: CLAUDE.md]).

## 21.5 What should never change

- Capability-based authorization (P-04)
- Human approval before irreversible effect (P-05)
- The business operating without AI (P-06)
- Evidence-graded documentation (P-08)
- One persona, role-scoped data

## 21.6 What should change immediately

1. Backups + a proven restore drill (RISK-001)
2. Rotate four burned credentials (RISK-002, RISK-008, Anthropic, Google)
3. Read `team_unanswered` — free evidence of what staff actually cannot get [V: tool exists, unused]
4. Rebind Muhammed's read path
5. Activate CI (RISK-004)

Items 1–3 and 5 are **days of work, not months**, and every one of them reduces risk that
compounds daily.

## 21.7 Competitive advantage

Three things, honestly assessed [R]:

1. **Decision velocity at small scale.** A four-person company with genuine real-time awareness
   can outmanoeuvre a forty-person competitor running on monthly reports. This is real and
   defensible.
2. **Institutional memory that survives turnover.** In a region where staff mobility is high,
   a company whose knowledge lives in a governed system rather than in people's heads has a
   structural advantage.
3. **Capability layer as a productisable asset.** Optional, but genuinely valuable if pursued
   deliberately (§2.5).

**What is *not* a competitive advantage:** using Claude. Every competitor can. The advantage is
the **governed capability layer and the accumulated decision history** — the parts that are hard
to copy.

## 21.8 What could destroy this project

Ranked by probability × impact [R]:

| # | Threat | Why it is lethal |
|---|---|---|
| **1** | **Data loss before backups exist** (RISK-001) | The company's operational record vanishes. Not a setback — an extinction event. Currently CRITICAL and OPEN. |
| **2** | **Trust collapse from wrong numbers** (B-R01) | Staff and owner stop believing the AI. Adoption never recovers. The zeros finding makes this live, not hypothetical. |
| **3** | **Owner as single point of failure** (B-R02) | All credentials, decisions, and system knowledge in one person. No continuity plan exists. |
| **4** | **Complexity outrunning the maintainer** | Sixteen agents on a four-person company collapses under coordination cost. The discipline to *not* build is the scarce resource. |
| **5** | **Security incident via unrotated credentials** | Four burned credentials, one over-broad shared token, no rotation cadence. |
| **6** | **Big-bang migration attempt** | A rewrite of persistence without a capability layer would halt the business. P-09 exists to prevent exactly this. |

## 21.9 Probability of scaling into a multi-company AI operating system

**Honest estimate — a 5-year horizon:**

| Outcome | Probability | Determining factor |
|---|---|---|
| **Fails or stagnates** | **25%** | RISK-001 materialises, or trust collapses, or the owner's capacity is exhausted |
| **Succeeds for NTBF alone** — trusted internal AI operating layer, no external productisation | **50%** | The most likely and entirely respectable outcome |
| **Scales to multi-company** | **20%** | Requires deliberate multi-tenancy investment and capacity beyond a four-person operation |
| **Becomes a sellable product** | **5%** | Requires funding, support capability, and go-to-market — none currently present |

**Reading of these numbers** [R]: a **70% chance of a good-to-excellent outcome** is strong for a
programme at this stage. But the 25% failure mass is concentrated almost entirely in the first
90 days, and almost entirely in items that are days of work: backups, credential rotation, data
binding. **The risk profile is unusually front-loaded and unusually cheap to fix.**

The architecture is not the constraint. The foundation is. Close RISK-001, rebind the read path,
rotate the credentials, and the probability distribution shifts materially — plausibly to
15% / 50% / 30% / 5%.

**Final verdict:** *This is a well-conceived architecture with a dangerous foundation. Fix the
foundation and it deserves the ten-year horizon it is being designed for.*

---

### §21 Final Assessment — in one paragraph

I would continue this architecture, preserve its capability-based security model and evidence
protocol as genuinely rare assets, replace the appstate read binding and eventually the JSON
persistence — but only from behind a capability layer — and redesign the data model to include
time. The project's survival depends on three things that are days of work, not months. Do them
and there is a roughly 70% probability of a good or excellent outcome. Skip them and the most
sophisticated four-person AI architecture in the region is one disk failure from nothing.

---

**END OF SESSION 1** · §0, §1, §2, §20, §21 complete.
Sessions 2–4 pending per §0.4. All [I] statements listed in §19 when written.
