// src/utilities/admin-cookies.ts

/**
 * Read a cookie value by name.
 *
 * Safe for SSR — returns null when `document` is unavailable.
 * Pattern extracted from SiteSwitcher and reused by SiteFilteredNav
 * and BeforeDashboard.
 */
export function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${name}=([^;]*)`),
  )
  return match ? decodeURIComponent(match[1]) : null
}
