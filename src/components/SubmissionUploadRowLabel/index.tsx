'use client'

import React from 'react'
import { useRowLabel } from '@payloadcms/ui'

/**
 * RowLabel override for the `submissionUploads` array field on form submissions.
 *
 * Displays the upload field name (e.g. "resume", "test-upload") instead of the
 * default "Submission Upload 01" / "Submission Upload 02" numbering pattern.
 *
 * Falls back gracefully: shows field name only, or the default row number if
 * the field name is not yet filled.
 */
export const SubmissionUploadRowLabel: React.FC = () => {
  const { data, rowNumber } = useRowLabel<{
    field?: string
  }>()

  const fieldName = data?.field?.trim()

  if (fieldName) {
    return <span>{fieldName}</span>
  }
  return <span>Submission Upload {String(rowNumber ?? 0).padStart(2, '0')}</span>
}
