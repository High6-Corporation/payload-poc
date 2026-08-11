# Phase 2 — Dynamic Sidebar/Dashboard Nav (Design Spec)

**Date:** 2026-08-10
**Status:** Approved
**Phase 1 dependency:** `disabledCollections` JSON field on Sites, `EnabledCollectionsToggle` component, `BUILT_IN_COLLECTIONS` registry

---

## Goal

Replace the CSS-only `SidebarOrderFix` with a custom `Nav` component that:

1. **Dynamically renders per-collection nav links** under the "Custom Content"
   group — one link per Custom Collection belonging to the active site
   (e.g. "Projects", "Available Opportunities"). These links deep-link into
   the `custom-collection-entries` list view pre-filtered by
   `parentCollection`. This is new functionality — individual Custom
   Collections do not have their own nav entries today.

2. **Filters those links** based on the active site's `disabledCollections`
   blacklist. A Custom Collection whose MongoDB ObjectID appears in the
   array is omitted from the nav entirely.

3. **Removes the generic "Entries" link** — replaced by the per-collection
   links. "Custom Collections" (schema management) stays visible and is
   never filtered.

### Scope shift from initial assumptions

The original framing ("filter existing sidebar entries") assumed individual
Custom Collections already had nav links. They don't — the current nav has
only two generic links: "Custom Collections" and "Entries." Phase 2 must
build the per-collection links first, then filter them. This is a real scope
increase from the initial task description.

---

## Mechanism: Custom `Nav` Component

Payload supports `admin.components.Nav` to fully replace the built-in sidebar
and mobile menu. This is the mechanism. `beforeNavLinks`/`afterNavLinks` are
ignored when `Nav` is set.

---

## Component Architecture

### New: `src/components/SiteFilteredNav/index.tsx`

Registered as `admin.components.Nav` in `payload.config.ts`.

```
SiteFilteredNav
└── NavWrapper (from @payloadcms/ui)
    ├── Dashboard link
    ├── NavGroup: "Tenant Management"
    │   └── NavItem per collection in this group
    ├── NavGroup: "Collections"
    │   └── NavItem per collection (filtered by permissions only)
    ├── NavGroup: "Globals"
    │   └── NavItem per global
    ├── NavGroup: "Custom Content"
    │   ├── NavItem: "Custom Collections"  (always visible, never filtered)
    │   ├── NavItem: "Projects"            (dynamic, filtered by disabledCollections)
    │   ├── NavItem: "Available Opportunities"  (dynamic, filtered)
    │   └── ... per-collection links ...
    ├── Browse by Folder link
    ├── SiteSwitcher (moved from beforeNavLinks)
    └── Controls (Payload's built-in)
```

### Data Flow

1. Read `payload-tenant` + `payload-site` cookies (same `getCookie()` helper)
2. If site cookie present → fetch `/api/custom-collections?where[site][equals]=<siteId>&limit=0`
   to get the list of Custom Collections for the active site
3. Fetch `/api/sites/<siteId>?depth=0` to get `disabledCollections`
4. Render per-collection links: for each Custom Collection NOT in `disabledCollections`,
   render a nav link to:
   `/admin/collections/custom-collection-entries?where[parentCollection][equals]=<customCollectionId>`
5. If no site cookie → per-collection links are absent (see State Handling below)

### Deep-Linking (Verified)

Payload's admin list view preserves URL `where` query params and applies them
as filters on load. Verified in-browser:
`/admin/collections/custom-collection-entries?where[parentCollection][equals]=6a4f157584cbf505b38bc4f8`
correctly shows only entries with `parentCollection = Projects`. No custom
list-view component needed.

### Permission Filtering (Preserved from DefaultNav)

```
collections from useConfig().config.collections
  │
  └─ filter: permissions.collections[slug]?.read?.permission === true
       (preserves Phase 0 RBAC + admin.hidden — superset of DefaultNav's
        visibleEntities filter)
```

Per-collection Custom Content links are NOT Payload collections — they're
dynamically rendered `<a>` tags pointing to filtered list views. They don't
go through `useConfig()` collections at all. Their filtering is purely
`disabledCollections`-based.

### What Happens to Existing Links

| Link                 | Fate                                       | Reason                                       |
| -------------------- | ------------------------------------------ | -------------------------------------------- |
| "Custom Collections" | **Stays** — always visible, never filtered | Schema management tool; not per-site content |
| "Entries"            | **Removed entirely**                       | Replaced by per-collection links             |

### Render Order (Replaces SidebarOrderFix CSS)

Explicit JSX order — no CSS hacks:

1. Dashboard link
2. "Tenant Management" group — `admin.group === 'Tenant Management'`
3. "Collections" group — all other collections, sub-grouped by `admin.group`
4. "Globals" group — Header, Footer
5. "Custom Content" group — "Custom Collections" + per-collection links
6. Browse by Folder
7. Site Switcher
8. Controls (settings + logout)

### Flicker Trade-Off (Stated Decision)

On mount, static nav links render immediately. The `custom-collections` fetch
and `disabledCollections` fetch complete in subsequent render ticks, at which
point per-collection links appear (or not). This creates a brief flicker where
the "Custom Content" group gains items after load.

**Accepted because the fetch is fast** — two local REST API calls returning
small payloads (sub-100ms on dev). A blocking spinner would contradict the
fail-open principle. Unlike Approach B's per-navigation DOM manipulation,
this is a single mount event. Site switches trigger `window.location.reload()`
→ full remount → same single flicker.

---

## State Handling

| State                                        | Per-collection links under "Custom Content"                   | Other nav                                   |
| -------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------- |
| **Normal** (site present, fetches succeed)   | Rendered and filtered by `disabledCollections`                | Normal                                      |
| **No tenant cookie**                         | **Absent** — no site to scope to                              | Normal (fail-open: everything else visible) |
| **No site cookie** (tenant present)          | **Absent** — data-fetching constraint, not an access decision | Normal                                      |
| **Fetch error** (custom-collections or site) | **Absent** — logged to console                                | Normal                                      |

**Rationale for "absent" vs "show all":** The question "which Custom
Collections belong to this site?" is structurally undefined without a site
to scope to. Showing all custom collections across all sites would be
actively misleading (wrong site's collections, no `disabledCollections`
filtering). This is a data-fetching constraint, not an access decision —
consistent with fail-open because we're not hiding anything we _could_ show.

In practice, SiteSwitcher's `defaultSite` fallback resolves an active site
within one render tick, so this state is rare and short-lived.

---

## Always-Visible Collections (Hardcoded Allowlist)

Never filtered by `disabledCollections`:

- Pages (`pages`)
- Posts (`posts`)
- Pricing Plans (`pricing-plans`)
- "Custom Collections" (the schema management link — `custom-collections`)
- Any other standard Payload collection not in the Custom Content group

The "Custom Collections" management link is always visible because it's the
schema-management tool, not a per-site content collection. This is the same
logic as Pages/Posts/Pricing Plans — they're infrastructure, not toggleable
content.

---

## Source-Agnostic Filtering

The `disabledCollections` array is a flat `string[]`. For Custom Collections,
entries are MongoDB ObjectIDs. For built-in collections (Phase 3), entries
are `builtin:<slug>` strings (e.g. `builtin:menus`).

The filtering logic:

- Per-collection Custom Content links: check `disabledCollections.includes(customCollection.id)`
- Built-in collection links (Phase 3): check `disabledCollections.includes('builtin:<slug>')`

Both checks are string comparisons against the same flat array. Phase 3 adds
entries to `BUILT_IN_COLLECTIONS` — the Nav queries them the same way and
filters them the same way. Zero Nav-component changes needed for Phase 3.

---

## Modified: `src/components/BeforeDashboard/index.tsx`

- Read `payload-tenant` + `payload-site` cookies
- Fetch active site's custom collections + `disabledCollections`
- Filter `quickActions` — actions targeting disabled Custom Collections are
  omitted. Currently quick actions are `faqs`, `testimonials`, `forms`,
  `form-submissions` — all standard collections, none affected. The mechanism
  is wired for when Custom Collection quick actions are added.
- Stat cards unchanged

### Modified: `src/payload.config.ts`

```diff
  admin: {
    components: {
+     Nav: '@/components/SiteFilteredNav',
-     beforeNavLinks: ['@/components/SidebarOrderFix', '@/components/SiteSwitcher'],
    },
  },
```

---

## What This Does NOT Change

- **RBAC/access control** — purely visual nav filtering
- **REST API** — disabled collections still accessible via direct URL
- **Collection configs** — no `admin.hidden` modifications
- **`SidebarOrderFix`** — file kept on disk, no longer imported
- **Standard collections** — Pages, Posts, Pricing Plans, etc. always visible

---

## Verification Plan

### Per-user verification (4 production users)

| User        | Role         | Tenant       | Expected                                                                                                                                                                    |
| ----------- | ------------ | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| High6 Admin | super-admin  | High6 (all)  | Full nav; per-collection Custom Content links filtered by High6 site's `disabledCollections`; "Custom Collections" always visible; Pages/Posts/Pricing Plans always visible |
| Josh        | super-admin  | High6 (all)  | Same as High6 Admin                                                                                                                                                         |
| Agent       | tenant-admin | High6 only   | Nav limited to High6-accessible collections (RBAC); per-collection links further filtered by `disabledCollections`; no cross-tenant leakage                                 |
| Demo Author | tenant-admin | Equator only | Nav limited to Equator-accessible collections; Equator's `disabledCollections` applied; no High6 collections                                                                |

### Per-user steps

1. **Toggle OFF:** Disable a Custom Collection for user's site → reload → per-collection link gone from DOM
2. **Toggle ON:** Re-enable → reload → link returns
3. **Site switch:** Change site → nav updates to new site's custom collections + filtering
4. **Standard collections:** Pages, Posts, Pricing Plans remain regardless
5. **"Custom Collections" link:** Always visible, never disabled
6. **"Entries" link:** Confirmed absent from nav entirely
7. **RBAC regression (tenant-admin):** Collections outside tenant scope never appear (Phase 0 check)
8. **Deep-link:** Click per-collection link → lands on filtered Entries list with correct `where[parentCollection]` param

---

## Files

| File                                       | Action                                                    |
| ------------------------------------------ | --------------------------------------------------------- |
| `src/components/SiteFilteredNav/index.tsx` | **Create** — custom Nav with dynamic per-collection links |
| `src/components/BeforeDashboard/index.tsx` | **Modify** — cookie + site-aware quick-action filtering   |
| `src/payload.config.ts`                    | **Modify** — register `Nav`, remove `beforeNavLinks`      |
| `src/components/SidebarOrderFix/index.tsx` | **Keep on disk** — no longer imported                     |
| `src/app/(payload)/admin/importMap.js`     | **Regenerate**                                            |

---

## Dependencies

- Phase 1: `disabledCollections` field, `EnabledCollectionsToggle`, `BUILT_IN_COLLECTIONS`
- Phase 0: user-tenant scoping, SiteSwitcher cookie pattern
- No Phase 3 dependency (Phase 3 adds `BUILT_IN_COLLECTIONS` entries → Nav picks them up automatically)
