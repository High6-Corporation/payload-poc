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

import { LoaderIcon } from '@/components/ui/admin-loading'

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
async function fetchCustomCollections(siteId: string): Promise<CustomCollectionSummary[]> {
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

    fetchCustomCollections(docId as string)
      .then((collections) => {
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
      })
      .catch(() => {
        if (!cancelled) setFetchState('error')
      })

    return () => {
      cancelled = true
    }
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
            Create a Custom Collection for this site first, or enable built-in collections (coming
            in a future update).
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
                      {item.description && <span style={S.toggleRowDesc}>{item.description}</span>}
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
