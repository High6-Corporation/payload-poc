/**
 * Shared utility for site-scoped queries in the Payload POC frontend.
 *
 * Implements the required two-step slug→ID resolution pattern:
 *   1. Resolve site slug → site ID via payload.find on 'sites' collection
 *   2. Validate the result is a 24-character hex MongoDB ObjectId
 *
 * DO NOT filter directly by slug on the site field — passing a non-ObjectId
 * string silently returns null-site seed data instead of 0 results.
 */

import configPromise from '@payload-config'
import { getPayload, type Where } from 'payload'

const VALID_OBJECT_ID_RE = /^[a-f0-9]{24}$/

/**
 * Step 1 & 2: Resolve a site slug to a validated site ID.
 *
 * Returns the site ObjectId string if found and valid, or null if:
 * - The slug is undefined/empty
 * - No site with that slug exists
 * - The resolved ID is not a valid 24-char hex ObjectId
 */
export async function resolveSiteIdFromSlug(slug: string | undefined): Promise<string | null> {
  if (!slug) return null

  const payload = await getPayload({ config: configPromise })

  const { docs } = await payload.find({
    collection: 'sites',
    where: { slug: { equals: slug } },
    depth: 0,
    pagination: false,
  })

  const site = docs?.[0]
  if (!site) return null

  // Guard: the resolved ID must be a valid MongoDB ObjectId
  if (!VALID_OBJECT_ID_RE.test(site.id)) return null

  return site.id
}

/**
 * Step 3: Build a site-scoped where clause.
 *
 * Returns a where condition suitable for payload.find():
 *   { site: { equals: siteId } }
 *
 * This matches the KNOWN-WORKING pattern verified in the test-tenant-fetch page.
 * Does NOT wrap in `and` — callers that need to merge multiple conditions
 * should build their own `and` array.
 *
 * The `exists: true` is omitted intentionally — `equals` against a valid
 * ObjectId already excludes null-site and wrong-site documents.
 * The `exists` operator on relationship fields can behave unexpectedly
 * in Payload's query builder.
 *
 * Returns `undefined` when no valid siteId is provided, so callers can
 * spread conditionally: `...(siteWhere ? { where: siteWhere } : {})`
 */
export function buildSiteWhereClause(siteId: string | null | undefined): Where | undefined {
  if (!siteId) return undefined

  return { site: { equals: siteId } } as Where
}

/**
 * Reverse lookup: resolve a site ObjectId → site slug.
 *
 * Used when a page document has a `site` field (the ID) and we need the
 * human-readable slug for use in URLs or cookies.
 *
 * Returns the site slug string if found and valid, or null if:
 * - The siteId is undefined/empty
 * - The siteId is not a valid 24-char hex ObjectId
 * - No site with that ID exists
 */
export async function resolveSiteSlugFromId(
  siteId: string | null | undefined,
): Promise<string | null> {
  if (!siteId) return null
  if (!VALID_OBJECT_ID_RE.test(siteId)) return null

  const payload = await getPayload({ config: configPromise })

  try {
    const site = await payload.findByID({
      collection: 'sites',
      id: siteId,
      depth: 0,
    })
    return site?.slug ?? null
  } catch {
    return null
  }
}

/**
 * Derive the tenant ID from a site slug.
 *
 * Resolves: site slug → site → site.tenant → tenant ID.
 * Used by pages/posts routes that are still tenant-scoped via the
 * multi-tenant plugin and need a tenant ID for query filtering.
 *
 * Returns the tenant ObjectId string if found, or null if the
 * site slug is unknown or has no tenant.
 */
export async function resolveTenantIdFromSiteSlug(
  slug: string | undefined,
): Promise<string | null> {
  if (!slug) return null

  const payload = await getPayload({ config: configPromise })

  const { docs } = await payload.find({
    collection: 'sites',
    where: { slug: { equals: slug } },
    depth: 1,
    pagination: false,
  })

  const site = docs?.[0]
  if (!site) return null

  // site.tenant is a relationship — it may be a populated object or a raw ID
  const tenantId =
    typeof site.tenant === 'string'
      ? site.tenant
      : ((site.tenant as { id?: string } | undefined)?.id ?? null)

  if (!tenantId || !VALID_OBJECT_ID_RE.test(tenantId)) return null

  return tenantId
}
