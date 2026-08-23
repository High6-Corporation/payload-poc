import { createHash } from 'node:crypto'
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { ObjectId } from 'mongodb'
import type { PayloadRequest } from 'payload'

export const retentionEnabled = () => process.env.ENABLE_RETENTION_DELETION === 'true'

export function envDays(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const n = Number.parseInt(raw, 10)
  return Number.isNaN(n) || n <= 0 ? fallback : n
}

function getS3Client(): S3Client {
  return new S3Client({
    region: process.env.SUPABASE_REGION || '',
    endpoint: process.env.SUPABASE_ENDPOINT || '',
    credentials: {
      accessKeyId: process.env.SUPABASE_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.SUPABASE_SECRET_ACCESS_KEY || '',
    },
    forcePathStyle: true,
  })
}

const sha256 = (content: string) => createHash('sha256').update(content, 'utf8').digest('hex')

/** Count non-empty lines — the NDJSON archive must have exactly one per archived row. */
export function countArchiveLines(body: string): number {
  return body.split('\n').filter((line) => line.trim() !== '').length
}

export interface ArchiveJobOptions {
  /** Task slug — used in log lines and the job-run-log row. */
  jobName: string
  /** Payload collection slug to read. */
  collectionSlug: string
  /** Raw Mongo collection name = slug as-is (verified convention). */
  rawCollectionName: string
  /** Date field the cutoff compares against. */
  cutoffField: string
  retentionDaysEnv: string
  archivePathEnv: string
  defaultPath: string
  defaultDays: number
}

export interface ArchiveResult {
  exported: number
  deleted: number
  dryRun: boolean
  archiveKey: string | null
  checksum: string | null
}

/**
 * Archive-then-delete pipeline shared by both retention jobs.
 *
 * Flow (order is the safety property — a failure at any archive step blocks
 * the delete):
 *   1. Paginate rows with <cutoffField> < cutoff.
 *   2. Serialize as NDJSON; compute sha256.
 *   3. Upload <run-stamp>.jsonl + .sha256 sidecar to SUPABASE_BUCKET.
 *   4. Read back and re-hash — mismatch throws.
 *   5. RECONCILE (Phase 3): the read-back file's line count must equal the
 *      archived row count — mismatch throws. A truncated or duplicate
 *      archive must never precede a delete.
 *   6. Delete ONLY when ENABLE_RETENTION_DELETION === 'true'. Otherwise log
 *      WOULD DELETE and delete nothing (dry-run).
 *   7. RECONCILE (Phase 3): after a live delete, deletedCount must equal the
 *      archived count — a mismatch throws a hard error (rows are already
 *      verified in the archive, so this surfaces a Mongo anomaly rather than
 *      data loss).
 */
export async function runArchiveJob(
  req: PayloadRequest,
  options: ArchiveJobOptions,
): Promise<ArchiveResult> {
  const payload = req.payload
  const days = envDays(options.retentionDaysEnv, options.defaultDays)
  const cutoff = new Date(Date.now() - days * 86400000)

  // 1. Paginate everything older than the cutoff
  const docs: Record<string, unknown>[] = []
  let page = 1
  for (;;) {
    const result = await payload.find({
      collection: options.collectionSlug as never,
      where: { [options.cutoffField]: { less_than: cutoff.toISOString() } },
      limit: 200,
      page,
      depth: 0,
      sort: options.cutoffField,
      overrideAccess: true,
    })
    docs.push(...(result.docs as unknown as Record<string, unknown>[]))
    if (!result.hasNextPage) break
    page += 1
  }

  if (docs.length === 0) {
    payload.logger.info(
      `[retention] ${options.jobName}: nothing older than the cutoff — nothing to do.`,
    )
    return { exported: 0, deleted: 0, dryRun: !retentionEnabled(), archiveKey: null, checksum: null }
  }

  const ids = docs.map((d) => String(d.id))

  // 2. NDJSON + checksum
  const ndjson = docs.map((d) => JSON.stringify(d)).join('\n') + '\n'
  const checksum = sha256(ndjson)
  const archivePath = process.env[options.archivePathEnv] || options.defaultPath
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const key = `${archivePath}${stamp}.jsonl`
  const bucket = process.env.SUPABASE_BUCKET || ''
  const client = getS3Client()

  // 3. Upload content + checksum sidecar
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: ndjson,
      ContentType: 'application/x-ndjson',
    }),
  )
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: `${key}.sha256`,
      Body: `${checksum}  ${key.split('/').pop()}\n`,
      ContentType: 'text/plain',
    }),
  )

  // 4. Verify by reading back — a failed verification must block deletion
  const got = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
  const body = (await got.Body?.transformToString('utf8')) ?? ''
  if (sha256(body) !== checksum) {
    throw new Error(
      `[retention] ${options.jobName}: checksum mismatch after upload for ${key} — aborting without deleting.`,
    )
  }

  // 5. Reconcile (Phase 3): archived file row count vs rows to delete
  const archivedLines = countArchiveLines(body)
  if (archivedLines !== docs.length || ids.length !== docs.length) {
    throw new Error(
      `[retention] ${options.jobName}: row-count reconcile mismatch for ${key} — ` +
        `archive has ${archivedLines} lines, expected ${docs.length} (${ids.length} ids). ` +
        `Aborting without deleting.`,
    )
  }

  // 6. Gated delete
  if (!retentionEnabled()) {
    payload.logger.info(
      `[retention] DRY-RUN ${options.jobName}: exported ${docs.length} rows to ${key} ` +
        `(sha256 ${checksum.slice(0, 12)}…, verified + reconciled ${archivedLines}/${docs.length}). ` +
        `WOULD DELETE ${ids.length} rows from ${options.rawCollectionName}. ` +
        `Set ENABLE_RETENTION_DELETION=true to enable deletion.`,
    )
    return {
      exported: docs.length,
      deleted: 0,
      dryRun: true,
      archiveKey: key,
      checksum,
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const conn = (payload.db as any)?.connection
  if (!conn?.db) {
    throw new Error(`[retention] ${options.jobName}: no raw DB connection — cannot delete archived rows.`)
  }
  const result = await conn.db
    .collection(options.rawCollectionName)
    .deleteMany({ _id: { $in: ids.map((id) => new ObjectId(id)) } })

  // 7. Reconcile (Phase 3): post-delete count
  if (result.deletedCount !== docs.length) {
    throw new Error(
      `[retention] ${options.jobName}: post-delete reconcile mismatch — deleted ${result.deletedCount} ` +
        `of ${docs.length} archived rows. Archive ${key} is verified; rows remaining in Mongo need review.`,
    )
  }

  payload.logger.info(
    `[retention] ${options.jobName}: archived ${docs.length} rows to ${key} ` +
      `(sha256 verified, reconciled) and deleted ${result.deletedCount} rows.`,
  )
  return { exported: docs.length, deleted: result.deletedCount, dryRun: false, archiveKey: key, checksum }
}

export interface JobRunLogEntry {
  jobName: string
  startedAt: Date
  finishedAt: Date
  status: 'success' | 'failed'
  rowsProcessed: number
  rowsArchived: number
  checksumOk: boolean
  deletedCount: number
  dryRun: boolean
  archiveKey: string | null
  errorMessage: string | null
}

/**
 * Write one job-run-log row. Failures are logged and swallowed — run-log
 * capture must never mask or alter the outcome of the archive job itself.
 */
export async function writeJobRunLog(req: PayloadRequest, entry: JobRunLogEntry): Promise<void> {
  try {
    await req.payload.create({
      collection: 'job-run-log',
      // Payload date fields accept ISO strings (the generated type rejects Date)
      data: {
        ...entry,
        startedAt: entry.startedAt.toISOString(),
        finishedAt: entry.finishedAt.toISOString(),
      },
      overrideAccess: true,
      req,
    })
  } catch (err) {
    console.error(`[retention] failed to write job-run-log row for ${entry.jobName}:`, err)
  }
}
