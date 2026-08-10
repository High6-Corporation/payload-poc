import type { CollectionConfig } from 'payload'

import { superAdminOnly } from '@/access/tenantScoped'

export const PortalClients: CollectionConfig = {
  slug: 'portal-clients',
  access: {
    admin: superAdminOnly,
    create: superAdminOnly,
    delete: superAdminOnly,
    read: superAdminOnly,
    update: superAdminOnly,
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
