import type { CollectionConfig } from 'payload'

import { authenticated } from '../access/authenticated'

export const EmailLogs: CollectionConfig = {
  slug: 'email-logs',
  access: {
    create: () => false,
    read: authenticated,
    update: () => false,
    delete: () => false,
  },
  admin: {
    useAsTitle: 'subject',
    defaultColumns: ['status', 'to', 'subject', 'sentAt'],
    group: 'Tenant Management',
  },
  defaultSort: '-sentAt',
  fields: [
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
