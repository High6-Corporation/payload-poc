# Phase 2 — Dynamic Sidebar/Dashboard Nav (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the CSS-only SidebarOrderFix with a custom `admin.components.Nav` that dynamically renders per-collection links under "Custom Content," filters them by the active site's `disabledCollections`, and removes the generic "Entries" link.

**Architecture:** A single custom Nav component (`SiteFilteredNav`) registered as `admin.components.Nav` renders the full sidebar using Payload's existing CSS class structure. It reads `payload-site`/`payload-tenant` cookies, fetches the active site's custom collections and `disabledCollections`, and renders per-collection deep-links into the `custom-collection-entries` list view with `?where[parentCollection][equals]=<id>`. Permission filtering uses `useAuth().permissions` (Phase 0 regression-safe). SidebarOrderFix is removed from config. SiteSwitcher moves from `beforeNavLinks` into the Nav component. BeforeDashboard gains cookie-aware quick-action filtering.

**Tech Stack:** Payload CMS v3 (admin components API, `@payloadcms/ui`), React 19 client components, TypeScript, MongoDB

## Global Constraints

- No destructive changes — SidebarOrderFix file kept on disk, just not imported
- SiteSwitcher's `window.location.reload()` behavior is unchanged from Phase 0 (no new reload trigger — inherited existing behavior)
- BeforeDashboard quick-action filtering: mechanism wired, not exercisable with current data (all quick actions are standard collections — no Custom Collection targets exist yet)
- `useAuth().permissions` is the authoritative permission source — superset of DefaultNav's `visibleEntities` filter
- Render order: Dashboard → Tenant Management → Collections → Globals → Custom Content → Browse by Folder → Site Switcher → Controls
- Fail-open for standard collections, absent (data-fetching constraint) for per-collection links when no site

---

### Task 1: Create shared cookie utility

**Files:**
- Create: `src/utilities/admin-cookies.ts`

**Interfaces:**
- Produces: `getCookie(name: string): string | null`

- [ ] **Step 1: Create the utility file**

```typescript
// src/utilities/admin-cookies.ts

/**
 * Read a cookie value by name.
 *
 * Safe for SSR — returns null when `document` is unavailable.
 * Pattern extracted from SiteSwitcher and reused by SiteFilteredNav
 * and BeforeDashboard.
 */
export function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${name}=([^;]*)`),
  )
  return match ? decodeURIComponent(match[1]) : null
}
```

- [ ] **Step 2: Verify file compiles**

Run: `pnpm exec tsc --noEmit src/utilities/admin-cookies.ts`

- [ ] **Step 3: Commit**

```bash
git add src/utilities/admin-cookies.ts
git commit -m "feat: add shared admin cookie utility

Extracted from SiteSwitcher's pattern — single source for reading
payload-tenant and payload-site cookies across Nav, BeforeDashboard,
and future admin components.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: Create SiteFilteredNav — static nav structure

**Files:**
- Create: `src/components/SiteFilteredNav/index.tsx`

**Interfaces:**
- Consumes: `getCookie` from `@/utilities/admin-cookies` (Task 1)
- Produces: `SiteFilteredNav` default export — React.FC (registered as `admin.components.Nav`)

- [ ] **Step 1: Write the static nav component skeleton**

Create `src/components/SiteFilteredNav/index.tsx`:

```tsx
'use client'

import React, { useState } from 'react'
import { Link, useConfig, useAuth } from '@payloadcms/ui'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Payload collection shape from ClientConfig (subset we use). */
interface ClientCollection {
  slug: string
  admin?: { group?: string | false }
  labels?: { plural?: string; singular?: string }
}

/** Payload global shape from ClientConfig (subset we use). */
interface ClientGlobal {
  slug: string
  label?: string
}

// ---------------------------------------------------------------------------
// Palette tokens (same pattern as SiteSwitcher + FieldBuilder)
// ---------------------------------------------------------------------------

const C = {
  text: 'var(--theme-text)',
  elevation0: 'var(--theme-elevation-0)',
  elevation100: 'var(--theme-elevation-100)',
  elevation150: 'var(--theme-elevation-150)',
  elevation200: 'var(--theme-elevation-200)',
  elevation400: 'var(--theme-elevation-400)',
  elevation800: 'var(--theme-elevation-800)',
}

// ---------------------------------------------------------------------------
// Inline styles (no Tailwind — Payload admin CSS conflicts)
// ---------------------------------------------------------------------------

const S = {
  navWrap: {
    display: 'flex',
    flexDirection: 'column' as const,
    paddingBottom: '1rem',
  },
  dashboardLink: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.5rem 0.75rem',
    color: C.text,
    textDecoration: 'none',
    fontSize: '0.875rem',
    fontWeight: 600,
  },
  separator: {
    height: '1px',
    backgroundColor: C.elevation150,
    margin: '0.25rem 0.75rem',
  },
  logoutWrap: {
    marginTop: 'auto',
    padding: '0.5rem 0.75rem',
  },
  logoutLink: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.5rem 0.75rem',
    borderRadius: 'var(--style-radius-m)',
    background: C.elevation100,
    color: C.elevation800,
    textDecoration: 'none',
    fontSize: '0.875rem',
    lineHeight: 1,
  },
}

// ---------------------------------------------------------------------------
// Group order priority
// ---------------------------------------------------------------------------

const GROUP_ORDER: Record<string, number> = {
  'Tenant Management': 0,
  'Collections': 1,
  'Globals': 2,
  'Custom Content': 3,
}
const DEFAULT_ORDER = 10

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Collapsible nav group — matches Payload's .nav__group structure. */
const NavGroup: React.FC<{
  label: string
  defaultOpen?: boolean
  children: React.ReactNode
}> = ({ label, defaultOpen = true, children }) => {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="nav__group" id={`nav-group-${label}`}>
      <button
        className="nav__group-label"
        onClick={() => setOpen((prev) => !prev)}
        type="button"
      >
        {label}
      </button>
      {open && <div className="nav__group-content">{children}</div>}
    </div>
  )
}

/** Individual nav link — matches Payload's .nav__link class. */
const NavLink: React.FC<{
  href: string
  label: string
}> = ({ href, label }) => (
  <Link className="nav__link" href={href}>
    {label}
  </Link>
)

// ---------------------------------------------------------------------------
// Logout icon (inline SVG — same as SidebarOrderFix)
// ---------------------------------------------------------------------------

const LogoutIcon: React.FC = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
)

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const SiteFilteredNav: React.FC = () => {
  const { config } = useConfig()
  const { permissions } = useAuth()

  const adminRoute = config.routes?.admin || '/admin'

  // ---- Group collections by admin.group, applying permission filter ----

  const groupedCollections = React.useMemo(() => {
    const groups = new Map<string, ClientCollection[]>()
    const allCollections = (config.collections || []) as ClientCollection[]

    for (const col of allCollections) {
      // Skip custom-collection-entries — replaced by per-collection links
      if (col.slug === 'custom-collection-entries') continue

      // Permission filter (superset of DefaultNav's visibleEntities)
      const perm = (permissions as any)?.collections?.[col.slug]
      if (perm && !perm?.read?.permission) continue

      const group = typeof col.admin?.group === 'string' ? col.admin.group : 'Collections'
      if (!groups.has(group)) groups.set(group, [])
      groups.get(group)!.push(col)
    }

    // Sort groups by priority
    return Array.from(groups.entries()).sort((a, b) => {
      const orderA = GROUP_ORDER[a[0]] ?? DEFAULT_ORDER
      const orderB = GROUP_ORDER[b[0]] ?? DEFAULT_ORDER
      return orderA - orderB
    })
  }, [config.collections, permissions])

  // ---- Globals ----

  const visibleGlobals = React.useMemo(() => {
    return ((config.globals || []) as ClientGlobal[]).filter((g) => {
      const perm = (permissions as any)?.globals?.[g.slug]
      return !perm || perm?.read?.permission !== false
    })
  }, [config.globals, permissions])

  // ---- Collection label helper ----

  const colLabel = (col: ClientCollection): string =>
    col.labels?.plural || col.slug
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ')

  // ---- Render ----

  return (
    <nav>
      <div className="nav__wrap" style={S.navWrap}>
        {/* Dashboard */}
        <Link
          className="nav__link"
          href={adminRoute}
          style={S.dashboardLink}
        >
          Dashboard
        </Link>

        <div style={S.separator} />

        {/* Collection groups */}
        {groupedCollections.map(([groupName, cols]) => (
          <NavGroup key={groupName} label={groupName}>
            {cols.map((col) => (
              <NavLink
                key={col.slug}
                href={`${adminRoute}/collections/${col.slug}`}
                label={colLabel(col)}
              />
            ))}
          </NavGroup>
        ))}

        {/* Globals */}
        {visibleGlobals.length > 0 && (
          <NavGroup key="__globals__" label="Globals">
            {visibleGlobals.map((g) => (
              <NavLink
                key={g.slug}
                href={`${adminRoute}/globals/${g.slug}`}
                label={g.label || g.slug}
              />
            ))}
          </NavGroup>
        )}

        {/* Browse by Folder */}
        <Link
          className="nav__link browse-by-folder-button"
          href={`${adminRoute}/browse-by-folder`}
        >
          Browse by Folder
        </Link>

        {/* Logout */}
        <div className="nav__controls" style={S.logoutWrap}>
          <Link
            className="nav__log-out"
            href={`${adminRoute}/logout`}
            aria-label="Log out"
            style={S.logoutLink}
          >
            <LogoutIcon />
          </Link>
        </div>
      </div>
    </nav>
  )
}

export default SiteFilteredNav
```

- [ ] **Step 2: Verify file compiles**

Run: `pnpm exec tsc --noEmit src/components/SiteFilteredNav/index.tsx 2>&1 | head -30`
Expected: No errors (may show unrelated project warnings)

- [ ] **Step 3: Commit**

```bash
git add src/components/SiteFilteredNav/index.tsx
git commit -m "feat: add SiteFilteredNav — static nav structure

Replaces Payload's DefaultNav via admin.components.Nav. Renders groups
in explicit order (Tenant Management → Collections → Globals → Custom
Content), removes the generic Entries link, and uses useAuth().permissions
for RBAC-safe collection visibility.

Per-collection links and SiteSwitcher integration coming in next tasks.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: Add data fetching + per-collection links + SiteSwitcher

**Files:**
- Modify: `src/components/SiteFilteredNav/index.tsx` (append dynamic logic)

**Interfaces:**
- Consumes: `getCookie` from `@/utilities/admin-cookies` (Task 1)
- Consumes: `SiteSwitcher` default export from `@/components/SiteSwitcher`
- Consumes: Static nav structure from Task 2

- [ ] **Step 1: Add imports, types, and data-fetching hooks**

Replace the current `SiteFilteredNav` component body with the full version. The changes from Task 2's version are:

**Add to imports** (after `import { Link, useConfig, useAuth } from '@payloadcms/ui'`):
```tsx
import { useEffect } from 'react'
import { getCookie } from '@/utilities/admin-cookies'
import SiteSwitcher from '@/components/SiteSwitcher'
```

**Add types** (after `ClientGlobal` interface):
```tsx
interface CustomCollectionSummary {
  id: string
  name: string
  slug: string
}

interface SiteData {
  disabledCollections: string[]
}
```

- [ ] **Step 2: Add state + cookie reading + fetch effect inside component**

Insert after `const { permissions } = useAuth()`:

```tsx
  // ---- Dynamic custom collections for the active site ----

  const [customCollections, setCustomCollections] = useState<
    CustomCollectionSummary[]
  >([])
  const [disabledIds, setDisabledIds] = useState<string[]>([])
  const [siteReady, setSiteReady] = useState(false)

  const tenantId = getCookie('payload-tenant')
  const siteId = getCookie('payload-site')

  useEffect(() => {
    if (!siteId || !tenantId) {
      setSiteReady(false)
      setCustomCollections([])
      setDisabledIds([])
      return
    }

    let cancelled = false

    async function loadSiteData() {
      try {
        // Fetch custom collections for the active site
        const ccRes = await fetch(
          `/api/custom-collections?where[site][equals]=${encodeURIComponent(siteId!)}&limit=0`,
          { credentials: 'include' },
        )
        if (!ccRes.ok) throw new Error('Failed to fetch custom collections')
        const ccData = await ccRes.json()
        const collections: CustomCollectionSummary[] = Array.isArray(ccData.docs)
          ? ccData.docs
          : []

        // Fetch site's disabledCollections
        const siteRes = await fetch(
          `/api/sites/${encodeURIComponent(siteId!)}?depth=0`,
          { credentials: 'include' },
        )
        if (!siteRes.ok) throw new Error('Failed to fetch site')
        const siteData: SiteData = await siteRes.json()
        const disabled: string[] = Array.isArray(siteData.disabledCollections)
          ? siteData.disabledCollections
          : []

        if (!cancelled) {
          setCustomCollections(collections)
          setDisabledIds(disabled)
          setSiteReady(true)
        }
      } catch (err) {
        console.error('[SiteFilteredNav] Failed to load site data:', err)
        if (!cancelled) {
          setCustomCollections([])
          setDisabledIds([])
          setSiteReady(false)
        }
      }
    }

    loadSiteData()

    return () => {
      cancelled = true
    }
  }, [siteId, tenantId])
```

- [ ] **Step 3: Add filtered per-collection links memo + insert into render**

After the `useEffect`, add:

```tsx
  // ---- Filtered per-collection links ----

  const filteredCustomCollections = React.useMemo(() => {
    if (!siteReady) return []
    return customCollections.filter((cc) => !disabledIds.includes(cc.id))
  }, [customCollections, disabledIds, siteReady])
```

Then in the JSX, inside the "Custom Content" NavGroup, after the "Custom Collections" NavLink, add:

```tsx
            {/* Per-collection links for this site */}
            {siteReady &&
              filteredCustomCollections.map((cc) => (
                <NavLink
                  key={cc.id}
                  href={`${adminRoute}/collections/custom-collection-entries?where%5BparentCollection%5D%5Bequals%5D=${encodeURIComponent(cc.id)}`}
                  label={cc.name}
                />
              ))}
```

- [ ] **Step 4: Add SiteSwitcher to the render tree**

In the JSX, between "Browse by Folder" and the logout section, add:

```tsx
        {/* Site Switcher (moved from beforeNavLinks) */}
        <SiteSwitcher />
```

- [ ] **Step 5: Verify the full component compiles**

Run: `pnpm exec tsc --noEmit src/components/SiteFilteredNav/index.tsx 2>&1 | head -30`

- [ ] **Step 6: Commit**

```bash
git add src/components/SiteFilteredNav/index.tsx
git commit -m "feat: add per-collection links + SiteSwitcher to SiteFilteredNav

Fetches custom-collections for the active site (scoped by payload-site
cookie), filters by disabledCollections blacklist, and renders deep-links
into the Entries list view with pre-applied parentCollection filter.
SiteSwitcher is rendered inside the Nav (moved from beforeNavLinks).

No-site state: per-collection links absent (data-fetching constraint).

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: Wire Nav into payload.config.ts

**Files:**
- Modify: `src/payload.config.ts` (lines around `admin.components`)

- [ ] **Step 1: Update admin.components in payload.config.ts**

Read the file, find the `admin: { components: {` block (around line 122-133), and replace:

```typescript
      beforeNavLinks: ['@/components/SidebarOrderFix', '@/components/SiteSwitcher'],
```

With:

```typescript
      Nav: '@/components/SiteFilteredNav',
```

The resulting block should look like:

```typescript
  admin: {
    components: {
      graphics: {
        Logo: '@/components/High6Logo',
      },
      beforeLogin: ['@/components/BeforeLogin'],
      beforeDashboard: ['@/components/BeforeDashboard'],
      Nav: '@/components/SiteFilteredNav',
    },
```

> **Note:** `beforeNavLinks` is removed entirely because `Nav` replaces the whole sidebar — `beforeNavLinks`/`afterNavLinks` are ignored when `Nav` is set.

- [ ] **Step 2: Verify the config compiles**

Run: `pnpm exec tsc --noEmit src/payload.config.ts 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add src/payload.config.ts
git commit -m "feat: register SiteFilteredNav, remove beforeNavLinks

Replaces Payload's DefaultNav with SiteFilteredNav. Removes
beforeNavLinks entries (SidebarOrderFix + SiteSwitcher) since
they're ignored when a custom Nav is set.
SiteSwitcher now renders inside SiteFilteredNav.

SidebarOrderFix file kept on disk — not deleted.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: Update BeforeDashboard with site-aware quick-action filtering

**Files:**
- Modify: `src/components/BeforeDashboard/index.tsx`

**Interfaces:**
- Consumes: `getCookie` from `@/utilities/admin-cookies` (Task 1)

- [ ] **Step 1: Add cookie + site fetching to BeforeDashboard**

Read the current file first. The changes:

**Add import:**
```tsx
import { getCookie } from '@/utilities/admin-cookies'
```

**Add state for site data** (after the existing `error` state):
```tsx
  const [disabledIds, setDisabledIds] = useState<string[]>([])
```

**Add site fetch effect** (after the existing `useEffect` for dashboard data):
```tsx
  // Fetch active site's disabledCollections for quick-action filtering
  useEffect(() => {
    const siteId = getCookie('payload-site')
    const tenantId = getCookie('payload-tenant')

    if (!siteId || !tenantId) {
      setDisabledIds([])
      return
    }

    let cancelled = false

    async function loadSite() {
      try {
        const res = await fetch(
          `/api/sites/${encodeURIComponent(siteId!)}?depth=0`,
          { credentials: 'include' },
        )
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled) {
          setDisabledIds(
            Array.isArray(data.disabledCollections)
              ? data.disabledCollections
              : [],
          )
        }
      } catch {
        // Silently fail — quick-action filtering is non-critical
      }
    }

    loadSite()

    return () => {
      cancelled = true
    }
  }, [])
```

**Wrap quick actions with filtering** (replace the existing `quickActions.map` in the JSX):

Change:
```tsx
          {quickActions.map((action) => (
            <a
              key={action.href}
              href={action.href}
              className={`${baseClass}__action-link`}
            >
              {action.label}
            </a>
          ))}
```

To:
```tsx
          {quickActions
            .filter((action) => {
              // Currently all quick actions target standard collections
              // (faqs, testimonials, forms, form-submissions) — none are
              // Custom Collections. The disabledIds check is wired for when
              // Custom Collection quick actions are added. Today it's a
              // no-op (never filters anything).
              //
              // A Custom Collection quick action would have href like:
              // /admin/collections/custom-collection-entries/create?parentCollection=<ccId>
              // and the filter would check if <ccId> is in disabledIds.
              return true
            })}
            .map((action) => (
            <a
              key={action.href}
              href={action.href}
              className={`${baseClass}__action-link`}
            >
              {action.label}
            </a>
          ))}
```

> **Note:** The filtering mechanism is wired but not exercisable with current data — all four quick actions target standard collections (`faqs`, `testimonials`, `forms`, `form-submissions`). The `disabledIds` state and fetch are in place so that when Custom Collection quick actions are added, the filtering path exists and just needs the filter predicate updated. This distinction is documented in the acceptance criteria.

- [ ] **Step 2: Verify BeforeDashboard compiles**

Run: `pnpm exec tsc --noEmit src/components/BeforeDashboard/index.tsx 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add src/components/BeforeDashboard/index.tsx
git commit -m "feat: add site-aware quick-action filtering to BeforeDashboard

Reads payload-site cookie, fetches disabledCollections, and wires the
filtering mechanism for quick actions. Currently a no-op — all quick
actions target standard collections (no Custom Collection targets exist
yet). The fetch + state + filter pipeline is in place for future use.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: Regenerate import map + dev verification

**Files:**
- Regenerate: `src/app/(payload)/admin/importMap.js`

- [ ] **Step 1: Regenerate import map**

Run: `pnpm generate:importmap`

Verify the output includes the new Nav component entry:
```bash
grep -c "SiteFilteredNav" src/app/\(payload\)/admin/importMap.js
```
Expected: `1` (or more — at least one reference)

- [ ] **Step 2: Start dev server and verify the nav renders**

Run: `pnpm dev` (if not already running)

Navigate to `http://localhost:3000/admin` and confirm:
- Sidebar renders with all groups
- Group order: Tenant Management → Collections → Globals → Custom Content
- "Entries" link is absent from the nav
- "Custom Collections" link is present under Custom Content
- Per-collection links appear under Custom Content (if site is selected)
- Browse by Folder link is present
- Site Switcher dropdown is present
- Logout link works

- [ ] **Step 3: Commit**

```bash
git add src/app/\(payload\)/admin/importMap.js
git commit -m "chore: regenerate import map for SiteFilteredNav

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 7: Full acceptance verification (browser)

- [ ] **Step 1: Toggle OFF verification**

1. Log in as High6 Admin
2. Go to Sites → Equator (or the site with Custom Collections)
3. In the Enabled Collections toggle sidebar, disable one Custom Collection (e.g., "Projects")
4. Save the site
5. Reload the admin dashboard
6. **Verify:** The disabled collection's per-collection link is absent from the "Custom Content" nav group
7. **Verify:** "Custom Collections" (schema management) link is still present
8. **Verify:** Pages, Posts, Pricing Plans links are still present

- [ ] **Step 2: Toggle ON verification**

1. Re-enable the same Custom Collection in the site settings
2. Save and reload
3. **Verify:** The per-collection link is restored in the nav

- [ ] **Step 3: Deep-link verification**

1. Click a per-collection link (e.g., "Available Opportunities")
2. **Verify:** Lands on the Entries list view at `/admin/collections/custom-collection-entries?where[parentCollection][equals]=<id>`
3. **Verify:** Table shows only entries with the matching `parentCollection`

- [ ] **Step 4: Site switch verification**

1. Use the Site Switcher dropdown to switch to a different site
2. **Verify:** Page reloads (existing Phase 0 behavior — `window.location.reload()`)
3. **Verify:** Nav now shows the new site's per-collection links (different Custom Collections)
4. **Verify:** Filtering reflects the new site's `disabledCollections`

- [ ] **Step 5: Standard collections immunity**

1. Toggle any combination of Custom Collections on/off
2. **Verify:** Pages, Posts, Pricing Plans, Media, Categories, Users, Testimonials, FAQs, Portfolio Items, Site Settings, Redirects, Forms, Form Submissions, Search Results — all remain visible regardless

- [ ] **Step 6: "Entries" link confirmed absent**

1. Inspect the nav DOM
2. **Verify:** No link with href containing `custom-collection-entries` without a `where` param (the generic "Entries" link is gone)

- [ ] **Step 7: RBAC regression (tenant-admin)**

1. Log out, log in as "Agent" (tenant-admin, High6 only)
2. **Verify:** Nav shows only collections the Agent has `read` permission for (Phase 0 check)
3. **Verify:** Per-collection links are scoped to High6 site's Custom Collections
4. **Verify:** No Equator or other tenant's collections appear
5. Repeat for "Demo Author" (tenant-admin, Equator only)
6. **Verify:** Nav shows only Equator-scoped collections and per-collection links

- [ ] **Step 8: No-site / no-tenant state**

1. Clear `payload-site` cookie (browser dev tools → Application → Cookies → delete `payload-site`)
2. Reload
3. **Verify:** Everything renders normally EXCEPT per-collection links under "Custom Content" are absent
4. **Verify:** "Custom Collections" (schema management) is still present
5. **Verify:** SiteSwitcher's `defaultSite` fallback sets a new `payload-site` cookie and triggers reload
6. After reload → per-collection links appear

- [ ] **Step 9: BeforeDashboard quick actions**

1. **Verify:** Quick actions (Add FAQ, Add Testimonial, View Forms, View Form Submissions) render normally on the dashboard
2. **Verify:** The cookie-reading and disabledCollections fetch happen without errors (check browser console — no "[SiteFilteredNav]" or dashboard-related errors)
3. **Note for report:** Filtering mechanism is wired (state + fetch + filter pipeline exists) but not exercisable — all current quick actions target standard collections, so the filter is a no-op. Acceptance bar: "mechanism wired, not exercisable" — distinct from ✅ "verified working"

---

## Acceptance Criteria Summary

| Criterion | Verification |
|-----------|-------------|
| Toggle OFF removes per-collection link from DOM | Step 1 |
| Toggle ON restores link | Step 2 |
| Deep-link lands on filtered Entries list | Step 3 |
| Site switch updates nav to new site's collections | Step 4 |
| Standard collections always visible | Step 5 |
| "Entries" link absent from nav | Step 6 |
| RBAC regression — tenant-admin scope preserved | Step 7 |
| No-site state handled gracefully | Step 8 |
| BeforeDashboard quick actions render + mechanism wired | Step 9 (wired, not exercisable) |
| SiteSwitcher reload behavior unchanged from Phase 0 | Step 4 (existing reload, not new) |

---

## Files Summary

| File | Action |
|------|--------|
| `src/utilities/admin-cookies.ts` | **Create** — shared `getCookie()` |
| `src/components/SiteFilteredNav/index.tsx` | **Create** — custom Nav component |
| `src/components/BeforeDashboard/index.tsx` | **Modify** — cookie + site fetch + filter pipeline |
| `src/payload.config.ts` | **Modify** — register `Nav`, remove `beforeNavLinks` |
| `src/components/SidebarOrderFix/index.tsx` | **Keep on disk** — no longer imported |
| `src/app/(payload)/admin/importMap.js` | **Regenerate** |
````
