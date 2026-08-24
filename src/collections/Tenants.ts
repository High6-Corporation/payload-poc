import type { CollectionConfig } from 'payload'

import { superAdminOnly, tenantSelfReadAccess } from '@/access/tenantScoped'
import { buildChangeLogHooks } from '@/hooks/changeLog'
import { slugField } from 'payload'

export const Tenants: CollectionConfig = {
  slug: 'tenants',
  access: {
    create: superAdminOnly,
    delete: superAdminOnly,
    read: tenantSelfReadAccess,
    update: superAdminOnly,
  },
  hooks: buildChangeLogHooks(),
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
      name: 'defaultSite',
      type: 'relationship',
      relationTo: 'sites',
      admin: {
        position: 'sidebar',
        description: 'Default site for this tenant. Used as fallback when no site cookie is set.',
      },
      filterOptions: ({ id }) => {
        if (!id) return true
        return { tenant: { equals: id } }
      },
    },
    {
      name: 'disabledCollections',
      type: 'json',
      defaultValue: [],
      admin: {
        description:
          'BLACKLIST — standard collections listed here are DISABLED for this tenant. ' +
          'Everything else is enabled by default. Standard collection slugs are ' +
          'prefixed with "builtin:".',
        position: 'sidebar',
        components: {
          Field: '@/components/EnabledCollectionsToggle#EnabledCollectionsToggle',
        },
      },
    },
  ],
}
