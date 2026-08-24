import type { Access, CollectionConfig, FieldAccess } from 'payload'

import { authenticated } from '../../access/authenticated'
import { buildChangeLogHooks } from '@/hooks/changeLog'

const superAdminOnly: Access = ({ req: { user } }) => {
  if (!user) return false
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (user as any).roles?.includes('super-admin') ?? false
}

const superAdminOnlyField: FieldAccess = ({ req: { user } }) => {
  if (!user) return false
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (user as any).roles?.includes('super-admin') ?? false
}

export const Users: CollectionConfig = {
  slug: 'users',
  access: {
    admin: authenticated,
    create: superAdminOnly,
    delete: superAdminOnly,
    read: authenticated,
    update: authenticated,
  },
  admin: {
    defaultColumns: ['name', 'email'],
    useAsTitle: 'name',
    group: 'Tenant Management',
  },
  auth: true,
  hooks: buildChangeLogHooks({
    // Auth-internal fields — never record password material or login noise.
    excludedPaths: [
      'password',
      'salt',
      'hash',
      'loginAttempts',
      'lockUntil',
      'resetPasswordToken',
      'resetPasswordExpiration',
      '_verificationToken',
      '_password',
    ],
  }),
  fields: [
    {
      name: 'name',
      type: 'text',
    },
    {
      name: 'roles',
      type: 'select',
      hasMany: true,
      options: ['super-admin', 'tenant-admin'],
      access: {
        // Only super-admins can change roles (prevents tenant-admin self-escalation)
        update: superAdminOnlyField,
      },
      admin: {
        position: 'sidebar',
        description:
          'super-admin sees all tenants. tenant-admin is scoped to the tenants assigned below.',
      },
    },
  ],
  timestamps: true,
}
