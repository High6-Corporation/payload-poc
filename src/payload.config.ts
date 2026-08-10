import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { nodemailerAdapter } from '@payloadcms/email-nodemailer'
import sharp from 'sharp'
import path from 'path'
import { APIError, buildConfig, EmailAdapter, PayloadRequest } from 'payload'
import { fileURLToPath } from 'url'

import { AgentAuditLog } from './collections/AgentAuditLog'
import { Categories } from './collections/Categories'
import { EmailLogs } from './collections/EmailLogs'
import { CustomCollectionEntries } from './collections/CustomCollectionEntries'
import { CustomCollections } from './collections/CustomCollections'
import { FAQs } from './collections/FAQs'
import { Media } from './collections/Media'
import { Pages } from './collections/Pages'
import { PortalClients } from './collections/PortalClients'
import { PortfolioItems } from './collections/PortfolioItems'
import { Posts } from './collections/Posts'
import { PricingPlans } from './collections/PricingPlans'
import { SiteSettings } from './collections/SiteSettings'
import { Sites } from './collections/Sites'
import { Tenants } from './collections/Tenants'
import { Testimonials } from './collections/Testimonials'
import { Users } from './collections/Users'
import { Footer } from './Footer/config'
import { Header } from './Header/config'
import { plugins } from './plugins'
import { defaultLexical } from '@/fields/defaultLexical'
import { getServerSideURL } from './utilities/getURL'
import { normalizeTo } from '@/email/loggingAdapter'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

/**
 * Email adapter that delegates to `nodemailerAdapter` and logs every send
 * attempt — success or failure — to the `email-logs` collection.
 *
 * Wrapped in an IIFE because `nodemailerAdapter` is async (returns a
 * Promise), so the real adapter is constructed once at module init and the
 * result — a sync `EmailAdapter` factory — is what the config uses.
 *
 * Defined inline in payload.config.ts because Turbopack externalizes the
 * ESM `@payloadcms/email-nodemailer` package in a way that breaks both
 * static and dynamic imports from non-entry-point modules. The static
 * import here works correctly.
 *
 * - Log-write failures are silently swallowed — they never block or
 *   change the outcome of the real email send.
 * - Existing SMTP2go transport config is unchanged.
 */
const loggingEmailAdapter = (async (): Promise<EmailAdapter> => {
  const adapterFn = await nodemailerAdapter({
    defaultFromAddress: process.env.SMTP2GO_FROM_EMAIL || '',
    defaultFromName: 'High6',
    transportOptions: {
      host: process.env.SMTP2GO_HOST,
      port: Number(process.env.SMTP2GO_PORT),
      auth: {
        user: process.env.SMTP2GO_USERNAME,
        pass: process.env.SMTP2GO_PASSWORD,
      },
    },
  })
  // adapterFn is () => { name, defaultFromAddress, defaultFromName, sendEmail };
  // cast required — the .d.ts types it as EmailAdapter which expects ({ payload }),
  // but the runtime implementation takes no arguments.
  const real = (adapterFn as () => ReturnType<typeof adapterFn>)()

  return ({ payload }) => ({
    ...real,

    sendEmail: async (message: Parameters<typeof real.sendEmail>[0]) => {
      // site is injected by the form-builder plugin's beforeEmail hook;
      // auth/system emails won't have it — that's fine, the field is optional.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const siteId = (message as any).site as string | undefined

      const logBase = {
        to: normalizeTo(message.to),
        subject: message.subject ?? '',
        site: siteId || undefined,
        sentAt: new Date().toISOString(),
      }

      try {
        const result = await real.sendEmail(message)

        try {
          await payload.create({
            collection: 'email-logs',
            data: { ...logBase, status: 'success' },
            overrideAccess: true,
          })
        } catch {
          // Swallow logging failures
        }

        return result
      } catch (err) {
        try {
          await payload.create({
            collection: 'email-logs',
            data: {
              ...logBase,
              status: 'error',
              errorMessage: err instanceof Error ? err.message : String(err),
            },
            overrideAccess: true,
          })
        } catch {
          // Swallow logging failures
        }

        throw err
      }
    },
  })
})()

export default buildConfig({
  admin: {
    components: {
      graphics: {
        Logo: '@/components/High6Logo',
      },
      beforeLogin: ['@/components/BeforeLogin'],
      beforeDashboard: ['@/components/BeforeDashboard'],
      afterDashboard: ['@/components/AfterDashboard'],
      Nav: '@/components/SiteFilteredNav',
    },
    // Show the default "collections" dashboard widget for super-admins
    // only.  Tenant-admins get an empty dashboard (the BeforeDashboard
    // component handles their welcome content instead).
    dashboard: {
      defaultLayout: ({ req }: { req: any }) => {
        const user = req?.user
        if (user?.roles?.includes('super-admin')) {
          return [{ widgetSlug: 'collections', width: 'full' as const }]
        }
        return []
      },
      widgets: [],
    },
    importMap: {
      baseDir: path.resolve(dirname),
    },
    user: Users.slug,
    livePreview: {
      breakpoints: [
        {
          label: 'Mobile',
          name: 'mobile',
          width: 375,
          height: 667,
        },
        {
          label: 'Tablet',
          name: 'tablet',
          width: 768,
          height: 1024,
        },
        {
          label: 'Desktop',
          name: 'desktop',
          width: 1440,
          height: 900,
        },
      ],
    },
  },
  // This config helps us configure global or default features that the other editors can inherit
  editor: defaultLexical,
  db: mongooseAdapter({
    url: process.env.DATABASE_URL || '',
  }),
  email: loggingEmailAdapter,
  collections: [
    Tenants,
    PortalClients,
    Sites,
    Pages,
    Posts,
    Media,
    Categories,
    Users,
    Testimonials,
    FAQs,
    PortfolioItems,
    PricingPlans,
    SiteSettings,
    CustomCollections,
    CustomCollectionEntries,
    AgentAuditLog,
    EmailLogs,
  ],
  cors: [getServerSideURL(), 'http://localhost:3001', 'http://localhost:3002'].filter(Boolean),
  globals: [Header, Footer],
  plugins,
  hooks: {
    afterError: [
      ({ error }) => {
        // Surface the real error message for plain Error objects thrown by
        // plugins (e.g. @payloadcms/storage-s3). These lack `status` so
        // Payload's isErrorPublic() hides them behind "Something went wrong".
        if (!(error instanceof APIError) && error?.message) {
          return {
            response: {
              errors: [{ message: error.message }],
            },
          }
        }
      },
    ],
  },
  secret: process.env.PAYLOAD_SECRET,
  sharp,
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  jobs: {
    access: {
      run: ({ req }: { req: PayloadRequest }): boolean => {
        // Allow logged in users to execute this endpoint (default)
        if (req.user) return true

        const secret = process.env.CRON_SECRET
        if (!secret) return false

        // If there is no logged in user, then check
        // for the Vercel Cron secret to be present as an
        // Authorization header:
        const authHeader = req.headers.get('authorization')
        return authHeader === `Bearer ${secret}`
      },
    },
    tasks: [],
  },
})
