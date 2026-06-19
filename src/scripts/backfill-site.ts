/**
 * Backfill script: Set `site` on all existing records across the 4
 * content collections (Testimonials, FAQs, PortfolioItems, PricingPlans).
 *
 * Step 5 of the tenant→site migration. For each record that has a
 * `tenant` field pointing to the High6 tenant, sets `site` to the
 * apir-tayo Site ID.
 *
 * Idempotent — records that already have `site` populated are skipped.
 * Safe to re-run; will report 0 updated on subsequent runs.
 *
 * Usage:
 *   cd ~/work/payload-poc
 *   pnpm tsx src/scripts/backfill-site.ts
 */

import 'dotenv/config'
import { getPayload } from 'payload'
import config from '@payload-config'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const HIGH6_SLUG = 'high6'
const SITE_SLUG = 'apir-tayo'

interface BackfillResult {
  collection: string
  total: number
  updated: number
  skipped: number
  errors: string[]
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const payload = await getPayload({ config })

  // 1. Resolve the High6 tenant ID
  console.log(`🔍 Finding tenant "${HIGH6_SLUG}"...`)
  const tenantResult = await payload.find({
    collection: 'tenants',
    where: { slug: { equals: HIGH6_SLUG } },
    limit: 1,
  })
  if (!tenantResult.docs.length) {
    console.error(`❌ Tenant "${HIGH6_SLUG}" not found.`)
    process.exit(1)
  }
  const tenantId = tenantResult.docs[0].id as string
  console.log(`   Tenant High6 id: ${tenantId}`)

  // 2. Resolve the apir-tayo Site ID
  console.log(`🔍 Finding site "${SITE_SLUG}"...`)
  const siteResult = await payload.find({
    collection: 'sites',
    where: { slug: { equals: SITE_SLUG } },
    limit: 1,
  })
  if (!siteResult.docs.length) {
    console.error(`❌ Site "${SITE_SLUG}" not found.`)
    process.exit(1)
  }
  const siteId = siteResult.docs[0].id as string
  console.log(`   Site apir-tayo id: ${siteId}`)

  // 3. Backfill each collection
  const collections = [
    { slug: 'testimonials', label: 'Testimonials' },
    { slug: 'faqs', label: 'FAQs' },
    { slug: 'portfolio-items', label: 'PortfolioItems' },
    { slug: 'pricing-plans', label: 'PricingPlans' },
  ]

  const results: BackfillResult[] = []

  for (const { slug, label } of collections) {
    console.log(`\n── ${label} ──`)
    const result: BackfillResult = { collection: label, total: 0, updated: 0, skipped: 0, errors: [] }

    // Find all records for this tenant
    const { docs } = await payload.find({
      collection: slug as 'testimonials' | 'faqs' | 'portfolio-items' | 'pricing-plans',
      where: { tenant: { equals: tenantId } },
      pagination: false,
    })

    result.total = docs.length
    console.log(`   Found ${docs.length} record(s) with tenant=High6`)

    for (const doc of docs) {
      const docId = doc.id as string

      // Idempotency check: already has site?
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((doc as any).site) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const existingSite = (doc as any).site
        const existingSiteId = typeof existingSite === 'string'
          ? existingSite
          : (existingSite as { id?: string })?.id ?? 'unknown'
        console.log(`   ⏭  ${docId.slice(-6)}: site already set (${existingSiteId.slice(-6)})`)
        result.skipped++
        continue
      }

      try {
        await payload.update({
          collection: slug as 'testimonials' | 'faqs' | 'portfolio-items' | 'pricing-plans',
          id: docId,
          data: { site: siteId },
        })
        console.log(`   ✅ ${docId.slice(-6)}: site set`)
        result.updated++
      } catch (err) {
        const msg = `Failed to update ${docId}: ${(err as Error).message}`
        console.error(`   ❌ ${docId.slice(-6)}: ${msg}`)
        result.errors.push(msg)
      }
    }

    results.push(result)
  }

  // 4. Summary
  console.log('\n═══════════════════════════════════════')
  console.log('  BACKFILL SUMMARY')
  console.log('═══════════════════════════════════════')
  let totalUpdated = 0
  let totalSkipped = 0
  let totalErrors = 0
  let grandTotal = 0

  for (const r of results) {
    console.log(`  ${r.collection.padEnd(20)} ${String(r.total).padStart(3)} total  ${String(r.updated).padStart(3)} updated  ${String(r.skipped).padStart(3)} skipped  ${String(r.errors.length).padStart(3)} errors`)
    totalUpdated += r.updated
    totalSkipped += r.skipped
    totalErrors += r.errors.length
    grandTotal += r.total
  }

  console.log('───────────────────────────────────────')
  console.log(`  ${'TOTAL'.padEnd(20)} ${String(grandTotal).padStart(3)} total  ${String(totalUpdated).padStart(3)} updated  ${String(totalSkipped).padStart(3)} skipped  ${String(totalErrors).padStart(3)} errors`)

  await payload.db?.destroy?.()

  if (totalErrors > 0) {
    console.error('\n❌ Backfill completed with errors. Review the output above.')
    process.exit(1)
  }

  console.log('\n✅ Backfill complete.')
}

main().catch((err) => {
  console.error('❌ Fatal:', err)
  process.exit(1)
})
