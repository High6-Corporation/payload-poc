import type { Payload } from 'payload'

import type { MenuItem } from '@/payload-types'

/** Menu item shape returned to frontends. `link` mirrors the `link` group field. */
export interface ResolvedMenuItem {
  id: string
  label: string
  order: number
  link: MenuItem['link']
}

/**
 * Resolve the active menu items for a given tenant + optional site.
 *
 * Lookup order (mirrors resolveSmtpConfig):
 *   1. Site-override: enabled MenuItems where tenant = tenantId AND site = siteId
 *   2. Tenant-default: enabled MenuItems where tenant = tenantId AND site is null
 *   3. Empty list — no items configured
 *
 * Items are ordered by the `order` field ascending. `overrideAccess: true`
 * matches resolveSmtpConfig: this runs server-side for the public frontend,
 * which must see menu items regardless of the caller's user state.
 */
export async function resolveMenuItems(
  payload: Payload,
  tenantId: string,
  siteId?: string,
): Promise<ResolvedMenuItem[]> {
  // 1. Site-override first
  if (siteId) {
    const siteResult = await payload.find({
      collection: 'menu-items',
      where: {
        and: [
          { tenant: { equals: tenantId } },
          { site: { equals: siteId } },
          { enabled: { equals: true } },
        ],
      },
      depth: 0,
      sort: 'order',
      limit: 100,
      overrideAccess: true,
    })

    if (siteResult.docs.length > 0) {
      return siteResult.docs.map(toMenuItem)
    }
  }

  // 2. Tenant-default fallback (`exists: false` — same as resolveSmtpConfig)
  const tenantResult = await payload.find({
    collection: 'menu-items',
    where: {
      and: [
        { tenant: { equals: tenantId } },
        { site: { exists: false } },
        { enabled: { equals: true } },
      ],
    },
    depth: 0,
    sort: 'order',
    limit: 100,
    overrideAccess: true,
  })

  return tenantResult.docs.map(toMenuItem)
}

function toMenuItem(doc: MenuItem): ResolvedMenuItem {
  return {
    id: String(doc.id),
    label: doc.label ?? '',
    order: doc.order ?? 0,
    link: doc.link ?? { type: 'reference' },
  }
}
