import type { CollectionConfig } from 'payload'

import { tenantEnabledAccess } from '@/access/tenantScoped'
import { slugField } from 'payload'

const access = tenantEnabledAccess('categories')

export const Categories: CollectionConfig = {
  slug: 'categories',
  access: {
    create: access,
    delete: access,
    read: access,
    update: access,
  },
  admin: {
    useAsTitle: 'title',
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    slugField({
      position: undefined,
    }),
  ],
}
