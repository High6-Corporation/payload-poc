import type { CollectionConfig } from 'payload'

import { authenticated } from '../access/authenticated'
import { siteTenantReadAccess } from '@/access/tenantScoped'

export const EmailLogs: CollectionConfig = {
  slug: 'email-logs',
  access: {
    create: () => false,
    read: siteTenantReadAccess,
    update: () => false,
    delete: () => false,
  },
  admin: {
    useAsTitle: 'subject',
    defaultColumns: ['status', 'site', 'to', 'subject', 'sentAt'],
    group: 'Logs',
  },
  defaultSort: '-sentAt',
  fields: [
    {
      name: 'site',
      type: 'relationship',
      relationTo: 'sites',
      admin: {
        description:
          'The site this email is associated with, when known. Null for system/auth emails that lack site context.',
      },
    },
    {
      name: 'status',
      type: 'select',
      options: ['success', 'error'],
      required: true,
    },
    {
      name: 'to',
      type: 'text',
      label: 'Recipient',
    },
    {
      name: 'subject',
      type: 'text',
    },
    {
      name: 'errorMessage',
      type: 'textarea',
      admin: {
        condition: (_, siblingData) => siblingData?.status === 'error',
      },
    },
    {
      name: 'sentAt',
      type: 'date',
      admin: {
        date: {
          pickerAppearance: 'dayAndTime',
        },
      },
    },
  ],
}
