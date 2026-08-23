import type { CollectionConfig } from 'payload'

import { siteTenantEnabledAccess } from '@/access/tenantScoped'

export const PortfolioItems: CollectionConfig = {
  slug: 'portfolio-items',
  versions: {
    maxPerDoc: 50,
  },
  access: {
    create: siteTenantEnabledAccess('portfolio-items'),
    delete: siteTenantEnabledAccess('portfolio-items'),
    read: siteTenantEnabledAccess('portfolio-items'),
    update: siteTenantEnabledAccess('portfolio-items'),
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
