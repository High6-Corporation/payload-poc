import type { CollectionConfig } from 'payload'

import { superAdminOnly, tenantReadAccess } from '@/access/tenantScoped'
import { slugField } from 'payload'

export const Sites: CollectionConfig = {
  slug: 'sites',
  access: {
    create: superAdminOnly,
    delete: superAdminOnly,
    read: tenantReadAccess,
    update: superAdminOnly,
  },
  admin: {
    useAsTitle: 'name',
    group: 'Tenant Management',
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    slugField({
      fieldToUse: 'name',
    }),
    {
      name: 'url',
      type: 'text',
      required: true,
    },
    {
      name: 'tenant',
      type: 'relationship',
      relationTo: 'tenants',
      required: true,
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'disabledCollections',
      type: 'json',
      defaultValue: [],
      admin: {
        description:
          'BLACKLIST — collections listed here are DISABLED for this site. ' +
          'Everything else is enabled by default. Custom Collections are ' +
          'auto-enabled on creation (they start absent from this list). ' +
          'Built-in collection slugs are prefixed with "builtin:".',
        position: 'sidebar',
        components: {
          Field: '@/components/EnabledCollectionsToggle#EnabledCollectionsToggle',
        },
      },
    },
  ],
}
