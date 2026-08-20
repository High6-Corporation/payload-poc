# Payload POC Handoff v33 — Access Control Hardened, Import/Export Migration Complete

**Date:** 2026-08-11
**Repo:** `/Users/josh/work/payload-poc` (Payload CMS 3.85.1)
**Supersedes:** v32 (Phase 3 prep + import/export in-progress — now historical, see §2)

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
  by `tenant` via the multi-tenant plugin, and now also **enforced
  server-side** by the `disabledCollections` toggle (see §3).

**Phase 0, Phase 1, Phase 2, and Phase 3 prep are all complete.** This
session closed out two loose threads carried from v32: the
`disabledCollections` access-control gap, and the import/export storage
migration. **Phase 3's actual original scope (Header/Footer globals,
Menu Items, SMTP2GO CRUD) has still not been started** — everything so
far has been infrastructure/hardening.

---

## 2. What Was Historical as of v32 (not repeated here)

Phase 0 (tenant/site role scoping), Phase 1 (per-site enabled-collections
toggle), Phase 2 (dynamic sidebar nav), and Phase 3 prep (super-admin
lockdown, tenant-level collection toggle, SEO focus keyword, dashboard
cleanup) are all complete and were fully detailed in v32 §2–3. Not
repeated here — see v32 if full detail is needed.

---

## 3. This Session — Access Control Enforcement (✅ Complete)

### Trigger
Investigating a UX request (flash of unfiltered collections on
tenant-admin login) surfaced that `disabledCollections` — the
tenant/site toggle from Phase 1/3 prep — was **nav/UI-only**, not
enforced in collection access control. A tenant-admin (or anyone with
direct API access) could read a "disabled" collection's data even
though it was hidden from the sidebar. Same class of gap as the
pre-existing Phase 0 finding from the prior session.

### Fix
Async factory functions added to `src/access/tenantScoped.ts`:
- `tenantEnabledAccess(slug)` — for plugin-managed, tenant-scoped
  collections (simpler factory, no site-doc lookup)
- `siteTenantEnabledAccess(slug)` — for site-scoped collections
  (more complex, needs a site-doc lookup for create validation)
- Both use `req.context` caching (one tenant/site query per request,
  shared across all collections) and fail closed on error
- Optional `publicAccess` param preserves `authenticatedOrPublished`
  for Pages/Posts (the only two collections using it) and `anyone` for
  Media/Categories — unauthenticated/public reads are **unaffected**,
  confirmed by design and by testing

### Scope: all 10 collections, rolled out one at a time
| # | Collection | Family | Notes |
|---|---|---|---|
| 1 | PricingPlans | site-scoped | Turned out more complex than planned — site-scoped needed the harder factory first |
| 2 | Categories | tenant-scoped | Clean |
| 3 | Media | tenant-scoped | `anyone` public access preserved |
| 4 | Forms + FormSubmissions | tenant-scoped | One change covered both (formBuilderPlugin configures them together) |
| 5 | Posts | tenant-scoped | `authenticatedOrPublished` preserved via `publicAccess` param |
| 6 | Pages | tenant-scoped | Same pattern as Posts |
| 7 | FAQs | site-scoped | |
| 8 | Testimonials | site-scoped | |
| 9 | PortfolioItems | site-scoped | Last one |

**Not in scope:** CustomCollections/CustomCollectionEntries use a
separate site-level `disabledIds` mechanism (already access-controlled
from Phase 0). SiteSettings/EmailLogs aren't gated by either toggle.

Every collection verified via real REST calls: super-admin 200 always,
disabled tenant-admin 403 (hard deny, not empty 200 — deliberate, avoids
"no data" vs "access denied" ambiguity), enabled tenant-admin normal
scoped access, no false lockouts on control collections, public access
preserved where applicable.

**Files:** `src/access/tenantScoped.ts` (new factories) +
`PricingPlans.ts`, `Categories.ts`, `Media.ts`, `FAQs.ts`,
`Testimonials.ts`, `PortfolioItems.ts`, `Posts/index.ts`,
`Pages/index.ts`, `plugins/index.ts` (forms + form-submissions).

---

## 4. This Session — Reusable Loading Component + Overlay (✅ Complete)

### Why
Once the access-control fix landed, the original flash-of-unfiltered-
collections became a pure UX issue (no longer a data-exposure gap).
Also flagged separately: the production DB isn't upgraded yet, so
various admin operations can be slow — worth a general-purpose loading
component, not a one-off fix.

### What was built
`AdminLoading` — new shared component at `src/components/ui/admin-loading.tsx`
+ `admin-loading.scss`:
- Two modes: `fullpage` (viewport-covering overlay, dark background
  matching the admin theme) and `inline` (compact, fits in a card/row)
- Configurable rotating messages ("Getting things ready…", "Just a few
  seconds…", etc.), minimum display time, rotation interval, and a
  "taking longer than expected" tone-shift tier with optional dismiss
  button after timeout
- Respects `prefers-reduced-motion` (static-but-visible fallback, not
  disappearing)
- Consolidated the previously-duplicated `LoaderIcon` SVG + `@keyframes
  spin` from `EntryDataField` and `EnabledCollectionsToggle` into one
  shared implementation (`admin-loading-spin` keyframe, defined once)

### Wired to (priority order)
1. `SiteFilteredNav` — fullpage overlay gates the sidebar until the
   tenant/site `disabledCollections` fetch resolves. SessionStorage-cached
   navigations skip the overlay entirely (no flash). The
   `SUPER_ADMIN_ONLY_SLUGS` synchronous check is unaffected by the new
   gate (verified — it was already correct on first paint).
2. `BeforeDashboard` main loading state — italic "Loading dashboard…"
   text swapped for the inline variant; no behavioral change (same
   `loading` state, same `finally` block, error state at lines 172–181
   untouched).
3. `BeforeDashboard` quick-actions — previously silent
   `disabledCollections` fetch now gated behind an inline loading
   indicator.

**Deferred (flagged, not implemented):** `SiteSwitcher` (`if (loading)
return null` → should become an inline indicator), `ImportHistory`
(plain "Loading…" text → same treatment). Not urgent, no data-exposure
concern, just visual polish.

**Commit:** `4d43515` (17 files, +831/−227) — access control +
AdminLoading + wiring, all in one commit, pushed to staging.

---

## 5. This Session — Import/Export Storage Migration (✅ Complete)

Closes out v32 §4 (was in-progress).

### Root cause of the blocked sanitization hooks
`validateMimeType` (a `beforeValidate` hook) accessed `req.file.data`.
The import-export plugin's `afterChange` handler calls
`req.payload.update()` to write status/results after processing a CSV —
this **re-triggers `beforeValidate`**, but on that internal update call
`req.file` is `undefined` (no file is being uploaded). The hook's `!fileData
|| fileData.length === 0` check was true for `undefined`, throwing
inside Payload's transaction boundary → the import document's status
update rolled back → 404 on the plugin's own follow-up request.

### Fix
One-line guard in `src/utilities/importSanitization.ts:70`:
```ts
if (!req.file) return  // skip on updates — no file to validate
```

### Result
All 5 sanitization hooks (`sanitizeFilename`, `validateMimeType`,
`captureUploadedBy`, `stripCsvBom`, `validateContent`) re-enabled.
`imports: true` re-added to the `s3Storage` collections config.

Verified: real import lands in the same S3 bucket Media uses (not local
disk), Media uploads unaffected post-reorder (regression-checked),
tenant field + `uploadedBy` populate correctly, tenant-admin only sees
their own tenant's import history, bad MIME-type upload rejected
cleanly (400, not a raw 500 or silent corruption), types regenerate
cleanly. The 20 pre-existing local CSV files were intentionally left
in place, untouched.

**Commit:** `2b4e076` (2 files — `plugins/index.ts`,
`importSanitization.ts` — +19/−14), staging.

---

## 6. Credential Hygiene — Checked, Clean

Investigated per a repeatedly-flagged open item. Result: the repo is
clean. No passwords, API keys, or connection strings with embedded
credentials in version control. Only low-risk items found: an SMTP2GO
subaccount *username* (no password) across 5 historical handoff docs,
and a MongoDB Atlas cluster *hostname* (connection strings all use
`<password>` placeholders). No `.env` ever committed to this repo's
history — no git-history scrubbing needed.

**Follow-up note (now resolved):** the v29-documented SMTP2GO migration
from `investph-smtp` to a client-server subaccount was unconfirmed in
handoffs v30–v32. **Confirmed this session: migration completed in
production.** No longer an open item.

**Still worth remembering (not a repo issue):** SMTP2GO password is
reused between this project and `email-app-backend` — shared blast
radius if either project's `.env` is ever exposed. Not actionable now,
just a fact to keep in mind for any future credential rotation.

---

## 7. Open Items Not Yet Scoped Into a Phase

- **Phase 3's actual original scope** — Header/Footer global
  connections, Menu Items, SMTP2GO CRUD. Not yet started. **New scoping
  question surfaced this session:** the SMTP2GO collection/config needs
  to be scoped per-tenant or per-site (not yet decided which) —
  presumably so different tenants can use different SMTP2GO
  subaccounts, but this needs to be pinned down (data-model scoping —
  separate credentials per tenant/site — vs. access-control scoping —
  same config, restricted visibility) before implementation starts.
  **Discuss and decide this at the start of next session, before any
  code.**
- **Loading-state audit follow-up** — `SiteSwitcher` (`return null` →
  inline indicator) and `ImportHistory` (plain text → inline indicator).
  Flagged, not scheduled. Low priority, no urgency.
- **`getUserTenantIds` test coverage** — has had two separate bugs fixed
  across sessions (populated-object handling, `String(t)` fallback);
  sits on the tenant security boundary. Not urgent but worth a
  dedicated pass at some point.
- **NestProviders / Next.js 16 + Payload framework version mismatch** —
  still just worked around (`pnpm build` temporarily clears it), not
  actually fixed. Worth tracking upstream.
- **Site-level RBAC** (deferred from Phase 0) — any user with tenant
  access can currently switch to any of that tenant's sites; no
  per-user site restriction exists.
- **Phase 1 cleanup** — fate of the "Auto Enable Test" custom
  collection fixture, and the "Projects" toggle state on Equator.

---

## 8. How to Resume — Continuation Prompt Template

```
# Task: Scope and Begin Phase 3 (Header/Footer, Menu Items, SMTP2GO CRUD)

## Pre-work
- Read this handoff doc (payload-poc-handoff-v33.md) in full first,
  especially §7 (open items) — the SMTP2GO per-tenant/site scoping
  question needs to be resolved before implementation starts.
- graphify --update: sync current state (AST-only, no LLM cost).
- engram: pull recent memories — search "validateMimeType", "import
  transaction rollback", or "afterChange req.file" for the import/export
  fix; pull memories covering the access-control rollout and
  AdminLoading component for architectural context.
- Start: cd /Users/josh/work/payload-poc && pnpm dev

## Execution mode
Discuss and decide the SMTP2GO scoping question first — data-model
scoping (separate credentials per tenant/site) vs. access-control
scoping (shared config, restricted visibility) — before any plan or
code. This is a product decision, not an implementation detail.

Once decided: plan-first gate applies as usual. Subagent-driven,
review gate between tasks for anything touching production data or
the security boundary (same discipline as the access-control rollout).

## Constraints carried over from the whole project
- Production database, additive changes only, no destructive
  migrations without explicit sign-off.
- Runtime verification required for every acceptance criterion — real
  logins, real API calls, real uploads, real prod build where relevant.
  Not a passing build alone.
- Plan-first gate applies to any task not already covered by an
  approved plan.
```
