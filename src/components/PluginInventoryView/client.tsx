'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'

// ---------------------------------------------------------------------------
// Plugin Inventory client view (super-admin only) — the interactive half of
// the Plugin Inventory page. Rendered inside the admin DefaultTemplate by the
// server wrapper in ./index.tsx (a custom view without its own template would
// render as a bare page with no sidebar — Root/index.js only applies a
// template to built-in view overrides).
//
// Renders the output of GET /api/plugin-inventory with `npm outdated`-style
// columns (Installed / Wanted / Latest), a MAJOR-vs-minor update distinction,
// a visually separated Payload Core section, text search, and status filters.
//
// The server route enforces the super-admin gate; this view only reflects it
// (401/403 → "Access denied" state). The nav link is hidden for everyone
// else too, but that is convenience — not the enforcement point.
// ---------------------------------------------------------------------------

interface InventoryRow {
  name: string
  category: string
  wiring: string
  active: boolean
  range: string | null
  installed: string | null
  wanted: string | null
  latest: string | null
  updateStatus: 'current' | 'minor-update' | 'major-update' | 'unknown'
  rangeStatus: 'in-range' | 'pinned' | 'outside-range' | null
  updateAvailable: boolean
  majorUpdate: boolean
  registryCacheHit: boolean | null
  purpose: string | null
  addedBecause: string | null
}

interface InventoryData {
  generatedAt: string
  registryCache: { ttlHours: number; entries: number }
  registryErrors: number
  rows: InventoryRow[]
  flags: { undocumented: string[]; unconfigured: string[] }
}

type FilterKey = 'all' | 'update' | 'major' | 'unused'

// Palette tokens (same pattern as SiteFilteredNav / FieldBuilder).
const C = {
  text: 'var(--theme-text)',
  muted: 'var(--theme-elevation-800)',
  elevation0: 'var(--theme-elevation-0)',
  elevation100: 'var(--theme-elevation-100)',
  elevation150: 'var(--theme-elevation-150)',
  elevation200: 'var(--theme-elevation-200)',
  success: 'var(--theme-success-500, #34d399)',
  error: 'var(--theme-error-500, #f87171)',
  warning: 'var(--theme-warning-500, #fbbf24)',
  info: 'var(--theme-elevation-800)',
}

// Inline styles — no Tailwind (Payload admin CSS conflicts).
const S: Record<string, React.CSSProperties> = {
  wrap: {
    // Fill the admin template's content area — no maxWidth cap (the bare
    // page needed one; inside DefaultTemplate the area is already bounded).
    padding: '1.5rem',
    width: '100%',
    color: C.text,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '1rem',
    flexWrap: 'wrap',
    marginBottom: '0.25rem',
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: 700,
    margin: 0,
  },
  meta: {
    fontSize: '0.8125rem',
    color: C.muted,
    margin: '0 0 1rem',
  },
  controls: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    flexWrap: 'wrap',
    marginBottom: '1rem',
  },
  search: {
    appearance: 'none',
    background: C.elevation100,
    border: `1px solid ${C.elevation150}`,
    borderRadius: '6px',
    color: C.text,
    padding: '0.5rem 0.75rem',
    fontSize: '0.875rem',
    minWidth: '16rem',
  },
  chip: {
    appearance: 'none',
    border: `1px solid ${C.elevation150}`,
    background: C.elevation100,
    color: C.text,
    borderRadius: '999px',
    padding: '0.375rem 0.75rem',
    fontSize: '0.8125rem',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background 150ms ease, border-color 150ms ease',
    whiteSpace: 'nowrap',
  },
  chipActive: {
    background: C.elevation200,
    // Full border shorthand — React warns when borderColor overrides part of
    // the `border` shorthand set on the base chip style.
    border: `1px solid ${C.text}`,
  },
  button: {
    appearance: 'none',
    border: `1px solid ${C.elevation150}`,
    background: C.elevation100,
    color: C.text,
    borderRadius: '6px',
    padding: '0.5rem 1rem',
    fontSize: '0.875rem',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background 150ms ease',
  },
  banner: {
    borderRadius: '6px',
    padding: '0.75rem 1rem',
    fontSize: '0.875rem',
    marginBottom: '1rem',
    background: C.elevation100,
    border: `1px solid ${C.elevation150}`,
    lineHeight: 1.5,
  },
  tableWrap: {
    overflowX: 'auto',
    border: `1px solid ${C.elevation150}`,
    borderRadius: '6px',
    background: C.elevation0,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '0.875rem',
    minWidth: '62rem',
  },
  th: {
    textAlign: 'left',
    padding: '0.625rem 0.875rem',
    fontSize: '0.75rem',
    fontWeight: 600,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    color: C.muted,
    borderBottom: `1px solid ${C.elevation150}`,
    whiteSpace: 'nowrap',
  },
  td: {
    padding: '0.625rem 0.875rem',
    borderBottom: `1px solid ${C.elevation100}`,
    verticalAlign: 'top',
    lineHeight: 1.5,
  },
  sectionRow: {
    background: C.elevation100,
    borderBottom: `1px solid ${C.elevation150}`,
  },
  sectionLabel: {
    padding: '0.5rem 0.875rem',
    fontSize: '0.75rem',
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: C.muted,
  },
  coreRow: {
    background: C.elevation100,
  },
  pkg: {
    fontWeight: 600,
    fontFamily: 'monospace',
    fontSize: '0.8125rem',
    whiteSpace: 'nowrap',
  },
  badge: {
    display: 'inline-block',
    borderRadius: '999px',
    padding: '0.125rem 0.5rem',
    fontSize: '0.75rem',
    fontWeight: 600,
    whiteSpace: 'nowrap',
  },
  dim: { color: C.muted, fontSize: '0.8125rem' },
  monoDim: {
    color: C.muted,
    fontFamily: 'monospace',
    fontSize: '0.8125rem',
  },
  state: {
    padding: '3rem 1.5rem',
    textAlign: 'center',
    color: C.muted,
    fontSize: '0.9375rem',
  },
}

function Badge({
  tone,
  children,
}: {
  tone: 'success' | 'error' | 'warning' | 'info'
  children: React.ReactNode
}) {
  const color = { success: C.success, error: C.error, warning: C.warning, info: C.info }[tone]
  return (
    <span
      style={{
        ...S.badge,
        color,
        border: `1px solid ${color}`,
        background: 'transparent',
      }}
    >
      {children}
    </span>
  )
}

function rangeNote(row: InventoryRow): string | null {
  if (row.updateStatus === 'minor-update') {
    if (row.rangeStatus === 'in-range') return 'in range'
    if (row.rangeStatus === 'pinned') return 'pinned — needs a package.json change'
    if (row.rangeStatus === 'outside-range') return 'outside declared range'
  }
  if (row.updateStatus === 'major-update' && row.rangeStatus === 'outside-range') {
    return 'outside declared range'
  }
  return null
}

function StatusCell({ row }: { row: InventoryRow }) {
  if (row.wiring === 'unused') {
    return <Badge tone="warning">Unused</Badge>
  }
  if (row.updateStatus === 'major-update') {
    return (
      <div>
        <Badge tone="error">Major update — breaking risk</Badge>
        {rangeNote(row) && <div style={S.dim}>{rangeNote(row)}</div>}
      </div>
    )
  }
  if (row.updateStatus === 'minor-update') {
    return (
      <div>
        <Badge tone="warning">Update available</Badge>
        {rangeNote(row) && <div style={S.dim}>{rangeNote(row)}</div>}
      </div>
    )
  }
  if (row.updateStatus === 'current') {
    return <Badge tone="info">Current</Badge>
  }
  return <span style={S.dim}>n/a</span>
}

export const PluginInventoryClient: React.FC = () => {
  const [data, setData] = useState<InventoryData | null>(null)
  const [state, setState] = useState<'loading' | 'forbidden' | 'error' | 'ready'>('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<FilterKey>('all')

  const load = useCallback(async () => {
    setState('loading')
    setErrorMsg('')
    try {
      const res = await fetch('/api/plugin-inventory', { credentials: 'include' })
      if (res.status === 401 || res.status === 403) {
        setState('forbidden')
        return
      }
      if (!res.ok) throw new Error(`Request failed (${res.status})`)
      setData((await res.json()) as InventoryData)
      setState('ready')
    } catch (err) {
      setState('error')
      setErrorMsg(err instanceof Error ? err.message : String(err))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const visibleRows = useMemo(() => {
    if (!data) return []
    const q = query.trim().toLowerCase()
    return data.rows.filter((row) => {
      const matchesFilter =
        filter === 'all' ||
        (filter === 'update' && row.updateStatus === 'minor-update') ||
        (filter === 'major' && row.updateStatus === 'major-update') ||
        (filter === 'unused' && row.wiring === 'unused')
      if (!matchesFilter) return false
      if (!q) return true
      const haystack = `${row.name} ${row.purpose ?? ''} ${row.addedBecause ?? ''}`.toLowerCase()
      return haystack.includes(q)
    })
  }, [data, query, filter])

  const counts = useMemo(() => {
    if (!data) return { all: 0, update: 0, major: 0, unused: 0 }
    return {
      all: data.rows.length,
      update: data.rows.filter((r) => r.updateStatus === 'minor-update').length,
      major: data.rows.filter((r) => r.updateStatus === 'major-update').length,
      unused: data.rows.filter((r) => r.wiring === 'unused').length,
    }
  }, [data])

  let content: React.ReactNode
  if (state === 'loading') {
    content = (
      <div style={S.state} role="status" aria-live="polite">
        Loading plugin inventory…
      </div>
    )
  } else if (state === 'forbidden') {
    content = (
      <div style={S.state} role="alert">
        <h2 style={S.title}>Access denied</h2>
        <p>Plugin inventory is restricted to super-admins.</p>
      </div>
    )
  } else if (state === 'error' || !data) {
    content = (
      <div style={S.state} role="alert">
        <h2 style={S.title}>Could not load inventory</h2>
        <p>{errorMsg || 'Unknown error'}</p>
        <button type="button" style={S.button} onClick={() => void load()}>
          Retry
        </button>
      </div>
    )
  } else {
    const { rows, flags, registryCache, registryErrors, generatedAt } = data
    const coreRow = rows.find((r) => r.name === 'payload')
    const otherRows = rows.filter((r) => r.name !== 'payload')

    const chips: Array<{ key: FilterKey; label: string; count: number }> = [
      { key: 'all', label: 'All', count: counts.all },
      { key: 'update', label: 'Update available', count: counts.update },
      { key: 'major', label: 'Major update risk', count: counts.major },
      { key: 'unused', label: 'Unused', count: counts.unused },
    ]

    content = (
      <div style={S.wrap}>
        <div style={S.header}>
          <h1 style={S.title}>Plugin Inventory</h1>
          <button
            type="button"
            style={S.button}
            onClick={() => void load()}
            aria-label="Refresh plugin inventory"
          >
            Refresh
          </button>
        </div>
        <p style={S.meta}>
          Generated {new Date(generatedAt).toLocaleString()} · registry cache:{' '}
          {registryCache.ttlHours}h TTL ({registryCache.entries} entries
          {registryErrors ? `, ${registryErrors} fetch errors` : ''}) · versions per package.json
          ranges — exact pins are intentional
        </p>

        <div style={S.controls} role="group" aria-label="Filter plugins">
          <input
            type="search"
            placeholder="Search package name or purpose…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={S.search}
            aria-label="Search package name or purpose"
          />
          {chips.map(({ key, label, count }) => (
            <button
              key={key}
              type="button"
              style={filter === key ? { ...S.chip, ...S.chipActive } : S.chip}
              onClick={() => setFilter(key)}
              aria-pressed={filter === key}
            >
              {label} ({count})
            </button>
          ))}
        </div>

        {(flags.undocumented.length > 0 || flags.unconfigured.length > 0) && (
          <div style={S.banner} role="note">
            {flags.undocumented.length > 0 && (
              <div>
                <strong>Missing purpose annotations</strong> (add to
                docs/payload/plugin-purposes.ts): {flags.undocumented.join(', ')}
              </div>
            )}
            {flags.unconfigured.length > 0 && (
              <div>
                <strong>Wired in config but not annotated:</strong> {flags.unconfigured.join(', ')}
              </div>
            )}
          </div>
        )}

        <div style={S.tableWrap}>
          <table style={S.table}>
            <thead>
              <tr>
                <th scope="col" style={S.th}>
                  Package
                </th>
                <th scope="col" style={S.th}>
                  Purpose
                </th>
                <th scope="col" style={S.th}>
                  Wiring
                </th>
                <th scope="col" style={S.th}>
                  Installed
                </th>
                <th scope="col" style={S.th}>
                  Wanted
                </th>
                <th scope="col" style={S.th}>
                  Latest
                </th>
                <th scope="col" style={S.th}>
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {coreRow && (
                <>
                  <tr style={S.sectionRow}>
                    <th colSpan={7} scope="colgroup" style={S.sectionLabel}>
                      Payload Core
                    </th>
                  </tr>
                  <tr style={S.coreRow}>
                    <td style={S.td}>
                      <span style={S.pkg}>{coreRow.name}</span>
                    </td>
                    <td style={S.td}>
                      {coreRow.purpose ?? <span style={S.dim}>No annotation</span>}
                      {coreRow.addedBecause && <div style={S.dim}>Why: {coreRow.addedBecause}</div>}
                    </td>
                    <td style={S.td}>
                      <Badge tone="info">{coreRow.wiring}</Badge>
                    </td>
                    <td style={S.td}>{coreRow.installed ?? <span style={S.dim}>n/a</span>}</td>
                    <td style={S.td}>
                      {coreRow.wanted ?? <span style={S.dim}>n/a</span>}
                      {coreRow.range && <div style={S.monoDim}>range: {coreRow.range}</div>}
                    </td>
                    <td style={S.td}>{coreRow.latest ?? <span style={S.dim}>n/a</span>}</td>
                    <td style={S.td}>
                      <StatusCell row={coreRow} />
                    </td>
                  </tr>
                  <tr style={S.sectionRow}>
                    <th colSpan={7} scope="colgroup" style={S.sectionLabel}>
                      Plugins &amp; Packages
                    </th>
                  </tr>
                </>
              )}
              {visibleRows
                .filter((row) => row.name !== 'payload')
                .map((row) => (
                  <tr key={row.name}>
                    <td style={S.td}>
                      <span style={S.pkg}>{row.name}</span>
                    </td>
                    <td style={S.td}>
                      {row.purpose ?? <span style={S.dim}>No annotation</span>}
                      {row.addedBecause && <div style={S.dim}>Why: {row.addedBecause}</div>}
                    </td>
                    <td style={S.td}>
                      <Badge
                        tone={
                          row.wiring === 'unused'
                            ? 'warning'
                            : row.wiring === 'undocumented'
                              ? 'error'
                              : 'info'
                        }
                      >
                        {row.wiring}
                      </Badge>
                    </td>
                    <td style={S.td}>{row.installed ?? <span style={S.dim}>n/a</span>}</td>
                    <td style={S.td}>
                      {row.wanted ?? <span style={S.dim}>n/a</span>}
                      {row.range && <div style={S.monoDim}>range: {row.range}</div>}
                    </td>
                    <td style={S.td}>{row.latest ?? <span style={S.dim}>n/a</span>}</td>
                    <td style={S.td}>
                      <StatusCell row={row} />
                    </td>
                  </tr>
                ))}
              {visibleRows.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ ...S.td, textAlign: 'center', color: C.muted }}>
                    No packages match the current search / filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return <>{content}</>
}
