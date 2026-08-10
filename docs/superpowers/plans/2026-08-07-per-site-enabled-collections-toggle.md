# Per-Site Enabled-Collections Toggle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `disabledCollections` field to the Sites collection with a custom admin toggle component that renders per-site Custom Collections (dynamically queried) and Built-in Collections (from a code registry), storing state as a JSON blacklist on the site document.

**Architecture:** A JSON field on Sites stores an array of disabled collection IDs (blacklist pattern — everything enabled by default). A custom `'use client'` admin component (following the FieldBuilder precedent: `useField`, inline Payload-CSS-property styles, no Tailwind) queries Custom Collections via REST API for the current site, reads Built-in Collections from a static registry file, and renders toggle switches. Toggling off adds the ID to the blacklist; toggling on removes it.

**Tech Stack:** Payload CMS v3.85.1, React 19 (client component), TypeScript strict, `@payloadcms/ui` hooks (`useField`, `useDocumentInfo`)

## Global Constraints

- No destructive changes — additive field only on Sites
- Follow FieldBuilder precedent for custom field component structure (inline styles, Payload CSS custom properties, no Tailwind)
- Production database in active use — no seed script or destructive migration
- `pnpm generate:types && pnpm generate:importmap` after any schema change
- Built-in section must be an empty extensible registry — Phase 3 adds entries without touching this component

---

## File Map

| Action | Path                                                | Responsibility                                                                                                                                                                                                     |
| ------ | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Create | `src/collections/built-in-collections.ts`           | Static registry of built-in collection slugs/labels. Phase 3 appends entries here.                                                                                                                                 |
| Create | `src/components/EnabledCollectionsToggle/index.tsx` | `'use client'` custom field component. Queries Custom Collections for the current site, reads the built-in registry, renders toggle switches for both sections. Reads/writes `disabledCollections` via `useField`. |
| Modify | `src/collections/Sites.ts`                          | Add `disabledCollections` JSON field with `admin.components.Field` pointing to the new toggle component.                                                                                                           |

---

### Task 1: Create the Built-in Collections Registry

**Files:**

- Create: `src/collections/built-in-collections.ts`

**Interfaces:**

- Produces: `BuiltInCollection` interface (`{ slug: string; label: string; description?: string }`) and `BUILT_IN_COLLECTIONS: BuiltInCollection[]` (empty array, Phase 3 will populate)

- [ ] **Step 1: Write the registry file**

```typescript
// src/collections/built-in-collections.ts
//
// Registry of built-in collection types that appear in the per-site
// enabled-collections toggle.  Phase 3 (Menus, Headers & Footers, SMTP
// Settings) will add entries to this array — the toggle component reads it
// automatically and needs no changes.
//
// Each entry maps to a future top-level collection (e.g. "menus") that will
// be scoped to a site.  The `slug` MUST match the eventual collection slug
// so the toggle component can store a consistent key in disabledCollections.
// ---------------------------------------------------------------------------

export interface BuiltInCollection {
  /** Collection slug — must match the eventual Payload collection slug */
  slug: string
  /** Human-readable label shown in the toggle UI */
  label: string
  /** Optional description shown below the label in the toggle UI */
  description?: string
}

/**
 * Built-in collections available for per-site enable/disable.
 *
 * EMPTY BY DESIGN — Phase 3 will add entries like:
 *   { slug: 'menus', label: 'Menus' },
 *   { slug: 'headers-footers', label: 'Headers & Footers' },
 *   { slug: 'smtp-settings', label: 'SMTP Settings' },
 */
export const BUILT_IN_COLLECTIONS: BuiltInCollection[] = []
```

- [ ] **Step 2: Verify the file compiles**

Run: `pnpm exec tsc --noEmit src/collections/built-in-collections.ts`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/collections/built-in-collections.ts
git commit -m "feat: add built-in collections registry (empty, Phase 3 will populate)"
```

---

### Task 2: Create the EnabledCollectionsToggle Custom Field Component

**Files:**

- Create: `src/components/EnabledCollectionsToggle/index.tsx`

**Interfaces:**

- Consumes: `BUILT_IN_COLLECTIONS`, `BuiltInCollection` from `@/collections/built-in-collections`
- Consumes: `useField<string[]>` from `@payloadcms/ui` (reads/writes `disabledCollections` at the field path)
- Consumes: `useDocumentInfo` from `@payloadcms/ui` (gets current site document ID)
- Produces: `EnabledCollectionsToggle` React component (default export, `'use client'`)

- [ ] **Step 1: Write the component**

```typescript
// src/components/EnabledCollectionsToggle/index.tsx
'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useField, useDocumentInfo } from '@payloadcms/ui'
import { BUILT_IN_COLLECTIONS, type BuiltInCollection } from '@/collections/built-in-collections'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A resolved collection item shown as a toggle row. */
interface ToggleItem {
  /** Unique key — custom-collection ObjectID string, or built-in slug string */
  key: string
  /** Human-readable label */
  label: string
  /** Optional description shown below the label */
  description?: string
  /** Discriminator for the section header */
  kind: 'custom' | 'built-in'
}

/** Shape returned by Payload REST API for a custom-collection doc (subset). */
interface CustomCollectionSummary {
  id: string
  name: string
  slug: string
}

interface EnabledCollectionsToggleProps {
  field: {
    name: string
    label?: string | Record<string, unknown>
    required?: boolean
    admin?: {
      description?: string | Record<string, unknown>
      width?: string
    }
  }
  path: string
  readOnly?: boolean
}

// ---------------------------------------------------------------------------
// Palette — matches FieldBuilder's CSS custom property tokens
// ---------------------------------------------------------------------------

const C = {
  elevation0: 'var(--theme-elevation-0)',
  elevation100: 'var(--theme-elevation-100)',
  elevation150: 'var(--theme-elevation-150)',
  elevation200: 'var(--theme-elevation-200)',
  elevation400: 'var(--theme-elevation-400)',
  elevation500: 'var(--theme-elevation-500)',
  elevation800: 'var(--theme-elevation-800)',
  text: 'var(--theme-text)',
  inputBg: 'var(--theme-input-bg)',
  borderColor: 'var(--theme-border-color)',
  error50: 'var(--theme-error-50)',
  error200: 'var(--theme-error-200)',
  error500: 'var(--theme-error-500)',
  success500: 'var(--theme-success-500)',
  success100: 'var(--theme-success-100)',
  warning100: 'var(--theme-warning-100)',
  warning600: 'var(--theme-warning-600)',
}

// ---------------------------------------------------------------------------
// Inline Styles (no Tailwind — Payload admin CSS conflicts)
// ---------------------------------------------------------------------------

const S = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '20px',
    padding: '4px 0',
  },

  // Section header
  sectionHeader: {
    fontSize: '11px',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    color: C.elevation400,
    padding: '4px 0',
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid' as const,
    borderBottomColor: C.elevation100,
    marginBottom: '4px',
  },

  // Toggle list
  toggleList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
  },

  // Toggle row
  toggleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '10px 12px',
    backgroundColor: C.elevation0,
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: C.elevation100,
    borderRadius: '6px',
    transition: 'border-color 150ms, box-shadow 150ms',
  },
  toggleRowInfo: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
  },
  toggleRowLabel: {
    fontSize: '13px',
    fontWeight: 600,
    color: C.elevation800,
    lineHeight: '20px',
  },
  toggleRowDesc: {
    fontSize: '11px',
    color: C.elevation500,
    lineHeight: '16px',
  },
  toggleRowMeta: {
    fontSize: '11px',
    color: C.elevation400,
    fontFamily: 'monospace',
    lineHeight: '16px',
  },

  // Toggle switch (mirrors FieldBuilder's formToggle/toggleTrack/toggleThumb)
  toggleSwitch: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexShrink: 0,
  },
  toggleTrack: {
    width: '36px',
    height: '20px',
    borderRadius: '10px',
    backgroundColor: C.elevation150,
    cursor: 'pointer',
    position: 'relative' as const,
    transition: 'background-color 150ms',
    flexShrink: 0,
  },
  toggleTrackActive: {
    width: '36px',
    height: '20px',
    borderRadius: '10px',
    backgroundColor: C.success500,
    cursor: 'pointer',
    position: 'relative' as const,
    transition: 'background-color 150ms',
    flexShrink: 0,
  },
  toggleThumb: {
    width: '16px',
    height: '16px',
    borderRadius: '50%',
    backgroundColor: C.elevation0,
    position: 'absolute' as const,
    top: '2px',
    left: '2px',
    transition: 'left 150ms',
    boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
  },
  toggleThumbActive: {
    width: '16px',
    height: '16px',
    borderRadius: '50%',
    backgroundColor: C.elevation0,
    position: 'absolute' as const,
    top: '2px',
    left: '18px',
    transition: 'left 150ms',
    boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
  },

  // States
  stateBox: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '32px 24px',
    backgroundColor: 'var(--theme-bg)',
    borderWidth: '1px',
    borderStyle: 'dashed',
    borderColor: C.elevation150,
    borderRadius: '8px',
    textAlign: 'center' as const,
  },
  stateText: {
    fontSize: '13px',
    color: C.elevation500,
    maxWidth: '360px',
    lineHeight: '1.5',
  },
  stateHeading: {
    fontSize: '14px',
    fontWeight: 600,
    color: C.elevation800,
    marginBottom: '4px',
  },
  loadingRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px',
    color: C.elevation500,
    fontSize: '13px',
  },
  errorText: {
    fontSize: '13px',
    color: C.error500,
    lineHeight: '1.5',
  },

  // Badge (count)
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '20px',
    height: '18px',
    padding: '0 6px',
    fontSize: '10px',
    fontWeight: 600,
    lineHeight: '18px',
    borderRadius: '9px',
    backgroundColor: C.elevation100,
    color: C.elevation500,
    marginLeft: '6px',
  },
}

// ---------------------------------------------------------------------------
// Inline SVG Icons
// ---------------------------------------------------------------------------

const LoaderIcon: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={C.elevation500}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ animation: 'spin 1s linear infinite' }}
  >
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
)

const AlertCircleIcon: React.FC<{ size?: number }> = ({ size = 32 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={C.elevation400}
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
)

const LayersIcon: React.FC<{ size?: number }> = ({ size = 32 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={C.elevation400}
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polygon points="12 2 22 8.5 12 15 2 8.5 12 2" />
    <polyline points="2 15.5 12 22 22 15.5" />
  </svg>
)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Fetch all custom collections for a given site.
 * Returns an empty array on failure (fail-open — the toggle UI degrades to
 * showing only built-in collections rather than blocking the entire Sites
 * edit form).
 */
async function fetchCustomCollections(
  siteId: string,
): Promise<CustomCollectionSummary[]> {
  try {
    const baseUrl = window.location.origin
    // Payload REST API: query custom-collections filtered by site.
    // limit=0 is Payload's "no limit" sentinel (returns all matching docs).
    const url = `${baseUrl}/api/custom-collections?where[site][equals]=${encodeURIComponent(siteId)}&limit=0&depth=0`
    const res = await fetch(url, { credentials: 'include' })
    if (!res.ok) return []
    const body = await res.json()
    return Array.isArray(body.docs) ? body.docs : []
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export const EnabledCollectionsToggle: React.FC<EnabledCollectionsToggleProps> = (props) => {
  const { path, readOnly } = props

  // ---- Current site document ID ----
  const { id: docId } = useDocumentInfo()

  // ---- Read/write the disabledCollections JSON array via Payload's form ----
  const { value, setValue } = useField<string[]>({ path })
  const disabledIds: string[] = Array.isArray(value) ? value : []

  // ---- Custom Collections (fetched from API for this site) ----
  const [customItems, setCustomItems] = useState<ToggleItem[]>([])
  const [fetchState, setFetchState] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle')

  useEffect(() => {
    if (!docId) {
      // New site (create flow) — no site ID yet, nothing to query.
      setCustomItems([])
      setFetchState('loaded')
      return
    }

    let cancelled = false
    setFetchState('loading')

    fetchCustomCollections(docId as string).then((collections) => {
      if (cancelled) return
      // Filter out any IDs that don't match a live collection (handles
      // deletion edge case — orphaned disabled IDs are simply not shown).
      const items: ToggleItem[] = collections.map((cc) => ({
        key: cc.id,
        label: cc.name,
        description: `/${cc.slug}`,
        kind: 'custom' as const,
      }))
      setCustomItems(items)
      setFetchState('loaded')
    }).catch(() => {
      if (!cancelled) setFetchState('error')
    })

    return () => { cancelled = true }
  }, [docId])

  // ---- Built-in Collections (static registry) ----
  const builtInItems: ToggleItem[] = useMemo(
    () =>
      BUILT_IN_COLLECTIONS.map((bic: BuiltInCollection) => ({
        key: `builtin:${bic.slug}`,
        label: bic.label,
        description: bic.description,
        kind: 'built-in' as const,
      })),
    [],
  )

  // ---- Toggle handler ----
  //
  // The `key` for custom collections is the MongoDB ObjectID string.
  // The `key` for built-in collections is `builtin:<slug>` (a namespaced
  // string — never a document ID).  Both are stored in the same
  // disabledCollections JSON array; the component discriminates by the
  // `builtin:` prefix when reading back if needed, but for toggle purposes
  // the key comparison is exact string match.
  const handleToggle = useCallback(
    (itemKey: string, currentlyEnabled: boolean) => {
      if (currentlyEnabled) {
        // Disable: add to blacklist
        setValue([...disabledIds, itemKey])
      } else {
        // Enable: remove from blacklist
        setValue(disabledIds.filter((id) => id !== itemKey))
      }
    },
    [disabledIds, setValue],
  )

  // ---- Derived ----
  const isLoading = fetchState === 'loading'
  const hasError = fetchState === 'error'
  const hasCustom = customItems.length > 0
  const hasBuiltIn = builtInItems.length > 0

  // All toggle items in render order: custom first, then built-in.
  const allItems: { section: string; items: ToggleItem[] }[] = []
  if (hasCustom || fetchState === 'idle' || isLoading) {
    allItems.push({ section: 'Custom Collections', items: customItems })
  }
  if (hasBuiltIn) {
    allItems.push({ section: 'Built-in Collections', items: builtInItems })
  }

  // ---- Render ----

  return (
    <div style={S.wrapper}>
      {/* Keyframes for spinner */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Loading state */}
      {isLoading && (
        <div style={S.loadingRow}>
          <LoaderIcon size={16} />
          Loading collections for this site…
        </div>
      )}

      {/* Error state */}
      {hasError && (
        <div style={S.stateBox}>
          <AlertCircleIcon size={32} />
          <div style={S.stateHeading}>Failed to load collections</div>
          <div style={{ ...S.stateText, ...S.errorText }}>
            Could not fetch custom collections for this site. Check your connection and reload.
          </div>
        </div>
      )}

      {/* Empty state: no custom collections AND no built-in AND not loading */}
      {!isLoading && !hasError && !hasCustom && !hasBuiltIn && (
        <div style={S.stateBox}>
          <LayersIcon size={32} />
          <div style={S.stateHeading}>No collections available</div>
          <div style={S.stateText}>
            Create a Custom Collection for this site first, or enable built-in collections (coming in a future update).
          </div>
        </div>
      )}

      {/* Toggle sections */}
      {!isLoading &&
        allItems.map(({ section, items }) => (
          <div key={section}>
            {/* Section header */}
            <div style={S.sectionHeader}>
              {section}
              <span style={S.badge}>{items.length}</span>
            </div>

            {/* Toggle rows */}
            <div style={S.toggleList}>
              {items.map((item) => {
                const isEnabled = !disabledIds.includes(item.key)

                return (
                  <div key={item.key} style={S.toggleRow}>
                    {/* Info */}
                    <div style={S.toggleRowInfo}>
                      <span style={S.toggleRowLabel}>{item.label}</span>
                      {item.description && (
                        <span style={S.toggleRowDesc}>{item.description}</span>
                      )}
                      {item.kind === 'built-in' && (
                        <span style={S.toggleRowMeta}>{item.key.replace('builtin:', '')}</span>
                      )}
                    </div>

                    {/* Toggle switch */}
                    {!readOnly && (
                      <div style={S.toggleSwitch}>
                        <div
                          style={isEnabled ? S.toggleTrackActive : S.toggleTrack}
                          onClick={() => handleToggle(item.key, isEnabled)}
                          role="switch"
                          aria-checked={isEnabled}
                          aria-label={`${isEnabled ? 'Disable' : 'Enable'} ${item.label}`}
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === ' ' || e.key === 'Enter') {
                              e.preventDefault()
                              handleToggle(item.key, isEnabled)
                            }
                          }}
                        >
                          <div style={isEnabled ? S.toggleThumbActive : S.toggleThumb} />
                        </div>
                      </div>
                    )}

                    {/* Read-only state indicator */}
                    {readOnly && (
                      <span
                        style={{
                          fontSize: '12px',
                          color: isEnabled ? C.success500 : C.elevation400,
                          fontWeight: 500,
                        }}
                      >
                        {isEnabled ? 'Enabled' : 'Disabled'}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
    </div>
  )
}
```

- [ ] **Step 2: Verify the component compiles**

```bash
pnpm exec tsc --noEmit src/components/EnabledCollectionsToggle/index.tsx
```

Expected: No type errors. (May need `pnpm generate:types` first if Payload types aren't current — that's fine, the component itself has no type errors.)

- [ ] **Step 3: Commit**

```bash
git add src/components/EnabledCollectionsToggle/index.tsx
git commit -m "feat: add EnabledCollectionsToggle custom field component"
```

---

### Task 3: Add disabledCollections Field to Sites Collection

**Files:**

- Modify: `src/collections/Sites.ts` — add `disabledCollections` field
- Files regenerated by tooling: `src/payload-types.ts`, `src/app/(payload)/admin/importMap.js`

**Interfaces:**

- Consumes: `EnabledCollectionsToggle` component from `@/components/EnabledCollectionsToggle#EnabledCollectionsToggle`
- Produces: `disabledCollections: string[] | null` on Sites documents (auto-generated in `payload-types.ts`)

- [ ] **Step 1: Add the field to Sites.ts**

Edit `src/collections/Sites.ts` — add the `disabledCollections` field after the `tenant` relationship field (as the last field in the array):

```typescript
import type { CollectionConfig } from 'payload'

import { authenticated } from '../access/authenticated'
import { slugField } from 'payload'

export const Sites: CollectionConfig = {
  slug: 'sites',
  access: {
    create: authenticated,
    delete: authenticated,
    read: authenticated,
    update: authenticated,
  },
  admin: {
    useAsTitle: 'name',
    group: 'Tenant Management',
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    slugField({
      fieldToUse: 'name',
    }),
    {
      name: 'url',
      type: 'text',
      required: true,
    },
    {
      name: 'tenant',
      type: 'relationship',
      relationTo: 'tenants',
      required: true,
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'disabledCollections',
      type: 'json',
      defaultValue: [],
      admin: {
        description:
          'BLACKLIST — collections listed here are DISABLED for this site. ' +
          'Everything else is enabled by default. Custom Collections are ' +
          'auto-enabled on creation (they start absent from this list). ' +
          'Built-in collection slugs are prefixed with "builtin:".',
        position: 'sidebar',
        components: {
          Field: '@/components/EnabledCollectionsToggle#EnabledCollectionsToggle',
        },
      },
    },
  ],
}
```

- [ ] **Step 2: Regenerate types and import map**

```bash
pnpm generate:types && pnpm generate:importmap
```

Expected: Both commands exit 0. Verify `src/payload-types.ts` now includes `disabledCollections` on the Site type.

- [ ] **Step 3: Verify the dev server starts without import-map errors**

```bash
pnpm dev &
sleep 10
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/admin
```

Expected: HTTP 200 (or redirect to login — any non-500 response confirms no import-map crash). Kill the dev server after.

- [ ] **Step 4: Commit**

```bash
git add src/collections/Sites.ts src/payload-types.ts src/app/\(payload\)/admin/importMap.js
git commit -m "feat: add disabledCollections field to Sites collection"
```

---

### Task 4: Runtime Verification

**Files:**

- No code changes — verification only.

**Prerequisites:** Dev server running (`pnpm dev`), logged into Payload admin.

- [ ] **Step 1: Verify the field appears on an existing site**

Navigate to `http://localhost:3000/admin/collections/sites` → click Equator (or any site with existing Custom Collections).

Expected:

- The "Custom Collections" section header renders with a count badge.
- Each existing Custom Collection for that site (e.g., "Available Opportunities", "Projects" for Equator) shows as a toggle row, all toggled ON by default.
- The "Built-in Collections" section either renders without error (if future entries exist) or is absent (if still empty).

- [ ] **Step 2: Verify toggle persistence**

Toggle one Custom Collection OFF. Save the site document. Reload the page.

Expected: The toggled-off collection is still OFF after reload. Inspect the site document via API:

```bash
curl -s http://localhost:3000/api/sites/<site-id> | jq '.disabledCollections'
```

Expected: The array contains the Custom Collection ID that was toggled off.

- [ ] **Step 3: Verify auto-enable on Custom Collection creation**

Navigate to `http://localhost:3000/admin/collections/custom-collections` → create a new Custom Collection for the same site. Save. Navigate back to the site edit form.

Expected: The newly created Custom Collection appears in the toggle list and is toggled ON (not in `disabledCollections`). No manual intervention needed.

- [ ] **Step 4: Verify no regression to Custom Collections**

Navigate to `http://localhost:3000/admin/collections/custom-collections`:

- List view loads and shows all collections.
- Edit an existing collection → fields load correctly in FieldBuilder.
- Create a new collection → fields default loads, save succeeds.
- Delete a collection that was in `disabledCollections` → the site edit form still loads (orphaned ID is silently ignored).

- [ ] **Step 5: Verify built-in section renders without error**

If the `BUILT_IN_COLLECTIONS` array is still empty: the "Built-in Collections" section is absent from the page (no header, no empty rows). The page renders without error.

Temporarily add a test entry to `BUILT_IN_COLLECTIONS`:

```typescript
{ slug: '_test', label: 'Test Built-in', description: 'Temporary test entry — remove before commit' },
```

Reload the site edit form. Expected: "Built-in Collections" section header with badge "1" and a toggle row for "Test Built-in". Remove the test entry after verification.

```

---

## Design Decisions Summary

| Decision | Choice | Reasoning |
|----------|--------|-----------|
| Field name | `disabledCollections` | Blacklist pattern — fail-open (everything visible by default). Matches project's existing safety instincts (tenant access rollback, duplicate handling). |
| Field type | `json` | Same precedent as `CustomCollections.fields` (FieldBuilder). Stores arbitrary array, queryable at document level. |
| Auto-enable | None needed | Blacklist pattern: new collections are absent from the array → enabled. No hook, no race condition, no extra write. |
| ID format | Custom: MongoDB ObjectID strings. Built-in: `builtin:<slug>` strings | Consistent string keys in a single JSON array. The `builtin:` namespace prefix prevents collisions with 24-char hex ObjectIDs and makes the stored data self-documenting. |
| Deletion edge case | Orphaned IDs silently ignored | `fetchCustomCollections` returns live collections only; the toggle renders what the API returns. Stale disabled IDs never match a rendered row. No cleanup needed. |
| Registry location | `src/collections/built-in-collections.ts` | No `src/config/` or `src/lib/` convention exists. Collections directory is most discoverable for Phase 3 developers adding collection-related config. |
| Component pattern | Follows FieldBuilder: `'use client'`, `useField`, inline Payload CSS properties, no Tailwind | Existing precedent, visual consistency, avoids Tailwind/Payload CSS conflicts. |
```
