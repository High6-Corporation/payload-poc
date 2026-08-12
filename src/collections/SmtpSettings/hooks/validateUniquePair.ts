import { APIError, type CollectionBeforeValidateHook } from 'payload'

/** True for server-side masked values that must never overwrite the raw key. */
function isMaskedOrPlaceholder(v: string): boolean {
  return v.includes('•') || v === '(key saved)'
}

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
  // Copy apiKey to _apiKey for raw key storage (before afterRead masks it).
  //
  // DATA SHAPE (verified empirically 2026-08-12): the apiKey/_apiKey fields
  // live inside the NAMED "smtp" tab, so hooks receive `data.smtp.apiKey`
  // (nested) — both from the admin form and the REST/local API.  Storage
  // and read responses are nested too (`smtp._apiKey`).  A flat fallback
  // (`data.apiKey`) is kept for robustness against other callers.
  //
  // Masked / placeholder values must never be copied to _apiKey: the admin
  // form serializes ALL registered fields on save (changed or not), so the
  // server-masked `apiKey` string rides along in every update payload.
  // Without this guard, a routine save of an unrelated field would
  // overwrite _apiKey with the mask and destroy the raw key.  SMTP2GO keys
  // are `api-` + alphanumerics, so bullets / "(key saved)" can only ever
  // be masks — see SmtpApiKeyField for the client side of this protection.
  //
  // The masked value is deliberately LEFT in the data (not deleted):
  // removing it makes Payload's required-field validation fail, because the
  // tab object is present so its children get validated.  The stored
  // apiKey value is inert — afterRead always regenerates the mask from
  // _apiKey, and nothing else reads the stored field.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const smtp = (data as any)?.smtp as Record<string, unknown> | undefined
  const apiKeyValue: unknown = smtp?.apiKey ?? (data as any)?.apiKey
  if (typeof apiKeyValue === 'string' && !isMaskedOrPlaceholder(apiKeyValue)) {
    if (smtp) smtp._apiKey = apiKeyValue
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    else (data as any)._apiKey = apiKeyValue
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
      throw new APIError(
        `${conflictType}. Each tenant may have one default config, ` +
          'and each site may have at most one override.',
        400,
        undefined, // no field-specific error
      )
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('already exists')) throw err
    throw err // fail closed
  }
}
