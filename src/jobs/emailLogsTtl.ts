import type { Payload } from 'payload'

// Raw Mongo collection name = Payload slug AS-IS (hyphens kept) — same verified
// convention as SMTP_SETTINGS_COLLECTION in src/utilities/resolveSmtpConfig.ts.
const EMAIL_LOGS_COLLECTION = 'email-logs'
const TTL_INDEX_NAME = 'ttl_sentAt'

const SAFETY_FLAG = () => process.env.ENABLE_RETENTION_DELETION === 'true'

/**
 * Ensure the EmailLogs TTL index exists — but only when deletion is enabled.
 *
 * SAFETY GATE: with ENABLE_RETENTION_DELETION !== 'true' this logs the index
 * spec it WOULD create and does nothing. The live index only ever exists once
 * the flag is flipped on a deploy. If the flag is later turned off, the index
 * (if created) persists — drop it manually with:
 *   db['email-logs'].dropIndex('ttl_sentAt')
 */
export async function ensureEmailLogsTtlIndex(payload: Payload): Promise<void> {
  const raw = process.env.EMAIL_LOGS_RETENTION_DAYS
  const days = raw ? Number.parseInt(raw, 10) : 90
  const safeDays = Number.isNaN(days) || days <= 0 ? 90 : days
  const expireAfterSeconds = safeDays * 86400

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const conn = (payload.db as any)?.connection
  if (!conn?.db) {
    payload.logger.warn('[retention] No raw DB connection — skipping EmailLogs TTL index check')
    return
  }

  if (!SAFETY_FLAG()) {
    payload.logger.info(
      `[retention] DRY-RUN EmailLogs TTL: WOULD create index "${TTL_INDEX_NAME}" ` +
        `on ${EMAIL_LOGS_COLLECTION}.sentAt with expireAfterSeconds=${expireAfterSeconds} ` +
        `(${safeDays}d). Not created — ENABLE_RETENTION_DELETION !== 'true'.`,
    )
    return
  }

  const col = conn.db.collection(EMAIL_LOGS_COLLECTION)
  const indexes = await col.indexes().catch(() => [])
  const exists = indexes.some((i: { name?: string }) => i.name === TTL_INDEX_NAME)
  if (exists) return

  await col.createIndex({ sentAt: 1 }, { name: TTL_INDEX_NAME, expireAfterSeconds })
  payload.logger.info(
    `[retention] Created TTL index "${TTL_INDEX_NAME}" (expireAfterSeconds=${expireAfterSeconds}, ${safeDays}d).`,
  )
}
