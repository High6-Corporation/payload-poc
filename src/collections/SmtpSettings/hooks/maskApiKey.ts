import type { CollectionAfterReadHook } from 'payload'

/**
 * Replace `apiKey` with a masked form derived from `_apiKey`.
 *
 * After this hook runs, client-facing API responses contain only the
 * masked version.  Internal reads that need the raw key MUST bypass
 * Payload hooks entirely — read the raw MongoDB document directly
 * and use the `_apiKey` field.
 *
 * Mask pattern:  first 7 chars + bullets (capped at 20) + last 4 chars
 * Example:       "api-9A8••••••3F2a"
 */
export const maskApiKey: CollectionAfterReadHook = ({ doc }) => {
  if (doc?._apiKey && typeof doc._apiKey === 'string' && doc._apiKey.length >= 12) {
    const raw = doc._apiKey
    const bulletCount = Math.min(raw.length - 11, 20)
    doc.apiKey = raw.slice(0, 7) + '•'.repeat(bulletCount) + raw.slice(-4)
  } else if (doc?._apiKey) {
    // Key too short to mask meaningfully — show a generic placeholder
    doc.apiKey = '(key saved)'
  }
  // _apiKey is admin-hidden so it never reaches client responses anyway,
  // but strip it here as a defense-in-depth measure.
  delete doc._apiKey
  return doc
}
