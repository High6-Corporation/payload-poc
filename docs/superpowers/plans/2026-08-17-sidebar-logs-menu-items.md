# Sidebar Independent Scroll + Logs Nav Group + Menu Items — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the admin sidebar so it stays in view on long pages with its own independent scrolling, move Email Logs out of Tenant Management into a standalone "Logs" nav group, and implement the Phase 3 Menu Items collection following the SmtpSettings tenant/site scoping convention.

**Architecture:** All three issues touch the custom admin nav (`SiteFilteredNav`) or add a tenant/site-scoped collection. The sidebar fix restores Payload's stock `.nav` pattern (sticky + `height: 100vh`) and adds `overflow-y: auto` for independent scrolling. The Logs move is a group-string change plus one nav-order entry. Menu Items is a new collection with explicit `tenant` (required) + `site` (optional) fields, gated by the existing `tenantEnabledAccess` factory, plus a `resolveMenuItems()` utility implementing site-override → tenant-default resolution.

**Tech Stack:** Payload 3.85.1 (MongoDB adapter), Next.js 16 admin, React, TypeScript strict, Vitest (jsdom, `tests/int/**/*.int.spec.ts`), pnpm.

**Spec:** Task brief in this session's conversation + `docs/payload/payload-poc-handoff-v35.md` §2.1 (verified against live code — see "Investigation findings" below).

## Global Constraints

- Production database — additive/non-destructive changes only: no migrations, no data writes; tests are fully mocked (no DB writes, no DB reads except none at all — see Task 3 test design).
- Payload 3.85.1 local API defaults `overrideAccess: true` — internal resolution reads pass `overrideAccess: true` explicitly, same as `resolveSmtpConfig`.
- Custom admin Nav is `SiteFilteredNav` (registered as `admin.components.Nav` in `src/payload.config.ts`); it renders its own `<nav class="nav__wrap">` and groups collections by `admin.group` with ordering from its `GROUP_ORDER` map.
- `SidebarOrderFix` component is DEAD CODE — not registered in `payload.config.ts` (verified by grep). Do not modify or rely on it.
- Keep each issue's changes isolated; the only cross-cutting file is `SiteFilteredNav/index.tsx` (touched by Issues 1 and 2 — noted explicitly).
- After schema changes run `pnpm generate:types`; no new custom admin components → `generate:importmap` NOT needed.
- `pnpm lint` is broken repo-wide (pre-existing, ESLint circular-structure crash — see v35 §2.4). Do not attempt to fix; do not treat lint failures as task failures.
- No `git commit` steps: commit only if the user asks (working tree has pre-existing unrelated modifications: `.gitignore`, `tsconfig.tsbuildinfo`).
- No credentials in committed code (v35 precedent: a spec was deleted for holding login credentials). `scripts/verify-admin-nav.mjs` reads admin credentials from `VERIFY_ADMIN_EMAIL` / `VERIFY_ADMIN_PASSWORD` env vars; dotenv loads the gitignored `.env` automatically (`.env*` is in `.gitignore`, verified).

## Investigation findings (verified this session, 2026-08-17)

1. **Sidebar root cause (proven by headless browser measurements):** `SiteFilteredNav` styles its `<nav class="nav__wrap">` with `position: sticky; top: 0; minHeight: 100vh` and no overflow. The nav's content makes it 1413px tall at a 1440×900 viewport — it is the tallest item in the `.template-default` grid, so the grid row equals the nav height and sticky has **zero travel room** (1413 − 1413 = 0). At page scroll bottom the nav's top measured `-513px` — it scrolls away with the page. It also cannot self-scroll (`scrollHeight === clientHeight`, `overflow-y: visible`), so bottom nav items (Browse by Folder, Site Switcher, Log out at y≈1347) are unreachable in a 900px viewport. Stock Payload `.nav` (from `@payloadcms/next/dist/prod/styles.css`) uses exactly `position: sticky; top: 0; height: 100vh; overflow: hidden` — the custom nav dropped `height` and overflow.
2. **Logs location:** `src/collections/EmailLogs.ts` line 17 sets `admin.group: 'Tenant Management'`. Nav item label is slug-derived "Email Logs" (no `labels` set). No other "Logs" item exists (AgentAuditLog is a separate, super-admin-only collection and stays in Tenant Management).
3. **Phase 3 re-verification (v35 claims checked against live code):**
   - Header/Footer global tenant/site scoping: **confirmed unstarted** — `src/Header/config.ts` and `src/Footer/config.ts` are unscoped globals (`read: () => true`, single `navItems` array, no tenant/site fields).
   - Menu Items: **confirmed absent** — no `menu-items` collection exists anywhere in `src/`.
   - `src/collections/built-in-collections.ts` explicitly anticipates a `menus`-style entry and says Phase 3 should add entries (smtp-settings entry was already added in v34). Menu Items needs its entry here so the per-tenant `disabledCollections` toggle covers it.
   - v35's remaining-scope list also names loading-state audit, `getUserTenantIds` test coverage, and site-level RBAC — out of scope for this session (Menu Items only, per the confirmed decision).
4. **SmtpSettings convention (v34) to mirror:** one collection, `tenant` (required, sidebar) + `site` (optional, sidebar, null = tenant default); `tenantEnabledAccess('smtp-settings', { publicAccess: authenticated })` for all four ops; resolution utility with site-override (`and: [tenant equals, site equals]`) → tenant-default (`and: [tenant equals, site: { exists: false }]`), `depth: 0`, `overrideAccess: true`. Menu Items uses `tenantEnabledAccess('menu-items')` WITHOUT `publicAccess` (factory default allows unauthenticated reads — required so the public frontend can render the menu; same public-read behavior as Categories).

---

### Task 1: Sidebar independent scroll + pinned to viewport

**Files:**

- Modify: `src/components/SiteFilteredNav/index.tsx` (the `<nav className="nav__wrap">` inline style block, currently lines ~415–425)
- Create: `scripts/verify-admin-nav.mjs` (headless verification script — login + assertions + screenshots to `.playwright/`)

**Interfaces:**

- Consumes: nothing new.
- Produces: `scripts/verify-admin-nav.mjs` runs `node scripts/verify-admin-nav.mjs` and exits 0 on pass / 1 on fail. Used again by Task 2 and final verification.

- [ ] **Step 1: Write the verification script (this is the failing test)**

Create `scripts/verify-admin-nav.mjs` with the full working login technique (hydrated-form native-setter, verified this session — plain `fill()` submits empty fields on Payload's login):

```javascript
import { createRequire } from 'node:module'
import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
const require = createRequire(new URL('../package.json', import.meta.url))
require('dotenv/config')
const { chromium } = require('@playwright/test')

const SHOT_DIR = new URL('../.playwright/', import.meta.url).pathname

// Credentials come from env vars only — never committed (v35 precedent:
// a spec was deleted for holding login credentials). dotenv loads the
// gitignored .env automatically if one exists in the repo root.
const EMAIL = process.env.VERIFY_ADMIN_EMAIL
const PASSWORD = process.env.VERIFY_ADMIN_PASSWORD
if (!EMAIL || !PASSWORD) {
  console.error(
    'VERIFY_ADMIN_EMAIL and VERIFY_ADMIN_PASSWORD env vars are required. ' +
      'Set them in your shell or in a gitignored .env file (dotenv loads it automatically).',
  )
  process.exit(2)
}

// Playwright's pinned headless-shell build may not be installed on this
// machine (its install stalls on this network). Fall back to any chromium
// build already present in the ms-playwright cache — machine-portable, no
// hardcoded paths.
function findPlaywrightChromium() {
  const cacheRoot = join(homedir(), 'Library', 'Caches', 'ms-playwright')
  if (!existsSync(cacheRoot)) return null
  const candidates = readdirSync(cacheRoot)
    .filter((d) => d.startsWith('chromium-') && !d.includes('headless_shell'))
    .sort()
    .reverse()
  for (const dir of candidates) {
    const bin = join(
      cacheRoot,
      dir,
      'chrome-mac-arm64',
      'Google Chrome for Testing.app',
      'Contents',
      'MacOS',
      'Google Chrome for Testing',
    )
    if (existsSync(bin)) return bin
  }
  return null
}

async function launch() {
  try {
    return await chromium.launch({ headless: true })
  } catch {
    const fallback = findPlaywrightChromium()
    if (!fallback) throw new Error('No Playwright chromium build found in the ms-playwright cache')
    return chromium.launch({ headless: true, executablePath: fallback })
  }
}

async function login(page) {
  await page.goto('http://localhost:3000/admin/login')
  await page.waitForSelector('input[name="email"]', { timeout: 45000 })
  await page.waitForTimeout(3000) // let React hydration settle before touching controlled inputs
  const setValue = async (sel, value) => {
    await page.click(sel)
    await page.evaluate(
      ([s, v]) => {
        const el = document.querySelector(s)
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value',
        ).set
        setter.call(el, v)
        el.dispatchEvent(new Event('input', { bubbles: true }))
        el.dispatchEvent(new Event('change', { bubbles: true }))
      },
      [sel, value],
    )
  }
  await setValue('input[name="email"]', EMAIL)
  await setValue('input[name="password"]', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL('http://localhost:3000/admin', { timeout: 45000 })
  await page.waitForSelector('nav.nav__wrap', { timeout: 45000 })
}

const failures = []
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures.push(name)
}

const browser = await launch()

// ---------- Sidebar scroll assertions ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  await login(page)

  await page.goto('http://localhost:3000/admin/collections/media')
  await page.waitForSelector('.table', { timeout: 45000 })
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.waitForTimeout(500)

  const r = await page.evaluate(() => {
    const nav = document.querySelector('nav.nav__wrap')
    const links = [...document.querySelectorAll('nav.nav__wrap a')]
    const logout = links[links.length - 1]
    return {
      navTop: Math.round(nav.getBoundingClientRect().top),
      innerHeight: window.innerHeight,
      clientH: nav.clientHeight,
      scrollH: nav.scrollHeight,
      logoutBottom: Math.round(logout.getBoundingClientRect().bottom),
    }
  })

  // Pinned: nav top must stay at 0 while the page is scrolled to the bottom
  check('sidebar pinned at page scroll bottom', r.navTop === 0, `navTop=${r.navTop}`)
  // Own scroll: content taller than viewport must be reachable via nav scroll
  const reachable = await page.evaluate(() => {
    const nav = document.querySelector('nav.nav__wrap')
    nav.scrollTop = nav.scrollHeight
    const links = [...document.querySelectorAll('nav.nav__wrap a')]
    const logout = links[links.length - 1]
    return logout.getBoundingClientRect().bottom <= window.innerHeight
  })
  check('logout reachable via sidebar self-scroll', reachable)

  await page.screenshot({ path: `${SHOT_DIR}sidebar-fixed-bottom.png` })
  await ctx.close()
}

// ---------- Mobile collapse regression ----------
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await ctx.newPage()
  await login(page)
  const m = await page.evaluate(() => ({
    navOpen: document.querySelector('.template-default--nav-open') !== null,
    hOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }))
  // At <=768px Payload collapses the nav behind the toggler; it must not be forced open
  check('mobile nav collapsed (no forced open)', !m.navOpen)
  check('no horizontal overflow on mobile', !m.hOverflow)
  await ctx.close()
}

await browser.close()
if (failures.length) {
  console.error(`\n${failures.length} check(s) FAILED: ${failures.join('; ')}`)
  process.exit(1)
}
console.log('\nall checks passed')
```

- [ ] **Step 2: Run the script — verify it FAILS on current code**

Run: `node scripts/verify-admin-nav.mjs`
Expected: exit 1 with `FAIL sidebar pinned at page scroll bottom — navTop=-513` (or similar negative value) and `FAIL logout reachable via sidebar self-scroll`. This reproduces the reported bug. (Login + mobile checks should PASS.)

- [ ] **Step 3: Apply the fix in SiteFilteredNav**

In `src/components/SiteFilteredNav/index.tsx`, replace the `<nav>` style block:

```tsx
        style={{
          backgroundColor: '#0a0e1a',
          color: 'rgba(255, 255, 255, 0.85)',
          minHeight: '100vh',
          position: 'sticky',
          top: 0,
          padding: '4rem 1.25rem 1rem',
        }}
```

with:

```tsx
        style={{
          backgroundColor: '#0a0e1a',
          color: 'rgba(255, 255, 255, 0.85)',
          // Pinned to the viewport with its own scroll container — mirrors
          // Payload's stock `.nav` (position: sticky; height: 100vh) plus
          // overflow-y so a tall sidebar scrolls independently of the page.
          // The previous `minHeight: 100vh` let the nav grow past the
          // viewport, which both made sticky travel zero (the nav was the
          // tallest grid item) and hid the bottom links (Log out, Site
          // Switcher) permanently.
          position: 'sticky',
          top: 0,
          height: '100vh',
          overflowY: 'auto',
          overflowX: 'hidden',
          boxSizing: 'border-box',
          padding: '4rem 1.25rem 1rem',
        }}
```

Note: `boxSizing: 'border-box'` is explicit because Payload's admin stylesheet has no global `box-sizing` rule (verified) and the 4rem top padding must stay inside the 100vh.

- [ ] **Step 4: Re-run the script — verify it PASSES**

Run: `node scripts/verify-admin-nav.mjs`
Expected: exit 0, all 4 checks PASS. Evidence screenshots written to `.playwright/sidebar-fixed-bottom.png` (+ any others from the script).

- [ ] **Step 5: Browser screenshot spot-check (dev server hot-reloads)**

The running dev server on :3000 hot-reloads the change. Confirm the sidebar still renders correctly visually (dark theme intact, groups present) — the script's screenshots cover this; eyeball `.playwright/sidebar-fixed-bottom.png`.

---

### Task 2: Move Email Logs into a standalone "Logs" nav group

**Files:**

- Modify: `src/collections/EmailLogs.ts` (line 17: `group: 'Tenant Management'` → `group: 'Logs'`)
- Modify: `src/components/SiteFilteredNav/index.tsx` (`GROUP_ORDER` map: add `'Logs': 4`)
- Extend: `scripts/verify-admin-nav.mjs` (nav-group assertions)

**Interfaces:**

- Consumes: `scripts/verify-admin-nav.mjs` from Task 1.
- Produces: nav shows a "Logs" group containing the "Email Logs" item; "Tenant Management" no longer contains it. Route `/admin/collections/email-logs` and access control unchanged.

- [ ] **Step 1: Add the failing nav-group assertions to the script**

Insert this block into `scripts/verify-admin-nav.mjs` before the mobile section (it reuses a logged-in 1440×900 page — reuse the page from the sidebar section instead of re-logging-in):

```javascript
// ---------- Nav group assertions ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  await login(page)

  const groups = await page.evaluate(() => {
    const result = {}
    for (const el of document.querySelectorAll('.nav-group')) {
      const label = el.querySelector('.nav-group__label')?.textContent || ''
      const items = [...el.querySelectorAll('.nav-group__content a')].map(
        (a) => a.querySelector('.nav__link-label')?.textContent || a.textContent || '',
      )
      result[label] = items
    }
    return result
  })

  check('Logs group exists', 'Logs' in groups, JSON.stringify(Object.keys(groups)))
  check(
    'Logs group contains Email Logs',
    (groups['Logs'] || []).some((l) => l.includes('Email Logs')),
  )
  check(
    'Tenant Management no longer contains Email Logs',
    !(groups['Tenant Management'] || []).some((l) => l.includes('Email Logs')),
  )
  await page.screenshot({ path: `${SHOT_DIR}nav-groups.png` })
  await ctx.close()
}
```

Note: with `GROUP_ORDER` having no `'Logs'` key yet, the Logs group would render LAST (DEFAULT_ORDER 10) — the assertions don't test position, only membership.

- [ ] **Step 2: Run the script — verify the Logs assertions FAIL**

Run: `node scripts/verify-admin-nav.mjs`
Expected: `FAIL Logs group exists` and `FAIL Logs group contains Email Logs` (the `Tenant Management no longer contains` check passes today). Sidebar checks from Task 1 keep passing.

- [ ] **Step 3: Move the group in EmailLogs.ts**

In `src/collections/EmailLogs.ts` change:

```ts
  admin: {
    useAsTitle: 'subject',
    defaultColumns: ['status', 'site', 'to', 'subject', 'sentAt'],
    group: 'Tenant Management',
  },
```

to:

```ts
  admin: {
    useAsTitle: 'subject',
    defaultColumns: ['status', 'site', 'to', 'subject', 'sentAt'],
    group: 'Logs',
  },
```

- [ ] **Step 4: Add the group-order entry in SiteFilteredNav**

In `src/components/SiteFilteredNav/index.tsx`, change:

```ts
const GROUP_ORDER: Record<string, number> = {
  'Tenant Management': 0,
  Collections: 1,
  Globals: 2,
  'Custom Content': 3,
}
```

to:

```ts
const GROUP_ORDER: Record<string, number> = {
  'Tenant Management': 0,
  Collections: 1,
  Globals: 2,
  'Custom Content': 3,
  Logs: 4,
}
```

- [ ] **Step 5: Re-run the script — verify all checks PASS**

Run: `node scripts/verify-admin-nav.mjs`
Expected: exit 0 — all sidebar + nav-group + mobile checks pass.

- [ ] **Step 6: Confirm no access-control or route change**

The only edits are `admin.group` strings — access control (`siteTenantReadAccess`, no create/update/delete) and the `/admin/collections/email-logs` route are untouched. `pnpm test:int` must stay green (no tests reference the group).

---

### Task 3: Menu Items collection (SmttpSettings scoping convention)

**Files:**

- Create: `src/collections/MenuItems.ts`
- Modify: `src/payload.config.ts` (import + `collections` array entry after `SiteSettings`)
- Modify: `src/collections/built-in-collections.ts` (add `menu-items` entry)
- Create: `src/utilities/resolveMenuItems.ts`
- Create: `tests/int/menu-items.int.spec.ts`
- Regenerate: `src/payload-types.ts` via `pnpm generate:types`

**Interfaces:**

- Consumes: `tenantEnabledAccess` from `src/access/tenantScoped.ts` (existing), `link` from `src/fields/link.ts` (existing).
- Produces: collection slug `menu-items`; `resolveMenuItems(payload, tenantId, siteId?) => Promise<ResolvedMenuItem[]>` where `ResolvedMenuItem = { id: string; label: string; order: number; link: unknown }` (link is the existing link group's shape — reference|url|newTab).

- [ ] **Step 1: Write the failing tests**

Create `tests/int/menu-items.int.spec.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

import config from '@/payload.config'
import { tenantEnabledAccess } from '@/access/tenantScoped'
import { resolveMenuItems } from '@/utilities/resolveMenuItems'

// ---------------------------------------------------------------------------
// Collection registration
// ---------------------------------------------------------------------------

describe('MenuItems collection', () => {
  it('is registered with tenant + site scoping fields', async () => {
    const resolved = await config
    const menuItems = resolved.collections?.find((c) => c.slug === 'menu-items')
    expect(menuItems).toBeDefined()

    const names = (menuItems!.fields as { name: string }[]).map((f) => f.name)
    expect(names).toEqual(
      expect.arrayContaining(['label', 'link', 'order', 'enabled', 'tenant', 'site']),
    )
    expect(menuItems!.admin?.useAsTitle).toBe('label')
  })

  it('gates all four operations with the same tenantEnabledAccess factory', async () => {
    const resolved = await config
    const menuItems = resolved.collections?.find((c) => c.slug === 'menu-items')
    const access = menuItems!.access!
    expect(access.create).toBe(access.read)
    expect(access.update).toBe(access.read)
    expect(access.delete).toBe(access.read)
  })
})

// ---------------------------------------------------------------------------
// Access control (factory unit tests — no DB, req.payload.find is mocked)
// ---------------------------------------------------------------------------

const makeReq = (user: unknown, tenantDocs: unknown[]) => {
  const req = {
    user,
    context: {},
    payload: {
      find: vi.fn().mockResolvedValue({ docs: tenantDocs }),
    },
    headers: new Headers(),
  }
  return req
}

const tenantAdmin = (tenantIds: string[]) => ({
  id: 'u1',
  roles: ['tenant-admin'],
  tenants: tenantIds.map((id) => ({ tenant: id })),
})

describe('tenantEnabledAccess("menu-items")', () => {
  const access = tenantEnabledAccess('menu-items')

  it('allows unauthenticated reads (public nav rendering)', async () => {
    const result = await access({ req: makeReq(null, []) } as any)
    expect(result).toBe(true)
  })

  it('allows super-admin without any tenant lookup', async () => {
    const req = makeReq({ id: 'u1', roles: ['super-admin'] }, [])
    const result = await access({ req } as any)
    expect(result).toBe(true)
    expect(req.payload.find).not.toHaveBeenCalled()
  })

  it('scopes tenant-admins to their enabled tenants', async () => {
    const req = makeReq(tenantAdmin(['t1', 't2']), [
      { id: 't1', disabledCollections: [] },
      { id: 't2', disabledCollections: [] },
    ])
    const result = await access({ req } as any)
    expect(result).toEqual({ tenant: { in: ['t1', 't2'] } })
  })

  it('denies when every assigned tenant disables menu-items', async () => {
    const req = makeReq(tenantAdmin(['t1']), [
      { id: 't1', disabledCollections: ['builtin:menu-items'] },
    ])
    const result = await access({ req } as any)
    expect(result).toBe(false)
  })

  it('allows create when the incoming tenant is enabled', async () => {
    const req = makeReq(tenantAdmin(['t1']), [{ id: 't1', disabledCollections: [] }])
    const result = await access({ req, data: { tenant: 't1' } } as any)
    expect(result).toBe(true)
  })

  it('denies create for a tenant outside the enabled set', async () => {
    const req = makeReq(tenantAdmin(['t1']), [{ id: 't1', disabledCollections: [] }])
    const result = await access({ req, data: { tenant: 't2' } } as any)
    expect(result).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// resolveMenuItems — site-override → tenant-default (stubbed payload, no DB)
// ---------------------------------------------------------------------------

describe('resolveMenuItems', () => {
  let find: ReturnType<typeof vi.fn>
  const payloadStub = {} as any

  beforeEach(() => {
    find = vi.fn()
    payloadStub.find = find
  })

  it('returns site-override items when present', async () => {
    find.mockResolvedValueOnce({
      docs: [
        { id: 'a', label: 'Site A', order: 0 },
        { id: 'b', label: 'Site B', order: 1 },
      ],
    })
    const items = await resolveMenuItems(payloadStub, 't1', 's1')
    expect(items.map((i) => i.id)).toEqual(['a', 'b'])
    expect(find).toHaveBeenCalledTimes(1)
  })

  it('falls back to tenant-default items when the site has none', async () => {
    find.mockResolvedValueOnce({ docs: [] })
    find.mockResolvedValueOnce({ docs: [{ id: 'd', label: 'Default', order: 0 }] })
    const items = await resolveMenuItems(payloadStub, 't1', 's1')
    expect(items.map((i) => i.id)).toEqual(['d'])
    expect(find).toHaveBeenCalledTimes(2)
    const second = find.mock.calls[1][0]
    expect(second.where.and).toContainEqual({ site: { exists: false } })
  })

  it('returns [] when nothing exists', async () => {
    find.mockResolvedValue({ docs: [] })
    const items = await resolveMenuItems(payloadStub, 't1', 's1')
    expect(items).toEqual([])
  })

  it('queries enabled items sorted by order, bypassing access', async () => {
    find.mockResolvedValue({ docs: [] })
    await resolveMenuItems(payloadStub, 't1', 's1')
    const call = find.mock.calls[0][0]
    expect(call.collection).toBe('menu-items')
    expect(call.sort).toBe('order')
    expect(call.overrideAccess).toBe(true)
    expect(call.where.and).toContainEqual({ enabled: { equals: true } })
  })
})
```

- [ ] **Step 2: Run tests — verify they FAIL**

Run: `pnpm test:int`
Expected: `menu-items.int.spec.ts` fails — collection not found in config, `resolveMenuItems` module missing. Pre-existing specs (api, seo-utilities) keep passing.

- [ ] **Step 3: Create the collection**

Create `src/collections/MenuItems.ts`:

```ts
import type { CollectionConfig } from 'payload'

import { tenantEnabledAccess } from '@/access/tenantScoped'
import { link } from '@/fields/link'

// Same factory pattern as Categories/Media/Pages/Posts/Forms, and the
// SmtpSettings convention (v34): tenantEnabledAccess without `publicAccess`
// leaves unauthenticated reads allowed — menu items must be readable by the
// public frontend. Tenant-admins are constrained to their assigned tenants
// and the per-tenant `disabledCollections` toggle (key `builtin:menu-items`).
const access = tenantEnabledAccess('menu-items')

export const MenuItems: CollectionConfig = {
  slug: 'menu-items',
  labels: { singular: 'Menu Item', plural: 'Menu Items' },
  access: {
    create: access,
    delete: access,
    read: access,
    update: access,
  },
  admin: {
    useAsTitle: 'label',
    defaultColumns: ['label', 'tenant', 'site', 'order', 'enabled'],
    description:
      'Tenant/site-scoped navigation menu items. Items with a site override the tenant defaults for that site.',
  },
  fields: [
    {
      name: 'label',
      type: 'text',
      required: true,
      admin: {
        description: 'Text shown in the navigation (e.g. "About Us").',
      },
    },
    // Link target group (internal page/post reference or custom URL, newTab).
    // disableLabel keeps the item-level `label` above as the single source of
    // truth for the displayed nav text.
    link({
      appearances: false,
      disableLabel: true,
    }),
    {
      name: 'order',
      type: 'number',
      defaultValue: 0,
      admin: {
        position: 'sidebar',
        description: 'Ascending sort order within the menu.',
      },
    },
    {
      name: 'enabled',
      type: 'checkbox',
      defaultValue: true,
      label: 'Show in menu',
      admin: { position: 'sidebar' },
    },
    {
      name: 'tenant',
      type: 'relationship',
      relationTo: 'tenants',
      required: true,
      admin: { position: 'sidebar' },
    },
    {
      name: 'site',
      type: 'relationship',
      relationTo: 'sites',
      // null = tenant default; non-null = site override
      admin: {
        position: 'sidebar',
        description:
          'Leave empty for a tenant-wide default. Set to scope this item to a specific site.',
      },
    },
  ],
}
```

- [ ] **Step 4: Create the resolution utility**

Create `src/utilities/resolveMenuItems.ts`:

```ts
import type { Payload } from 'payload'

/** Menu item shape returned to frontends. `link` mirrors the `link` group field. */
export interface ResolvedMenuItem {
  id: string
  label: string
  order: number
  link: {
    type: 'reference' | 'custom'
    reference?: { relationTo: string; value: string } | string | null
    url?: string | null
    newTab?: boolean | null
  }
}

/**
 * Resolve the active menu items for a given tenant + optional site.
 *
 * Lookup order (mirrors resolveSmtpConfig):
 *   1. Site-override: enabled MenuItems where tenant = tenantId AND site = siteId
 *   2. Tenant-default: enabled MenuItems where tenant = tenantId AND site is null
 *   3. Empty list — no items configured
 *
 * Items are ordered by the `order` field ascending. `overrideAccess: true`
 * matches resolveSmtpConfig: this runs server-side for the public frontend,
 * which must see menu items regardless of the caller's user state.
 */
export async function resolveMenuItems(
  payload: Payload,
  tenantId: string,
  siteId?: string,
): Promise<ResolvedMenuItem[]> {
  // 1. Site-override first
  if (siteId) {
    const siteResult = await payload.find({
      collection: 'menu-items',
      where: {
        and: [
          { tenant: { equals: tenantId } },
          { site: { equals: siteId } },
          { enabled: { equals: true } },
        ],
      },
      depth: 0,
      sort: 'order',
      limit: 100,
      overrideAccess: true,
    })

    if (siteResult.docs.length > 0) {
      return siteResult.docs.map(toMenuItem)
    }
  }

  // 2. Tenant-default fallback (`exists: false` — same as resolveSmtpConfig)
  const tenantResult = await payload.find({
    collection: 'menu-items',
    where: {
      and: [
        { tenant: { equals: tenantId } },
        { site: { exists: false } },
        { enabled: { equals: true } },
      ],
    },
    depth: 0,
    sort: 'order',
    limit: 100,
    overrideAccess: true,
  })

  return tenantResult.docs.map(toMenuItem)
}

function toMenuItem(doc: Record<string, unknown>): ResolvedMenuItem {
  return {
    id: String(doc.id),
    label: String(doc.label ?? ''),
    order: Number(doc.order ?? 0),
    link: (doc.link ?? {}) as ResolvedMenuItem['link'],
  }
}
```

- [ ] **Step 5: Register the collection + built-in toggle entry**

In `src/payload.config.ts`:

- Add to imports (alphabetical): `import { MenuItems } from './collections/MenuItems'` (after `Media`, before `Pages`).
- In the `collections` array, add `MenuItems,` after `SiteSettings,`.

In `src/collections/built-in-collections.ts`, add after the `smtp-settings` entry:

```ts
  { slug: 'menu-items', label: 'Menu Items', description: 'Site navigation menu links' },
```

- [ ] **Step 6: Regenerate types**

Run: `pnpm generate:types`
Expected: `src/payload-types.ts` regenerated, now containing `MenuItem` (and `menuItems` query types). `generate:importmap` is NOT needed — no new custom admin components were added.

- [ ] **Step 7: Run tests — verify they PASS**

Run: `pnpm test:int`
Expected: all specs pass — menu-items (9 new tests) + api + seo-utilities.

- [ ] **Step 8: Build check**

Run: `pnpm build`
Expected: clean build (v35 confirms a clean baseline). Do not run `pnpm lint` (pre-existing repo-wide break).

---

### Task 4: Admin UI spot-verification (no DB writes) + handoff doc

**Files:**

- Create: `docs/payload/payload-poc-handoff-v36.md`

**Interfaces:** none new.

- [ ] **Step 1: Browser spot-check of all three changes (no saves — production DB untouched)**

With the dev server hot-reloaded and `node scripts/verify-admin-nav.mjs` green:

1. Sidebar: the script's `.playwright/sidebar-fixed-bottom.png` shows the pinned + independently scrollable sidebar.
2. Nav groups: `.playwright/nav-groups.png` (written by the script's groups block) shows the "Logs" group with "Email Logs" inside, and Tenant Management without it.
3. Menu Items: in the headless script (or manually), visit `/admin/collections/menu-items` — the list view must render (empty list, "Create New" button). Open the create view once WITHOUT saving to confirm fields render (label, link group, sidebar order/enabled/tenant/site). Do NOT save anything.

- [ ] **Step 2: Write the handoff doc**

Create `docs/payload/payload-poc-handoff-v36.md` following the established format (title, date, repo, supersedes v35, sections: what was built with root causes, files-changed table, verification table, key discoveries, open items, continuation prompt template). MUST include an explicit "v35 corrections" note — this session re-verified v35's remaining-Phase-3 claims and found them accurate (Header/Footer scoping unstarted, Menu Items absent, SidebarOrderFix dead code — the latter is a correction of fact not stated in v35). Also document: the login-hydration Playwright technique, the sticky-travel root cause, the `site: { exists: false }` query convention, and that `scripts/verify-admin-nav.mjs` is now the repeatable regression check (credentials via `VERIFY_ADMIN_EMAIL` / `VERIFY_ADMIN_PASSWORD` env vars — nothing committed).

- [ ] **Step 3: Update graph + memory**

Run: `cd /Users/josh/work/payload-poc && graphify update .` (AST-only, per project CLAUDE.md) and `mem_save` for the session's decisions/discoveries (sidebar root cause, Logs group move, Menu Items convention).

---

## Self-review

**Spec coverage (task brief acceptance criteria):**

- Sidebar reachable + independently scrollable, no coupling to main scroll → Task 1 (assertions prove pinning + self-scroll).
- No regression to responsive/collapse behavior → Task 1 mobile checks (nav collapsed at ≤768px, no horizontal overflow); fix mirrors Payload's own stock `.nav` pattern, so the built-in collapse media queries keep working.
- Logs in own standalone group, removed from Tenant Management, functional → Task 2 (assertions + unchanged access/route).
- Phase 3 state re-verified with discrepancies documented → done in "Investigation findings" (v35 claims accurate; SidebarOrderFix dead-code discovery added); discrepancies also recorded in v36 handoff (Task 4).
- Menu Items per SmtpSettings convention with tests passing → Task 3 (tenant+site fields, tenantEnabledAccess, resolve util, 9 mocked tests).
- v36 handoff in established format → Task 4.

**Placeholder scan:** all code blocks are complete, runnable content — no TODOs.

**Type consistency:** `ResolvedMenuItem` defined once in `src/utilities/resolveMenuItems.ts` and imported by tests; `tenantEnabledAccess('menu-items')` slug matches the built-in-collections key `builtin:menu-items` and the collection slug; script uses `SHOT_DIR` consistently; assertion names match between steps. `link({ appearances: false, disableLabel: true })` is verified against `src/fields/link.ts` (read in full during investigation): `LinkType` options are `{ appearances?: LinkAppearances[] | false; disableLabel?: boolean; overrides?: Partial<GroupField> }` — both options exist, and `src/Header/config.ts` / `src/Footer/config.ts` already use `appearances: false`, so the call is valid at build time.

**Known accepted trade-offs (flagged for review):**

1. Menu Items public read is allowed (factory default) — same as Categories; nav links are not sensitive, and the frontend needs them. The alternative (`publicAccess: authenticatedOrPublished`) doesn't apply because there is no published/draft state on menu items.
2. `resolveMenuItems` site semantics: if ANY site-scoped items exist, they REPLACE tenant defaults (mirrors SmtpSettings replace semantics). The alternative (merge defaults + site additions) would need a "menu position/slot" concept — flagged as future work, not built now.
3. Header/Footer relationship to Menu Items is deliberately untouched (that's the still-open "Header/Footer global connections" scope item — needs its own design once Header/Footer become tenant/site-scoped).
4. No commits are made in this plan (per harness rule "commit only when asked"); task checkpoints are verifiable without commits.
