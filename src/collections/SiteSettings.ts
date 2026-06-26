import type { CollectionConfig } from 'payload'

import { anyone } from '../access/anyone'
import { authenticated } from '../access/authenticated'

export const SiteSettings: CollectionConfig = {
  slug: 'site-settings',
  access: {
    create: authenticated,
    delete: authenticated,
    read: anyone,
    update: authenticated,
  },
  admin: {
    useAsTitle: 'site',
  },
  fields: [
    {
      name: 'site',
      type: 'relationship',
      relationTo: 'sites',
      required: true,
      unique: true,
      admin: {
        position: 'sidebar',
      },
    },
    {
      type: 'tabs',
      tabs: [
        {
          name: 'hero',
          label: 'Hero',
          fields: [
            {
              name: 'heroHeadline',
              type: 'text',
            },
            {
              name: 'heroSubheadline',
              type: 'text',
            },
          ],
        },
        {
          name: 'whyOnePage',
          label: 'Why One Page',
          fields: [
            {
              name: 'whyOnePageTitle',
              type: 'text',
            },
            {
              name: 'whyOnePageParagraph',
              type: 'textarea',
            },
          ],
        },
        {
          name: 'howItWorks',
          label: 'How It Works',
          fields: [
            {
              name: 'howItWorksTitle',
              type: 'text',
            },
            {
              name: 'howItWorksParagraph',
              type: 'textarea',
            },
          ],
        },
        {
          name: 'trust',
          label: 'Trust',
          fields: [
            {
              name: 'trustSectionTitle',
              type: 'text',
            },
            {
              name: 'trustSectionParagraph',
              type: 'textarea',
            },
          ],
        },
        {
          name: 'cta',
          label: 'CTA',
          fields: [
            {
              name: 'ctaTitle',
              type: 'text',
            },
            {
              name: 'ctaParagraph',
              type: 'textarea',
            },
            {
              name: 'ctaButtonText',
              type: 'text',
            },
            {
              name: 'ctaCaption',
              type: 'textarea',
            },
          ],
        },
        {
          name: 'footer',
          label: 'Footer',
          fields: [
            {
              name: 'footerCopy',
              type: 'text',
            },
          ],
        },
        {
          name: 'custom',
          label: 'Custom',
          fields: [
            {
              name: 'customFields',
              type: 'array',
              admin: {
                description:
                  'Extensible key/value pairs for section headings not covered by the tabs above. Keys should be lowercase, hyphen-separated (e.g. partner-logos-title). Duplicate keys resolve to "last one wins" on the frontend — uniqueness is not enforced here.',
              },
              fields: [
                {
                  name: 'key',
                  type: 'text',
                  required: true,
                },
                {
                  name: 'value',
                  type: 'text',
                  required: true,
                },
              ],
            },
          ],
        },
      ],
    },
  ],
}
