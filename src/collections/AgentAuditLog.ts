import type { CollectionConfig } from 'payload'

import { authenticated } from '../access/authenticated'

export const AgentAuditLog: CollectionConfig = {
  slug: 'agent-audit-log',
  access: {
    create: authenticated,
    read: authenticated,
    update: () => false,
    delete: () => false,
  },
  admin: {
    useAsTitle: 'action',
    defaultColumns: ['action', 'collection', 'slug', 'confirmedAt'],
    group: 'Tenant Management',
  },
  defaultSort: '-confirmedAt',
  fields: [
    {
      name: 'tenant',
      type: 'relationship',
      relationTo: 'tenants',
      required: true,
    },
    {
      name: 'action',
      type: 'text',
      required: true,
    },
    {
      name: 'collection',
      type: 'text',
      required: true,
    },
    {
      name: 'documentId',
      type: 'text',
      required: true,
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
    },
    {
      name: 'previousValue',
      type: 'text',
      required: true,
    },
    {
      name: 'newValue',
      type: 'text',
      required: true,
    },
    {
      name: 'confirmedAt',
      type: 'date',
      required: true,
      admin: {
        date: {
          pickerAppearance: 'dayAndTime',
        },
      },
    },
  ],
}
