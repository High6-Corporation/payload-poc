import type { CollectionConfig } from 'payload'

import { superAdminOnly } from '@/access/tenantScoped'

export const PortalClients: CollectionConfig = {
  slug: 'portal-clients',
  access: {
    admin: ({ req: { user } }) => {
      if (!user) return false
      return (user as any).roles?.includes('super-admin') ?? false
    },
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
