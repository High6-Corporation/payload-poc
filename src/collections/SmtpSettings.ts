import type { CollectionConfig } from 'payload'
import { tenantEnabledAccess } from '@/access/tenantScoped'
import { authenticated } from '@/access/authenticated'
import { validateUniquePair } from './SmtpSettings/hooks/validateUniquePair'
import { maskApiKey } from './SmtpSettings/hooks/maskApiKey'

// tenantEnabledAccess('smtp-settings') for all operations, with
// `authenticated` as the baseline gate: anonymous users are denied
// (tenantEnabledAccess defaults to `true` for unauthenticated requests,
// which would otherwise leave this API-key-bearing collection open).
const access = tenantEnabledAccess('smtp-settings', { publicAccess: authenticated })

export const SmtpSettings: CollectionConfig = {
  slug: 'smtp-settings',
  labels: { singular: 'SMTP Setting', plural: 'SMTP Settings' },
  hooks: {
    beforeValidate: [validateUniquePair],
    afterRead: [maskApiKey],
  },
  access: {
    create: access,
    delete: access,
    read: access,
    update: access,
  },
  admin: {
    useAsTitle: 'label',
    defaultColumns: ['label', 'tenant', 'site', 'enabled', 'senderEmail'],
    group: 'Tenant Management',
    description:
      'Per-tenant SMTP2GO configuration. One default per tenant, optional per-site overrides.',
  },
  fields: [
    {
      name: 'label',
      type: 'text',
      required: true,
      admin: {
        description: 'Human-readable label (e.g. "Default", "Marketing Site Override")',
      },
    },
    {
      name: 'tenant',
      type: 'relationship',
      relationTo: 'tenants',
      required: true,
      admin: { position: 'sidebar' },
    },
    {
      name: 'site',
      type: 'relationship',
      relationTo: 'sites',
      // null = tenant default; non-null = site override
      admin: {
        position: 'sidebar',
        description:
          'Leave empty for a tenant-wide default. Set to scope this config to a specific site.',
      },
    },
    {
      name: 'enabled',
      type: 'checkbox',
      defaultValue: true,
      label: 'Enable this SMTP config',
    },
    {
      name: 'enableLogging',
      type: 'checkbox',
      defaultValue: true,
      label: 'Log emails sent with this config',
    },
    {
      type: 'tabs',
      tabs: [
        {
          name: 'smtp',
          label: 'SMTP Settings',
          fields: [
            {
              name: '_apiKey',
              type: 'text',
              admin: {
                hidden: true,
                description:
                  'INTERNAL: Raw SMTP2GO API key. Never exposed in client-facing API responses. ' +
                  'The afterRead hook masks apiKey from this value. Internal reads (resolveSmtpConfig, ' +
                  'smtp-test endpoint) bypass Payload hooks and read this field directly from MongoDB.',
              },
            },
            {
              name: 'apiKey',
              type: 'text',
              required: true,
              admin: {
                description:
                  'SMTP2GO API key. Masked in the admin UI and API responses — ' +
                  'the raw key is never returned after initial save.',
                components: {
                  Field: '@/components/SmtpApiKeyField#SmtpApiKeyField',
                },
              },
            },
            {
              name: 'apiRegion',
              type: 'select',
              defaultValue: 'us',
              options: [
                { label: 'US (api.smtp2go.com)', value: 'us' },
                { label: 'EU (api-eu.smtp2go.com)', value: 'eu' },
                { label: 'AU (api-au.smtp2go.com)', value: 'au' },
              ],
              required: true,
            },
            {
              name: 'senderEmail',
              type: 'email',
              required: true,
              admin: { description: 'From address for emails sent with this config' },
            },
            {
              name: 'forceSenderEmail',
              type: 'checkbox',
              defaultValue: false,
              label: 'Force Sender Email',
              admin: {
                description:
                  'When enabled, all emails sent with this config use the sender email above, ' +
                  'overriding any from address set by the calling code.',
              },
            },
            {
              name: 'senderName',
              type: 'text',
              required: true,
              defaultValue: 'High6',
              admin: { description: 'From name for emails sent with this config' },
            },
          ],
        },
        {
          name: 'test',
          label: 'Test',
          fields: [
            {
              name: 'testAction',
              type: 'ui',
              admin: {
                components: {
                  Field: '@/components/SmtpTestAction#SmtpTestAction',
                },
              },
            },
          ],
        },
      ],
    },
  ],
}
