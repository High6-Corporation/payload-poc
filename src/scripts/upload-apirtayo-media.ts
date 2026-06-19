/**
 * One-off script: upload apir-tayo testimonial/portfolio images to Payload
 * Media and link them to the correct records.
 *
 * Uses Payload's Local API — runs server-side with full access, no JWT/auth
 * dependency on the agent service account.
 *
 * Idempotent: re-running skips records that already have an image linked.
 *
 * Usage:
 *   cd ~/work/payload-poc
 *   pnpm tsx src/scripts/upload-apirtayo-media.ts
 *
 * Requires the MongoDB connection string (DATABASE_URL) and Supabase/S3
 * credentials in .env. No dev server needed — the script initializes
 * Payload directly.
 */

import 'dotenv/config'

import { getPayload } from 'payload'
import config from '@payload-config'
import fs from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

import type { File } from 'payload'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/** Apir-tayo project root — images are read from here */
const APIR_TAYO_ASSETS = path.resolve(process.cwd(), '..', 'apir-tayo', 'public', 'assets')

const SITE_SLUG = 'apir-tayo'

/** Media guardrail — match Media.ts:74 */
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB

/** Sharp compression target — if an image exceeds MAX_FILE_SIZE, resize to
 *  this width (maintaining aspect ratio) and re-encode as PNG at quality 85. */
const COMPRESS_WIDTH = 2000
const COMPRESS_QUALITY = 85

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UploadEntry {
  collection: 'testimonials' | 'portfolio-items'
  /** Field used to find the existing record */
  matchField: 'name' | 'title'
  matchValue: string
  /** Source filename relative to APIR_TAYO_ASSETS */
  sourceFile: string
  /** Alt text for the media record */
  alt: string
}

interface UploadResult {
  entry: UploadEntry
  status: 'created' | 'skipped' | 'compressed' | 'error'
  mediaId?: string
  error?: string
}

// ---------------------------------------------------------------------------
// Source image mapping
// ---------------------------------------------------------------------------

const ENTRIES: UploadEntry[] = [
  // Testimonials
  {
    collection: 'testimonials',
    matchField: 'name',
    matchValue: 'Jason Go',
    sourceFile: 'gtgo.png',
    alt: 'Jason Go, Vice President of GTGO Enterprises Inc.',
  },
  {
    collection: 'testimonials',
    matchField: 'name',
    matchValue: 'Gene Nicolas',
    sourceFile: 'premiere-builders-corp.png',
    alt: 'Gene Nicolas, Founder of Premiere Builders Corp.',
  },
  {
    collection: 'testimonials',
    matchField: 'name',
    matchValue: 'Claudia Soriano',
    sourceFile: 'all-about-people.png',
    alt: 'Claudia Soriano, CEO of All About People',
  },
  // Portfolio items
  {
    collection: 'portfolio-items',
    matchField: 'title',
    matchValue: 'Soding Bros',
    sourceFile: 'soding-bros.png',
    alt: 'Soding Bros website preview',
  },
  {
    collection: 'portfolio-items',
    matchField: 'title',
    matchValue: 'Tipping Point PH',
    sourceFile: 'tipping-point-ph.png',
    alt: 'Tipping Point PH website preview',
  },
  {
    collection: 'portfolio-items',
    matchField: 'title',
    matchValue: 'Ad-Haven',
    sourceFile: 'adhaven.png',
    alt: 'Ad-Haven website preview',
  },
  {
    collection: 'portfolio-items',
    matchField: 'title',
    matchValue: 'Michael James Love',
    sourceFile: 'mjl.png',
    alt: 'Michael James Love website preview',
  },
  {
    collection: 'portfolio-items',
    matchField: 'title',
    matchValue: 'City Tech',
    sourceFile: '69608c73f7374bc0cc7e836fb4d87a10f6e2c208.png',
    alt: 'City Tech website preview',
  },
  {
    collection: 'portfolio-items',
    matchField: 'title',
    matchValue: 'Edgetech',
    sourceFile: '3f5a380ce7d9387320c7ce2309ba10a3a368ee9a.png',
    alt: 'Edgetech website preview',
  },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024)
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(1)} KB`
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('📸 Upload apir-tayo images to Payload Media')
  console.log(`   Assets dir: ${APIR_TAYO_ASSETS}`)
  console.log(`   Site:       ${SITE_SLUG}`)

  // 1. Initialize Payload (connects to MongoDB, S3, plugins)
  console.log('\n🔌 Initializing Payload…')
  const payload = await getPayload({ config })
  console.log('   Connected ✓')

  // 2. Resolve site (and derive tenant for media uploads)
  console.log(`\n🔍 Resolving site "${SITE_SLUG}"…`)
  const siteResult = await payload.find({
    collection: 'sites',
    where: { slug: { equals: SITE_SLUG } },
    depth: 1,
    limit: 1,
  })

  if (!siteResult.docs.length) {
    console.error(`   ✗ Site "${SITE_SLUG}" not found. Has it been created?`)
    process.exit(1)
  }

  const site = siteResult.docs[0]
  const siteId = site.id as string
  const tenantId =
    typeof site.tenant === 'string'
      ? site.tenant
      : ((site.tenant as { id?: string } | undefined)?.id ?? null)

  if (!tenantId) {
    console.error('   ✗ Site has no tenant. Cannot proceed.')
    process.exit(1)
  }
  console.log(`   Site ID:   ${siteId} ✓`)
  console.log(`   Tenant ID: ${tenantId} ✓`)

  // 3. Process each entry
  const results: UploadResult[] = []

  for (const entry of ENTRIES) {
    const label = `${entry.collection}:"${entry.matchValue}"`
    console.log(`\n── ${label} ──`)

    try {
      // 3a. Find the existing record (site-scoped lookup)
      const recordResult = await payload.find({
        collection: entry.collection,
        where: {
          and: [
            { site: { equals: siteId } },
            { [entry.matchField]: { equals: entry.matchValue } },
          ],
        },
        limit: 1,
      })

      if (!recordResult.docs.length) {
        console.log(`  ⚠  Record not found — has seed-apirtayo.ts been run?`)
        results.push({ entry, status: 'error', error: 'Record not found' })
        continue
      }

      const record = recordResult.docs[0]

      // 3b. Idempotency check — already linked?
      // When image is populated, it comes back as either a string ID or
      // an object with id/url (depending on depth). Check both shapes.
      const existingImage = record.image as string | { id: string } | null | undefined
      const imageId = typeof existingImage === 'string' ? existingImage : existingImage?.id
      if (imageId) {
        console.log(`  ⏭  Skipping (image already linked: ${imageId})`)
        results.push({ entry, status: 'skipped', mediaId: imageId })
        continue
      }

      // 3c. Read source file
      const filePath = path.join(APIR_TAYO_ASSETS, entry.sourceFile)
      console.log(`  📂 Reading ${filePath}`)

      let buffer: Buffer
      try {
        buffer = await fs.readFile(filePath)
      } catch {
        console.log(`  ✗  Source file not found: ${filePath}`)
        results.push({ entry, status: 'error', error: `File not found: ${filePath}` })
        continue
      }

      console.log(`  📏 Original size: ${formatBytes(buffer.byteLength)}`)

      // 3d. Compress if over the 5 MB guardrail
      let wasCompressed = false
      if (buffer.byteLength > MAX_FILE_SIZE) {
        console.log(`  ⚠  Exceeds 5 MB limit — compressing with sharp…`)
        buffer = await sharp(buffer)
          .resize({ width: COMPRESS_WIDTH, withoutEnlargement: true })
          .png({ quality: COMPRESS_QUALITY })
          .toBuffer()
        console.log(`  📏 Compressed size: ${formatBytes(buffer.byteLength)}`)
        wasCompressed = true

        // Double-check the compressed version passes the guardrail
        if (buffer.byteLength > MAX_FILE_SIZE) {
          console.log(`  ✗  Still exceeds 5 MB after compression — skipping`)
          results.push({
            entry,
            status: 'error',
            error: `Still exceeds 5 MB after compression (${formatBytes(buffer.byteLength)})`,
          })
          continue
        }
      }

      // 3e. Upload to Media
      const file: File = {
        name: entry.sourceFile,
        data: buffer,
        mimetype: 'image/png',
        size: buffer.byteLength,
      }

      console.log(`  ⬆  Uploading to Media…`)
      const mediaDoc = await payload.create({
        collection: 'media',
        data: {
          alt: entry.alt,
          tenant: tenantId,
        },
        file,
      })

      console.log(`  ✓  Media doc created: ${mediaDoc.id}`)

      // 3f. Link image to the record
      await payload.update({
        collection: entry.collection,
        id: record.id,
        data: { image: mediaDoc.id as string },
      })

      console.log(`  ✓  Linked to ${entry.collection} record`)
      results.push({
        entry,
        status: wasCompressed ? 'compressed' : 'created',
        mediaId: mediaDoc.id as string,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`  ✗  Error: ${msg}`)
      results.push({ entry, status: 'error', error: msg })
    }
  }

  // 4. Summary
  const created = results.filter((r) => r.status === 'created' || r.status === 'compressed').length
  const compressed = results.filter((r) => r.status === 'compressed').length
  const skipped = results.filter((r) => r.status === 'skipped').length
  const errors = results.filter((r) => r.status === 'error').length

  console.log('\n═══════════════════════════════════════')
  console.log('📊 Upload Summary')
  console.log('═══════════════════════════════════════')
  console.log(
    `  Created:    ${created}${compressed > 0 ? ` (${compressed} required compression)` : ''}`,
  )
  console.log(`  Skipped:    ${skipped}`)
  console.log(`  Errors:     ${errors}`)

  if (errors > 0) {
    console.log('\n❌ Errors:')
    for (const r of results) {
      if (r.status === 'error') {
        console.log(`  - ${r.entry.collection}:"${r.entry.matchValue}": ${r.error}`)
      }
    }
  }

  // 5. Cleanup — disconnect from MongoDB
  try {
    await (payload as unknown as { db?: { destroy?: () => Promise<void> } }).db?.destroy?.()
  } catch {
    // Best-effort cleanup
  }

  if (errors > 0) {
    process.exit(1)
  }

  console.log('\n✅ Done.\n')
}

main().catch((err) => {
  console.error('\n💥 Upload failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
