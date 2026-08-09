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
  Collections: 1,
  Globals: 2,
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
      <button className="nav__group-label" onClick={() => setOpen((prev) => !prev)} type="button">
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
    col.labels?.plural ||
    col.slug
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ')

  // ---- Render ----

  return (
    <nav>
      <div className="nav__wrap" style={S.navWrap}>
        {/* Dashboard */}
        <Link className="nav__link" href={adminRoute} style={S.dashboardLink}>
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
        <Link className="nav__link browse-by-folder-button" href={`${adminRoute}/browse-by-folder`}>
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
