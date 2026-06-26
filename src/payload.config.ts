import { mongooseAdapter } from '@payloadcms/db-mongodb'
import sharp from 'sharp'
import path from 'path'
import { APIError, buildConfig, PayloadRequest } from 'payload'
import { fileURLToPath } from 'url'

import { AgentAuditLog } from './collections/AgentAuditLog'
import { Categories } from './collections/Categories'
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

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    components: {
      graphics: {
        Logo: '@/components/High6Logo',
      },
      beforeLogin: ['@/components/BeforeLogin'],
      beforeDashboard: ['@/components/BeforeDashboard'],
      // Reorders nav groups so Tenant Management appears above Collections.
      // Payload's groupNavItems() hardcodes Collections/Globals first — CSS
      // flexbox order corrects the visual placement.
      beforeNavLinks: ['@/components/SidebarOrderFix'],
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
    AgentAuditLog,
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
