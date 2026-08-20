# Payload POC Handoff v36 — Sidebar Independent Scroll + Logs Nav Group + Menu Items

**Date:** 2026-08-17
**Repo:** `/Users/josh/work/payload-poc` (Payload CMS 3.85.1)
**Supersedes:** v35 (Project Gallery Multi-Select + Focus Keyword Multi-Keyword Parsing)

---

## 1. This Session — Three Issues from the Task Brief

All three root causes were confirmed by direct inspection/measurement before fixing — not assumed. Plan: `docs/superpowers/plans/2026-08-17-sidebar-logs-menu-items.md` (user-reviewed; one revision: verification-script credentials externalized to env vars).

### Issue 1 — Admin sidebar scrolled away on long pages (✅ Fixed)

**Root cause (measured, not guessed):** `SiteFilteredNav` styled its `<nav class="nav__wrap">` with `position: sticky; top: 0; minHeight: 100vh` and no overflow. The nav's content made it **1413px tall at a 900px viewport** — the tallest item in Payload's `.template-default` grid, so the grid row equaled the nav height and sticky had **zero travel room** (1413 − 1413 = 0). At page scroll bottom the nav top measured `-513px`: it scrolled away with the page. It also couldn't self-scroll (`scrollHeight === clientHeight`, `overflow-y: visible`), so the bottom links (Browse by Folder, Site Switcher, Log out) were permanently unreachable in any viewport shorter than the nav.

**Fix:** restored Payload's stock `.nav` pattern (`position: sticky; top: 0; height: 100vh`) plus `overflow-y: auto` so a tall sidebar scrolls independently; `overflow-x: hidden` + explicit `boxSizing: 'border-box'` (Payload's admin stylesheet has **no global box-sizing rule** — verified) so the 4rem top padding stays inside the 100vh.

**Post-fix measurements:** nav pinned at `top=0` at page scroll bottom; sidebar self-scrolls (`scrollTop: 593`) and reveals Log out with the page at the top. Mobile regression: nav still collapses behind the toggler at ≤768px, no horizontal overflow.

### Issue 2 — "Logs" moved into its own nav group (✅ Fixed)

`EmailLogs` was registered under `admin.group: 'Tenant Management'`. Changed to `group: 'Logs'`. In `SiteFilteredNav` the Logs group is split out of the grouped-collections render and placed **at the bottom of the nav, after the Custom Content group** (user-specified position). Final order: Tenant Management → Collections → Globals → Custom Content → **Logs**. `AgentAuditLog` was also moved into the Logs group (user-requested follow-up) — it renders there as "Agent Audit Log" for super-admins only; tenant-admins never see it anywhere (hard `SUPER_ADMIN_ONLY_SLUGS` gate in SiteFilteredNav). Access control and the `/admin/collections/email-logs` + `/admin/collections/agent-audit-log` routes are untouched. The verify script asserts the position (Logs index > Custom Content index) and both memberships.

### Issue 3 — Menu Items collection (Phase 3) (✅ Implemented)

**Phase 3 re-verification against live code** (task requirement — do not trust v35): v35's remaining-scope claims were **accurate**: Header/Footer tenant/site scoping is unstarted (both are unscoped globals with public `read: () => true` and a single `navItems` array — no tenant/site fields), and no `menu-items` collection existed anywhere. One new fact v35 never mentioned: **`src/components/SidebarOrderFix` is dead code** — not registered in `payload.config.ts` (only a comment in SiteFilteredNav references it). Not modified; note for future cleanup.

**Built (SmtpSettings v34 convention):**

- `src/collections/MenuItems.ts` — slug `menu-items`; fields: `label` (required), `link` group (`link({ appearances: false, disableLabel: true })` — item label is the single source of nav text), `order` (number, sidebar), `enabled` (checkbox, default true, sidebar), `tenant` (relationship, required, sidebar), `site` (relationship, optional, sidebar — null = tenant default).
- Access: `tenantEnabledAccess('menu-items')` for all four ops, **without** `publicAccess` — factory default allows unauthenticated reads (public frontend needs the menu; same public-read behavior as Categories). Tenant-admins are constrained to assigned tenants and the per-tenant `disabledCollections` toggle.
- `src/utilities/resolveMenuItems.ts` — `resolveMenuItems(payload, tenantId, siteId?)` with site-override (`site: { equals: siteId }`) → tenant-default (`site: { exists: false }` — same query as resolveSmtpConfig), `enabled: { equals: true }`, `sort: 'order'`, `limit: 100`, `depth: 0`, `overrideAccess: true`. Site items **replace** tenant defaults (SmtpSettings replace semantics, not merge).
- `src/collections/built-in-collections.ts` — added `menu-items` entry so the per-tenant toggle covers it (`builtin:menu-items` key).
- Registered in `payload.config.ts` (collections array after SiteSettings); `pnpm generate:types` regenerated `payload-types.ts` (MenuItem interface at line ~1267).
- Header/Footer relationship deliberately untouched — that's the still-open "Header/Footer global connections" scope item, which needs its own design once those globals become tenant/site-scoped.

### Files changed

| File                                                           | Action                                                                      |
| -------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `src/components/SiteFilteredNav/index.tsx`                     | Modify (nav style: height 100vh + overflow-y auto; GROUP_ORDER + 'Logs': 4) |
| `src/collections/EmailLogs.ts`                                 | Modify (group: 'Logs')                                                      |
| `src/collections/MenuItems.ts`                                 | Create (tenant/site-scoped menu items collection)                           |
| `src/utilities/resolveMenuItems.ts`                            | Create (site-override → tenant-default resolver)                            |
| `src/payload.config.ts`                                        | Modify (MenuItems import + registration)                                    |
| `src/collections/built-in-collections.ts`                      | Modify (+ menu-items entry)                                                 |
| `src/payload-types.ts`                                         | Regenerated (MenuItem type)                                                 |
| `scripts/verify-admin-nav.mjs`                                 | Create (repeatable headless regression check; credentials from env vars)    |
| `tests/int/menu-items.int.spec.ts`                             | Create (12 tests — 2 config, 6 access, 4 resolver; fully mocked, no DB)     |
| `docs/superpowers/plans/2026-08-17-sidebar-logs-menu-items.md` | Create (implementation plan)                                                |
| `.env` (gitignored)                                            | Append `VERIFY_ADMIN_EMAIL` / `VERIFY_ADMIN_PASSWORD` for the verify script |

### Verification

| Check                                                                    | Result                                                                                                                                                                       |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/verify-admin-nav.mjs` (pre-fix)                                 | ❌ navTop=-513, no self-scroll — reproduced reported bug                                                                                                                     |
| `scripts/verify-admin-nav.mjs` (post-fix)                                | ✅ 7/7: pinned (navTop=0), self-scroll reaches Log out, Logs group + membership, mobile collapse, no h-overflow                                                              |
| `pnpm test:int`                                                          | ✅ 58/58 (12 new menu-items tests; 46 pre-existing untouched)                                                                                                                |
| `pnpm build`                                                             | ✅ clean (after one type fix — see discoveries #5)                                                                                                                           |
| Menu Items admin UI (headless browser, **no saves** — prod DB untouched) | ✅ list view empty + Create New; create view renders label, link type radio, order/enabled/tenant/site. Evidence: `.playwright/menu-items-list.png`, `menu-items-create.png` |
| `GET /api/menu-items` (unauthenticated)                                  | ✅ 200 empty docs — public read design confirmed live                                                                                                                        |

### Key discoveries (reusable for future work)

1. **Sidebar scroll bug mechanism:** with `position: sticky; top: 0` and the nav taller than the viewport, the nav becomes the tallest item in Payload's `.template-default` grid → grid row = nav height → sticky travel = 0 → the nav scrolls away 1:1 with the page. Stock Payload `.nav` uses `height: 100vh` precisely to avoid this. Fix pattern: sticky + `height: 100vh` + `overflow-y: auto`.
2. **Payload login is hydration-sensitive for automation:** `page.fill()` on the login inputs submits EMPTY fields — React re-hydration wipes the values between fill and submit. Working technique: wait ~3s after the input appears, then set values via the native `HTMLInputElement.prototype.value` setter + dispatch `input`/`change` events. Encoded in `scripts/verify-admin-nav.mjs`.
3. **`pnpm build` while `next dev` is running corrupts the dev server** — they share `.next`; the dev server started serving a mixed module graph ("Cannot assign to read only property 'i18n'", admin pages showed "This page couldn't load" while APIs stayed 200). Recovery: kill dev server → `rm -rf .next` → `pnpm dev`. **Never run `pnpm build` while the shared dev server is up** — or expect to restart it. (This session did restart it; the server on :3000 was restarted from a clean `.next`.)
4. **Payload's local API infers typed docs from the collection slug literal** — `payload.find({ collection: 'menu-items' })` returns `docs: MenuItem[]` (typed via payload-types), so mapper helpers must accept the generated type, not `Record<string, unknown>`. The build's `tsc` caught this where vitest (transform-only, no type-check) didn't — treat `pnpm build` as the real type gate.
5. **Vitest is not a type-checker** — same as #4: tests passed while `pnpm build` failed type-check on `resolveMenuItems.ts`. Always pair test green with a build.
6. **Tenant-default query convention:** `site: { exists: false }` (not `equals: null`) — established in resolveSmtpConfig v34, mirrored in resolveMenuItems.
7. **Verify-script conventions:** credentials only via `VERIFY_ADMIN_EMAIL` / `VERIFY_ADMIN_PASSWORD` env vars (gitignored `.env` — v35 precedent: never commit credentials); chromium fallback scans `~/Library/Caches/ms-playwright` instead of hardcoding a build path; media-list wait has 3-attempt retry + page-state diagnostics (the dev server can be slow to render list views).
8. **Playwright MCP browser conflict:** the shared Playwright MCP profile is locked by another session's `playwright-mcp` process — don't kill it; use a standalone headless script (`scripts/verify-admin-nav.mjs` pattern) with its own browser.

### 2. Open Items / Follow-ups

- **Header/Footer global connections** — still unstarted (re-verified). Menu Items now exists to consume; Header/Footer must first become tenant/site-scoped (or be replaced) before wiring. Needs its own design session.
- Remaining Phase 3 scope (carried from v35): loading-state audit (SiteSwitcher, ImportHistory), `getUserTenantIds` test coverage, site-level RBAC.
- `resolveMenuItems` uses **replace** semantics for site items (any site item → tenant defaults hidden). If merge semantics are wanted, a menu-position/slot concept is needed — flagged, not built.
- `SidebarOrderFix` component is dead code — candidate for removal in a cleanup pass.
- Playwright's pinned `headless_shell` build is not installed (`playwright install` stalls on this network); the verify script's cache-scan fallback works around it.
- `pnpm lint` still broken repo-wide (pre-existing — see v35 §2.4).

### 2.1 v35 corrections note (explicit, per task requirement)

v35's "Remaining Phase 3 scope" claims were re-verified against live code and found **accurate**: Header/Footer scoping unstarted, Menu Items absent. New facts this session surfaced that v35 didn't state: (a) `SidebarOrderFix` is registered nowhere (dead code — its docstring claims it's registered as `admin.components.beforeNavLinks`, which is false for the current config); (b) no credentials or verification script existed in the repo (v35 §2.3 used the session's Playwright MCP ad hoc — this session added the repeatable script).

### 3. How to Resume — Continuation Prompt Template

```
# Task: Continue Phase 3 (Header/Footer connections, remaining scope) or sidebar/nav follow-ups

## Pre-work
- Read this handoff doc (payload-poc-handoff-v36.md) in full first
- graphify --update: sync current state (payload-poc scoped skill: payload-poc:graphify)
- engram: search "sidebar sticky travel", "Menu Items", "SmtpSettings convention" for context
- Dev server: cd /Users/josh/work/payload-poc && pnpm dev (if port 3000 is taken, a stale server may be running — check PID before killing)

## Constraints
- Production database, additive changes only; browser checks never save documents
- NEVER run `pnpm build` while the dev server is running (corrupts .next — see discoveries #3)
- Verify-script credentials only via VERIFY_ADMIN_EMAIL / VERIFY_ADMIN_PASSWORD env vars — never commit credentials
- Payload 3.85.1 local API overrideAccess=true default — pass explicitly
- Regression checks: `node scripts/verify-admin-nav.mjs` (sidebar + nav groups + mobile) and `pnpm test:int`
```
