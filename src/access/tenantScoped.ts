import type { Access, AccessArgs } from 'payload'

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
