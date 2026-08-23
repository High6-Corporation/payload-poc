import type { CollectionConfig } from 'payload'

import { siteTenantEnabledAccess } from '@/access/tenantScoped'

export const FAQs: CollectionConfig = {
  slug: 'faqs',
  versions: {
    maxPerDoc: 50,
  },
  access: {
    create: siteTenantEnabledAccess('faqs'),
    delete: siteTenantEnabledAccess('faqs'),
    read: siteTenantEnabledAccess('faqs'),
    update: siteTenantEnabledAccess('faqs'),
  },
  admin: {
    useAsTitle: 'question',
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
      name: 'question',
      type: 'text',
      required: true,
    },
    {
      name: 'answer',
      type: 'textarea',
      required: true,
    },
    {
      name: 'order',
      type: 'number',
      defaultValue: 0,
    },
  ],
}
