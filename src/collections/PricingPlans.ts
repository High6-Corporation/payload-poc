import type { CollectionConfig } from 'payload'

import { anyone } from '../access/anyone'
import { authenticated } from '../access/authenticated'
import { siteTenantReadAccess, siteTenantMutateAccess } from '@/access/tenantScoped'

export const PricingPlans: CollectionConfig = {
  slug: 'pricing-plans',
  access: {
    create: authenticated,
    delete: siteTenantMutateAccess,
    read: siteTenantReadAccess,
    update: siteTenantMutateAccess,
  },
  admin: {
    useAsTitle: 'label',
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
      name: 'label',
      type: 'text',
      required: true,
    },
    {
      name: 'price',
      type: 'number',
      required: true,
      admin: {
        description: 'Price for this plan (e.g. 99.99)',
      },
    },
    {
      name: 'description',
      type: 'textarea',
      required: false,
      admin: {
        description: 'Optional description of what this plan includes',
      },
    },
    {
      name: 'items',
      type: 'array',
      fields: [
        {
          name: 'item',
          type: 'text',
          required: true,
        },
      ],
    },
    {
      name: 'order',
      type: 'number',
      defaultValue: 0,
    },
  ],
}
