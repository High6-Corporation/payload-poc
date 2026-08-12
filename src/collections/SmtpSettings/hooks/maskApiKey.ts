import type { CollectionAfterReadHook } from 'payload'

/**
 * Replace `apiKey` with a masked form derived from `_apiKey`.
 *
 * After this hook runs, client-facing API responses contain only the
 * masked version.  Internal reads that need the raw key MUST bypass
 * Payload hooks entirely — read the raw MongoDB document directly
 * and use the `_apiKey` field.
 *
 * DATA SHAPE (verified empirically 2026-08-12): the apiKey/_apiKey fields
 * live inside the NAMED "smtp" tab, so the doc handed to this hook (and
 * the REST/local-API response) is nested — `doc.smtp._apiKey` is the raw
 * key, `doc.smtp.apiKey` is what gets masked.  Storage is nested too.
 * A flat fallback is kept for robustness against other shapes.
 *
 * Mask pattern:  first 7 chars + bullets (capped at 20) + last 4 chars
 * Example:       "api-9A8••••••3F2a"
 */
export const maskApiKey: CollectionAfterReadHook = ({ doc }) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const smtp = (doc as any)?.smtp as Record<string, unknown> | undefined
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = (smtp?._apiKey ?? (doc as any)?._apiKey) as string | undefined

  if (raw && typeof raw === 'string') {
    if (raw.length >= 12) {
      const bulletCount = Math.min(raw.length - 11, 20)
      const masked = raw.slice(0, 7) + '•'.repeat(bulletCount) + raw.slice(-4)
      if (smtp) smtp.apiKey = masked
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      else (doc as any).apiKey = masked
    } else if (smtp) {
      // Key too short to mask meaningfully — show a generic placeholder
      smtp.apiKey = '(key saved)'
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(doc as any).apiKey = '(key saved)'
    }
    // _apiKey is admin-hidden so it never reaches client responses anyway,
    // but strip it here as a defense-in-depth measure.
    if (smtp) delete smtp._apiKey
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    else delete (doc as any)._apiKey
  }
  return doc
}
