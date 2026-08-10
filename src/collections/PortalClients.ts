import type { CollectionConfig } from 'payload'

import { authenticated } from '../access/authenticated'
import { tenantReadAccess, tenantMutateAccess } from '@/access/tenantScoped'

export const PortalClients: CollectionConfig = {
  slug: 'portal-clients',
  access: {
    admin: authenticated,
    create: authenticated,
    delete: tenantMutateAccess,
    read: tenantReadAccess,
    update: tenantMutateAccess,
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
