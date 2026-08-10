# Payload POC Handoff v30 — Multi-Tenant Production Readiness (Phase 2 In Progress)

**Date:** 2026-08-10
**Repo:** `/Users/josh/work/payload-poc` (Payload CMS 3.85.1)
**Supersedes:** v29 (bulk import/export work — complete, see §7 for corrections made to that doc)

---

## 1. Project Context

Supervisor requested a production-readiness feature set for the multi-tenant
CMS: tenant-scoped admin accounts, per-tenant/site collection filtering in
the sidebar, tenant-based CMS accounts, global header/footer connections,
menu items, and SMTP2GO CRUD. **Database is already in production use —
additive changes only, no destructive migrations without explicit sign-off.**

Confirmed architecture:
- Tenant → Site is **1:many**, not 1:1 (a tenant can own multiple sites).
- Custom Collections are scoped by `site`, not `tenant`.
- Per-collection settings (like enabled/disabled toggles) therefore live on
  `sites`, not `tenants`.

Work is broken into phases. **Phase 0 and Phase 1 are complete and verified.
Phase 2 is in progress (1 of 7 tasks done).**

---

## 2. Phase 0 — User-Tenant Scoping + Site Switcher (✅ Complete)

- Added `roles` field to Users (`super-admin` / `tenant-admin`), field-level
  access preventing self-escalation, create/delete restricted to
  super-admin only.
- `userHasAccessToAllTenants` in the multi-tenant plugin config now checks
  `roles.includes('super-admin')` instead of always returning `true`.
- `useTenantsCollectionAccess: true` made explicit in plugin config.
- Added `defaultSite` relationship field to `Tenants`, scoped via
  `filterOptions` to that tenant's own sites.
- New `SiteSwitcher` component (`src/components/SiteSwitcher/index.tsx`) —
  cookie-based (`payload-tenant` read, `payload-site` read/write), renders
  a dropdown only when the active tenant has 2+ sites, falls back to
  `tenant.defaultSite` when the site cookie is missing/stale. Site switches
  trigger `window.location.reload()`.
- **Site-level RBAC is explicitly deferred** — any user with tenant access
  can currently switch between all of that tenant's sites. Marked with a
  `// TODO: site-level RBAC not yet implemented` comment in code.
- Rollback: single-line revert of `userHasAccessToAllTenants` back to
  `() => true`, documented inline with a comment above the line.

### Confirmed production role/tenant assignments

| User | Email | Role | Tenant(s) |
|---|---|---|---|
| High6 Admin | payload.admin@high6.com | super-admin | all |
| Josh | joshsosme@gmail.com | super-admin | all |
| Agent | agent@payload-poc.local | tenant-admin | High6 |
| Demo Author | demo-author@example.com | tenant-admin | Equator |

> ⚠️ Plaintext passwords for these accounts have been circulating in prior
> session reports and doc files (this repo's `docs/NEXT_SESSION.md` among
> them). This is a real exposure for production credentials sitting in a
> doc that may be committed. Worth rotating and moving to a proper secrets
> manager at some point — flagged previously, still unresolved, not
> re-included here.

Also fixed during this phase: a pre-existing data bug where the Matchpoint
form was assigned to the wrong tenant — corrected.

---

## 3. Phase 1 — Per-Site Enabled-Collections Toggle (✅ Complete)

- New field `disabledCollections` (type `json`, default `[]`) added to
  `Sites` collection, sidebar-positioned.
- **Blacklist pattern, not whitelist**: everything is enabled by default;
  an ID appearing in the array means it's explicitly disabled. Fail-open —
  new Custom Collections are automatically "enabled" simply by being absent
  from the array. No hook, no compute-on-read logic needed.
- Custom field component: `src/components/EnabledCollectionsToggle/index.tsx`
  — follows the existing `FieldBuilder` precedent (`'use client'`,
  `useField<string[]>`, inline Payload CSS custom properties, no Tailwind).
  Fetches Custom Collections for the current site via REST
  (`/api/custom-collections?where[site][equals]=<siteId>`), renders a
  "Custom Collections" toggle section.
- New registry file `src/collections/built-in-collections.ts` — currently
  **empty by design**. Phase 3 will add entries
  (`{ slug, label, description }`) for Menus / Headers & Footers / SMTP
  Settings; the toggle UI and (eventually) the nav filter both read this
  registry automatically with zero changes needed when Phase 3 lands.
- ID format in the array: Custom Collection MongoDB ObjectIDs, or
  `builtin:<slug>` strings for future built-in entries — both live in the
  same flat `string[]`, checked by exact string match.
- Deletion edge case: if a Custom Collection is deleted while its ID sits
  in some site's `disabledCollections`, it's simply orphaned — the toggle
  UI only renders what the API returns, so stale IDs never match a
  rendered row. No cleanup logic needed.
- Access control: inherits `sites.update: authenticated` + existing tenant
  scoping — a tenant-admin can toggle their own site's collections (same
  as they can edit any other field on their own site). Deliberate, not a
  default left unexamined.
- Verified live on Equator (3 Custom Collections). Two verification
  artifacts remain from testing and need a decision:
  - **"Auto Enable Test"** custom collection still exists under Equator
    (created to test auto-enable behavior) — keep as a fixture or delete.
  - **"Projects" toggle is currently OFF** on Equator (left in its tested
    state, not restored) — decide whether to flip back on.

---

## 4. Phase 2 — Dynamic Sidebar/Dashboard Nav (🔶 In Progress — 1 of 7 tasks complete)

### Scope discovery (important — changed the shape of this phase)

The original framing assumed individual Custom Collections already had
their own sidebar links that just needed filtering. **They don't.** The
actual current nav has only two generic links under "Custom Content":
"Custom Collections" (schema management) and "Entries" (unfiltered list of
all entries across all collections). Phase 2 therefore has to **build**
per-collection nav links (e.g. "Projects", "Available Opportunities") and
then filter those — a real scope increase, documented and approved before
implementation began.

### Key design decisions (all in the approved spec)

- **Mechanism**: full custom `admin.components.Nav` replacement (the
  officially-supported Payload mechanism), not a CSS/DOM-manipulation hack.
  This replaces `SidebarOrderFix` entirely (kept on disk, no longer
  imported) and absorbs `SiteSwitcher` (moves from `beforeNavLinks` into
  the new Nav component).
- **"Entries" link removed entirely** — replaced by dynamic per-collection
  links, each deep-linking to
  `/admin/collections/custom-collection-entries?where[parentCollection][equals]=<id>`
  (verified working in-browser — Payload's admin list view applies `where`
  query params on load, no custom list-view component needed).
- **"Custom Collections" (schema management) stays, never filtered** —
  same category as Pages/Posts/Pricing Plans (infrastructure, not
  per-site toggleable content).
- **Permission filtering preserved**: traced Payload's actual source
  (`getVisibleEntities()` + `getAccessResults()` → `DefaultNav`) rather
  than assuming `useConfig()` alone was safe. Standard collections are
  filtered via `useAuth().permissions.collections[slug]?.read?.permission`
  (a superset of what `DefaultNav` does — preserves Phase 0's RBAC work).
  Per-collection Custom Content links are NOT Payload collections, so they
  bypass this check entirely and are filtered purely by
  `disabledCollections`.
- **No-site-selected state**: per-collection links are **absent** (not
  fail-open) — reasoned as a data-fetching constraint ("which collections
  belong to this site?" is structurally undefined without a site), not an
  access decision. Every other part of the nav stays fail-open as normal.
  In practice this state should be rare/short-lived since `SiteSwitcher`'s
  `defaultSite` fallback resolves quickly.
- **Flicker trade-off, explicitly accepted**: static nav renders
  immediately; per-collection links appear after two fast local REST
  fetches complete (site's `disabledCollections` + site's Custom
  Collections list). Accepted because it's a single mount-time flicker
  (not per-navigation like the rejected DOM-manipulation approach), and a
  blocking spinner would contradict the fail-open principle used
  throughout this project.
- **Source-agnostic filtering**: the filter checks membership in
  `disabledCollections` generically — works the same for Custom Collection
  ObjectIDs today and `builtin:<slug>` entries once Phase 3 populates the
  registry. Zero Nav-component changes needed when Phase 3 ships.

### Render order (replaces `SidebarOrderFix`'s CSS hack)

1. Dashboard link
2. "Tenant Management" group
3. "Collections" group (standard collections, permission-filtered)
4. "Globals" group
5. "Custom Content" group — "Custom Collections" (always visible) + dynamic
   per-collection links (filtered)
6. Browse by Folder
7. Site Switcher
8. Controls (settings/logout)

### Task progress

| # | Task | Status | Commit |
|---|---|---|---|
| 1 | Cookie utility (`src/utilities/admin-cookies.ts`, extracted `getCookie()` from SiteSwitcher) | ✅ Complete, reviewed clean | `d464e88` |
| 2 | `SiteFilteredNav` static structure (`src/components/SiteFilteredNav/index.tsx`, 259 lines — NavGroup/NavLink sub-components, group ordering, `useAuth().permissions` RBAC filtering, `custom-collection-entries` exclusion) | 🔲 Implemented, **review not yet dispatched** | `5a58c7d` |
| 3 | Per-collection links + move SiteSwitcher into new Nav | ⬜ Not started | — |
| 4 | Wire `Nav` into `payload.config.ts`, remove `beforeNavLinks` | ⬜ Not started | — |
| 5 | `BeforeDashboard` update (cookie-aware quick-action filtering — currently no Custom Collection quick actions exist, so this path is "wired but not exercisable with current data," stated explicitly rather than claimed as verified) | ⬜ Not started | — |
| 6 | Regenerate import map | ⬜ Not started | — |
| 7 | 4-user browser verification (9 steps — see below) | ⬜ Not started | — |

### Task 7 verification plan (do not compress when executing)

All 4 real production users, each with concrete expected outcomes:

| User | Role | Tenant | Expected |
|---|---|---|---|
| High6 Admin | super-admin | High6 (all) | Full nav; High6 site's per-collection links filtered correctly; "Custom Collections" + Pages/Posts/Pricing Plans always visible |
| Josh | super-admin | High6 (all) | Same as High6 Admin |
| Agent | tenant-admin | High6 only | Nav limited to High6-accessible collections (RBAC); per-collection links further filtered by `disabledCollections`; no cross-tenant leakage |
| Demo Author | tenant-admin | Equator only | Nav limited to Equator-accessible collections; Equator's `disabledCollections` applied; no High6 collections visible |

Steps per user: (1) toggle a collection off → reload → link gone, (2)
toggle back on → link returns, (3) switch sites → nav updates to new
site's collections, (4) standard collections always present, (5) "Custom
Collections" always visible, (6) "Entries" confirmed absent, (7) RBAC
regression check — no out-of-scope collections appear, (8) deep-link click
lands on correctly filtered Entries list, (9) `BeforeDashboard`
quick-action mechanism confirmed wired (not necessarily exercised, per the
stated caveat above).

### Known process gotchas from this session

- The review-package script needs an **absolute path** to the plan file:
  `/Users/josh/work/payload-poc/docs/superpowers/plans/2026-08-10-phase-2-dynamic-nav.md`
- The plan file had a stray backtick fixed at line 22 — extraction scripts
  now work correctly.
- Execution mode: **subagent-driven** (fresh subagent per task, review
  gate between each) — chosen deliberately over inline execution, same
  reasoning as Phase 1: independent verification per task catches mistakes
  before they compound, given this phase touches the entire sidebar for
  every logged-in user.

### Key decision artifacts (in-repo)

- Spec: `docs/superpowers/specs/2026-08-10-phase-2-dynamic-nav-design.md`
- Plan: `docs/superpowers/plans/2026-08-10-phase-2-dynamic-nav.md`
- Progress ledger: `.superpowers/sdd/2026-08-10-phase-2-dynamic-nav/progress.md`

---

## 5. How to Resume — Continuation Prompt Template

When starting the next session (new Claude Code session recommended — this
work has accumulated enough context that a fresh session reading the
artifacts above directly is more reliable than a long carried-over thread):

```
# Task: Phase 2 — Dynamic Sidebar Nav — Resume from Task 2 Review (payload-poc)

## Pre-work
- Read this handoff doc (payload-poc-handoff-v30.md) in full first.
- Read the approved spec and plan directly:
  - docs/superpowers/specs/2026-08-10-phase-2-dynamic-nav-design.md
  - docs/superpowers/plans/2026-08-10-phase-2-dynamic-nav.md
- Read the progress ledger: .superpowers/sdd/2026-08-10-phase-2-dynamic-nav/progress.md
- graphify + engram: pull current state, confirm nothing drifted since
  commits d464e88 and 5a58c7d.

## Immediate next step
Task 2 (SiteFilteredNav static structure, commit 5a58c7d) was implemented
but its review was never dispatched. Dispatch that review now before
starting Task 3. Use subagent-driven execution (superpowers:subagent-
driven-development), same as the rest of this phase — do not switch to
inline execution.

## Then continue
Tasks 3 → 4 → 5 → 6 → 7 in order, per the plan file. Task 7 (4-user
verification) is a hard gate — do not consider Phase 2 complete without
actually logging in as all 4 users and confirming each row of the
verification table in this handoff doc (§4), not just a build-passes check.

## Production credentials for Task 7
High6 Admin: payload.admin@high6.com / [password — see project's existing
credential doc, not duplicated here]
Josh: joshsosme@gmail.com / [same]
Agent / Demo Author: request current passwords if not already known —
don't assume they're unchanged from earlier sessions.

## Constraints carried over from the whole project
- Production database, additive changes only, no destructive migrations
  without explicit sign-off.
- "Builds cleanly" is never accepted as evidence — runtime verification
  (real logins, real toggles, real nav renders) is required for every
  acceptance criterion.
- Plan-first gate applies to any new task not already covered by the
  approved spec/plan above.
```

---

## 6. Open Items Not Yet Scoped Into a Phase

- **Site-level RBAC** (deferred from Phase 0) — currently any user with
  tenant access can access any of that tenant's sites; no per-user site
  restriction exists.
- **Extending the toggle system to standard collections** — supervisor
  raised wanting Pages/Posts/Pricing Plans (and similar) eventually made
  toggleable per-tenant too, via the same tenant-management settings, so
  unused collections don't clutter the sidebar for tenants that don't use
  them. Not yet scoped into a phase; would require checking whether these
  collections are currently tenant/site-scoped at all.
- **Phase 1 cleanup**: decide fate of "Auto Enable Test" custom collection
  and "Projects" toggle state on Equator (see §3).
- **Credential hygiene**: plaintext production passwords in repo docs —
  flagged twice now, still unresolved.

---

## 7. Phase 3 (Not Started) — Reminder of Full Scope

- Header/Footer: currently Payload Globals (singleton, not per-tenant).
  Needs conversion to per-tenant content — investigate `isGlobal: true`
  collection mode as a possible lower-disruption alternative to a full
  Collection conversion (avoids breaking the current API response shape
  for whatever frontend(s) consume these globals — confirm which repos
  consume them before starting).
- Menu Items: new tenant/site-scoped collection.
- SMTP2GO CRUD: currently global env-var config
  (`src/payload.config.ts:52-65`, all values from `process.env`). Needs a
  new `smtp-configs` collection (tenant-scoped) and a refactor of the
  email adapter from its current module-init IIFE pattern to a per-send
  lookup adapter. **High blast radius** — touches all outgoing email
  including auth/password-reset, not just form submissions. Verification
  must include an actual sent email, not just a successful config load.
- All three: once built, register into `built-in-collections.ts` — the
  Phase 1/2 toggle and nav-filtering mechanisms will pick them up
  automatically with no further changes to either.
