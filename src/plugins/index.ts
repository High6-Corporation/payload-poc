import { formBuilderPlugin } from '@payloadcms/plugin-form-builder'
import { importExportPlugin } from '@payloadcms/plugin-import-export'
import { multiTenantPlugin } from '@payloadcms/plugin-multi-tenant'
import { entryExportHook, entryImportHook } from './custom-collection-entries-import-export'
import { nestedDocsPlugin } from '@payloadcms/plugin-nested-docs'
import { redirectsPlugin } from '@payloadcms/plugin-redirects'
import { seoPlugin } from '@payloadcms/plugin-seo'
import { searchPlugin } from '@payloadcms/plugin-search'
import { s3Storage } from '@payloadcms/storage-s3'
import { ArrayField, Field, parseCookies, Plugin, ValidationError } from 'payload'
import type { Config } from '@/payload-types'
import { revalidateRedirects } from '@/hooks/revalidateRedirects'
import { GenerateTitle, GenerateURL } from '@payloadcms/plugin-seo/types'
import { FixedToolbarFeature, HeadingFeature, lexicalEditor } from '@payloadcms/richtext-lexical'
import { searchFields } from '@/search/fieldOverrides'
import { beforeSyncWithSearch } from '@/search/beforeSync'
import { Page, Post } from '@/payload-types'
import { getServerSideURL } from '@/utilities/getURL'

// ---------------------------------------------------------------------------
// Export flattening: submissionData → human-readable CSV/JSON columns
// ---------------------------------------------------------------------------

const flattenSubmissionData = (row: Record<string, unknown>, format: string) => {
  const newRow = { ...row }

  if (format === 'csv') {
    // CSV: submissionData array is flattened by the export plugin as
    //   submissionData_0_field, submissionData_0_value, submissionData_0_id,
    //   submissionData_1_field, submissionData_1_value, submissionData_1_id, ...
    // Pair field→value and emit one column per field name.
    const indexFields: Record<string, string> = {} // index → fieldName
    for (const key of Object.keys(newRow)) {
      const match = key.match(/^submissionData_(\d+)_(field|value)$/)
      if (match) {
        const idx = match[1]
        const prop = match[2]
        if (prop === 'field') {
          indexFields[idx] = String(newRow[key] ?? '')
        } else if (prop === 'value') {
          const fieldName = indexFields[idx]
          if (fieldName) {
            newRow[fieldName] = newRow[key]
          }
        }
      }
    }
  }

  // JSON: submissionData is a nested array, no special handling needed
  // (it stays as-is in JSON exports)

  // Strip all submissionData / submissionUploads internal array keys
  const keysToDelete: string[] = []
  for (const key of Object.keys(newRow)) {
    if (key.startsWith('submissionData_') || key.startsWith('submissionUploads_')) {
      keysToDelete.push(key)
    }
  }
  for (const key of keysToDelete) {
    delete newRow[key]
  }
  delete newRow.submissionData
  delete newRow.submissionUploads

  // Drop internal columns
  delete newRow.id
  delete newRow.tenant
  delete newRow.site
  delete newRow.form
  delete newRow.updatedAt

  return newRow
}

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
      upload: true,
    },
    uploadCollections: ['media'],
    // Inject the submission's site ID into each outgoing email so the
    // logging adapter can record which site triggered the send. Without
    // this, email-logs rows have no site — unworkable at scale.
    beforeEmail: (emails, { data }) => {
      // `data.site` can be a plain ID string (set by the beforeChange hook)
      // OR a populated relationship object `{ id: "..." }` — Payload's hook
      // data varies depending on whether the relationship was resolved.
      const raw = (data as Record<string, unknown>)?.site
      const siteId = typeof raw === 'string' ? raw : (raw as { id?: string } | null)?.id
      if (!siteId) return emails
      return emails.map((email) => ({
        ...email,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        site: siteId as any,
      }))
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

        // Mutate the emails array field in place so the plugin reference
        // picks up the RowLabel override (GitHub Discussion #15612).
        // A spread+return creates a new object the plugin ignores.
        const emailsField = defaultFields.find(
          (f) => 'name' in f && f.type === 'array' && f.name === 'emails',
        ) as ArrayField | undefined
        if (emailsField) {
          emailsField.admin ??= {}
          emailsField.admin.components = {
            ...emailsField.admin.components,
            RowLabel: '@/components/EmailRowLabel#EmailRowLabel',
          }
        }

        const modifiedFields = defaultFields.map((field) => {
          if ('name' in field && field.name === 'title') {
            // TypeScript: Field union doesn't narrow to { hooks } after name check.
            // Safe — the plugin's title field is always a text field with hook support.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const f = field as any
            return {
              ...field,
              hooks: {
                ...(f.hooks || {}),
                beforeDuplicate: [
                  ...((f.hooks?.beforeDuplicate as unknown[]) || []),
                  ({ value }: { value?: string }) => (value ? `${value} (Copy)` : value),
                ],
              },
            }
          }

          // Pass through emails — mutated in place above (see GitHub #15612)
          if ('name' in field && field.type === 'array' && field.name === 'emails') {
            return field
          }

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
      admin: {
        defaultColumns: ['submissionData', 'createdAt', 'tenant'],
      },
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

        // Inject RowLabel and custom Field component for submissionUploads.
        // RowLabel: shows upload field name (e.g. "resume") instead of "Submission Upload 01".
        // Field: replaces the tiny default thumbnail with a larger preview + "View full size" link.
        const uploadsField = defaultFields.find(
          (f) => 'name' in f && f.type === 'array' && f.name === 'submissionUploads',
        ) as ArrayField | undefined
        if (uploadsField) {
          uploadsField.admin ??= {}
          uploadsField.admin.components = {
            ...uploadsField.admin.components,
            RowLabel: '@/components/SubmissionUploadRowLabel#SubmissionUploadRowLabel',
            Field: '@/components/SubmissionUploadField#SubmissionUploadField',
          }
        }

        // Replace the default array editor for submissionData with a read-only
        // label → value table so non-technical readers can understand submissions
        // without seeing the internal form-builder field/array structure.
        const submissionDataField = defaultFields.find(
          (f) => 'name' in f && f.type === 'array' && f.name === 'submissionData',
        ) as ArrayField | undefined
        if (submissionDataField) {
          submissionDataField.admin ??= {}
          submissionDataField.admin.components = {
            ...submissionDataField.admin.components,
            Field: '@/components/SubmissionDataField#SubmissionDataField',
            Cell: '@/components/SubmissionDataCell#SubmissionDataCell',
          }
        }

        // Hide these default fields from the list view — only submissionSummary,
        // createdAt, and tenant columns are needed.
        for (const f of defaultFields) {
          if ('name' in f && (f.name === 'form' || f.name === 'submissionUploads')) {
            ;(f as { admin?: Record<string, unknown> }).admin ??= {}
            ;(f as { admin: Record<string, unknown> }).admin.disableListColumn = true
          }
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
          //
          // Uses real client IP/UA/referrer when provided via clientInfo
          // (forwarded by apir-tayo's server action), falling back to the
          // incoming request headers for direct API calls.
          async ({ data, req }) => {
            try {
              // Prefer forwarded client info (real visitor) over request headers
              // (which would be the proxy/VPS IP for server-action-originated calls).
              const clientIp =
                data.clientInfo?.ip ||
                req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
                req.headers.get('x-real-ip') ||
                undefined

              const clientUserAgent =
                data.clientInfo?.userAgent || req.headers.get('user-agent') || undefined

              const clientReferrer =
                data.clientInfo?.referrer ||
                req.headers.get('referer') ||
                req.headers.get('referrer') ||
                undefined

              // Fail open: no IP to score → skip check
              if (!clientIp) {
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
                  sender_ip: clientIp,
                  sender_email: email || undefined,
                  sender_info: JSON.stringify({
                    REFFERRER: clientReferrer || '',
                    USER_AGENT: clientUserAgent || '',
                  }),
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
  importExportPlugin({
    collections: [
      {
        slug: 'form-submissions',
        export: {
          disableJobsQueue: true,
          format: 'csv', // default to CSV; user can switch to JSON in UI
          hooks: {
            before: async ({ data, format }) => {
              return data.map((row) => flattenSubmissionData(row, format))
            },
          },
          overrideCollection: ({ collection }) => ({
            ...collection,
            access: {
              ...collection.access,
              read: ({ req: { user } }) => {
                // Must be logged in — matches form-submissions default read access.
                // Tenant scoping is enforced at export time by the form-submissions
                // collection's multi-tenant access control (the export queries
                // form-submissions, which already applies tenant filtering).
                if (!user) return false
                return true
              },
            },
          }),
        },
        import: false,
      },
      {
        slug: 'custom-collection-entries',
        export: {
          disableJobsQueue: true,
          format: 'csv',
          hooks: {
            before: entryExportHook,
          },
        },
        import: {
          disableJobsQueue: true,
          overrideCollection: ({ collection }) => {
            // Lock importMode to Create-only — Update/Upsert don't apply to this
            // workflow (entries are always new; duplicates are rejected in the hook).
            const cleanFields = (collection.fields as Field[]).map((field) => {
              if ('name' in field && field.name === 'importMode') {
                return {
                  ...field,
                  defaultValue: 'create' as const,
                  options: (field as any).options?.filter((o: any) => o.value === 'create'),
                  admin: {
                    ...(field as any).admin,
                    description: 'Entries are always created as new. Duplicates are rejected.',
                    readOnly: true,
                  },
                }
              }
              return field
            })

            return {
              ...collection,
              fields: [
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ...(cleanFields as any[]),
                {
                  name: 'targetCollection',
                  type: 'relationship',
                  relationTo: 'custom-collections',
                  label: 'Import into Custom Collection',
                  admin: {
                    description:
                      'All entries in the uploaded file will be added to this collection. Leave blank to use the "Collection" column from the CSV instead.',
                    position: 'sidebar',
                  },
                  // Only show custom collections matching the currently-selected tenant.
                  // The tenant selector stores the active tenant in the payload-tenant
                  // cookie.  Try Payload's cookies API first, then fall back to parsing
                  // the raw Cookie header (server-side Payload doesn't always populate
                  // req.cookies the same way the Next.js client does).
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  filterOptions: ({ req }: any) => {
                    try {
                      const cookies = parseCookies(req?.headers)
                      const tenantId = cookies.get('payload-tenant')
                      if (tenantId) {
                        return { tenant: { equals: tenantId } }
                      }
                    } catch {
                      /* proceed without filter */
                    }
                    return {}
                  },
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                } as any,
              ],
            }
          },
          hooks: {
            before: entryImportHook,
          },
        },
      },
    ],
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
      'custom-collections': {},
      'custom-collection-entries': {},
    },
    // ROLLBACK: Revert the line below to `() => true` to instantly restore
    // full access for all users if the role check causes unexpected lockouts.
    userHasAccessToAllTenants: (user) =>
      Boolean('roles' in user && (user as { roles?: string[] }).roles?.includes('super-admin')),
    useTenantsCollectionAccess: true,
    useTenantsListFilter: false,
  }),
]
