/**
 * One-time migration script: wraps plain-string SiteSettings fields in
 * minimal Lexical richText JSON documents.
 *
 * DRY-RUN (default):
 *   pnpm payload run src/scripts/migrate-site-settings-richtext.ts
 *
 * EXECUTE:
 *   pnpm payload run src/scripts/migrate-site-settings-richtext.ts -- --execute
 */

import { getPayload } from 'payload'
import configPromise from '@payload-config'

// ---------------------------------------------------------------------------
// The 10 fields being migrated, keyed by parent tab name and field name.
// ---------------------------------------------------------------------------
const FIELDS_TO_MIGRATE: { tab: string; field: string }[] = [
  { tab: 'hero', field: 'heroHeadline' },
  { tab: 'hero', field: 'heroSubheadline' },
  { tab: 'whyOnePage', field: 'whyOnePageTitle' },
  { tab: 'whyOnePage', field: 'whyOnePageParagraph' },
  { tab: 'howItWorks', field: 'howItWorksTitle' },
  { tab: 'howItWorks', field: 'howItWorksParagraph' },
  { tab: 'trust', field: 'trustSectionTitle' },
  { tab: 'trust', field: 'trustSectionParagraph' },
  { tab: 'cta', field: 'ctaTitle' },
  { tab: 'cta', field: 'ctaParagraph' },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Wrap a plain string value in a minimal Lexical richText JSON doc. */
function wrapStringInLexical(text: string) {
  return {
    root: {
      type: 'root',
      format: '',
      indent: 0,
      version: 1,
      direction: 'ltr',
      children: [
        {
          type: 'paragraph',
          format: '',
          indent: 0,
          version: 1,
          direction: 'ltr',
          children: [
            {
              type: 'text',
              text,
              format: 0,
              detail: 0,
              mode: 'normal',
              style: '',
              version: 1,
            },
          ],
        },
      ],
    },
  }
}

/** Truncate a value for display. */
function preview(val: unknown, maxLen = 80): string {
  const s = typeof val === 'string' ? val : JSON.stringify(val)
  if (s.length <= maxLen) return s
  return s.slice(0, maxLen) + '…'
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2)
  const execute = args.includes('--execute')

  const payload = await getPayload({ config: configPromise })

  const result = await payload.find({
    collection: 'site-settings',
    limit: 0, // fetch all
  })

  console.log(`Found ${result.totalDocs} site-settings document(s).\n`)

  if (result.totalDocs === 0) {
    console.log('Nothing to migrate.')
    return
  }

  // --- Dry-run: show before/after for the first document -------------------
  const firstDoc = result.docs[0]
  console.log('=== DRY-RUN: first document (id=%s) ===\n', firstDoc.id)

  let changeCount = 0

  for (const { tab, field } of FIELDS_TO_MIGRATE) {
    const tabData = (firstDoc as unknown as Record<string, unknown>)[tab] as
      | Record<string, unknown>
      | undefined
    const currentValue = tabData?.[field]

    if (typeof currentValue === 'string') {
      changeCount++
      const lexicalDoc = wrapStringInLexical(currentValue)
      console.log(`--- ${tab}.${field} ---`)
      console.log(`  Before (string): "${preview(currentValue)}"`)
      console.log(
        `  After  (Lexical): ${preview(JSON.stringify(lexicalDoc))}`,
      )
      console.log()
    } else if (currentValue && typeof currentValue === 'object') {
      console.log(
        `--- ${tab}.${field} --- SKIP (already an object, looks like richtext)`,
      )
      console.log()
    } else {
      console.log(
        `--- ${tab}.${field} --- SKIP (null/undefined/missing)`,
      )
      console.log()
    }
  }

  if (changeCount === 0) {
    console.log('No string fields found to migrate. All done.')
    return
  }

  if (!execute) {
    console.log(
      `\nDRY-RUN complete. ${changeCount} field(s) would be migrated across ${result.totalDocs} doc(s).`,
    )
    console.log(
      'Re-run with --execute to apply the migration.',
    )
    return
  }

  // --- Execute: update all documents ---------------------------------------
  console.log('\n=== EXECUTING MIGRATION ===\n')

  let totalUpdated = 0
  let totalFieldsUpdated = 0

  for (const doc of result.docs) {
    const updateData: Record<string, Record<string, unknown>> = {}
    let docHasChanges = false

    for (const { tab, field } of FIELDS_TO_MIGRATE) {
      const tabData = (doc as unknown as Record<string, unknown>)[tab] as
        | Record<string, unknown>
        | undefined
      const currentValue = tabData?.[field]

      if (typeof currentValue === 'string') {
        if (!updateData[tab]) updateData[tab] = {}
        updateData[tab][field] = wrapStringInLexical(currentValue)
        docHasChanges = true
        totalFieldsUpdated++
      }
    }

    if (docHasChanges) {
      await payload.update({
        collection: 'site-settings',
        id: doc.id,
        data: updateData,
      })
      totalUpdated++
      console.log(`  Updated doc ${doc.id} (${totalFieldsUpdated} fields so far)`)
    }
  }

  console.log(
    `\nDone. Updated ${totalUpdated} document(s), ${totalFieldsUpdated} field(s).`,
  )
}

main().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
