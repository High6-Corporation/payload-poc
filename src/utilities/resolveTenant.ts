/**
 * Shared utility for tenant-scoped queries in the Payload POC frontend.
 *
 * Implements the required two-step slug→ID resolution pattern:
 *   1. Resolve tenant slug → tenant ID via payload.find on 'tenants' collection
 *   2. Validate the result is a 24-character hex MongoDB ObjectId
 *
 * DO NOT filter directly by slug on the tenant field — passing a non-ObjectId
 * string silently returns null-tenant seed data instead of 0 results.
 */

import configPromise from '@payload-config'
import { getPayload, type Where } from 'payload'

const VALID_OBJECT_ID_RE = /^[a-f0-9]{24}$/

/**
 * Step 1 & 2: Resolve a tenant slug to a validated tenant ID.
 *
 * Returns the tenant ObjectId string if found and valid, or null if:
 * - The slug is undefined/empty
 * - No tenant with that slug exists
 * - The resolved ID is not a valid 24-char hex ObjectId
 */
export async function resolveTenantIdFromSlug(slug: string | undefined): Promise<string | null> {
  if (!slug) return null

  const payload = await getPayload({ config: configPromise })

  const { docs } = await payload.find({
    collection: 'tenants',
    where: { slug: { equals: slug } },
    depth: 0,
    pagination: false,
  })

  const tenant = docs?.[0]
  if (!tenant) return null

  // Guard: the resolved ID must be a valid MongoDB ObjectId
  if (!VALID_OBJECT_ID_RE.test(tenant.id)) return null

  return tenant.id
}

/**
 * Step 3: Build a tenant-scoped where clause.
 *
 * Returns a where condition suitable for payload.find():
 *   { tenant: { equals: tenantId } }
 *
 * This matches the KNOWN-WORKING pattern verified in the test-tenant-fetch page.
 * Does NOT wrap in `and` — callers that need to merge multiple conditions
 * should build their own `and` array.
 *
 * The `exists: true` is omitted intentionally — `equals` against a valid
 * ObjectId already excludes null-tenant and wrong-tenant documents.
 * The `exists` operator on relationship fields can behave unexpectedly
 * in Payload's query builder.
 *
 * Returns `undefined` when no valid tenantId is provided, so callers can
 * spread conditionally: `...(tenantWhere ? { where: tenantWhere } : {})`
 */
export function buildTenantWhereClause(tenantId: string | null | undefined): Where | undefined {
  if (!tenantId) return undefined

  return { tenant: { equals: tenantId } } as Where
}

/**
 * Reverse lookup: resolve a tenant ObjectId → tenant slug.
 *
 * Used when a page document has a `tenant` field (the ID) and we need the
 * human-readable slug for use in URLs or cookies.
 *
 * Returns the tenant slug string if found and valid, or null if:
 * - The tenantId is undefined/empty
 * - The tenantId is not a valid 24-char hex ObjectId
 * - No tenant with that ID exists
 */
export async function resolveTenantSlugFromId(
  tenantId: string | null | undefined,
): Promise<string | null> {
  if (!tenantId) return null
  if (!VALID_OBJECT_ID_RE.test(tenantId)) return null

  const payload = await getPayload({ config: configPromise })

  try {
    const tenant = await payload.findByID({
      collection: 'tenants',
      id: tenantId,
      depth: 0,
    })
    return tenant?.slug ?? null
  } catch {
    return null
  }
}
