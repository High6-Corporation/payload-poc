'use client'

import { useEffect } from 'react'

/**
 * Client component that syncs the tenant-slug cookie and dispatches a
 * custom event so the Header can reactively update nav links.
 *
 * Server components in Next.js App Router cannot call cookies().set(),
 * so this must be done client-side.
 */
export const TenantCookieSync: React.FC<{ tenantSlug?: string | null }> = ({ tenantSlug }) => {
  useEffect(() => {
    // Set or clear the tenant-slug cookie
    if (tenantSlug) {
      document.cookie = `tenant-slug=${tenantSlug}; path=/; SameSite=Lax`
    } else {
      document.cookie = 'tenant-slug=; path=/; max-age=0'
    }

    // Notify the Header (and any other listeners) that the tenant context changed
    window.dispatchEvent(new CustomEvent('tenant-changed', { detail: tenantSlug ?? null }))
  }, [tenantSlug])

  return null
}
