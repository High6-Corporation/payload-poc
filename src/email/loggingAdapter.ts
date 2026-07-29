import type { SendEmailOptions } from 'payload'

/**
 * Normalize nodemailer's `to` field to a readable string for logging.
 *
 * Nodemailer's `to` supports `string | Address | (string | Address)[]`.
 * Coerce all forms to a comma-joined string so the email-logs row is
 * scannable — `[object Object]` in the admin helps no one.
 */
export function normalizeTo(to: SendEmailOptions['to']): string {
  if (typeof to === 'string') {
    return to
  }
  if (Array.isArray(to)) {
    return to
      .map((entry) => (typeof entry === 'string' ? entry : entry?.address ?? ''))
      .filter(Boolean)
      .join(', ')
  }
  if (to && typeof to === 'object' && 'address' in to) {
    return (to as { address: string }).address
  }
  return String(to ?? '')
}
