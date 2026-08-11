import type { Access, AccessArgs, PayloadRequest } from 'payload'

// ---------------------------------------------------------------------------
// Super-admin only — hard block for sensitive collections
// ---------------------------------------------------------------------------

/**
 * Access control that gates a collection/operation entirely to super-admin users.
 * Non-super-admins (including tenant-admins) are denied with false.
 */
export const superAdminOnly: Access = ({ req: { user } }) => {
  if (!user) return false
  return (user as any).roles?.includes('super-admin') ?? false
}

// ---------------------------------------------------------------------------
// Tenant-scoped access
// ---------------------------------------------------------------------------

/**
 * Resolve the current user's assigned tenant IDs.
 *
 * Payload's multi-tenant plugin stores user-to-tenant assignments as
 * `user.tenants[{ tenant: string | { id: string } }]`. The tenant
 * field may be a plain string or a populated relationship object.
 */
function getUserTenantIds(user: any): string[] {
  return (user?.tenants || [])
    .map((t: any) => {
      if (typeof t !== 'object' || t === null) return String(t)
      // t.tenant may be a populated object { id, name, ... } or a plain ID string
      const tv = t.tenant
      if (typeof tv === 'object' && tv !== null && tv.id) return tv.id
      return tv || t.id || undefined
    })
    .filter(Boolean)
}

// ---------------------------------------------------------------------------
// Read access: tenant-document row-level filter
// ---------------------------------------------------------------------------

/**
 * Read access for collections that reference `site` (→ `sites` → `tenant`).
 *
 * Super-admins see everything. Tenant-admins see only documents whose
 * `site.tenant` matches one of their assigned tenants.
 * Unauthenticated users are denied.
 */
export const siteTenantReadAccess: Access = ({ req }: AccessArgs): any => {
  const user = req.user
  if (!user) return false
  if ((user as any).roles?.includes('super-admin')) return true

  const ids = getUserTenantIds(user as any)
  if (ids.length === 0) return false

  return { 'site.tenant': { in: ids } }
}

/**
 * Read access for collections that carry an explicit `tenant` field.
 */
export const tenantReadAccess: Access = ({ req }: AccessArgs): any => {
  const user = req.user
  if (!user) return false
  if ((user as any).roles?.includes('super-admin')) return true

  const ids = getUserTenantIds(user as any)
  if (ids.length === 0) return false

  return { tenant: { in: ids } }
}

/**
 * Read access for the Tenants collection itself (no self-referential `tenant`
 * field — a tenant IS the scope). Tenant-admins can only read their own
 * tenant document by matching on the document's `id`.
 */
export const tenantSelfReadAccess: Access = ({ req }: AccessArgs): any => {
  const user = req.user
  if (!user) return false
  if ((user as any).roles?.includes('super-admin')) return true

  const ids = getUserTenantIds(user as any)
  if (ids.length === 0) return false

  return { id: { in: ids } }
}

// ---------------------------------------------------------------------------
// Mutate access: tenant-document ownership guard
// ---------------------------------------------------------------------------

/**
 * Update/delete guard for site-scoped collections.
 */
export const siteTenantMutateAccess: Access = ({ req }: AccessArgs): any => {
  const user = req.user
  if (!user) return false
  if ((user as any).roles?.includes('super-admin')) return true

  const ids = getUserTenantIds(user as any)
  if (ids.length === 0) return false

  return { 'site.tenant': { in: ids } }
}

/**
 * Update/delete guard for collections with an explicit `tenant` field.
 */
export const tenantMutateAccess: Access = ({ req }: AccessArgs): any => {
  const user = req.user
  if (!user) return false
  if ((user as any).roles?.includes('super-admin')) return true

  const ids = getUserTenantIds(user as any)
  if (ids.length === 0) return false

  return { tenant: { in: ids } }
}

// ---------------------------------------------------------------------------
// Per-collection disabledCollections enforcement (Phase 3b)
// ---------------------------------------------------------------------------

/**
 * Check whether `builtin:<slug>` is present in a disabledCollections array.
 * Mirrors the client-side key format from `src/collections/built-in-collections.ts`.
 */
const isDisabled = (list: unknown, slug: string): boolean =>
  Array.isArray(list) && list.includes(`builtin:${slug}`)

interface TenantDoc {
  id: string
  disabledCollections?: unknown
}

/**
 * Fetch the current user's assigned tenant documents, cached per request.
 * Used by the collection-toggle access factories so multiple collections
 * checked in one request only cost one DB query.
 */
async function getTenantDocs(req: PayloadRequest): Promise<TenantDoc[]> {
  if ((req.context as any)._tenantDocs) return (req.context as any)._tenantDocs

  const ids = getUserTenantIds(req.user)
  if (!ids.length) {
    ;(req.context as any)._tenantDocs = []
    return []
  }

  try {
    const { docs } = await req.payload.find({
      collection: 'tenants',
      where: { id: { in: ids } },
      depth: 0,
      limit: 0,
      overrideAccess: true,
      req,
    })
    ;(req.context as any)._tenantDocs = docs as TenantDoc[]
    return docs as TenantDoc[]
  } catch {
    ;(req.context as any)._tenantDocs = []
    return []
  }
}

/**
 * Factory returning an async Access function that denies read/update/delete
 * (and create) for collections whose `builtin:<slug>` key is present in the
 * tenant's `disabledCollections` JSON field.
 *
 * For **plugin-managed collections** (have a `tenant` field — Pages, Posts,
 * Media, Categories, Forms, FormSubmissions).  The multi-tenant plugin ANDs
 * its own `{ tenant: { in: assignedIds } }` constraint on top, so returning
 * `{ tenant: { in: enabledIds } }` here produces the correct intersection.
 *
 * @param slug — collection slug matching the `builtin:<slug>` key
 * @param options.publicAccess — optional Access function to use for
 *   unauthenticated users (default: `true`).  Pass `authenticatedOrPublished`
 *   for collections where public visitors should only see published docs.
 */
export const tenantEnabledAccess =
  (slug: string, options?: { publicAccess?: Access }): Access =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async (args: any): Promise<any> => {
    const user = args.req?.user
    if (!user) {
      // Unauthenticated — use publicAccess if provided, otherwise allow
      return options?.publicAccess ? options.publicAccess(args) : true
    }
    if ((user as any).roles?.includes('super-admin')) return true

    try {
      const tenants = await getTenantDocs(args.req)
      if (!tenants.length) return false

      const enabledIds = tenants
        .filter((t) => !isDisabled(t.disabledCollections, slug))
        .map((t) => t.id)

      if (!enabledIds.length) return false

      // create operations: check the incoming tenant field
      if (args.data) {
        const dataTenant =
          typeof args.data.tenant === 'string'
            ? args.data.tenant
            : args.data?.tenant?.id || args.data?.tenant
        return dataTenant ? enabledIds.includes(String(dataTenant)) : false
      }

      return { tenant: { in: enabledIds } }
    } catch {
      return false // fail closed
    }
  }

interface SiteDoc {
  id: string
  tenant?: string | { id: string }
  disabledCollections?: unknown
}

/**
 * Fetch the current user's assigned site documents, cached per request.
 */
async function getSiteDocs(req: PayloadRequest): Promise<SiteDoc[]> {
  if ((req.context as any)._siteDocs) return (req.context as any)._siteDocs

  const tenantIds = getUserTenantIds(req.user)
  if (!tenantIds.length) {
    ;(req.context as any)._siteDocs = []
    return []
  }

  try {
    const { docs } = await req.payload.find({
      collection: 'sites',
      where: { tenant: { in: tenantIds } },
      depth: 0,
      limit: 0,
      overrideAccess: true,
      req,
    })
    ;(req.context as any)._siteDocs = docs as SiteDoc[]
    return docs as SiteDoc[]
  } catch {
    ;(req.context as any)._siteDocs = []
    return []
  }
}

/**
 * Factory returning an async Access function for **site-scoped collections**
 * (have a `site` field → `site.tenant` — FAQs, Testimonials, PortfolioItems,
 * PricingPlans, SiteSettings, EmailLogs).
 *
 * Same `disabledCollections` check as `tenantEnabledAccess` but returns
 * `{ 'site.tenant': { in: enabledIds } }` instead of a bare `tenant` constraint.
 *
 * Create operations: inspects `args.data.site`, resolves the site's tenant,
 * and checks that tenant's disabledCollections.
 */
export const siteTenantEnabledAccess =
  (slug: string, options?: { publicAccess?: Access }): Access =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async (args: any): Promise<any> => {
    const user = args.req?.user
    if (!user) {
      return options?.publicAccess ? options.publicAccess(args) : true
    }
    if ((user as any).roles?.includes('super-admin')) return true

    try {
      const tenants = await getTenantDocs(args.req)
      if (!tenants.length) return false

      const enabledTenantIds = tenants
        .filter((t) => !isDisabled(t.disabledCollections, slug))
        .map((t) => t.id)

      if (!enabledTenantIds.length) return false

      // create operations: inspect the incoming site field
      if (args.data) {
        const dataSite =
          typeof args.data.site === 'string'
            ? args.data.site
            : args.data?.site?.id || args.data?.site
        if (!dataSite) return false

        // Resolve the site's tenant from the cached site docs
        const siteDocs = await getSiteDocs(args.req)
        const site = siteDocs.find((s) => s.id === String(dataSite))
        if (!site) return false

        const siteTenantId =
          typeof site.tenant === 'object' && site.tenant !== null
            ? String(site.tenant.id)
            : String(site.tenant || '')

        return enabledTenantIds.includes(siteTenantId)
      }

      return { 'site.tenant': { in: enabledTenantIds } }
    } catch {
      return false // fail closed
    }
  }
