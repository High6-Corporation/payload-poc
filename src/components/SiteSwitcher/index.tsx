'use client'

import React, { useCallback, useEffect, useState } from 'react'

// ---------------------------------------------------------------------------
// Cookie helpers — same pattern as ImportHistory.getTenantId()
// ---------------------------------------------------------------------------

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

function setCookie(name: string, value: string): void {
  document.cookie = `${name}=${encodeURIComponent(value)};path=/`
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Site {
  id: string
  name: string
  url: string
}

interface Tenant {
  id: string
  name: string
  defaultSite?: string | { id: string; name: string }
}

// ---------------------------------------------------------------------------
// CSS custom properties (Payload admin theme)
// ---------------------------------------------------------------------------

const C = {
  text: 'var(--theme-text)',
  elevation0: 'var(--theme-elevation-0)',
  elevation100: 'var(--theme-elevation-100)',
  elevation150: 'var(--theme-elevation-150)',
  elevation200: 'var(--theme-elevation-200)',
  elevation800: 'var(--theme-elevation-800)',
  elevation900: 'var(--theme-elevation-900)',
  success500: 'var(--theme-success-500)',
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const SiteSwitcher: React.FC = () => {
  const [sites, setSites] = useState<Site[]>([])
  const [activeSiteId, setActiveSiteId] = useState<string | null>(null)
  const [tenant, setTenant] = useState<Tenant | null>(null)
  const [loading, setLoading] = useState(true)

  const tenantId = getCookie('payload-tenant')

  // Fetch tenant info + sites
  useEffect(() => {
    if (!tenantId) {
      setLoading(false)
      return
    }

    let cancelled = false

    async function load() {
      try {
        // Fetch tenant (for defaultSite)
        const tRes = await fetch(`/api/tenants/${tenantId}`, {
          credentials: 'include',
        })
        if (!tRes.ok) throw new Error('Failed to fetch tenant')
        const tenantData: Tenant = await tRes.json()

        // Fetch this tenant's sites
        const siteRes = await fetch(`/api/sites?where[tenant][equals]=${tenantId}&limit=50`, {
          credentials: 'include',
        })
        if (!siteRes.ok) throw new Error('Failed to fetch sites')
        const siteData = await siteRes.json()
        const siteList: Site[] = siteData.docs || []

        if (!cancelled) {
          setTenant(tenantData)
          setSites(siteList)

          // Determine active site
          const cookieSiteId = getCookie('payload-site')
          const validSite = siteList.find((s) => s.id === cookieSiteId)

          if (validSite) {
            setActiveSiteId(validSite.id)
          } else {
            // Fallback to tenant.defaultSite, then first site
            const defaultId =
              typeof tenantData.defaultSite === 'object'
                ? tenantData.defaultSite?.id
                : tenantData.defaultSite
            const fallbackId = defaultId || siteList[0]?.id || null
            if (fallbackId) {
              setCookie('payload-site', fallbackId)
              setActiveSiteId(fallbackId)
            }
          }
        }
      } catch {
        // Silently fail — site switcher is non-critical
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [tenantId])

  const handleChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const newSiteId = e.target.value
    setCookie('payload-site', newSiteId)
    setActiveSiteId(newSiteId)
    // Reload so any site-scoped data in the admin panel refreshes
    window.location.reload()
  }, [])

  // Don't render anything during loading
  if (loading) return null

  // No tenant selected — don't render
  if (!tenantId) return null

  // 0 or 1 sites — no need for a switcher
  if (sites.length <= 1) return null

  // TODO: site-level RBAC not yet implemented — any tenant member can
  // currently access any of the tenant's sites. When site-level access
  // control is added, filter the site list to only those the current
  // user is explicitly authorized for.

  const activeSite = sites.find((s) => s.id === activeSiteId)

  return (
    <div
      style={{
        padding: '0.5rem 0.75rem',
        borderTop: `1px solid ${C.elevation150}`,
      }}
    >
      <label
        htmlFor="site-switcher"
        style={{
          display: 'block',
          fontSize: '11px',
          fontWeight: 600,
          color: C.elevation800,
          textTransform: 'uppercase',
          marginBottom: '4px',
        }}
      >
        Site
      </label>
      <div style={{ position: 'relative' }}>
        <select
          id="site-switcher"
          value={activeSiteId ?? ''}
          onChange={handleChange}
          style={{
            width: '100%',
            padding: '4px 28px 4px 8px',
            fontSize: '13px',
            color: C.elevation900,
            backgroundColor: C.elevation100,
            border: `1px solid ${C.elevation200}`,
            borderRadius: '4px',
            appearance: 'none',
            cursor: 'pointer',
            lineHeight: '1.4',
          }}
        >
          {sites.map((site) => (
            <option key={site.id} value={site.id}>
              {site.name}
            </option>
          ))}
        </select>
        {/* Down chevron */}
        <svg
          style={{
            position: 'absolute',
            right: '8px',
            top: '50%',
            transform: 'translateY(-50%)',
            pointerEvents: 'none',
            width: '12px',
            height: '12px',
            color: C.elevation800,
          }}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </div>
      {activeSite && (
        <p
          style={{
            fontSize: '11px',
            color: C.success500,
            margin: '4px 0 0 0',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {activeSite.url}
        </p>
      )}
    </div>
  )
}

export default SiteSwitcher
