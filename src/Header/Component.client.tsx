'use client'
import { useHeaderTheme } from '@/providers/HeaderTheme'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import React, { useCallback, useEffect, useState } from 'react'

import type { Header } from '@/payload-types'

import { Logo } from '@/components/Logo/Logo'
import { HeaderNav } from './Nav'

interface HeaderClientProps {
  data: Header
}

function getTenantSlugFromCookie(): string | undefined {
  if (typeof document === 'undefined') return undefined
  const match = document.cookie.match(/(?:^|;\s*)tenant-slug=([^;]*)/)
  return match?.[1] || undefined
}

export const HeaderClient: React.FC<HeaderClientProps> = ({ data }) => {
  /* Storing the value in a useState to avoid hydration errors */
  const [theme, setTheme] = useState<string | null>(null)
  const [tenantSlug, setTenantSlug] = useState<string | undefined>(undefined)
  const { headerTheme, setHeaderTheme } = useHeaderTheme()
  const pathname = usePathname()

  // Reactively sync tenant slug from cookie + custom events
  const syncTenantSlug = useCallback(() => {
    setTenantSlug(getTenantSlugFromCookie())
  }, [])

  useEffect(() => {
    syncTenantSlug()
    window.addEventListener('tenant-changed', syncTenantSlug)
    return () => window.removeEventListener('tenant-changed', syncTenantSlug)
  }, [syncTenantSlug])

  useEffect(() => {
    setHeaderTheme(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  useEffect(() => {
    if (headerTheme && headerTheme !== theme) setTheme(headerTheme)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headerTheme])

  return (
    <header className="container relative z-20   " {...(theme ? { 'data-theme': theme } : {})}>
      <div className="py-8 flex justify-between">
        <Link href="/">
          <Logo loading="eager" priority="high" className="invert dark:invert-0" />
        </Link>
        <HeaderNav data={data} tenantSlug={tenantSlug} />
      </div>
    </header>
  )
}
