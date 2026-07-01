import type { CollectionConfig } from 'payload'

import { anyone } from '../access/anyone'
import { authenticated } from '../access/authenticated'

export const CustomCollectionEntries: CollectionConfig = {
  slug: 'custom-collection-entries',
  labels: {
    singular: 'Entry',
    plural: 'Entries',
  },
  access: {
    create: authenticated,
    delete: authenticated,
    read: anyone,
    update: authenticated,
  },
  admin: {
    group: 'Custom Content',
    useAsTitle: 'id',
    defaultColumns: ['parentCollection', 'id', 'updatedAt'],
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
      name: 'parentCollection',
      label: 'Parent Collection',
      type: 'relationship',
      relationTo: 'custom-collections',
      required: true,
      admin: {
        position: 'sidebar',
        description:
          'The Custom Collection this entry belongs to — its schema defines the expected shape of the data below.',
      },
    },
    {
      name: 'data',
      type: 'json',
      required: true,
      admin: {
        components: {
          Field: '@/components/EntryDataField#EntryDataField',
          Description: '@/components/EntryDataDescription#EntryDataDescription',
        },
        description:
          'The content for this entry. Select a Parent Collection first — fields load automatically from its schema.',
      },
    },
  ],
}

// @todo (apir-tayo): Fetch entries from this collection filtered by the target
// site. For each entry, use the parent Custom Collection's schema (fields array)
// to determine how to render each value — text as string, richtext as rich
// content, media as an image (resolving the media document ID to the Supabase
// S3 URL via the Payload API), toggle as a boolean indicator, etc.
