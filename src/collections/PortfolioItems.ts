import type { CollectionConfig } from 'payload'

import { anyone } from '../access/anyone'
import { authenticated } from '../access/authenticated'
import { siteTenantReadAccess, siteTenantMutateAccess } from '@/access/tenantScoped'

export const PortfolioItems: CollectionConfig = {
  slug: 'portfolio-items',
  access: {
    create: authenticated,
    delete: siteTenantMutateAccess,
    read: siteTenantReadAccess,
    update: siteTenantMutateAccess,
  },
  admin: {
    useAsTitle: 'title',
  },
  fields: [
    {
      name: 'site',
      type: 'relationship',
      relationTo: 'sites',
      required: true,
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      name: 'category',
      type: 'text',
      required: true,
    },
    {
      name: 'url',
      type: 'text',
      required: false,
    },
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media',
      required: false,
    },
  ],
}
