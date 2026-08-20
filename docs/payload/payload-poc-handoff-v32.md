# Payload POC Handoff v32 — Phase 3 Prep Complete, Import/Export Migration In Progress

**Date:** 2026-08-11
**Repo:** `/Users/josh/work/payload-poc` (Payload CMS 3.85.1)
**Supersedes:** v31 (Phase 2 close-out — now historical, see §2)

---

## 1. Project Context

Production-readiness feature set for a multi-tenant CMS: tenant-scoped
admin accounts, per-tenant/site collection filtering in the sidebar,
global header/footer connections, menu items, and SMTP2GO CRUD.
**Database is in production use — additive changes only, no destructive
migrations without explicit sign-off.**

Confirmed architecture:
- Tenant → Site is 1:many.
- Custom Collections are scoped by `site`, not `tenant`.
- Standard/built-in collections (Pages, Posts, etc.) are scoped directly
  by `tenant` via the multi-tenant plugin.

**Phase 0, Phase 1, and Phase 2 are complete.** Phase 3 prep
(infrastructure/hardening ahead of the original Phase 3 feature scope)
is now also complete. Import/export storage migration is in progress,
started this session, not finished.

---

## 2. Phase 2 — Dynamic Sidebar Nav (✅ Complete, historical)

Per-collection sidebar nav, filtered by site-level and (as of Phase 3
prep) tenant-level toggles. Full 4-user verification passed. A
pre-existing Phase 0 tenant-data-scoping gap was discovered and fixed
during this phase — 9 collections (portfolio-items, faqs, testimonials,
pricing-plans, site-settings, sites, portal-clients, agent-audit-log,
email-logs) had a tenant/site relationship field but no access
filtering, letting tenant-admins read other tenants' records. Fixed via
`siteTenantReadAccess`/`MutateAccess` and `tenantReadAccess`/
`MutateAccess`, verified via direct REST API calls. See v31 for full
detail if needed — not repeated here.

---

## 3. Phase 3 Prep — Complete This Cycle

### 3a. Super-admin lockdown
Tenant Management, Portal Clients, and Agent Audit Log are now
hard-restricted to super-admins only — **no exceptions**, confirmed
decision. Not a toggle, a hard role check (`roles.includes('super-admin')`)
plus collection-level access control that fully blocks non-super-admins
(zero records returned, not just tenant-filtered). Verified via direct
REST API call as a tenant-admin.

### 3b. Tenant-level collection toggle
Extends the Phase 1 per-Site `disabledCollections` pattern (which
covers Custom Collections) to a new toggle on **Tenants**, covering 10
standard/built-in collections (Pages, Posts, Pricing Plans, etc.).
Super-admin manages this from the Tenant Management admin screen.
Sidebar nav now checks both the site-level toggle (Custom Collections)
and the tenant-level toggle (standard collections) — the two mechanisms
are kept separate, not conflated.

### 3c. SEO Focus Keyword (Pages)
Per-page `focusKeyword` field added (mirrors the existing Site Settings
SEO tab field), with Site Settings' keyword as fallback when a page
doesn't set its own. `generateMeta()` extended with a `keywords` param.
**Verified in dev only — production build verification (port 3000,
requires restart) is still outstanding.** This has been flagged as
open for two sessions running; needs to actually get done next session.

### 3d. Dashboard cleanup
Removed the duplicate Payload-default collections widget, made the
remaining widget conditional on super-admin, added an "AfterDashboard —
Coming Soon" placeholder, expanded quick actions to 9 total, and
patched (via patch-package) to remove Edit/Reset buttons from certain
default UI.

### 3e. Bugs found and fixed this cycle
- Stale `useMemo` deps silently broke a toggle
- SSR hydration mismatch from `sessionStorage` used inside `useState`
- `NestProviders`/`chunk.reason.enqueueModel` error — traced to a
  Payload plugin version mismatch (3.87.0 → pinned to 3.85.1).
  **Workaround only** — `pnpm build` temporarily clears it, but the
  underlying Next.js 16 + Payload framework incompatibility is not
  actually resolved. Still an open risk.
- Select dropdown scroll CSS — **fixed** (confirmed this session)
- `getUserTenantIds` — two separate bugs fixed across sessions
  (populated-object handling in `e4e1442`, `String(t)` fallback replaced
  with `undefined` in `99dc9e6`). Worth a dedicated test-coverage pass
  at some point since this function sits on the tenant security
  boundary and has broken twice.
- Vercel build failure — `pnpm-lock.yaml` was out of sync with
  `package.json` (missing `patch-package`/`postinstall-postinstall`
  specifiers), blocking every staging deploy. **Fixed** — lockfile
  regenerated and committed.

---

## 4. Import/Export Storage Migration — IN PROGRESS, not finished

### Why
Imported CSV files were being written to a gitignored `imports/`
directory in the project repo — untracked, not backed up, wiped on a
fresh deploy, and invisible to the admin UI.

### Root cause (confirmed)
`@payloadcms/plugin-import-export` auto-creates an `imports` upload
collection with no storage adapter configured, defaulting to local
disk. The `s3Storage` plugin only covers Media because it runs
**before** `importExportPlugin` registers its collections, so it never
sees `imports`/`exports` to wire them to S3.

### Decision
Reorder `s3Storage` to run after `importExportPlugin` (not a collection
override — avoids duplicating plugin-internal config, which is fragile
against version bumps, as already seen with the NestProviders issue).
Add `imports`/`exports` to the multi-tenant plugin config for tenant
scoping (multi-tenant plugin runs last, can see them). Add an
`uploadedBy` field via hook. Sanitize files before upload — an S3
bucket is already provisioned.

### What's done and verified working
- Plugin reorder (`s3Storage` after `importExportPlugin`)
- `imports`/`exports` added to multi-tenant config — tenant field +
  access control working
- `uploadedBy` relationship field on the imports collection — working
- `targetCollection` made required — catches missing selection before
  submit — working

### What's blocked
Sanitization utility functions were written
(`src/utilities/importSanitization.ts`: `sanitizeFilename`,
`validateMimeType`, `captureUploadedBy`, `stripCsvBom`,
`validateContent`) but **all 5 hooks are currently disabled/commented
out**. One of them causes a MongoDB transaction rollback — the
import-export plugin's `afterChange` hook processes the CSV then calls
`req.payload.update()` to write status/results; if any hook in the
`beforeValidate`/`beforeChange` chain throws (even indirectly), the
transaction rolls back, the import document never persists, and the
subsequent update returns a 404. This is inside Payload's transaction
boundary — unrelated to the S3 work itself.

**S3 storage for `imports` was temporarily reverted to local disk**
until the hook issue is resolved — `imports: true` needs to be added
back to the `s3Storage` collections config once fixed.

The 20 pre-existing CSV files already on local disk are intentionally
left in place, not migrated — not urgent enough to justify migration
risk right now.

### Next steps (in order)
1. Re-enable the 5 sanitization hooks **one at a time**, starting with
   `sanitizeFilename` (considered lowest-risk), running a real import
   after each to find which one triggers the transaction rollback.
2. Fix the culprit hook (likely needs to not throw inside the
   transaction boundary — catch and handle gracefully, or move the
   check earlier/outside the hook chain that Payload wraps in a
   transaction).
3. Once all 5 hooks are stable, re-add `imports: true` to the
   `s3Storage` collections config.
4. Full runtime verification: real import → confirm file lands in the
   same S3 bucket Media uses (not local disk) → confirm Media uploads
   still work correctly post-reorder (regression check) → confirm
   tenant field + uploadedBy populate correctly → confirm a
   tenant-admin only sees their own tenant's import history → confirm
   sanitization actually rejects a messy filename / mismatched
   MIME-type file with a clear error rather than silent corruption.

---

## 5. Open Items Not Yet Scoped Into a Phase

- **Production-build verification of the SEO Focus Keyword** —
  flagged for two sessions running, still not done. Should be the
  first thing done next session, it's quick.
- **Import/export migration completion** — see §4, in progress.
- **NestProviders / Next.js 16 + Payload framework version mismatch**
  — currently just worked around, not actually fixed. Worth tracking
  upstream for a real fix rather than relying on the `pnpm build`
  workaround indefinitely.
- **Site-level RBAC** (deferred from Phase 0) — any user with tenant
  access can currently switch to any of that tenant's sites; no
  per-user site restriction exists.
- **Phase 1 cleanup** — fate of the "Auto Enable Test" custom
  collection fixture, and the "Projects" toggle state on Equator.
- **Credential hygiene** — plaintext production passwords still
  sitting in repo docs. Flagged repeatedly across multiple sessions,
  still unresolved. Low effort, should just get done.
- **`getUserTenantIds` test coverage** — has had two separate bugs
  fixed across sessions; not urgent but worth a dedicated pass given
  it sits on the tenant security boundary.
- **Phase 3's actual original scope** — Header/Footer global
  connections, Menu Items, SMTP2GO CRUD. Everything under "Phase 3
  prep" so far (super-admin lockdown, tenant toggle, dashboard cleanup,
  SEO keyword, import/export) has been infrastructure/hardening work,
  not these originally-requested features. Not yet started.

---

## 6. How to Resume — Continuation Prompt Template

```
# Task: Finish Import/Export Migration + SEO Prod Verification (payload-poc)

## Pre-work
- Read this handoff doc (payload-poc-handoff-v32.md) in full first,
  especially §4 (import/export — in progress) and §5 (open items).
- graphify --update: sync current state (AST-only, no LLM cost).
- engram: pull recent memories from the last few sessions covering
  the tenant toggle, SEO keyword, and import/export work.
- Read the current state of src/utilities/importSanitization.ts and
  src/plugins/index.ts to see exactly which hooks are commented out
  and the current s3Storage collections config.
- Start: cd /Users/josh/work/payload-poc && pnpm dev

## Execution mode
Subagent-driven, review gate between tasks.

## Task 1 — SEO keyword production verification (quick, do first)
Build and run on port 3000 (restart required). Confirm the
focusKeyword field and fallback chain (page → tenant → sites →
site-settings) render correctly in generateMeta() output under prod
conditions, not just dev server. This has been outstanding for two
sessions — close it out.

## Task 2 — Finish import/export migration
Re-enable the 5 sanitization hooks in importSanitization.ts one at a
time, starting with sanitizeFilename, running a real import after each
to isolate which one causes the MongoDB transaction rollback (404 on
the plugin's afterChange update). Fix the culprit. Once all 5 are
stable, re-add imports: true to the s3Storage collections config in
src/plugins/index.ts. Full verification per §4 above — real S3 upload
confirmed, Media regression-checked, tenant scoping confirmed, bad
filename/MIME-type upload confirmed rejected cleanly.

## Constraints carried over from the whole project
- Production database, additive changes only, no destructive
  migrations without explicit sign-off.
- Runtime verification required for every acceptance criterion — real
  logins, real API calls, real uploads, real prod build where relevant.
  Not a passing build alone.
- Plan-first gate applies to any task not already covered by an
  approved plan.
```
