import { mongooseAdapter } from '@payloadcms/db-mongodb'
import sharp from 'sharp'
import path from 'path'
import { APIError, buildConfig, EmailAdapter, PayloadRequest } from 'payload'
import { fileURLToPath } from 'url'
import nodemailer from 'nodemailer'

import { AgentAuditLog } from './collections/AgentAuditLog'
import { Categories } from './collections/Categories'
import { EmailLogs } from './collections/EmailLogs'
import { CustomCollectionEntries } from './collections/CustomCollectionEntries'
import { CustomCollections } from './collections/CustomCollections'
import { FAQs } from './collections/FAQs'
import { Media } from './collections/Media'
import { MenuItems } from './collections/MenuItems'
import { Pages } from './collections/Pages'
import { PortalClients } from './collections/PortalClients'
import { PortfolioItems } from './collections/PortfolioItems'
import { Posts } from './collections/Posts'
import { PricingPlans } from './collections/PricingPlans'
import { SiteSettings } from './collections/SiteSettings'
import { Sites } from './collections/Sites'
import { SmtpSettings } from './collections/SmtpSettings'
import { Tenants } from './collections/Tenants'
import { Testimonials } from './collections/Testimonials'
import { Users } from './collections/Users'
import { Footer } from './Footer/config'
import { Header } from './Header/config'
import { plugins } from './plugins'
import { defaultLexical } from '@/fields/defaultLexical'
import { getServerSideURL } from './utilities/getURL'
import { normalizeTo } from '@/email/loggingAdapter'
import { sendViaSmtp2goApi } from '@/email/smtp2go'
import { ensureEmailLogsTtlIndex } from './jobs/emailLogsTtl'
import {
  resolveSmtpConfig,
  resolveTenantFromRecipient,
  type ResolvedSmtpConfig,
} from '@/utilities/resolveSmtpConfig'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

/**
 * Email adapter that resolves the SMTP transport per-send from the
 * SmtpSettings collection (per-tenant, with optional per-site overrides)
 * and logs every send attempt — success or failure — to `email-logs`.
 *
 * Resolution order (see src/utilities/resolveSmtpConfig.ts):
 *   1. Form emails carry a `site` (injected by the form-builder plugin's
 *      beforeEmail hook) — the site's tenant + site id resolve the config.
 *   2. Auth/system emails have no site — the recipient's tenant is looked
 *      up via PortalClients/Users.
 *   3. No config (or a disabled one) → throw — never a silent fallback.
 *
 * SmtpSettings sends go through SMTP2GO's HTTP API (`sendViaSmtp2goApi`)
 * using the config's raw API key (read directly from MongoDB, bypassing
 * the afterRead mask). The env-var fallback keeps the legacy SMTP relay
 * transport.
 * Log-write failures are silently swallowed — they never block or change
 * the outcome of the real email send.
 */
const loggingEmailAdapter: EmailAdapter = ({ payload }) => ({
  name: 'smtp2go-dynamic',
  defaultFromAddress: 'no-reply@h6app.site',
  defaultFromName: 'High6',

  sendEmail: async (message) => {
    // site is injected by the form-builder plugin's beforeEmail hook;
    // auth/system emails won't have it — those resolve via recipient lookup.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const siteId = (message as any).site as string | undefined
    const recipient = normalizeTo(message.to)
    const subject = message.subject ?? ''

    let config: ResolvedSmtpConfig | null = null

    // ---- Resolve SMTP config ----
    if (siteId) {
      // Form emails: resolve tenant from the site
      try {
        const site = await payload.findByID({
          collection: 'sites',
          id: siteId,
          depth: 0,
          overrideAccess: true,
        })
        const siteDoc = site as unknown as Record<string, unknown>
        const tenantId =
          typeof siteDoc.tenant === 'string'
            ? siteDoc.tenant
            : (siteDoc.tenant as { id: string })?.id

        if (tenantId) {
          config = await resolveSmtpConfig(payload, tenantId, siteId)
        }
      } catch {
        // Fall through to recipient lookup
      }
    }

    if (!config && recipient) {
      // Auth/system emails: resolve tenant from recipient
      const tenantId = await resolveTenantFromRecipient(payload, recipient)
      if (tenantId) {
        config = await resolveSmtpConfig(payload, tenantId)
      }
    }

    if (!config || !config.enabled) {
      // ---- Fallback: original env-var SMTP2GO transport ----
      // Kept as a safety net while tenants migrate to SmtpSettings docs.
      const envHost = process.env.SMTP2GO_HOST
      const envPort = process.env.SMTP2GO_PORT
      const envUser = process.env.SMTP2GO_USERNAME
      const envPass = process.env.SMTP2GO_PASSWORD
      const envFrom = process.env.SMTP2GO_FROM_EMAIL

      if (envHost && envUser && envPass) {
        config = {
          id: 'env-fallback',
          apiKey: envUser,
          senderEmail: envFrom || 'no-reply@h6app.site',
          forceSenderEmail: false,
          senderName: 'High6',
          enabled: true,
          enableLogging: true,
        }
      } else {
        throw new Error(
          config
            ? `SMTP config "${config.id}" is disabled. Enable it before sending emails.`
            : `No SMTP config found for recipient "${recipient}". ` +
                `Ensure a SmtpSettings tenant-default exists for at least one tenant, ` +
                `or set SMTP2GO_* env vars as a fallback.`,
        )
      }
    }

    // ---- Send: HTTP API for SmtpSettings configs, relay for the env fallback ----
    // SmtpSettings configs carry an API key — valid ONLY on the HTTP API
    // (api.smtp2go.com). The SMTP relay (mail.smtp2go.com) authenticates with a
    // separate "SMTP User" username/password pair, so an API key there always
    // 535s. The env-var fallback uses SMTP2GO_USERNAME/PASSWORD, which IS an
    // SMTP-User credential pair — that branch keeps the relay transport.
    const sendMessage = { ...message }
    if (config.forceSenderEmail || !sendMessage.from) {
      sendMessage.from = {
        address: config.senderEmail,
        name: config.senderName,
      }
    }

    let send: () => Promise<unknown>
    if (config.id === 'env-fallback') {
      const transport = nodemailer.createTransport({
        host: process.env.SMTP2GO_HOST!,
        port: Number(process.env.SMTP2GO_PORT) || 2525,
        auth: {
          user: process.env.SMTP2GO_USERNAME!,
          pass: process.env.SMTP2GO_PASSWORD!,
        },
      })
      send = () => transport.sendMail(sendMessage)
    } else {
      send = () => sendViaSmtp2goApi(config, sendMessage)
    }

    // ---- Send + Log ----
    const logBase = {
      to: recipient,
      subject,
      site: config.resolvedForSite || siteId || undefined,
      sentAt: new Date().toISOString(),
    }

    try {
      const result = await send()

      if (config.enableLogging) {
        try {
          await payload.create({
            collection: 'email-logs',
            data: { ...logBase, status: 'success' },
            overrideAccess: true,
          })
        } catch {
          /* Swallow logging failures */
        }
      }

      return result
    } catch (err) {
      if (config.enableLogging) {
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
          /* Swallow logging failures */
        }
      }

      throw err
    }
  },
})

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
      views: {
        pluginInventory: {
          Component: '@/components/PluginInventoryView#PluginInventoryView',
          path: '/plugin-inventory',
        },
      },
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
    MenuItems,
    SmtpSettings,
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
  onInit: async (payload) => {
    await ensureEmailLogsTtlIndex(payload)
  },
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
