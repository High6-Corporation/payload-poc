'use client'

import React from 'react'
import { useDocumentDrawer } from '@payloadcms/ui'

interface SubmissionItem {
  field?: string
  value?: unknown
}

/**
 * Cell component for the `submissionData` array column in list view.
 *
 * Instead of showing the array item count ("6 Submission Data"), extracts
 * an email or name from the submitted fields and renders that as the
 * identifying value.  Clicking the summary opens the full submission in
 * a document drawer (which renders the existing `SubmissionDataField`
 * read-only label→value table).
 */
export const SubmissionDataCell: React.FC<{
  rowData?: Record<string, unknown>
  cellData?: SubmissionItem[]
}> = ({ rowData }) => {
  const items = (rowData?.submissionData as SubmissionItem[]) ?? []
  const docId = rowData?.id != null ? String(rowData.id) : undefined

  const [DocumentDrawer, DocumentDrawerToggler] = useDocumentDrawer({
    collectionSlug: 'form-submissions',
    id: docId,
  })

  let email: string | undefined
  let name: string | undefined

  for (const item of items) {
    if (item?.field && item?.value !== undefined && item?.value !== null) {
      const fieldName = item.field.toLowerCase().trim()
      const val = String(item.value).trim()
      if (val) {
        if (!email && (fieldName === 'email' || fieldName.includes('email'))) {
          email = val
        }
        if (
          !name &&
          (fieldName === 'name' ||
            fieldName === 'full_name' ||
            fieldName === 'fullname' ||
            fieldName.includes('name'))
        ) {
          name = val
        }
      }
    }
    if (email && name) break
  }

  const summary = email || name || `${items.length} fields`

  return (
    <>
      <DocumentDrawerToggler
        style={{
          cursor: 'pointer',
          color: 'var(--theme-elevation-800)',
          textDecoration: 'none',
          background: 'none',
          border: 'none',
          padding: 0,
          font: 'inherit',
        }}
      >
        {summary}
      </DocumentDrawerToggler>
      <DocumentDrawer />
    </>
  )
}
