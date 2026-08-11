'use client'

import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { ChevronIcon, Link, SelectInput, useConfig, useAuth } from '@payloadcms/ui'
import { AdminLoading } from '@/components/ui/admin-loading'
import { getCookie } from '@/utilities/admin-cookies'
import SiteSwitcher from '@/components/SiteSwitcher'
import { useTenantSelection } from '@payloadcms/plugin-multi-tenant/client'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Payload collection shape from ClientConfig (subset we use). */
interface ClientCollection {
  slug: string
  admin?: { group?: string | false; hidden?: boolean }
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
        label="Tenant"
        name="siteFilteredNavTenant"
        onChange={onChange}
        options={options}
        path="setTenant"
        value={selectedTenantID as string | undefined}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const SiteFilteredNav: React.FC = () => {
  const { config } = useConfig()
  const { permissions, user } = useAuth()

  const isSuperAdmin = (user as any)?.roles?.includes('super-admin') ?? false

  // ---- Dynamic custom collections for the active site ----

  const tenantId = getCookie('payload-tenant')
  const siteId = getCookie('payload-site')

  // Seed tenantDisabledIds from sessionStorage so client-side navigations
  // don't flash unfiltered collections.  Keyed by tenantId so switching
  // tenants invalidates naturally.
  const tenantCacheKey = tenantId ? `tenant_disabled_${tenantId}` : null

  const [customCollections, setCustomCollections] = useState<CustomCollectionSummary[]>([])
  const [disabledIds, setDisabledIds] = useState<string[]>([])
  const [tenantDisabledIds, setTenantDisabledIds] = useState<string[]>([])
  const [siteReady, setSiteReady] = useState(false)

  // Full-page overlay gate — visible until tenant + site filtering data resolves.
  // Prevents the flash of unfiltered collections on first login.
  const [overlayVisible, setOverlayVisible] = useState(true)

  // Seed from sessionStorage synchronously before paint — avoids hydration
  // mismatch (server always renders []) and prevents flash on client navs.
  // If cached data exists, dismiss the overlay immediately — no need to gate
  // a subsequent navigation behind the same fetch.
  useLayoutEffect(() => {
    if (!tenantCacheKey) return
    try {
      const raw = sessionStorage.getItem(tenantCacheKey)
      if (raw) {
        setTenantDisabledIds(JSON.parse(raw))
        setOverlayVisible(false)
      }
    } catch {
      /* non-critical */
    }
  }, [tenantCacheKey])

  useEffect(() => {
    if (!siteId || !tenantId) {
      setSiteReady(false)
      setCustomCollections([])
      setDisabledIds([])
      setTenantDisabledIds([])
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

        // Also fetch tenant-level disabledCollections for standard collections
        try {
          const tenantRes = await fetch(`/api/tenants/${encodeURIComponent(tenantId!)}?depth=0`, {
            credentials: 'include',
          })
          if (!cancelled && tenantRes.ok) {
            const tenantData = await tenantRes.json()
            const tenantDisabled: string[] = Array.isArray(tenantData.disabledCollections)
              ? tenantData.disabledCollections
              : []
            if (!cancelled) {
              setTenantDisabledIds(tenantDisabled)
              setOverlayVisible(false)
              // Persist so remounts (nav clicks) read the correct value instantly
              try {
                sessionStorage.setItem(
                  `tenant_disabled_${tenantId!}`,
                  JSON.stringify(tenantDisabled),
                )
              } catch {
                /* quota exceeded — non-critical */
              }
            }
          }
        } catch {
          /* tenant fetch is non-critical */
          if (!cancelled) setOverlayVisible(false)
        }
      } catch (err) {
        console.error('[SiteFilteredNav] Failed to load site data:', err)
        if (!cancelled) {
          setCustomCollections([])
          setDisabledIds([])
          setSiteReady(false)
          setOverlayVisible(false)
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
      // Skip custom-collection-entries (replaced by per-collection links)
      // and custom-collections (rendered in manual Custom Content group)
      if (col.slug === 'custom-collections' || col.slug === 'custom-collection-entries') continue

      // Skip Payload internal/system collections (payload-jobs, payload-kv, etc.)
      if (col.slug.startsWith('payload-')) continue

      // Hard-restrict sensitive admin collections to super-admin only.
      // These must NEVER be visible to a tenant-admin — hard role check, not a
      // toggle, no exceptions.
      const SUPER_ADMIN_ONLY_SLUGS = ['tenants', 'users', 'portal-clients', 'agent-audit-log']
      if (SUPER_ADMIN_ONLY_SLUGS.includes(col.slug) && !isSuperAdmin) continue

      // Filter standard collections against tenant's disabledCollections blacklist.
      // Custom Collections use the site-level disabledIds filter (handled separately).
      // Applies to all users — super-admins see the toggle's effect too.
      const builtinKey = `builtin:${col.slug}`
      if (tenantDisabledIds.includes(builtinKey)) continue

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
  }, [config.collections, permissions, tenantDisabledIds, isSuperAdmin])

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
    <>
      <AdminLoading mode="fullpage" show={overlayVisible} minDisplayMs={300} />
      <nav
        className="nav__wrap"
        style={{
          backgroundColor: '#0a0e1a',
          color: 'rgba(255, 255, 255, 0.85)',
          minHeight: '100vh',
          position: 'sticky',
          top: 0,
          padding: '4rem 1.25rem 1rem',
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
        <Link
          className="nav__log-out"
          href={`${adminRoute}/logout`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.5rem 0',
            color: 'inherit',
            textDecoration: 'none',
          }}
        >
          <LogoutIcon />
          <span>Log out</span>
        </Link>
      </nav>
    </>
  )
}

export default SiteFilteredNav
