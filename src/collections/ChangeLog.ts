import type { CollectionConfig } from 'payload'

import { superAdminOnly } from '@/access/tenantScoped'

/**
 * Immutable field-level change history across tracked collections.
 *
 * Writes come ONLY from the afterChange/afterDelete hooks in
 * src/hooks/changeLog.ts (create/update/delete access is () => false —
 * same pattern as EmailLogs). Read is super-admin only for now;
 * site/tenant-scoped read is a future enhancement.
 */
export const ChangeLog: CollectionConfig = {
  slug: 'change-log',
  labels: { singular: 'Change Log Entry', plural: 'Change Log' },
  access: {
    create: () => false,
    read: superAdminOnly,
    update: () => false,
    delete: () => false,
  },
  admin: {
    useAsTitle: 'collectionSlug',
    defaultColumns: ['collectionSlug', 'operation', 'fieldPath', 'actor', 'source', 'createdAt'],
    group: 'Logs',
    description:
      'Immutable field-level change history (Phase 2 of the change-history design doc). ' +
      'Written only by hooks on smtp-settings, sites, tenants, users. Super-admin read only.',
  },
  defaultSort: '-createdAt',
  fields: [
    {
      name: 'collectionSlug',
      type: 'text',
      required: true,
      admin: { description: 'Slug of the collection the change happened in.' },
    },
    {
      name: 'docId',
      type: 'text',
      required: true,
      admin: { description: 'ID of the changed document.' },
    },
    {
      name: 'operation',
      type: 'select',
      options: ['create', 'update', 'delete'],
      required: true,
    },
    {
      name: 'fieldPath',
      type: 'text',
      admin: { description: 'Dotted path of the changed field. Null = whole-document change.' },
    },
    {
      name: 'previousValue',
      type: 'json',
      admin: { description: 'Value before the change (null on create). Secret fields are stripped.' },
    },
    {
      name: 'newValue',
      type: 'json',
      admin: { description: 'Value after the change (null on delete). Secret fields are stripped.' },
    },
    {
      name: 'actor',
      type: 'relationship',
      relationTo: 'users',
      admin: { description: 'User who made the change. Null = system (adapter/job/seed).' },
    },
    {
      name: 'actorRole',
      type: 'text',
      admin: { description: 'Comma-joined roles of the actor at write time.' },
    },
    {
      name: 'source',
      type: 'select',
      options: ['admin', 'api', 'agent', 'public', 'system'],
      required: true,
      admin: {
        description:
          'admin = authenticated REST call (admin UI or direct API — not distinguishable in v1); ' +
          'agent = AGENT_EMAIL service account; system = local API (adapter/seed/jobs). ' +
          'api and public are reserved and unused in v1.',
      },
    },
    {
      name: 'tenant',
      type: 'relationship',
      relationTo: 'tenants',
      admin: { description: 'Attributed tenant when derivable (null for users).' },
    },
    {
      name: 'site',
      type: 'relationship',
      relationTo: 'sites',
      admin: { description: 'Attributed site when derivable.' },
    },
  ],
}
