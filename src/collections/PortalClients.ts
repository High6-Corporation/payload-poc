import type { CollectionConfig } from 'payload'

import { authenticated } from '../access/authenticated'

export const PortalClients: CollectionConfig = {
  slug: 'portal-clients',
  access: {
    admin: authenticated,
    create: authenticated,
    delete: authenticated,
    read: authenticated,
    update: authenticated,
  },
  admin: {
    useAsTitle: 'email',
    group: 'Tenant Management',
  },
  auth: true,
  fields: [
    {
      name: 'tenant',
      type: 'relationship',
      relationTo: 'tenants',
      required: true,
    },
  ],
}
