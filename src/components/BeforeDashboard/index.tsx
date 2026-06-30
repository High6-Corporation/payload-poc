'use client'

import React, { useEffect, useState } from 'react'

import type { DashboardResponse } from '@/app/(payload)/api/dashboard/route'

import './index.scss'

const baseClass = 'before-dashboard'

// ── Quick actions (static) ─────────────────────────────────

interface QuickAction {
  label: string
  href: string
}

const quickActions: QuickAction[] = [
  { label: 'Add FAQ', href: '/admin/collections/faqs/create' },
  { label: 'Add Testimonial', href: '/admin/collections/testimonials/create' },
  { label: 'View Forms', href: '/admin/collections/forms' },
  { label: 'View Form Submissions', href: '/admin/collections/form-submissions' },
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

  // ── Loading state ──────────────────────────────────────

  if (loading) {
    return (
      <div className={baseClass}>
        <div className={`${baseClass}__card`}>
          <p className={`${baseClass}__loading`}>Loading dashboard…</p>
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
        <div className={`${baseClass}__actions`}>
          {quickActions.map((action) => (
            <a
              key={action.href}
              href={action.href}
              className={`${baseClass}__action-link`}
            >
              {action.label}
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}

export default BeforeDashboard
