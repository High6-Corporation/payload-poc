import { APIError } from 'payload'
import type { CollectionConfig } from 'payload'
import type { User } from '@/payload-types'
import {
  FixedToolbarFeature,
  InlineToolbarFeature,
  lexicalEditor,
} from '@payloadcms/richtext-lexical'
import { getTenantFromCookie } from '@payloadcms/plugin-multi-tenant/utilities'
import path from 'path'
import { fileURLToPath } from 'url'
import { anyone } from '../access/anyone'
import { authenticated } from '../access/authenticated'
import { sanitizeMediaFilename } from '../utilities/sanitizeMediaFilename'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

// The multi-tenant plugin middleware decorates req.user with the active tenant at runtime
type UserWithTenant = User & { tenant?: string | { id: string } }

export const Media: CollectionConfig = {
  slug: 'media',
  folders: true,
  access: {
    create: authenticated,
    delete: authenticated,
    read: anyone,
    update: authenticated,
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      //required: true,
    },
    {
      name: 'caption',
      type: 'richText',
      editor: lexicalEditor({
        features: ({ rootFeatures }) => {
          return [...rootFeatures, FixedToolbarFeature(), InlineToolbarFeature()]
        },
      }),
    },
    {
      name: 'prefix',
      type: 'text',
      admin: {
        hidden: true,
      },
    },
  ],
  hooks: {
    beforeOperation: [
      ({ args, operation, req }) => {
        if ((operation === 'create' || operation === 'update') && req.file) {
          const user = req.user as UserWithTenant | undefined
          const tenantId =
            args?.data?.tenant ||
            getTenantFromCookie(req.headers, 'text') ||
            (typeof user?.tenant === 'string' ? user.tenant : user?.tenant?.id)

          if (!tenantId) {
            throw new APIError('Tenant ID not found when attempting to upload a file', 400)
          }

          // Initialize args.data if undefined — during multipart file uploads via
          // the REST API, Payload only extracts the file binary, not FormData fields.
          args.data ??= {}
          args.data.prefix = String(tenantId)

          // Sanitize filename for S3-compatible storage (Supabase).
          // macOS screenshots contain U+202F (narrow non-breaking space) which
          // causes S3 InvalidKey errors — see sanitizeMediaFilename.ts.
          req.file.name = sanitizeMediaFilename(req.file.name)
        }

        return args
      },
      ({ args, operation, req }) => {
        if ((operation === 'create' || operation === 'update') && req.file) {
          const maxSize = 5 * 1024 * 1024
          const allowedMimeTypes: string[] = [
            'image/jpeg',
            'image/png',
            'image/webp',
            'image/gif',
            'application/pdf',
          ]

          if (req.file.size > maxSize) {
            const sizeMB = (req.file.size / (1024 * 1024)).toFixed(1)
            throw new APIError(
              `File "${req.file.name}" is too large (${sizeMB}MB). Maximum allowed size is 5MB.`,
              400,
            )
          }

          if (!allowedMimeTypes.includes(req.file.mimetype)) {
            throw new APIError(
              `File type "${req.file.mimetype}" is not allowed. Accepted types: JPEG, PNG, WebP, GIF, PDF.`,
              400,
            )
          }

          // Validate that the file content matches its claimed MIME type
          const buf = req.file.data as Buffer
          const magicBytes: Record<string, number[]> = {
            'image/jpeg': [0xff, 0xd8, 0xff],
            'image/png': [0x89, 0x50, 0x4e, 0x47],
            'image/gif': [0x47, 0x49, 0x46, 0x38],
            'image/webp': [0x52, 0x49, 0x46, 0x46],
            'application/pdf': [0x25, 0x50, 0x44, 0x46],
          }

          const expectedMagic = magicBytes[req.file.mimetype]
          if (expectedMagic) {
            const matches = expectedMagic.every((byte, i) => buf[i] === byte)
            // WebP: also verify bytes 8-11 are "WEBP" (RIFF alone matches other formats)
            const isWebpValid =
              req.file.mimetype !== 'image/webp' ||
              (buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50)
            if (!matches || !isWebpValid) {
              const readableTypes: Record<string, string> = {
                'image/jpeg': 'JPEG',
                'image/png': 'PNG',
                'image/webp': 'WebP',
                'image/gif': 'GIF',
                'application/pdf': 'PDF',
              }
              throw new APIError(
                `File "${req.file.name}" does not appear to be a valid ${readableTypes[req.file.mimetype] || req.file.mimetype} file.`,
                400,
              )
            }
          }

          // Reject truncated files (busboy limit hit before we removed it)
          if ((req.file as Record<string, unknown>).truncated) {
            throw new APIError(
              `File "${req.file.name}" is too large. Maximum allowed size is 5MB.`,
              400,
            )
          }
        }

        return args
      },
    ],
  },
  upload: {
    // Upload to the public/media directory in Next.js making them publicly accessible even outside of Payload
    staticDir: path.resolve(dirname, '../../public/media'),
    adminThumbnail: 'thumbnail',
    focalPoint: true,
    mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'],
    imageSizes: [
      { name: 'thumbnail', width: 300 },
      { name: 'square', width: 500, height: 500 },
      { name: 'small', width: 600 },
      { name: 'medium', width: 900 },
      { name: 'large', width: 1400 },
      { name: 'xlarge', width: 1920 },
      { name: 'og', width: 1200, height: 630, crop: 'center' },
    ],
  },
}
