'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { ChevronIcon, Link, SelectInput, useConfig, useAuth } from '@payloadcms/ui'
import { getCookie } from '@/utilities/admin-cookies'
import SiteSwitcher from '@/components/SiteSwitcher'
import { useTenantSelection } from '@payloadcms/plugin-multi-tenant/client'

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

/** Custom collection summary — subset of the custom-collections doc we need. */
interface CustomCollectionSummary {
  id: string
  name: string
  slug: string
}

/** Site doc subset — the disabledCollections blacklist. */
interface SiteData {
  disabledCollections: string[]
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

const NavGroup: React.FC<{
  label: string
  children: React.ReactNode
}> = ({ label, children }) => {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div
      className={`nav-group ${collapsed ? 'nav-group--collapsed' : ''}`}
      id={`nav-group-${label}`}
    >
      <button
        className={`nav-group__toggle nav-group__toggle--${collapsed ? 'collapsed' : 'open'}`}
        onClick={() => setCollapsed((prev) => !prev)}
        type="button"
      >
        <div className="nav-group__label">{label}</div>
        <ChevronIcon className="nav-group__indicator" direction={collapsed ? undefined : 'up'} />
      </button>
      <div className="nav-group__content" style={{ display: collapsed ? 'none' : 'block' }}>
        {children}
      </div>
    </div>
  )
}

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
// Tenant Selector (from multi-tenant plugin — replaces admin.components.beforeNav
// which is dropped when a custom Nav component is set)
// ---------------------------------------------------------------------------

const TenantSelector: React.FC = () => {
  const { options, selectedTenantID, setTenant } = useTenantSelection()

  const onChange = useCallback(
    (option: unknown) => {
      if (option && typeof option === 'object' && 'value' in option) {
        setTenant({ id: (option as { value: string }).value, refresh: true })
      }
    },
    [setTenant],
  )

  if (options.length <= 1) return null

  return (
    <div style={{ padding: '0.5rem 0' }}>
      <SelectInput
        name="siteFilteredNavTenant"
        onChange={onChange}
        options={options}
        path="setTenant"
        value={selectedTenantID as string | undefined}
        isClearable={false}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const SiteFilteredNav: React.FC = () => {
  const { config } = useConfig()
  const { permissions } = useAuth()

  // ---- Dynamic custom collections for the active site ----

  const [customCollections, setCustomCollections] = useState<CustomCollectionSummary[]>([])
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
        const collections: CustomCollectionSummary[] = Array.isArray(ccData.docs) ? ccData.docs : []

        // Fetch site's disabledCollections
        const siteRes = await fetch(`/api/sites/${encodeURIComponent(siteId!)}?depth=0`, {
          credentials: 'include',
        })
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

  // ---- Filtered per-collection links ----

  const filteredCustomCollections = React.useMemo(() => {
    if (!siteReady) return []
    return customCollections.filter((cc) => !disabledIds.includes(cc.id))
  }, [customCollections, disabledIds, siteReady])

  const adminRoute = config.routes?.admin || '/admin'

  // ---- Group collections by admin.group, applying permission filter ----

  const groupedCollections = React.useMemo(() => {
    const groups = new Map<string, ClientCollection[]>()
    const allCollections = (config.collections || []) as ClientCollection[]

    for (const col of allCollections) {
      // Skip custom-collections + custom-collection-entries — rendered in the
      // dedicated "Custom Content" group below (schema link always visible,
      // entries replaced by per-collection links)
      if (col.slug === 'custom-collections' || col.slug === 'custom-collection-entries') continue

      // Permission filter — only skip when explicitly denied.
      // Payload's permissions.collections[slug] may have shape { fields: {...} }
      // (for collections the user CAN access) rather than { read: { permission: true } }
      // for super-admin. Check for explicit denial (false), not missing shape (undefined).
      const colPerm = (permissions as any)?.collections?.[col.slug]
      if (colPerm?.read?.permission === false) continue

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
      // Only filter when explicitly denied — same logic as collections filter
      const globalPerm = (permissions as any)?.globals?.[g.slug]
      return globalPerm?.read?.permission !== false
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
    <nav
      className="nav__wrap"
      style={{
        backgroundColor: 'var(--theme-elevation-0)',
        color: 'var(--theme-text)',
        padding: '0 0.75rem',
      }}
    >
      {/* Tenant Selector (from multi-tenant plugin — was admin.components.beforeNav) */}
      <TenantSelector />

      {/* Dashboard */}
      <Link className="nav__link" href={adminRoute}>
        <span className="nav__link-label">Dashboard</span>
      </Link>

      {/* Collection groups */}
      {groupedCollections.map(([groupName, cols]) => (
        <NavGroup key={groupName} label={groupName}>
          {cols.map((col) => (
            <Link
              className="nav__link"
              key={col.slug}
              href={`${adminRoute}/collections/${col.slug}`}
            >
              <span className="nav__link-label">{colLabel(col)}</span>
            </Link>
          ))}
        </NavGroup>
      ))}

      {/* Globals */}
      {visibleGlobals.length > 0 && (
        <NavGroup key="__globals__" label="Globals">
          {visibleGlobals.map((g) => (
            <Link className="nav__link" key={g.slug} href={`${adminRoute}/globals/${g.slug}`}>
              <span className="nav__link-label">{g.label || g.slug}</span>
            </Link>
          ))}
        </NavGroup>
      )}

      {/* Custom Content (schema management + per-collection entries) */}
      <NavGroup label="Custom Content">
        <Link className="nav__link" href={`${adminRoute}/collections/custom-collections`}>
          <span className="nav__link-label">Custom Collections</span>
        </Link>
        {/* Per-collection links for this site */}
        {siteReady &&
          filteredCustomCollections.map((cc) => (
            <Link
              className="nav__link"
              key={cc.id}
              href={`${adminRoute}/collections/custom-collection-entries?where%5BparentCollection%5D%5Bequals%5D=${encodeURIComponent(cc.id)}`}
            >
              <span className="nav__link-label">{cc.name}</span>
            </Link>
          ))}
      </NavGroup>

      {/* Browse by Folder */}
      <Link className="nav__link browse-by-folder-button" href={`${adminRoute}/browse-by-folder`}>
        <span className="nav__link-label">Browse by Folder</span>
      </Link>

      {/* Site Switcher (moved from beforeNavLinks) */}
      <SiteSwitcher />

      {/* Logout */}
      <div className="nav__controls">
        <Link className="nav__log-out" href={`${adminRoute}/logout`} aria-label="Log out">
          <LogoutIcon />
        </Link>
      </div>
    </nav>
  )
}

export default SiteFilteredNav
