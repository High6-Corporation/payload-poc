'use client'

import React from 'react'
import { useField, useDocumentInfo } from '@payloadcms/ui'

interface SubmissionValue {
  field?: string
  value?: unknown
}

/**
 * Read-only replacement for the default `submissionData` array field editor.
 *
 * Renders the submitted field/value pairs as a simple label → value table so
 * non-technical readers can understand what was submitted without seeing the
 * internal form-builder field/array structure.
 *
 * Registered via `formSubmissionOverrides` on the `submissionData` array field:
 *   Field: '@/components/SubmissionDataField#SubmissionDataField'
 */
export const SubmissionDataField: React.FC<{ path: string }> = ({ path }) => {
  const { value } = useField<SubmissionValue[]>({ path })
  const { initialData } = useDocumentInfo()

  // Prefer populated data from initialData, fall back to form state
  const submissions: SubmissionValue[] =
    (Array.isArray(value) && value.length > 0
      ? value
      : ((initialData as Record<string, unknown>)?.submissionData as SubmissionValue[])) ?? []

  if (submissions.length === 0) {
    return (
      <p
        style={{
          color: 'var(--theme-elevation-400)',
          fontSize: '0.875rem',
          padding: '1rem 0',
        }}
      >
        No submission data recorded.
      </p>
    )
  }

  const displayValue = (v: unknown): string => {
    if (v === null || v === undefined) return '—'
    if (typeof v === 'boolean') return v ? 'Yes' : 'No'
    if (typeof v === 'string') return v.trim() || '—'
    if (typeof v === 'number') return String(v)
    if (Array.isArray(v)) {
      // Could be an array of file references (submissionUploads moved here, or
      // multi-select values). Show count rather than raw JSON.
      if (v.length === 0) return '—'
      return v
        .map((item) => {
          if (typeof item === 'object' && item !== null && 'filename' in item)
            return String(item.filename)
          if (typeof item === 'string') return item
          return JSON.stringify(item)
        })
        .join(', ')
    }
    return JSON.stringify(v)
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        border: '1px solid var(--theme-elevation-200)',
        borderRadius: '6px',
        overflow: 'hidden',
        margin: '0.5rem 0',
      }}
    >
      {submissions.map((item, i) => {
        const label = item.field || `Field ${i + 1}`
        const val = displayValue(item.value)

        return (
          <div
            key={`${item.field ?? i}-${i}`}
            style={{
              display: 'flex',
              borderBottom:
                i < submissions.length - 1
                  ? '1px solid var(--theme-elevation-150)'
                  : 'none',
            }}
          >
            <div
              style={{
                flex: '0 0 200px',
                padding: '0.625rem 0.75rem',
                fontSize: '0.8125rem',
                fontWeight: 600,
                color: 'var(--theme-elevation-800)',
                backgroundColor: 'var(--theme-elevation-50)',
                borderRight: '1px solid var(--theme-elevation-150)',
                wordBreak: 'break-word',
              }}
            >
              {label}
            </div>
            <div
              style={{
                flex: 1,
                padding: '0.625rem 0.75rem',
                fontSize: '0.875rem',
                color: 'var(--theme-elevation-900)',
                wordBreak: 'break-word',
                whiteSpace: 'pre-wrap',
                minWidth: 0,
              }}
            >
              {val}
            </div>
          </div>
        )
      })}
    </div>
  )
}
