import { createHash } from 'node:crypto'
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { ObjectId } from 'mongodb'
import type { TaskConfig } from 'payload'

// Raw Mongo collection name = Payload slug AS-IS — same convention as
// SMTP_SETTINGS_COLLECTION in src/utilities/resolveSmtpConfig.ts.
const AGENT_AUDIT_LOG_COLLECTION = 'agent-audit-log'

const retentionEnabled = () => process.env.ENABLE_RETENTION_DELETION === 'true'

function envDays(name: string, fallback: number): number {
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

/**
 * Archive-then-delete for AgentAuditLog rows older than the retention window.
 *
 * Flow (order is the safety property):
 *   1. Paginate rows with confirmedAt < cutoff.
 *   2. Serialize as NDJSON; compute sha256.
 *   3. Upload <run-stamp>.jsonl + <run-stamp>.jsonl.sha256 sidecar to
 *      SUPABASE_BUCKET under AGENT_AUDIT_LOG_ARCHIVE_PATH.
 *   4. Read the object back and re-hash — mismatch throws (blocks deletion).
 *   5. Delete ONLY when ENABLE_RETENTION_DELETION === 'true'. Otherwise log
 *      exactly what WOULD be deleted and delete nothing (dry-run).
 *
 * Run-stamped (not day-stamped) filenames keep dry-run exports from colliding
 * with the first live run's exports of the same rows.
 */
export const archiveAgentAuditLogTask: TaskConfig<'archive-agent-audit-log'> = {
  slug: 'archive-agent-audit-log',
  inputSchema: [],
  retries: 0,
  schedule: [
    // Daily at 03:00 local (6-field cron, seconds first). handleSchedules
    // checks this whenever GET /api/payload-jobs/run is hit (Vercel Cron).
    { cron: '0 0 3 * * *', queue: 'default' },
  ],
  handler: async ({ req }) => {
    const payload = req.payload
    const days = envDays('AGENT_AUDIT_LOG_RETENTION_DAYS', 180)
    const cutoff = new Date(Date.now() - days * 86400000)

    // 1. Paginate everything older than the cutoff
    const docs: Record<string, unknown>[] = []
    let page = 1
    for (;;) {
      const result = await payload.find({
        collection: 'agent-audit-log',
        where: { confirmedAt: { less_than: cutoff.toISOString() } },
        limit: 200,
        page,
        depth: 0,
        sort: 'confirmedAt',
        overrideAccess: true,
      })
      docs.push(...(result.docs as unknown as Record<string, unknown>[]))
      if (!result.hasNextPage) break
      page += 1
    }

    if (docs.length === 0) {
      payload.logger.info(
        '[retention] agent-audit-log: nothing older than the cutoff — nothing to do.',
      )
      return { output: { exported: 0, deleted: 0, dryRun: !retentionEnabled() } }
    }

    const ids = docs.map((d) => String(d.id))

    // 2. NDJSON + checksum
    const ndjson = docs.map((d) => JSON.stringify(d)).join('\n') + '\n'
    const checksum = sha256(ndjson)
    const archivePath = process.env.AGENT_AUDIT_LOG_ARCHIVE_PATH || 'archives/agent-audit-log/'
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
      throw new Error(`[retention] Checksum mismatch after upload for ${key} — aborting without deleting.`)
    }

    // 5. Gated delete
    if (!retentionEnabled()) {
      payload.logger.info(
        `[retention] DRY-RUN agent-audit-log: exported ${docs.length} rows to ${key} ` +
          `(sha256 ${checksum.slice(0, 12)}…, verified by read-back). ` +
          `WOULD DELETE ${ids.length} rows from ${AGENT_AUDIT_LOG_COLLECTION}. ` +
          `Set ENABLE_RETENTION_DELETION=true to enable deletion.`,
      )
      return { output: { exported: docs.length, deleted: 0, dryRun: true } }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const conn = (payload.db as any)?.connection
    if (!conn?.db) {
      throw new Error('[retention] No raw DB connection — cannot delete archived rows.')
    }
    const result = await conn.db
      .collection(AGENT_AUDIT_LOG_COLLECTION)
      .deleteMany({ _id: { $in: ids.map((id) => new ObjectId(id)) } })

    payload.logger.info(
      `[retention] agent-audit-log: archived ${docs.length} rows to ${key} ` +
        `(sha256 verified) and deleted ${result.deletedCount} rows.`,
    )
    return { output: { exported: docs.length, deleted: result.deletedCount, dryRun: false } }
  },
}
