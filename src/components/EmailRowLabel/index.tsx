'use client'

import React from 'react'
import { useRowLabel } from '@payloadcms/ui'

/**
 * RowLabel override for the `emails` array field on forms.
 *
 * Displays the email subject and recipient instead of the default
 * "Email 01" / "Email 02" numbering pattern.
 *
 * Falls back gracefully: shows whatever info is available (subject only,
 * recipient only, or the default row number if neither is filled).
 */
export const EmailRowLabel: React.FC = () => {
  const { data, rowNumber } = useRowLabel<{
    emailSubject?: string
    emailTo?: string
  }>()

  const subject = data?.emailSubject?.trim()
  const recipient = data?.emailTo?.trim()

  if (subject && recipient) {
    return (
      <span>
        {subject} — {recipient}
      </span>
    )
  }
  if (subject) {
    return <span>{subject}</span>
  }
  if (recipient) {
    return <span>{recipient}</span>
  }
  return <span>Email {String(rowNumber ?? 0).padStart(2, '0')}</span>
}
