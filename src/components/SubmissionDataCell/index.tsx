'use client'

import React from 'react'

interface SubmissionItem {
  field?: string
  value?: unknown
}

/**
 * Cell component for the `submissionData` array column in list view.
 *
 * Instead of showing the array item count ("6 Submission Data"), extracts
 * an email or name from the submitted fields and renders that as the
 * identifying value.
 *
 * Falls back to the array item count if neither is found.
 */
export const SubmissionDataCell: React.FC<{
  rowData?: Record<string, unknown>
  cellData?: SubmissionItem[]
}> = ({ rowData }) => {
  const items = (rowData?.submissionData as SubmissionItem[]) ?? []

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

  if (email) return <span>{email}</span>
  if (name) return <span>{name}</span>

  return <span>{items.length} fields</span>
}
