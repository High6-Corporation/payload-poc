import type { CollectionConfig } from 'payload'

import { superAdminOnly } from '@/access/tenantScoped'
import { slugField } from 'payload'

export const Tenants: CollectionConfig = {
  slug: 'tenants',
  access: {
    create: superAdminOnly,
    delete: superAdminOnly,
    read: superAdminOnly,
    update: superAdminOnly,
  },
  admin: {
    useAsTitle: 'name',
    group: 'Tenant Management',
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    slugField({
      fieldToUse: 'name',
    }),
    {
      name: 'defaultSite',
      type: 'relationship',
      relationTo: 'sites',
      admin: {
        position: 'sidebar',
        description: 'Default site for this tenant. Used as fallback when no site cookie is set.',
      },
      filterOptions: ({ id }) => {
        if (!id) return true
        return { tenant: { equals: id } }
      },
    },
  ],
}
