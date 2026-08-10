# Plan: SEO Focus Keyword (Pages) + Phase 2 Close-out

**Date:** 2026-08-10
**Repo:** `/Users/josh/work/payload-poc` (Payload CMS 3.85.1)
**Handoff:** docs/payload/payload-poc-handoff-v31.md
**Prior workspace:** .superpowers/sdd/2026-08-10-phase-2-dynamic-nav/

## Global Constraints

- Production database, additive changes only, no destructive migrations
- "Builds cleanly" is never accepted as evidence — runtime verification required
- Plan-first gate applies; this plan is the gate for all three tasks
- Start: `cd /Users/josh/work/payload-poc && pnpm dev`
- After schema changes: `pnpm generate:types && pnpm generate:importmap`

## Pre-flight Context

Phase 0, 1, and 2 are all complete and verified (including tenant data-leakage fix
across 9 collections). The handoff v31 §4 lists open items; this plan addresses
three of them.

---

## Task 1 — SEO Focus Keyword on Pages

### Current state
- `SiteSettings.ts` has `focusKeyword` (textarea, comma-separated) in the SEO tab
- `Pages/index.ts` has an SEO tab but NO `focusKeyword` field
- `generateMeta.ts` produces `Metadata` from doc's `meta.title`, `meta.description`,
  `meta.image` — does NOT read or output `focusKeyword` anywhere
- The keyword field exists on SiteSettings but is **never consumed** in frontend output

### Decision (confirmed — do not re-litigate)
- Add SEO Focus Keyword to Pages, same multi-keyword field pattern as SiteSettings
- Site Settings' keyword is the fallback default — Page's own value takes precedence
  when set; falls back to Site Settings when the Page's field is empty
- Pages already inherits tenant scoping via the plugin — no access-control work needed

### Steps

1. **Add field to Pages** (`src/collections/Pages/index.ts`):
   - Add `focusKeyword` textarea to the SEO tab, exact same config as SiteSettings line 194-201:
     ```ts
     {
       name: 'focusKeyword',
       type: 'textarea',
       label: 'Focus Keywords',
       admin: {
         description:
           'Comma-separated keywords this page targets for SEO (e.g. "web design, agency, philippines").',
       },
     }
     ```

2. **Modify `generateMeta.ts`** to accept and output keywords:
   - Add `keywords?: string | null` to the args type
   - Parse comma-separated string → array, add `keywords` to returned `Metadata`

3. **Wire fallback in page `generateMetadata`** (`src/app/(frontend)/[slug]/page.tsx`):
   - After getting the page doc, check `page.meta?.focusKeyword`
   - If empty/null, look up SiteSettings for the page's tenant:
     - Get tenant ID from page (`page.tenant`)
     - Find sites for that tenant → get first site's SiteSettings
     - Use that SiteSettings' `focusKeyword` as fallback
   - Pass resolved keywords to `generateMeta`

4. **Regenerate types**: `pnpm generate:types`

5. **Verify** (real runtime, not just build):
   - Set a keyword on a Page → confirm it appears in rendered `<meta name="keywords">`
   - Clear the Page's keyword → confirm SiteSettings fallback kicks in
   - Set a different keyword on SiteSettings → confirm it's used when page has none
   - Check actual rendered HTML output (View Source), not just a passing build

### Files to touch
- `src/collections/Pages/index.ts` — add field
- `src/utilities/generateMeta.ts` — accept/output keywords
- `src/app/(frontend)/[slug]/page.tsx` — fallback resolution in generateMetadata

---

## Task 2 — Final Whole-Branch SDD Review (Phase 2 Close-out)

### Scope
Full diff from merge-base (`9c2d68e`) to HEAD (`f08210b`) — all Phase 2 nav work
(14+ commits) plus the tenant-scoping security fix (3 commits). Individual tasks
were reviewed clean but the combined branch has not had a full review.

### Steps
1. Generate review package: `scripts/review-package PLAN_FILE MERGE_BASE HEAD`
2. Dispatch final code reviewer on most capable model
3. Address any findings (ONE fix wave if needed, one scoped re-review)
4. Adjudicate residuals

### Success criteria
- Review complete with no load-bearing Critical/Important findings unresolved
- Deferred minors documented in ledger

---

## Task 3 — SiteSwitcher Investigation

### Background
Earlier in Phase 2, the sidebar rendered completely broken twice:
1. Empty nav with oversized stray icons
2. Almost-empty dark shell

Both appeared resolved by the time Task 7 verification passed, but root cause
was never conclusively identified.

### Investigation scope
The SiteSwitcher component (`src/components/SiteSwitcher/index.tsx`) is embedded
inside `SiteFilteredNav`. Key risk points to investigate:

1. **Swallowed fetch failures**: The `load()` function catches errors silently
   (line 111: `// Silently fail — site switcher is non-critical`). If the
   `/api/tenants/:id` or `/api/sites` fetch fails, `sites` stays `[]` and
   `loading` becomes `false` — the component returns `null` (line 136: sites ≤ 1
   → null). But this shouldn't break the entire nav...

2. **Component returning null**: When `loading` is true (line 133), when no
   tenantId (line 136), or when sites ≤ 1 (line 139), the component returns
   `null`. Check if this null propagation could cause the parent Nav to render
   empty.

3. **Race condition**: `loading` starts `true`, component returns `null`. If the
   fetch hangs or fails, `loading` stays true longer than expected. The entire
   nav renders without SiteSwitcher (which is fine — it's just missing), but
   could there be a layout shift or CSS issue?

4. **Import map regeneration**: After `83bfdbc` (regenerate import map for
   SiteFilteredNav), could a stale import map cause the custom Nav component to
   fail to load, leaving Payload's default (empty) nav?

5. **Cookie/state issues**: `getCookie('payload-tenant')` returning null when it
   shouldn't, or returning a stale value.

### Steps
1. Read the full SiteFilteredNav component to understand the parent/child relationship
2. Trace the null-return paths and their effect on the parent
3. Check the import map for SiteFilteredNav registration
4. Test fetch failure scenarios
5. Document root cause with evidence (not speculation)

### Success criteria
- Root cause identified and documented with evidence
- If a fixable bug is found, fix it
- If it's a Payload framework quirk, document the reproduction steps and mitigation
- Add a ledger entry with findings
