import type { Access, AccessArgs } from 'payload'

/**
 * Resolve the current user's assigned tenant IDs.
 *
 * Payload's multi-tenant plugin stores user-to-tenant assignments as
 * `user.tenants[{ tenant: string }]`. For super-admin users, an empty
 * array signals "all access."
 */
function getUserTenantIds(user: any): string[] {
  return (user?.tenants || [])
    .map((t: any) =>
      typeof t === 'object' && t !== null ? t.tenant || t.id || String(t) : String(t),
    )
    .filter(Boolean)
}

// ---------------------------------------------------------------------------
// Read access: tenant-document row-level filter via `site.tenant` deep-query
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
 *
 * Same semantics as `siteTenantReadAccess` but filters on the direct
 * `tenant` relationship rather than resolving through `site`.
 */
export const tenantReadAccess: Access = ({ req }: AccessArgs): any => {
  const user = req.user
  if (!user) return false
  if ((user as any).roles?.includes('super-admin')) return true

  const ids = getUserTenantIds(user as any)
  if (ids.length === 0) return false

  return { tenant: { in: ids } }
}

// ---------------------------------------------------------------------------
// Mutate access: tenant-document ownership guard
// ---------------------------------------------------------------------------

/**
 * Update/delete guard for site-scoped collections.
 *
 * Allows super-admins always; tenant-admins only for documents whose
 * `site.tenant` matches their own tenant list (£pairs with the read
 * filter to ensure they can't even see documents they can't touch).
 */
export const siteTenantMutateAccess: Access = ({ req }: AccessArgs): any => {
  const user = req.user
  if (!user) return false
  if ((user as any).roles?.includes('super-admin')) return true

  // mutate access can't express a deep-query constraint — it's a
  // boolean or a where-constraint on the doc being mutated.  Payload
  // will apply the doc-level read access + the mutate return here as a
  // second gate.  For maximum safety, we use the same deep-query shape.
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
