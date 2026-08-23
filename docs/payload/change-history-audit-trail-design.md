# Change History, Audit Trail & Retention — Design Doc (for sign-off)

**Date:** 2026-08-23
**Status:** IMPLEMENTED (Phases 1 + 2 + 2b) — EmailLogs TTL (dry-run by default), AgentAuditLog archive job (dry-run by default), change-log collection + hooks on smtp-settings/sites/tenants/users, native versions on Tier-1 content collections. Phase 3 (ChangeLog archive) and Phase 4 (monitoring) remain plan-only. See §7 for the flip-on runbook.
**Related:** handoff v38 §2.2 (corrected scope — this covers field-level change tracking across all collections, not just the two log collections).

---

## 1. Audit Findings — Current State

### 1.1 Native Payload versioning (as of 2026-08-23)

Only two collections have **any** versioning:

| Collection | `versions` config | Notes |
|---|---|---|
| Pages | `{ drafts: { autosave: 100ms, schedulePublish }, maxPerDoc: 50 }` | Draft/publish workflow, 50 full-doc snapshots cap |
| Posts | `{ drafts: { autosave: 100ms, schedulePublish }, maxPerDoc: 50 }` | Same |

Everything else — 17 config collections, both globals, and all 6 plugin-added collections — has **no versioning and no change history of any kind**.

### 1.2 Full collection inventory

**Config collections (19)** — `src/payload.config.ts`:

| Collection | versions | Write sources | History today | Risk class |
|---|---|---|---|---|
| Tenants | none | admin (super-admin) | none | governance |
| PortalClients | none | admin, portal login/signup | none | governance |
| Sites | none | admin | none | governance |
| Pages | drafts + max 50 | admin, agent, public reads | ✅ full-doc snapshots | content |
| Posts | drafts + max 50 | admin, agent, public reads | ✅ full-doc snapshots | content |
| Media | none | admin upload, public-form-upload | none (S3 object itself is the artifact) | content |
| Categories | none | admin | none | content |
| Users | none | admin, self-service | none | governance |
| Testimonials | none | admin, agent | none | content |
| FAQs | none | admin, agent | none | content |
| PortfolioItems | none | admin, agent | none | content |
| PricingPlans | none | admin, agent | none | content |
| SiteSettings | none | admin | none | config |
| MenuItems | none | admin | none (not yet consumed — §2.4) | config |
| **SmtpSettings** | **none** | **admin** | **none** | **⚠️ config / operational** |
| CustomCollections | none | admin | none | schema |
| CustomCollectionEntries | none | admin, import jobs | none | data |
| AgentAuditLog | none | agent route only (`audit.ts`) | append-only in practice (`superAdminOnly` access, not hard-immutable) | audit log |
| EmailLogs | none | email adapter only (`overrideAccess: true`) | append-only in practice (`create/update/delete: () => false`) | audit log |

**Globals (2):**

| Global | versions | Write sources | History today |
|---|---|---|---|
| Header | none | admin | none (public `read: () => true`) |
| Footer | none | admin | none (public `read: () => true`) |

**Plugin-added collections (6)** — verified in each plugin's `dist/index.js`: none of redirects, search, form-builder, or import-export set `versions` on the collections they create:

| Collection | Plugin | History today |
|---|---|---|
| redirects | plugin-redirects | none |
| forms | plugin-form-builder | none (form definitions) |
| form-submissions | plugin-form-builder | append-only submissions, no retention |
| search | plugin-search | none (derived index — rebuildable via beforeSync) |
| imports | plugin-import-export | none (CSV artifacts in S3) |
| exports | plugin-import-export | none (CSV artifacts in S3) |

### 1.3 Existing mechanisms that are NOT change history

- **AgentAuditLog** — only the DeepSeek agent route writes it (action + previousValue/newValue per confirmed action). Admin/API edits to the same collections are invisible to it.
- **EmailLogs** — send attempts, not content changes.
- **Pages/Posts drafts** — full-doc snapshots (no field-level diff view in the list, restore works per snapshot), and **no actor attribution** beyond `updatedAt`.

**Conclusion:** a silent, unlogged change to SmtpSettings (sender email, `enabled` flag, `enableLogging`) or to any FAQ/testimonial/portfolio item is possible today and leaves zero trace — the operational risk called out in the task brief is real.

---

## 2. Gap Analysis — Priority Candidates

| Priority | Target | Why |
|---|---|---|
| **P0** | SmtpSettings | Holds the SMTP2GO API key path + sender config. A wrong edit silently breaks all mail for a tenant (v38's whole incident class). Field-level history with actor is the minimum bar for ops debugging. |
| **P0** | Header / Footer globals | Site-wide navigation. Wrong edit = broken nav on the public site with no undo (no drafts, no versions). |
| **P1** | FAQs, Testimonials, PortfolioItems, PricingPlans | Content collections editable by tenant-admins AND by the AI agent. Agent edits already log to AgentAuditLog, but admin edits leave no trace — asymmetric audit. |
| **P1** | SiteSettings, MenuItems | Per-site config/content. MenuItems will become live consumption when §2.4 lands. |
| **P2** | Sites, Tenants, Users, PortalClients | Governance. Low edit frequency but high blast radius; history here is mostly "who changed what access/role". |
| **P3** | CustomCollectionEntries, Categories, Media | Data rows / low-stakes content. Lowest value per stored byte. |
| **Excluded** | EmailLogs, AgentAuditLog, form-submissions, search, imports, exports | Append-only artifacts — they need **retention** (§4), not versioning. Search is derived (rebuildable). |

---

## 3. Design Options for the Gaps

### Option A — Native Payload `versions` everywhere it's needed

Add `versions: { maxPerDoc: N }` (without drafts) or `versions: { drafts: …, maxPerDoc: N }` (with publish workflow) to the priority collections/globals.

**Pros**
- Zero custom code — snapshotting, restore, and the admin "Versions" UI come free (Payload supports versions on globals too).
- `maxPerDoc` gives a built-in, count-based retention bound (Pages/Posts already use 50).
- Drafts semantics already proven in this project (Pages/Posts).
- REST `/api/<slug>/versions` for tooling.

**Cons**
- Stores a **full document per save** — storage-heavy for wide docs (relationship-heavy collections, layout blocks). Cost is O(saves × doc size), not O(changes).
- **No actor attribution** out of the box — you can see *when*, not *who*.
- Field-level diff UX is weaker (full-doc compare, no per-field search across collections).
- `maxPerDoc` is count-based, not time-based — a busy doc loses its older history by churn, not age.
- For singletons that shouldn't gain draft/publish semantics (SmtpSettings), must use plain `versions: { maxPerDoc }` — which is fine, but easy to misconfigure.

### Option B — Generic custom `ChangeLog` collection

New collection `change-log`, written by hooks (`beforeChange` diff vs `originalDoc`, `afterChange` write, `beforeDelete` log) on every tracked collection, with `req.context` loop guards. Shape:

```
collectionSlug · docId · operation (create|update|delete) · fieldPath (null = whole-doc)
previousValue · newValue · actor (users rel, nullable=system) · actorRole · source (admin|api|agent|public|system)
tenant (rel) · site (rel) · createdAt
```

Access: `create/update/delete: () => false` (hooks only — same pattern as EmailLogs); `read: superAdminOnly` (or siteTenant-scoped read for tenant-admins later).

**Pros**
- **Field-level diffs** — exactly what changed, per field, queryable across ALL collections ("who changed any senderEmail, ever?").
- Actor attribution built in (admin user, agent identity, or `system`).
- Works identically for collections AND globals; independent of Payload's versioning lifecycle.
- Retention composable with the same TTL/archive machinery as the log collections (§4) — one pattern for all audit data.
- Agent writes can flow into the same stream as admin writes → **single unified audit trail** (closes the admin/agent asymmetry noted in §2).

**Cons**
- Custom code: hooks on every tracked collection (diff logic, loop guards, deletion logging) — the largest surface of any option.
- No restore capability — it's a log, not a rollback mechanism.
- Volume noise: bulk edits (imports, agent batch ops) each produce N rows; needs `req.context` skip flags (e.g. import jobs) to stay sane.
- Hook-based capture misses direct MongoDB writes (only the email adapter and raw `_apiKey` read bypass hooks today — small surface, but worth stating).

### Option C — Hybrid (recommended for sign-off, pending the questions in §5)

- **Tier 1 content** (FAQs, Testimonials, PortfolioItems, PricingPlans, MenuItems, SiteSettings): **native versions**, non-draft, `maxPerDoc` (e.g. 50, matching Pages/Posts). Cheap, gives restore, proven pattern.
- **Tier 2 config/governance** (SmtpSettings, Header, Footer, Sites, Tenants, Users): **ChangeLog** — field-level + actor, because the question these exist to answer is "who changed what and when", and restore matters less than attribution here.
- **Tier 3 append-only logs** (EmailLogs, AgentAuditLog, form-submissions, imports, exports, search): no versioning — **retention only** (§4).
- **Tier 4** (CustomCollectionEntries, Categories, Media): defer; revisit if a client asks.

Why not "native versions for everything": no actor attribution + full-doc storage makes it a poor audit tool for config/governance. Why not "ChangeLog for everything": loses restore/undo on content where undo is the more likely ask. The hybrid spends each mechanism where it's strongest.

---

## 4. Retention Proposal (env-driven, no hardcoded day counts)

| Data | Mechanism | Env var | Default |
|---|---|---|---|
| EmailLogs | MongoDB **TTL index** on `sentAt` (BSON date — Payload stores `date` as a real Date, so TTL works; index creation is additive and reversible with `dropIndex`) | `EMAIL_LOGS_RETENTION_DAYS` | **90** |
| AgentAuditLog | **Archive-then-delete**: nightly job exports rows with `confirmedAt` older than N days as NDJSON (one file per day) to Supabase Storage (bucket already configured via `SUPABASE_*` env), verifies checksum, then deletes the exported rows from Mongo | `AGENT_AUDIT_LOG_RETENTION_DAYS` + `AGENT_AUDIT_LOG_ARCHIVE_PATH` | **180**, `archives/agent-audit-log/` |
| New change-history mechanism (§3) | Depends on the chosen option: **native versions** → `maxPerDoc` count cap (no time component needed; optionally a prune job later). **ChangeLog** → same archive-then-delete pattern as AgentAuditLog (this log is the one place full history might be worth keeping longer) | `CHANGE_LOG_RETENTION_DAYS` + `CHANGE_LOG_ARCHIVE_PATH` | **365**, `archives/change-log/` |
| form-submissions | Out of scope here (client data — deleting submissions is a client decision; flag for §2.5/client conversations, not proposed unilaterally) | — | — |

**Job mechanism (design):** Payload's jobs queue already exists (`jobs.access` accepts `CRON_SECRET`; `tasks` is currently empty). Propose one scheduled task (Vercel Cron → `POST /api/payload-jobs/run` with `Authorization: Bearer $CRON_SECRET`) that runs the AgentAuditLog archive + (if Option B/C) ChangeLog archive. EmailLogs needs no job — the TTL index does the work natively (Mongo TTL monitor runs every ~60s).

**Why TTL for EmailLogs but archive for AgentAuditLog:** email send attempts have near-zero value after debugging window; agent audit entries document content changes made through the AI path and could be needed for client disputes — archiving keeps them without growing the hot collection.

**Compliance question (from handoff v38):** whether anyone (Sir JM, Sir Jeff, Sir Gio, or a client) actually needs EmailLogs older than ~90 days / AgentAuditLog older than ~180 days should be asked before Phase 1 — see §5.

---

## 5. Open Questions for Sign-off

1. **Retention windows** — confirm 90 / 180 / 365 day defaults (or give real numbers).
2. **Archive destination** — Supabase Storage reuse OK, or should archives go elsewhere (e.g. S3, local volume)?
3. **Change-history option** — A, B, or C (hybrid)? If C: confirm the tier assignments above.
4. **Actor for system writes** — agree that adapter/agent/import writes log as `system`/agent identity rather than a user?
5. **Sequencing with §2.4** — Header/Footer are being redesigned for tenant/site scoping; wire ChangeLog for them before or after that work? (Recommend after — avoid double work on a schema that's about to change.)
6. **form-submissions retention** — intentionally not proposed (client data); raise separately or include?

---

## 6. Proposed Implementation Phases (NOT started — for planning only)

- **Phase 0** — answers to §5.
- **Phase 1** — EmailLogs TTL index + AgentAuditLog archive job (env-driven). Smallest surface, unblocks unbounded growth immediately.
- **Phase 2** — change-history mechanism per the chosen option, rolled out collection-by-collection (P0 → P1 → P2 tiers).
- **Phase 3** — ChangeLog archive job + a verification step (row-count reconcile between archive files and deletions).
- **Phase 4** — monitoring/alerting on archive job failures (a failed archive must block deletion, never silently skip it).

## 7. Flip-On Runbook (ENABLE_RETENTION_DELETION)

Deletion is inert by default. To enable real deletion after a dry-run cycle has been observed:

1. Set `ENABLE_RETENTION_DELETION=true` in the deployment env (and `.env` for local).
2. Deploy. On first boot, `onInit` creates the EmailLogs TTL index `ttl_sentAt` (90d default).
3. The archive job's next scheduled run (daily 03:00, via Vercel Cron → GET /api/payload-jobs/run) will delete rows after verified archive upload.
4. If the flag is later set back to false, an existing TTL index is NOT removed automatically — drop it manually: `db['email-logs'].dropIndex('ttl_sentAt')`.
5. Manual dry-run at any time: queue via local API (`payload.jobs.queue({ task: 'archive-agent-audit-log', input: {} })`), then GET /api/payload-jobs/run with `Authorization: Bearer $CRON_SECRET` (this version has no REST queue endpoint — queueing is local-API only).

### Implementation notes (2026-08-23/24)

- The jobs run endpoint is **GET** (not POST as §4 proposed) — "GET instead of POST to allow it to be used in a Vercel Cron" (Payload 3.85 source).
- `change-log.previousValue`/`newValue` store **JSON-encoded text** (Payload's `json` field parses string input as JSON, so raw text values fail validation; `JSON.stringify` round-trips deterministically). `JSON.parse` on read.
- `source` v1 emits only `admin` | `agent` | `system` — the admin UI sends no distinguishing header, so admin-UI and direct-API REST calls both log as `admin`. `agent` = the AGENT_EMAIL service account; `system` = local API. `api`/`public` are reserved and unused.
- Agent writes to the 4 tracked collections flow into change-log automatically (hooks fire on its REST PATCHes as the agent user). The agent has no actions on these collections today, so no AgentAuditLog duplication exists yet — if it gains Tier-2 actions later, both logs will record (intent log vs server-side truth log); decide then whether to keep both.
- Archive files are run-stamped (`<ISO>.jsonl` + `.sha256` sidecar), not day-stamped — avoids dry-run/live-run filename collisions.
- Imports (plugin-import-export) never write Tier-2 collections, so the `skipChangeLog` context flag has no import wiring; seed uses it for its users create/delete.
