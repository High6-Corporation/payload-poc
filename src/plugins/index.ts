import { formBuilderPlugin } from '@payloadcms/plugin-form-builder'
import { multiTenantPlugin } from '@payloadcms/plugin-multi-tenant'
import { nestedDocsPlugin } from '@payloadcms/plugin-nested-docs'
import { redirectsPlugin } from '@payloadcms/plugin-redirects'
import { seoPlugin } from '@payloadcms/plugin-seo'
import { searchPlugin } from '@payloadcms/plugin-search'
import { s3Storage } from '@payloadcms/storage-s3'
import { Field, Plugin, ValidationError } from 'payload'
import type { Config } from '@/payload-types'
import { revalidateRedirects } from '@/hooks/revalidateRedirects'
import { GenerateTitle, GenerateURL } from '@payloadcms/plugin-seo/types'
import { FixedToolbarFeature, HeadingFeature, lexicalEditor } from '@payloadcms/richtext-lexical'
import { searchFields } from '@/search/fieldOverrides'
import { beforeSyncWithSearch } from '@/search/beforeSync'
import { Page, Post } from '@/payload-types'
import { getServerSideURL } from '@/utilities/getURL'

const generateTitle: GenerateTitle<Post | Page> = ({ doc }) => {
  return doc?.title ? `${doc.title} | Payload Website Template` : 'Payload Website Template'
}
const generateURL: GenerateURL<Post | Page> = ({ doc }) => {
  const url = getServerSideURL()
  return doc?.slug ? `${url}/${doc.slug}` : url
}

export const plugins: Plugin[] = [
  s3Storage({
    collections: { media: true },
    bucket: process.env.SUPABASE_BUCKET || '',
    config: {
      credentials: {
        accessKeyId: process.env.SUPABASE_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.SUPABASE_SECRET_ACCESS_KEY || '',
      },
      region: process.env.SUPABASE_REGION || '',
      endpoint: process.env.SUPABASE_ENDPOINT || '',
      forcePathStyle: true,
    },
  }),
  redirectsPlugin({
    collections: ['pages', 'posts'],
    overrides: {
      // @ts-expect-error - This is a valid override, mapped fields don't resolve to the same type
      fields: ({ defaultFields }) => {
        return defaultFields.map((field) => {
          if ('name' in field && field.name === 'from') {
            return {
              ...field,
              admin: {
                description: 'You will need to rebuild the website when changing this field.',
              },
            }
          }
          return field
        })
      },
      hooks: {
        afterChange: [revalidateRedirects],
      },
    },
  }),
  nestedDocsPlugin({
    collections: ['categories'],
    generateURL: (docs) => docs.reduce((url, doc) => `${url}/${doc.slug}`, ''),
  }),
  seoPlugin({
    generateTitle,
    generateURL,
  }),
  formBuilderPlugin({
    fields: {
      payment: false,
    },
    formOverrides: {
      fields: ({ defaultFields }) => {
        const siteField: Field = {
          name: 'site',
          type: 'relationship',
          relationTo: 'sites',
          required: true,
          admin: {
            position: 'sidebar',
          },
        }

        const modifiedFields = defaultFields.map((field) => {
          if ('name' in field && field.name === 'confirmationMessage') {
            return {
              ...field,
              editor: lexicalEditor({
                features: ({ rootFeatures }) => {
                  return [
                    ...rootFeatures,
                    FixedToolbarFeature(),
                    HeadingFeature({ enabledHeadingSizes: ['h1', 'h2', 'h3', 'h4'] }),
                  ]
                },
              }),
            }
          }
          return field
        })

        return [siteField, ...modifiedFields]
      },
    },
    formSubmissionOverrides: {
      fields: ({ defaultFields }) => {
        const siteField: Field = {
          name: 'site',
          type: 'relationship',
          relationTo: 'sites',
          required: false, // auto-populated by beforeChange hook
          admin: {
            position: 'sidebar',
          },
        }
        return [siteField, ...defaultFields]
      },
      hooks: {
        beforeChange: [
          async ({ data, req }) => {
            // Auto-populate site from the parent form
            try {
              const formId = data?.form
              if (formId) {
                const form = await req.payload.findByID({
                  collection: 'forms',
                  id: formId,
                  depth: 0,
                })
                if (form?.site) {
                  data.site = form.site
                }
              }
            } catch (_error) {
              // Fail open — allow submission even if form lookup fails
            }
            return data
          },
          // CleanTalk anti-spam hook for form-submissions
          // Headers expected: x-forwarded-for, user-agent
          // As of 2026-06-29: apir-tayo does NOT proxy form submissions to Payload
          // (contact form uses Gravity Forms). Direct submissions to Payload's API
          // will carry these headers naturally. When apir-tayo migrates to Payload
          // form-submissions, the proxy route MUST forward these headers.
          async ({ data, req }) => {
            try {
              const forwardedFor = req.headers.get('x-forwarded-for')
              const ip = forwardedFor?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || undefined

              const userAgent = req.headers.get('user-agent') || undefined

              // Fail open: missing both headers → skip check
              if (!ip && !userAgent) {
                return data
              }

              // Extract email from submission data if present
              const emailField = data.submissionData?.find(
                (d: { field: string; value: string }) => d.field === 'email',
              )
              const email = emailField?.value

              const controller = new AbortController()
              const timeoutId = setTimeout(() => controller.abort(), 3000)

              const response = await fetch('https://moderate.cleantalk.org/api2.0', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  auth_key: process.env.CLEANTALK_API_KEY,
                  sender_ip: ip,
                  sender_email: email || undefined,
                  js_on: 1,
                  submit_time: 0,
                  message: JSON.stringify(data.submissionData),
                }),
                signal: controller.signal,
              })

              clearTimeout(timeoutId)

              if (!response.ok) {
                // Fail open on non-200
                return data
              }

              const result = await response.json()

              if (result.allow === 0) {
                throw new ValidationError({
                  errors: [
                    {
                      message: 'Submission flagged as spam.',
                      path: '_submission',
                    },
                  ],
                })
              }

              // allow === 1 or any other response → proceed
            } catch (error) {
              if (error instanceof ValidationError) {
                throw error // Re-throw — this is the intentional spam rejection
              }
              // Fail open: network error, timeout, invalid JSON, missing key, etc.
              console.error('CleanTalk check failed (fail-open):', error)
            }
            return data
          },
        ],
      },
    },
  }),
  searchPlugin({
    collections: ['posts'],
    beforeSync: beforeSyncWithSearch,
    searchOverrides: {
      fields: ({ defaultFields }) => {
        return [...defaultFields, ...searchFields]
      },
    },
  }),
  multiTenantPlugin<Config>({
    cleanupAfterTenantDelete: false,
    collections: {
      pages: {},
      posts: {},
      media: {},
      categories: {},
      forms: {},
      'form-submissions': {},
    },
    userHasAccessToAllTenants: () => true,
    useTenantsListFilter: false,
  }),
]
