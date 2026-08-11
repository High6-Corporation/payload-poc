'use client'

import React from 'react'
import { hasBasicSeo } from '@/utilities/seoChecklist'
import type { BasicSeoInput } from '@/utilities/seoChecklist'

// ---------------------------------------------------------------------------
// Palette tokens (matches SeoChecklistPanel pass/fail icon colors)
// ---------------------------------------------------------------------------

const C = {
  success500: 'var(--theme-success-500)',
  success100: 'var(--theme-success-100)',
  warning500: 'var(--theme-warning-500)',
  warning100: 'var(--theme-warning-100)',
  elevation400: 'var(--theme-elevation-400)',
  elevation800: 'var(--theme-elevation-800)',
}

// ---------------------------------------------------------------------------
// Inline SVG icons (same shapes as SeoChecklistPanel, shrunk for list cell)
// ---------------------------------------------------------------------------

const PassBadge: React.FC = () => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '5px',
      padding: '3px 9px',
      borderRadius: '12px',
      fontSize: '12px',
      fontWeight: 600,
      lineHeight: '18px',
      color: C.success500,
      backgroundColor: C.success100,
      border: `1px solid ${C.success500}`,
    }}
  >
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
    SEO Ready
  </span>
)

const FailBadge: React.FC = () => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '5px',
      padding: '3px 9px',
      borderRadius: '12px',
      fontSize: '12px',
      fontWeight: 600,
      lineHeight: '18px',
      color: C.warning500,
      backgroundColor: C.warning100,
      border: `1px solid ${C.warning500}`,
    }}
  >
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
    Needs SEO
  </span>
)

const NaBadge: React.FC = () => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '5px',
      padding: '3px 9px',
      borderRadius: '12px',
      fontSize: '12px',
      fontWeight: 500,
      lineHeight: '18px',
      color: C.elevation400,
      backgroundColor: 'transparent',
    }}
  >
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
    No SEO
  </span>
)

// ---------------------------------------------------------------------------
// Props — Payload cell component shape
// ---------------------------------------------------------------------------

interface CellProps {
  cellData?: unknown
  rowData?: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const SeoStatusCell: React.FC<CellProps> = ({ rowData }) => {
  // Extract SEO fields from row data (API response paths)
  const meta = (rowData?.meta as Record<string, unknown> | undefined) ?? {}

  const input: BasicSeoInput = {
    seoTitle: (meta.title as string) ?? '',
    metaDescription: (meta.description as string) ?? '',
    focusKeyword: (meta.focusKeyword as string) ?? '',
  }

  // If ALL fields are empty (never touched), show "No SEO" rather than a
  // false "Needs SEO" that would confuse editors who just haven't started.
  const title = (input.seoTitle ?? '').trim()
  const desc = (input.metaDescription ?? '').trim()
  const kw = (input.focusKeyword ?? '').trim()
  const allEmpty = title === '' && desc === '' && kw === ''

  if (allEmpty) return <NaBadge />

  const ok = hasBasicSeo(input)
  return ok ? <PassBadge /> : <FailBadge />
}
