import type { Payload } from 'payload'

// Subset of SmtpSetting fields needed for sending — avoids importing payload-types
export interface ResolvedSmtpConfig {
  id: string
  apiKey: string
  apiRegion: 'us' | 'eu' | 'au'
  senderEmail: string
  forceSenderEmail: boolean
  senderName: string
  enabled: boolean
  enableLogging: boolean
  /** The site this config was resolved for, if any (for logging context) */
  resolvedForSite?: string
}

/**
 * Raw MongoDB collection name for the SmtpSettings collection (slug
 * `smtp-settings`). Payload's MongoDB adapter uses the slug AS-IS — the
 * hyphen is kept. VERIFIED empirically against the production database on
 * 2026-08-12 via `conn.db.listCollections()` (the collection exists and
 * holds the Task-1 verification docs). Do NOT "fix" this to `smtp_settings`
 * — a wrong collection name silently returns no docs.
 */
const SMTP_SETTINGS_COLLECTION = 'smtp-settings'

/**
 * Resolve the active SMTP config for a given tenant + optional site.
 *
 * Lookup order:
 *   1. Site-override: SmtpSettings where tenant = tenantId AND site = siteId
 *   2. Tenant-default:  SmtpSettings where tenant = tenantId AND site is null
 *   3. Error — no config exists for this tenant
 *
 * Disabled configs are still returned — the caller decides whether to
 * honour `enabled: false` (typically: skip sending, log a warning).
 */
export async function resolveSmtpConfig(
  payload: Payload,
  tenantId: string,
  siteId?: string,
): Promise<ResolvedSmtpConfig> {
  // 1. Try site-override first (via Payload API — handles relationship queries correctly)
  if (siteId) {
    const siteResult = await payload.find({
      collection: 'smtp-settings',
      where: {
        and: [{ tenant: { equals: tenantId } }, { site: { equals: siteId } }],
      },
      depth: 0,
      limit: 1,
      overrideAccess: true,
    })

    if (siteResult.docs.length > 0) {
      return docToConfig(payload, siteResult.docs[0] as unknown as Record<string, unknown>)
    }
  }

  // 2. Tenant-default fallback
  const tenantResult = await payload.find({
    collection: 'smtp-settings',
    where: {
      and: [{ tenant: { equals: tenantId } }, { site: { exists: false } }],
    },
    depth: 0,
    limit: 1,
    overrideAccess: true,
  })

  if (tenantResult.docs.length > 0) {
    return docToConfig(payload, tenantResult.docs[0] as unknown as Record<string, unknown>)
  }

  // 3. Fail loud
  throw new Error(
    `No SMTP config found for tenant "${tenantId}"` +
      (siteId ? ` (site "${siteId}")` : '') +
      '. Create a SmtpSettings document for this tenant before sending emails.',
  )
}

/**
 * Build a ResolvedSmtpConfig from a Payload doc, reading the raw `_apiKey`
 * from MongoDB directly to bypass the afterRead masking hook.
 *
 * The `maskApiKey` afterRead hook deletes `_apiKey` from every returned
 * doc, so the raw MongoDB read is the ONLY source of the real key.
 * If the raw read fails, we fail loud with the underlying cause rather
 * than guessing.
 */
async function docToConfig(
  payload: Payload,
  doc: Record<string, unknown>,
): Promise<ResolvedSmtpConfig> {
  // All SMTP fields live inside the named "smtp" tab, so both storage and
  // response docs carry them nested (`doc.smtp.apiKey`, `doc.smtp.apiRegion`,
  // ...).  Read nested-first with a flat fallback for robustness.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const smtp = (doc as any)?.smtp as Record<string, unknown> | undefined
  const get = (key: string): unknown => smtp?.[key] ?? doc[key]

  let apiKey = get('_apiKey') as string | undefined

  // _apiKey is stripped by the afterRead mask hook, so read it raw from
  // MongoDB via the mongoose connection's native db handle.
  //
  // DATA SHAPE (verified empirically 2026-08-12): the raw key is stored at
  // `smtp._apiKey` (nested).  A flat fallback is kept for robustness.
  let rawReadError: string | null = null
  if (!apiKey && doc.id) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const conn = (payload.db as any)?.connection
      if (conn?.db) {
        const { ObjectId } = await import('mongodb')
        const rawDoc = (await conn.db
          .collection(SMTP_SETTINGS_COLLECTION)
          .findOne(
            { _id: new ObjectId(doc.id as string) },
            { projection: { 'smtp._apiKey': 1 } },
          )) as Record<string, unknown> | null
        const nested = (rawDoc?.smtp as Record<string, unknown> | undefined)?._apiKey
        const flat = rawDoc?._apiKey
        if (nested || flat) {
          apiKey = (nested ?? flat) as string
        }
      }
    } catch (err) {
      rawReadError = err instanceof Error ? err.message : String(err)
    }
  }

  if (!apiKey) {
    throw new Error(
      `SmtpSettings "${doc.id}" has no API key` +
        (rawReadError
          ? ` — raw _apiKey read from MongoDB failed: ${rawReadError}`
          : '. Re-save the document to store the key.'),
    )
  }

  return {
    id: doc.id as string,
    apiKey,
    apiRegion: (get('apiRegion') as 'us' | 'eu' | 'au') || 'us',
    senderEmail: get('senderEmail') as string,
    forceSenderEmail: (get('forceSenderEmail') as boolean) || false,
    senderName: (get('senderName') as string) || 'High6',
    enabled: doc.enabled !== false,
    enableLogging: (get('enableLogging') as boolean) !== false,
    resolvedForSite: (doc.site as string) || undefined,
  }
}

/**
 * Resolve a tenant ID from a recipient email address by looking up
 * Users and PortalClients. Used for auth emails (password reset, etc.)
 * that lack site/tenant context.
 */
export async function resolveTenantFromRecipient(
  payload: Payload,
  email: string,
): Promise<string | null> {
  // Try PortalClients first (they have a direct `tenant` field)
  const portalResult = await payload.find({
    collection: 'portal-clients',
    where: { email: { equals: email.toLowerCase() } },
    depth: 0,
    limit: 1,
    overrideAccess: true,
  })

  if (portalResult.docs.length > 0) {
    const doc = portalResult.docs[0] as unknown as Record<string, unknown>
    const tenant = doc.tenant
    return typeof tenant === 'string' ? tenant : (tenant as { id: string })?.id || null
  }

  // Try Users (multi-tenant — take first assigned tenant)
  const userResult = await payload.find({
    collection: 'users',
    where: { email: { equals: email.toLowerCase() } },
    depth: 0,
    limit: 1,
    overrideAccess: true,
  })

  if (userResult.docs.length > 0) {
    const doc = userResult.docs[0] as unknown as Record<string, unknown>
    const tenants = (doc.tenants || []) as Array<{ tenant?: string | { id: string } }>
    const first = tenants[0]
    if (first?.tenant) {
      return typeof first.tenant === 'string' ? first.tenant : first.tenant.id || null
    }
  }

  return null
}
