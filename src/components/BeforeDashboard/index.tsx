'use client'

import React, { useEffect, useState } from 'react'

import { AdminLoading } from '@/components/ui/admin-loading'
import { getCookie } from '@/utilities/admin-cookies'

import type { DashboardResponse } from '@/app/(payload)/api/dashboard/route'

import './index.scss'

const baseClass = 'before-dashboard'

// ── Quick actions (static) ─────────────────────────────────

interface QuickAction {
  label: string
  href: string
  /** Collection slug used for disabled-collection filtering (tenant-level: builtin:<slug>) */
  collectionSlug?: string
}

const quickActions: QuickAction[] = [
  { label: 'Create Page', href: '/admin/collections/pages/create', collectionSlug: 'pages' },
  { label: 'Write Post', href: '/admin/collections/posts/create', collectionSlug: 'posts' },
  { label: 'Upload Media', href: '/admin/collections/media/create', collectionSlug: 'media' },
  { label: 'Add FAQ', href: '/admin/collections/faqs/create', collectionSlug: 'faqs' },
  {
    label: 'Add Testimonial',
    href: '/admin/collections/testimonials/create',
    collectionSlug: 'testimonials',
  },
  {
    label: 'Add Portfolio Item',
    href: '/admin/collections/portfolio-items/create',
    collectionSlug: 'portfolio-items',
  },
  {
    label: 'Add Pricing Plan',
    href: '/admin/collections/pricing-plans/create',
    collectionSlug: 'pricing-plans',
  },
  { label: 'View Forms', href: '/admin/collections/forms', collectionSlug: 'forms' },
  {
    label: 'View Form Submissions',
    href: '/admin/collections/form-submissions',
    collectionSlug: 'form-submissions',
  },
]

// ── Stat card ──────────────────────────────────────────────

const StatCard: React.FC<{ label: string; count: number }> = ({ label, count }) => (
  <div className={`${baseClass}__stat-card`}>
    <span className={`${baseClass}__stat-count`}>{count.toLocaleString()}</span>
    <span className={`${baseClass}__stat-label`}>{label}</span>
  </div>
)

// ── Main component ─────────────────────────────────────────

const BeforeDashboard: React.FC = () => {
  const [data, setData] = useState<DashboardResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [disabledIds, setDisabledIds] = useState<string[]>([])
  const [disabledLoading, setDisabledLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function fetchData() {
      try {
        setLoading(true)
        setError(null)

        const res = await fetch('/api/dashboard')

        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || `Server error (${res.status})`)
        }

        const json: DashboardResponse = await res.json()

        if (!cancelled) {
          setData(json)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load dashboard')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    fetchData()

    return () => {
      cancelled = true
    }
  }, [])

  // Fetch active site + tenant disabledCollections for quick-action filtering
  useEffect(() => {
    const siteId = getCookie('payload-site')
    const tenantId = getCookie('payload-tenant')

    if (!siteId || !tenantId) {
      setDisabledIds([])
      setDisabledLoading(false)
      return
    }

    let cancelled = false

    async function load() {
      try {
        // Site-level disabled (custom collections)
        const siteRes = await fetch(`/api/sites/${encodeURIComponent(siteId!)}?depth=0`, {
          credentials: 'include',
        })
        let siteDisabled: string[] = []
        if (siteRes.ok) {
          const data = await siteRes.json()
          siteDisabled = Array.isArray(data.disabledCollections) ? data.disabledCollections : []
        }

        // Tenant-level disabled (standard collections)
        let tenantDisabled: string[] = []
        try {
          const tenantRes = await fetch(`/api/tenants/${encodeURIComponent(tenantId!)}?depth=0`, {
            credentials: 'include',
          })
          if (tenantRes.ok) {
            const data = await tenantRes.json()
            tenantDisabled = Array.isArray(data.disabledCollections) ? data.disabledCollections : []
          }
        } catch {
          /* tenant fetch is non-critical */
        }

        if (!cancelled) {
          setDisabledIds([...siteDisabled, ...tenantDisabled])
          setDisabledLoading(false)
        }
      } catch {
        // Silently fail — quick-action filtering is non-critical
        if (!cancelled) setDisabledLoading(false)
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [])

  // ── Loading state ──────────────────────────────────────

  if (loading) {
    return (
      <div className={baseClass}>
        <div className={`${baseClass}__card`}>
          <AdminLoading mode="inline" show />
        </div>
      </div>
    )
  }

  // ── Error state ────────────────────────────────────────

  if (error || !data) {
    return (
      <div className={baseClass}>
        <div className={`${baseClass}__card ${baseClass}__card--error`}>
          <h2>Dashboard Unavailable</h2>
          <p>{error || 'Could not load dashboard data.'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className={baseClass}>
      {/* ── Stat cards ─────────────────────────────────── */}
      <div className={`${baseClass}__stats-grid`}>
        <StatCard label="Tenants" count={data.tenants} />
        <StatCard label="Sites" count={data.sites} />
        <StatCard label="Collections" count={data.collections} />
      </div>

      {/* ── Quick actions ─────────────────────────────── */}
      <div className={`${baseClass}__card`}>
        <h2 className={`${baseClass}__section-title`}>Quick Actions</h2>
        {disabledLoading ? (
          <AdminLoading mode="inline" show />
        ) : (
          <div className={`${baseClass}__actions`}>
            {quickActions
              .filter((action) => {
                if (!action.collectionSlug) return true
                const builtinKey = `builtin:${action.collectionSlug}`
                return !disabledIds.includes(builtinKey)
              })
              .map((action) => (
                <a key={action.href} href={action.href} className={`${baseClass}__action-link`}>
                  {action.label}
                </a>
              ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default BeforeDashboard
