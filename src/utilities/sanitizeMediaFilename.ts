/**
 * Sanitize a filename for S3-compatible storage (Supabase).
 *
 * macOS screenshots contain U+202F (narrow non-breaking space) before AM/PM,
 * e.g. "Screenshot 2026-06-01 at 3.49.58 PM.png". These characters pass through
 * Payload's built-in sanitizeFilename (which only strips control chars 0x00-0x1F
 * and 0x80-0x9F) but cause S3 InvalidKey errors because Supabase Storage
 * rejects them.
 *
 * This function:
 * - Replaces all Unicode whitespace (including U+202F) with hyphens
 * - Strips characters unsafe for S3 object keys
 * - Collapses consecutive hyphens, trims leading/trailing hyphens
 * - Lowercases the result
 */
export const sanitizeMediaFilename = (filename: string): string => {
  // Split base name from extension (last dot)
  const lastDot = filename.lastIndexOf('.')
  const base = lastDot > 0 ? filename.slice(0, lastDot) : filename
  const ext = lastDot > 0 ? filename.slice(lastDot) : ''

  let sanitized = base

  // Replace all Unicode whitespace and space-like characters with hyphens.
  // U+00A0        non-breaking space
  // U+2000–U+200A en/em/ thin/hair spaces, etc.
  // U+200B        zero-width space
  // U+202F        narrow non-breaking space (macOS screenshots!)
  // U+205F        medium mathematical space
  // U+3000        ideographic space (CJK)
  // Also handles plain space U+0020
  sanitized = sanitized.replace(/[  -​  　\s]+/g, '-')

  // Remove characters unsafe for S3 object keys:
  // \ { } ^ % ` ] [ " ' > < ~ # |
  // Also remove any remaining non-ASCII characters as a safety net
  sanitized = sanitized.replace(/[\\{}^%`\]\["'><~#|]/g, '')
  sanitized = sanitized.replace(/[^\x00-\x7F]/g, '')

  // Collapse consecutive hyphens
  sanitized = sanitized.replace(/-+/g, '-')

  // Strip leading/trailing hyphens
  sanitized = sanitized.replace(/^-+|-+$/g, '')

  // Lowercase (S3 keys are case-sensitive; consistency avoids surprises)
  sanitized = sanitized.toLowerCase()

  return sanitized + ext.toLowerCase()
}
