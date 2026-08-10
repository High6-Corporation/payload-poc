import type { CollectionConfig } from 'payload'

import { authenticated } from '../access/authenticated'
import { slugField } from 'payload'

export const Tenants: CollectionConfig = {
  slug: 'tenants',
  access: {
    create: authenticated,
    delete: authenticated,
    read: authenticated,
    update: authenticated,
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
