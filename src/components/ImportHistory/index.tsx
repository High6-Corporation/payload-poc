'use client'

import React, { useCallback, useEffect, useState } from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Summary {
  imported: number
  updated: number
  total: number
  issues: number
}

interface HistoryDoc {
  id: string
  filename: string
  status: 'pending' | 'completed' | 'partial' | 'failed'
  summary?: Summary
  createdAt: string
}

// ---------------------------------------------------------------------------
// Payload admin CSS custom properties
// ---------------------------------------------------------------------------

const C = {
  text: 'var(--theme-text)',
  elevation0: 'var(--theme-elevation-0)',
  elevation100: 'var(--theme-elevation-100)',
  elevation150: 'var(--theme-elevation-150)',
  elevation200: 'var(--theme-elevation-200)',
  elevation400: 'var(--theme-elevation-400)',
  elevation500: 'var(--theme-elevation-500)',
  elevation800: 'var(--theme-elevation-800)',
  success500: 'var(--theme-success-500)',
  success100: 'var(--theme-success-100)',
  error500: 'var(--theme-error-500)',
  error50: 'var(--theme-error-50)',
  warning500: 'var(--theme-warning-500)',
  warning100: 'var(--theme-warning-100)',
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const S = {
  section: {
    border: `1px solid ${C.elevation150}`,
    borderRadius: '6px',
    overflow: 'hidden',
    backgroundColor: C.elevation0,
  } as React.CSSProperties,

  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 24px',
    borderBottom: `1px solid ${C.elevation150}`,
    backgroundColor: C.elevation100,
  } as React.CSSProperties,

  heading: {
    fontSize: '15px',
    fontWeight: 600,
    color: C.elevation800,
    margin: 0,
  } as React.CSSProperties,

  seeAll: {
    background: 'none',
    border: `1px solid ${C.elevation150}`,
    borderRadius: '4px',
    padding: '5px 14px',
    fontSize: '12px',
    color: C.elevation800,
    cursor: 'pointer',
    fontWeight: 500,
    textDecoration: 'none',
    display: 'inline-block',
  } as React.CSSProperties,

  body: {
    padding: '20px 24px',
  } as React.CSSProperties,

  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: '13px',
  } as React.CSSProperties,

  th: {
    textAlign: 'left' as const,
    padding: '8px 12px',
    color: C.elevation500,
    fontWeight: 500,
    fontSize: '11px',
    textTransform: 'uppercase' as const,
    borderBottom: `1px solid ${C.elevation150}`,
  } as React.CSSProperties,

  td: {
    padding: '10px 12px',
    color: C.elevation800,
    borderBottom: `1px solid ${C.elevation100}`,
  } as React.CSSProperties,

  link: {
    color: C.elevation800,
    textDecoration: 'none',
    fontWeight: 500,
    cursor: 'pointer',
  } as React.CSSProperties,

  badge: (color: string, bg: string): React.CSSProperties => ({
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: '3px',
    fontSize: '11px',
    fontWeight: 600,
    color,
    backgroundColor: bg,
    textTransform: 'uppercase' as const,
  }),

  empty: {
    padding: '28px 0',
    textAlign: 'center' as const,
    color: C.elevation500,
    fontSize: '13px',
  } as React.CSSProperties,

  loading: {
    padding: '4px 0',
    color: C.elevation500,
    fontSize: '13px',
  } as React.CSSProperties,

  error: {
    padding: '10px 14px',
    color: C.error500,
    backgroundColor: C.error50,
    borderRadius: '4px',
    fontSize: '12px',
    marginBottom: '12px',
  } as React.CSSProperties,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusBadge(status: HistoryDoc['status']) {
  switch (status) {
    case 'completed':
      return <span style={S.badge(C.success500, C.success100)}>Done</span>
    case 'partial':
      return <span style={S.badge(C.warning500, C.warning100)}>Partial</span>
    case 'failed':
      return <span style={S.badge(C.error500, C.error50)}>Failed</span>
    default:
      return <span style={S.badge(C.elevation500, C.elevation150)}>Pending</span>
  }
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

// ---------------------------------------------------------------------------
// Sub-component: one history table
// ---------------------------------------------------------------------------

function getTenantId(): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(/(?:^|;\s*)payload-tenant=([^;]*)/)
  return match ? decodeURIComponent(match[1]) : null
}

const HistoryTable: React.FC<{
  kind: 'imports' | 'exports'
  label: string
}> = ({ kind, label }) => {
  const [docs, setDocs] = useState<HistoryDoc[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const fetchDocs = useCallback(async () => {
    setLoading(true)
    setFetchError(null)
    try {
      const params = new URLSearchParams({
        depth: '0',
        limit: '5',
        sort: '-createdAt',
        'where[collectionSlug][equals]': 'custom-collection-entries',
      })
      // Scope to the active tenant when one is selected, so non-superadmin
      // users only see imports tied to their tenant's custom collections.
      // Payload doesn't support deep relationship filtering
      // (where[targetCollection.tenant]), so we fetch the tenant's
      // custom-collections first and filter by those IDs.
      const tenantId = getTenantId()
      if (tenantId && kind === 'imports') {
        try {
          const ccParams = new URLSearchParams({
            depth: '0',
            limit: '100',
            'where[tenant][equals]': tenantId,
          })
          const ccRes = await fetch(`/api/custom-collections?${ccParams}`, { credentials: 'include' })
          if (ccRes.ok) {
            const ccData = await ccRes.json()
            const ids: string[] = (ccData.docs as { id: string }[])?.map((d) => d.id) || []
            if (ids.length > 0) {
              ids.forEach((id, i) => {
                params.set(`where[targetCollection][in][${i}]`, id)
              })
            }
          }
        } catch {
          /* proceed without tenant filter */
        }
      }
      const res = await fetch(`/api/${kind}?${params}`, { credentials: 'include' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setDocs((data.docs as HistoryDoc[]) || [])
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [kind])

  useEffect(() => {
    fetchDocs()
  }, [fetchDocs])

  return (
    <div style={S.section}>
      <div style={S.header}>
        <h3 style={S.heading}>{label}</h3>
        <a href={`/admin/collections/${kind}`} style={S.seeAll}>
          See All →
        </a>
      </div>

      <div style={S.body}>
        {loading && <div style={S.loading}>Loading…</div>}

        {fetchError && <div style={S.error}>{fetchError}</div>}

        {!loading && !fetchError && docs && docs.length === 0 && (
          <div style={S.empty}>No {kind} yet.</div>
        )}

        {!loading && docs && docs.length > 0 && (
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>File</th>
                <th style={S.th}>Date</th>
                <th style={S.th}>Status</th>
                <th style={S.th}>Result</th>
              </tr>
            </thead>
            <tbody>
              {docs.map((doc) => (
                <tr key={doc.id}>
                  <td style={S.td}>
                    <a href={`/admin/collections/${kind}/${doc.id}`} style={S.link}>
                      {doc.filename || 'Unnamed'}
                    </a>
                  </td>
                  <td style={{ ...S.td, color: C.elevation500 }}>{formatDate(doc.createdAt)}</td>
                  <td style={S.td}>{statusBadge(doc.status)}</td>
                  <td style={{ ...S.td, color: C.elevation500 }}>
                    {doc.summary ? (
                      <>
                        {doc.summary.imported > 0 && (
                          <span style={{ color: C.success500, fontWeight: 600 }}>
                            {doc.summary.imported} created
                          </span>
                        )}
                        {doc.summary.imported > 0 && doc.summary.issues > 0 && ', '}
                        {doc.summary.issues > 0 && (
                          <span style={{ color: C.error500, fontWeight: 600 }}>
                            {doc.summary.issues} failed
                          </span>
                        )}
                        {doc.summary.imported === 0 && doc.summary.issues === 0 && '—'}
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

const outer: React.CSSProperties = {
  padding: '32px 24px 40px 24px',
  display: 'flex',
  flexDirection: 'column',
  gap: '20px',
}

export const ImportHistory: React.FC = () => {
  return (
    <div style={outer}>
      <HistoryTable kind="imports" label="Imports" />
      <HistoryTable kind="exports" label="Exports" />
    </div>
  )
}
