import type { CollectionBeforeValidateHook } from 'payload'

/**
 * Enforce (tenant, site) uniqueness AND copy apiKey → _apiKey.
 *
 * - A tenant may have at most one default (site = null/undefined).
 * - A site may appear in at most one SmtpSettings document.
 * - The user-entered `apiKey` value is persisted to `_apiKey` (admin-hidden)
 *   so the raw key survives the afterRead mask.
 */
export const validateUniquePair: CollectionBeforeValidateHook = async ({
  data,
  originalDoc,
  req,
  collection,
}) => {
  // Copy apiKey to _apiKey for raw key storage (before afterRead masks it)
  if (data?.apiKey !== undefined) {
    data._apiKey = data.apiKey
  }

  if (!data?.tenant) return // let required-field validation handle it

  const tenantId = typeof data.tenant === 'string' ? data.tenant : data.tenant?.id || data.tenant
  const siteId = data.site
    ? typeof data.site === 'string'
      ? data.site
      : data.site?.id || data.site
    : undefined

  const docId = originalDoc?.id as string | undefined

  const where = {
    tenant: { equals: tenantId },
    ...(siteId ? { site: { equals: siteId } } : { site: { exists: false } }),
    ...(docId ? { id: { not_equals: docId } } : {}),
  }

  try {
    const { totalDocs } = await req.payload.count({
      collection: collection!.slug!,
      where,
      overrideAccess: true,
      req,
    })

    if (totalDocs > 0) {
      const conflictType = siteId
        ? 'A site-level override already exists for this site'
        : 'A tenant default already exists for this tenant'
      throw new Error(
        `${conflictType}. Each tenant may have one default config, ` +
          'and each site may have at most one override.',
      )
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('already exists')) throw err
    throw err // fail closed
  }
}
