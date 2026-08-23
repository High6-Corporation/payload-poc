import type { CollectionConfig } from 'payload'

import { FixedToolbarFeature, lexicalEditor } from '@payloadcms/richtext-lexical'
import {
  MetaDescriptionField,
  MetaImageField,
  MetaTitleField,
  OverviewField,
  PreviewField,
} from '@payloadcms/plugin-seo/fields'
import { anyone } from '../access/anyone'
import { authenticated } from '../access/authenticated'
import { siteTenantReadAccess, siteTenantMutateAccess } from '@/access/tenantScoped'

const richtextEditor = lexicalEditor({
  features: ({ rootFeatures }) => [...rootFeatures, FixedToolbarFeature()],
})

export const SiteSettings: CollectionConfig = {
  slug: 'site-settings',
  versions: {
    maxPerDoc: 50,
  },
  access: {
    create: authenticated,
    delete: siteTenantMutateAccess,
    read: siteTenantReadAccess,
    update: siteTenantMutateAccess,
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
              type: 'richText',
              editor: richtextEditor,
            },
            {
              name: 'heroSubheadline',
              type: 'richText',
              editor: richtextEditor,
            },
          ],
        },
        {
          name: 'whyOnePage',
          label: 'Why One Page',
          fields: [
            {
              name: 'whyOnePageTitle',
              type: 'richText',
              editor: richtextEditor,
            },
            {
              name: 'whyOnePageParagraph',
              type: 'richText',
              editor: richtextEditor,
            },
          ],
        },
        {
          name: 'howItWorks',
          label: 'How It Works',
          fields: [
            {
              name: 'howItWorksTitle',
              type: 'richText',
              editor: richtextEditor,
            },
            {
              name: 'howItWorksParagraph',
              type: 'richText',
              editor: richtextEditor,
            },
          ],
        },
        {
          name: 'trust',
          label: 'Trust',
          fields: [
            {
              name: 'trustSectionTitle',
              type: 'richText',
              editor: richtextEditor,
            },
            {
              name: 'trustSectionParagraph',
              type: 'richText',
              editor: richtextEditor,
            },
          ],
        },
        {
          name: 'cta',
          label: 'CTA',
          fields: [
            {
              name: 'ctaTitle',
              type: 'richText',
              editor: richtextEditor,
            },
            {
              name: 'ctaParagraph',
              type: 'richText',
              editor: richtextEditor,
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
        {
          name: 'meta',
          label: 'SEO',
          fields: [
            OverviewField({
              titlePath: 'meta.title',
              descriptionPath: 'meta.description',
              imagePath: 'meta.image',
            }),
            MetaTitleField({
              hasGenerateFn: true,
            }),
            MetaImageField({
              relationTo: 'media',
            }),

            MetaDescriptionField({}),
            PreviewField({
              // if the `generateUrl` function is configured
              hasGenerateFn: true,

              // field paths to match the target field for data
              titlePath: 'meta.title',
              descriptionPath: 'meta.description',
            }),
            {
              name: 'focusKeyword',
              type: 'textarea',
              label: 'Focus Keywords',
              admin: {
                description:
                  'Comma-separated keywords this page targets for SEO (e.g. "web design, agency, philippines").',
              },
            },
          ],
        },
      ],
    },
  ],
}
