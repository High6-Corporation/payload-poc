import type { CollectionConfig } from 'payload'

import { tenantEnabledAccess } from '@/access/tenantScoped'
import { link } from '@/fields/link'

// Same factory pattern as Categories/Media/Pages/Posts/Forms, and the
// SmtpSettings convention (v34): tenantEnabledAccess without `publicAccess`
// leaves unauthenticated reads allowed — menu items must be readable by the
// public frontend. Tenant-admins are constrained to their assigned tenants
// and the per-tenant `disabledCollections` toggle (key `builtin:menu-items`).
const access = tenantEnabledAccess('menu-items')

export const MenuItems: CollectionConfig = {
  slug: 'menu-items',
  labels: { singular: 'Menu Item', plural: 'Menu Items' },
  access: {
    create: access,
    delete: access,
    read: access,
    update: access,
  },
  admin: {
    useAsTitle: 'label',
    defaultColumns: ['label', 'tenant', 'site', 'order', 'enabled'],
    description:
      'Tenant/site-scoped navigation menu items. Items with a site override the tenant defaults for that site.',
  },
  fields: [
    {
      name: 'label',
      type: 'text',
      required: true,
      admin: {
        description: 'Text shown in the navigation (e.g. "About Us").',
      },
    },
    // Link target group (internal page/post reference or custom URL, newTab).
    // disableLabel keeps the item-level `label` above as the single source of
    // truth for the displayed nav text.
    link({
      appearances: false,
      disableLabel: true,
    }),
    {
      name: 'order',
      type: 'number',
      defaultValue: 0,
      admin: {
        position: 'sidebar',
        description: 'Ascending sort order within the menu.',
      },
    },
    {
      name: 'enabled',
      type: 'checkbox',
      defaultValue: true,
      label: 'Show in menu',
      admin: { position: 'sidebar' },
    },
    {
      name: 'tenant',
      type: 'relationship',
      relationTo: 'tenants',
      required: true,
      admin: { position: 'sidebar' },
    },
    {
      name: 'site',
      type: 'relationship',
      relationTo: 'sites',
      // null = tenant default; non-null = site override
      admin: {
        position: 'sidebar',
        description:
          'Leave empty for a tenant-wide default. Set to scope this item to a specific site.',
      },
    },
  ],
}
