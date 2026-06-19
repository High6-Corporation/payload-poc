/**
 * One-shot script: Rename the existing "apir-tayo" tenant to "High6".
 *
 * Step 2 of the tenant→site migration. Keeps the same _id — only updates
 * name and slug (slug auto-updates from name via slugField).
 *
 * Idempotent: if the tenant is already named "High6", this is a no-op.
 *
 * Usage:
 *   cd ~/work/payload-poc
 *   pnpm tsx src/scripts/rename-tenant-high6.ts
 */

import 'dotenv/config'
import { getPayload } from 'payload'
import config from '@payload-config'

async function main() {
  console.log('🔍 Finding tenant with slug "apir-tayo"...')

  const payload = await getPayload({ config })

  const { docs } = await payload.find({
    collection: 'tenants',
    where: { slug: { equals: 'apir-tayo' } },
    limit: 1,
  })

  if (!docs.length) {
    console.log('⚠️  No tenant with slug "apir-tayo" found. Already renamed?')
    // Check if High6 already exists
    const high6 = await payload.find({
      collection: 'tenants',
      where: { slug: { equals: 'high6' } },
      limit: 1,
    })
    if (high6.docs.length) {
      console.log(`✅ Tenant "High6" already exists (id: ${high6.docs[0].id as string}). Nothing to do.`)
    } else {
      console.error('❌ No "apir-tayo" or "high6" tenant found. Cannot proceed.')
      process.exit(1)
    }
  } else {
    const tenant = docs[0]
    const oldName = tenant.name as string
    const oldSlug = tenant.slug as string
    const tenantId = tenant.id as string

    console.log(`   Found: "${oldName}" (slug: "${oldSlug}", id: ${tenantId})`)
    console.log(`   Renaming to "High6"...`)

    await payload.update({
      collection: 'tenants',
      id: tenantId,
      data: { name: 'High6', slug: 'high6' },
    })

    // Verify
    const updated = await payload.findByID({
      collection: 'tenants',
      id: tenantId,
    })
    console.log(`✅ Tenant renamed: "${updated.name as string}" (slug: "${updated.slug as string}", id: ${tenantId})`)
  }

  await payload.db?.destroy?.()
  console.log('Done.')
}

main().catch((err) => {
  console.error('❌ Fatal:', err)
  process.exit(1)
})
