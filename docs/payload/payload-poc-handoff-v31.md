# Payload POC Handoff v31 — Phase 2 Complete, Tenant Security Gap Closed

**Date:** 2026-08-10
**Repo:** `/Users/josh/work/payload-poc` (Payload CMS 3.85.1)
**Supersedes:** v30 (Phase 2 in-progress state — now complete, see §2-3 below)

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

**Phase 0, Phase 1, and Phase 2 are all complete and verified.**

---

## 2. Phase 2 — Dynamic Sidebar/Dashboard Nav (✅ Complete)

Built per-collection sidebar nav links (replacing the old generic "Custom
Collections" / "Entries" links), filtered by each site's
`disabledCollections` setting and by existing RBAC permissions. Full custom
`admin.components.Nav` replacement, absorbing `SiteSwitcher`.

14 commits across Tasks 1-6, plus 10 additional bug fixes found during Task
7 verification (permission-filter logic, TenantSelector wiring, Payload CSS
classes/ChevronIcon, Link children vs label prop, nav dark bg/sticky/100vh,
payload-* internal collection filtering, TenantSelector props/padding,
import-export version pin).

**Task 7 (4-user browser verification) — confirmed complete.** All 4 real
production users verified against the 9-step checklist (toggle collection
off/on, site switch updates nav, standard collections always present,
"Custom Collections" always visible, "Entries" absent, RBAC regression
check, deep-link correctness, `BeforeDashboard` wiring):

| User | Role | Tenant | Status |
|---|---|---|---|
| High6 Admin | super-admin | High6 (all) | ✅ Verified |
| Josh | super-admin | High6 (all) | ✅ Verified |
| Agent | tenant-admin | High6 only | ✅ Verified |
| Demo Author | tenant-admin | Equator only | ✅ Verified |

Key commits: `d464e88` (cookie utility) → `5a58c7d` (static nav structure)
→ `b7046b8` (per-collection links + SiteSwitcher) → `1254d6c` (wired into
config) → `b9e1151` (BeforeDashboard filter) → `83bfdbc` (import map) →
bug-fix commits `565e52e` through `92d16e4`.

---

## 3. Tenant Data-Scoping Gap — Discovered and Fixed This Session

**Not a Phase 2 nav bug — a pre-existing Phase 0 access-control gap,
discovered while doing Task 7 RBAC checks.** The multi-tenant plugin only
enforced access control on 8 collections (pages, posts, media, categories,
forms, form-submissions, custom-collections, custom-collection-entries).
Several other collections had a `site` or `tenant` relationship field in
their schema but **no access filtering applied to it** — meaning
tenant-admins could read (and in some cases write) other tenants' records
directly via the admin UI or REST API, despite the relationship existing to
prevent it.

### Root cause pattern
Two distinct sub-cases, confirmed per-collection via direct REST API testing
as Demo Author (Equator tenant-admin):

| Collection | Relationship | Access before | Access after |
|---|---|---|---|
| PortfolioItems | site → sites | anyone/authenticated | siteTenantReadAccess/MutateAccess |
| FAQs | site → sites | anyone/authenticated | siteTenantReadAccess/MutateAccess |
| Testimonials | site → sites | anyone/authenticated | siteTenantReadAccess/MutateAccess |
| PricingPlans | site → sites | anyone/authenticated | siteTenantReadAccess/MutateAccess |
| SiteSettings | site → sites | anyone/authenticated | siteTenantReadAccess/MutateAccess |
| Sites | tenant → tenants | authenticated | tenantReadAccess/MutateAccess |
| PortalClients | tenant → tenants | authenticated | tenantReadAccess/MutateAccess |
| AgentAuditLog | tenant → tenants | authenticated | tenantReadAccess (locked update/delete) |
| EmailLogs | site → sites | authenticated | siteTenantReadAccess (locked update/delete) |

**Already properly scoped, no changes needed:** Tenants (plugin
`useTenantsCollectionAccess: true`), Users (plugin default), CustomCollections
(plugin registration), Pages/Posts/Media/Categories/Forms/FormSubmissions/
CustomCollectionEntries (plugin registration).

### Verification
Every fix verified via direct REST API call as Demo Author — confirmed
zero cross-tenant records returned for each collection (Equator's own
records only). Commits: `afa5605` (site-scoped 5), `0c9cb46` (tenant-scoped
4), `e4e1442` (bug fix, see below).

### Bug found during verification
`getUserTenantIds` returned populated tenant relationship objects
(`{ id, name }`) instead of ID strings in some cases, breaking the tenant
comparison in the new access functions. Fixed in `e4e1442`.

---

## 4. Open Items Not Yet Scoped Into a Phase

- **Site-level RBAC** (deferred from Phase 0) — currently any user with
  tenant access can access any of that tenant's sites; no per-user site
  restriction exists.
- **Extending the toggle system to standard collections** — supervisor
  raised wanting Pages/Posts/Pricing Plans (and similar) eventually made
  toggleable per-tenant too, via the same tenant-management settings, so
  unused collections don't clutter the sidebar for tenants that don't use
  them. Not yet scoped into a phase.
- **Per-page SEO focus keyword** (raised by a teammate this session) —
  SEO Focus Keyword currently exists only on Site Settings (one value,
  site-wide). Needs to move to (or also exist on) the Pages collection
  itself, since different pages should be able to target different
  keywords. No access-control work needed — Pages already inherits tenant
  scoping via the plugin. Still needs a decision: does the Site Settings
  keyword become a fallback/default, or do the two become independent?
  **Explicitly deferred to next session.**
- **SiteSwitcher investigation** — tied to earlier broken-sidebar rendering
  reports seen mid-session (nav rendering empty / oversized stray icons).
  Appeared resolved by the time Task 7 verification passed, but the root
  cause was never conclusively identified — worth a dedicated look to make
  sure it doesn't silently regress.
- **Final whole-branch SDD review** — individual tasks were reviewed
  clean, but a full review of the complete Phase 2 branch (all commits
  together) has not yet been done.
- **Phase 1 cleanup**: decide fate of "Auto Enable Test" custom collection
  and "Projects" toggle state on Equator.
- **Credential hygiene**: plaintext production passwords in repo docs —
  flagged multiple times now, still unresolved.

---

## 5. How to Resume — Continuation Prompt Template

```
# Task: Phase 3 Kickoff (payload-poc)

## Pre-work
- Read this handoff doc (payload-poc-handoff-v31.md) in full first.
- graphify + engram: pull current state, confirm nothing drifted since
  the last session's commits (see §2-3 above for commit refs).
- Read the SDD workspace and tenant audit from the prior session:
  - .superpowers/sdd/2026-08-10-phase-2-dynamic-nav/SESSION_CLOSE.md
  - .superpowers/sdd/2026-08-10-phase-2-dynamic-nav/tenant-audit.md

## Immediate next step
Decide with Josh which of the Open Items (§4) to tackle first — the
per-page SEO keyword feature was explicitly deferred to this session
and is the most likely starting point, but confirm before starting
any implementation (plan-first gate applies).

## Constraints carried over from the whole project
- Production database, additive changes only, no destructive migrations
  without explicit sign-off.
- "Builds cleanly" is never accepted as evidence — runtime verification
  (real logins, real toggles, real API calls) is required for every
  acceptance criterion. The tenant-scoping fix this session was only
  accepted after direct REST API verification, not UI inspection alone.
- Plan-first gate applies to any new task not already covered by an
  approved spec/plan.
- Start: `cd /Users/josh/work/payload-poc && pnpm dev`
```
