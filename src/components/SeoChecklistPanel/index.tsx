'use client'

import React, { useMemo } from 'react'
import { useField } from '@payloadcms/ui'

import { extractPlainText } from '@/utilities/extractPlainText'
import {
  evaluateSeoChecklist,
  SEO_STARTER_GUIDE_LABEL,
  SEO_STARTER_GUIDE_URL,
} from '@/utilities/seoChecklist'
import type { ChecklistItem, Recommendation } from '@/utilities/seoChecklist'

// ---------------------------------------------------------------------------
// Palette tokens (matches EntryDataField / SiteFilteredNav pattern)
// ---------------------------------------------------------------------------

const C = {
  text: 'var(--theme-text)',
  elevation0: 'var(--theme-elevation-0)',
  elevation100: 'var(--theme-elevation-100)',
  elevation150: 'var(--theme-elevation-150)',
  elevation200: 'var(--theme-elevation-200)',
  elevation400: 'var(--theme-elevation-400)',
  elevation500: 'var(--theme-elevation-500)',
  elevation800: 'var(--theme-elevation-800)',
  success500: 'var(--theme-success-500)',
  success100: 'var(--theme-success-100)',
  warning500: 'var(--theme-warning-500)',
  warning100: 'var(--theme-warning-100)',
  error500: 'var(--theme-error-500)',
  error50: 'var(--theme-error-50)',
}

// ---------------------------------------------------------------------------
// Inline styles (no Tailwind — Payload admin CSS conflicts)
// ---------------------------------------------------------------------------

const S = {
  panel: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '16px',
    marginTop: '4px',
  },

  // ---- Checklist ----

  checklist: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
    backgroundColor: C.elevation0,
    borderWidth: '1px' as const,
    borderStyle: 'solid' as const,
    borderColor: C.elevation150,
    borderRadius: '8px',
    overflow: 'hidden' as const,
  },

  checklistHeader: {
    display: 'flex',
    alignItems: 'center' as const,
    gap: '8px',
    padding: '10px 14px',
    fontSize: '13px',
    fontWeight: 600,
    color: C.elevation800,
    borderBottomWidth: '1px' as const,
    borderBottomStyle: 'solid' as const,
    borderBottomColor: C.elevation150,
    backgroundColor: C.elevation100,
  },

  itemRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    padding: '8px 14px',
    fontSize: '13px',
    lineHeight: '20px',
  },

  itemIcon: {
    flexShrink: 0,
    width: '18px',
    height: '18px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: '1px',
  },

  itemLabel: {
    flex: 1,
    fontWeight: 500,
  },

  itemDetail: {
    fontSize: '12px',
    lineHeight: '18px',
    marginTop: '1px',
  },

  // ---- Recommendations ----

  recommendations: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
    backgroundColor: C.elevation0,
    borderWidth: '1px' as const,
    borderStyle: 'solid' as const,
    borderColor: C.elevation150,
    borderRadius: '8px',
    overflow: 'hidden' as const,
  },

  recHeader: {
    display: 'flex',
    alignItems: 'center' as const,
    gap: '8px',
    padding: '10px 14px',
    fontSize: '13px',
    fontWeight: 600,
    color: C.elevation800,
    borderBottomWidth: '1px' as const,
    borderBottomStyle: 'solid' as const,
    borderBottomColor: C.elevation150,
    backgroundColor: C.elevation100,
  },

  recRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    padding: '8px 14px',
    fontSize: '13px',
    lineHeight: '20px',
  },

  recText: {
    flex: 1,
  },

  // ---- External link ----

  linkRow: {
    padding: '8px 14px',
    borderTopWidth: '1px' as const,
    borderTopStyle: 'solid' as const,
    borderTopColor: C.elevation150,
  },

  extLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '12px',
    color: C.elevation500,
    textDecoration: 'none',
  },

  // ---- Loading / empty ----

  emptyState: {
    padding: '20px 14px',
    textAlign: 'center' as const,
    fontSize: '13px',
    color: C.elevation500,
    fontStyle: 'italic',
  },
}

// ---------------------------------------------------------------------------
// Inline SVG icons
// ---------------------------------------------------------------------------

const PassIcon: React.FC = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke={C.success500}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="10" />
    <polyline points="9 12 11 14 15 10" />
  </svg>
)

const FailIcon: React.FC = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke={C.warning500}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
)

const NaIcon: React.FC = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke={C.elevation400}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="10" />
    <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
  </svg>
)

const ChecklistIcon: React.FC = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <polyline points="9 11 12 14 22 4" />
    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
  </svg>
)

const LightbulbIcon: React.FC = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M9 18h6" />
    <path d="M10 22h4" />
    <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" />
  </svg>
)

const ExternalLinkIcon: React.FC = () => (
  <svg
    width="12"
    height="12"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </svg>
)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const iconForStatus = (status: ChecklistItem['status']): React.ReactNode => {
  switch (status) {
    case 'pass':
      return <PassIcon />
    case 'fail':
      return <FailIcon />
    case 'na':
      return <NaIcon />
  }
}

const itemColor = (status: ChecklistItem['status']): string => {
  switch (status) {
    case 'pass':
      return C.success500
    case 'fail':
      return C.warning500
    case 'na':
      return C.elevation400
  }
}

const recColor = (status: Recommendation['status']): string => {
  switch (status) {
    case 'pass':
      return C.success500
    case 'fail':
      return C.warning500
    case 'na':
      return C.elevation500
  }
}

const recBg = (status: Recommendation['status']): string => {
  switch (status) {
    case 'pass':
      return C.success100
    case 'fail':
      return C.warning100
    case 'na':
      return 'transparent'
  }
}

const recDot = (status: Recommendation['status']): string => {
  switch (status) {
    case 'pass':
      return C.success500
    case 'fail':
      return C.warning500
    case 'na':
      return C.elevation400
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface ChecklistItemRowProps {
  item: ChecklistItem
}

const ChecklistItemRow: React.FC<ChecklistItemRowProps> = ({ item }) => (
  <div style={S.itemRow}>
    <div style={S.itemIcon}>{iconForStatus(item.status)}</div>
    <div>
      <div style={{ ...S.itemLabel, color: itemColor(item.status) }}>{item.label}</div>
      {item.detail && <div style={{ ...S.itemDetail, color: C.elevation500 }}>{item.detail}</div>}
    </div>
  </div>
)

interface RecommendationRowProps {
  rec: Recommendation
}

const RecommendationRow: React.FC<RecommendationRowProps> = ({ rec }) => (
  <div
    style={{
      ...S.recRow,
      backgroundColor: recBg(rec.status),
      borderTop: `1px solid ${C.elevation150}`,
    }}
  >
    <div
      style={{
        ...S.itemIcon,
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        backgroundColor: recDot(rec.status),
        marginTop: '6px',
        flexShrink: 0,
      }}
    />
    <div style={{ ...S.recText, color: C.elevation800 }}>{rec.message}</div>
  </div>
)

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const SeoChecklistPanel: React.FC = () => {
  // Watch all fields the checklist depends on
  const { value: focusKeyword } = useField<string>({ path: 'meta.focusKeyword' })
  const { value: seoTitle } = useField<string>({ path: 'meta.title' })
  const { value: metaDescription } = useField<string>({ path: 'meta.description' })
  const { value: slug } = useField<string>({ path: 'slug' })

  // Content is in different fields per collection — watch both
  const { value: lexicalContent } = useField({ path: 'content' })
  const { value: blocksLayout } = useField({ path: 'layout' })

  // Extract plain text from whichever content field has data
  const bodyText = useMemo(() => {
    const content = lexicalContent ?? blocksLayout ?? ''
    return extractPlainText(content)
  }, [lexicalContent, blocksLayout])

  // Evaluate checklist
  const result = useMemo(
    () =>
      evaluateSeoChecklist({
        focusKeyword: focusKeyword ?? '',
        seoTitle: seoTitle ?? '',
        metaDescription: metaDescription ?? '',
        slug: slug ?? '',
        content: bodyText,
      }),
    [focusKeyword, seoTitle, metaDescription, slug, bodyText],
  )

  const passCount = result.items.filter((i) => i.status === 'pass').length
  const failCount = result.items.filter((i) => i.status === 'fail').length
  const totalChecked = result.items.filter((i) => i.status !== 'na').length

  return (
    <div style={S.panel}>
      {/* ---- Checklist ---- */}
      <div style={S.checklist}>
        <div style={S.checklistHeader}>
          <ChecklistIcon />
          SEO Checklist
          {totalChecked > 0 && (
            <span style={{ fontWeight: 400, color: C.elevation500, marginLeft: 'auto' }}>
              {passCount}/{totalChecked} passing
            </span>
          )}
        </div>

        {result.items.map((item) => (
          <ChecklistItemRow key={item.id} item={item} />
        ))}
      </div>

      {/* ---- Recommendations ---- */}
      <div style={S.recommendations}>
        <div style={S.recHeader}>
          <LightbulbIcon />
          Recommendations
        </div>

        {result.recommendations.map((rec, i) => (
          <RecommendationRow key={i} rec={rec} />
        ))}

        {/* Canonical external link */}
        <div style={S.linkRow}>
          <a
            href={SEO_STARTER_GUIDE_URL}
            target="_blank"
            rel="noopener noreferrer"
            style={S.extLink}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = C.elevation800
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = C.elevation500
            }}
          >
            <ExternalLinkIcon />
            {SEO_STARTER_GUIDE_LABEL}
          </a>
        </div>
      </div>
    </div>
  )
}
