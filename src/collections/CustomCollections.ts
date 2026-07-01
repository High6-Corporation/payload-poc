import type { CollectionConfig } from 'payload'

import { anyone } from '../access/anyone'
import { authenticated } from '../access/authenticated'
import { slugField } from 'payload'

export const CustomCollections: CollectionConfig = {
  slug: 'custom-collections',
  labels: {
    singular: 'Custom Collection',
    plural: 'Custom Collections',
  },
  access: {
    create: authenticated,
    delete: authenticated,
    read: anyone,
    update: authenticated,
  },
  admin: {
    group: 'Custom Content',
    useAsTitle: 'name',
    defaultColumns: ['name', 'site', 'slug', 'updatedAt'],
  },
  fields: [
    {
      name: 'site',
      type: 'relationship',
      relationTo: 'sites',
      required: true,
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'name',
      type: 'text',
      required: true,
      admin: {
        description:
          'A human-readable name for this collection (e.g. "Team Members", "Office Locations", "Service Plans").',
      },
    },
    slugField({
      fieldToUse: 'name',
    }),
    {
      name: 'fields',
      type: 'json',
      required: true,
      defaultValue: [
        {
          name: 'full-name',
          type: 'text',
          required: true,
          label: 'Full Name',
        },
      ],
      admin: {
        components: {
          Field: '@/components/FieldBuilder#FieldBuilder',
          Description: '@/components/FieldBuilderDescription#FieldBuilderDescription',
        },
        description:
          'Define the fields for this custom collection using the visual builder below. No JSON required.',
      },
    },
  ],
}

// @todo (apir-tayo): Fetch the schema from this collection for the site, then
// fetch entries from custom-collection-entries. Render fields dynamically on
// the frontend based on schema.fields — iterate each field definition and
// render the corresponding form/display component per entry.data key.
// Media fields store a Payload media document ID — resolve them through
// the Payload API to get the actual file URL from Supabase S3.
