/**
 * One-shot script: Create the "apir-tayo" Site record.
 *
 * Step 3 of the tenant→site migration. Creates one Site owned by
 * the High6 tenant. Idempotent — skips if the site already exists.
 *
 * Usage:
 *   cd ~/work/payload-poc
 *   pnpm tsx src/scripts/create-apirtayo-site.ts
 */

import 'dotenv/config'
import { getPayload } from 'payload'
import config from '@payload-config'

async function main() {
  console.log('🔍 Finding "high6" tenant...')

  const payload = await getPayload({ config })

  const tenantResult = await payload.find({
    collection: 'tenants',
    where: { slug: { equals: 'high6' } },
    limit: 1,
  })

  if (!tenantResult.docs.length) {
    console.error('❌ Tenant "high6" not found. Run rename-tenant-high6.ts first.')
    process.exit(1)
  }

  const tenantId = tenantResult.docs[0].id as string
  console.log(`   Tenant High6 id: ${tenantId}`)

  // Check if site already exists
  const existing = await payload.find({
    collection: 'sites',
    where: { slug: { equals: 'apir-tayo' } },
    limit: 1,
  })

  if (existing.docs.length) {
    const site = existing.docs[0]
    console.log(`⚠️  Site "apir-tayo" already exists (id: ${site.id as string}). Nothing to do.`)
    console.log(`\n📋 Use this Site ID as PAYLOAD_SITE_ID: ${site.id as string}`)
  } else {
    const site = await payload.create({
      collection: 'sites',
      data: {
        name: 'apir-tayo',
        slug: 'apir-tayo',
        url: 'https://apirtayo.com',
        tenant: tenantId,
      },
    })

    const siteId = site.id as string
    console.log(`✅ Site created: "${site.name as string}" (slug: "${site.slug as string}", id: ${siteId})`)
    console.log(`   url:    ${site.url as string}`)
    console.log(`   tenant: ${tenantId} (High6)`)
    console.log(`\n📋 Use this Site ID as PAYLOAD_SITE_ID: ${siteId}`)
  }

  await payload.db?.destroy?.()
  console.log('Done.')
}

main().catch((err) => {
  console.error('❌ Fatal:', err)
  process.exit(1)
})
