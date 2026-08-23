import type { TaskConfig } from 'payload'

import { retentionEnabled, runArchiveJob, writeJobRunLog } from './archiveShared'

// Raw Mongo collection name = Payload slug AS-IS — same convention as
// SMTP_SETTINGS_COLLECTION in src/utilities/resolveSmtpConfig.ts.
const CHANGE_LOG_COLLECTION = 'change-log'

/**
 * Archive-then-delete for change-log rows older than the retention window
 * (design doc §4: 365 days default — this is the log most worth keeping).
 *
 * Runs 5 minutes after the AgentAuditLog job (03:05 vs 03:00) so the two
 * jobs don't hit Supabase Storage at the same moment.
 */
export const archiveChangeLogTask: TaskConfig<'archive-change-log'> = {
  slug: 'archive-change-log',
  inputSchema: [],
  retries: 0,
  schedule: [
    { cron: '0 5 3 * * *', queue: 'default' },
  ],
  handler: async ({ req }) => {
    const startedAt = new Date()
    let rowsProcessed = 0
    try {
      const result = await runArchiveJob(req, {
        jobName: 'archive-change-log',
        collectionSlug: 'change-log',
        rawCollectionName: CHANGE_LOG_COLLECTION,
        cutoffField: 'createdAt',
        retentionDaysEnv: 'CHANGE_LOG_RETENTION_DAYS',
        archivePathEnv: 'CHANGE_LOG_ARCHIVE_PATH',
        defaultPath: 'archives/change-log/',
        defaultDays: 365,
      })
      rowsProcessed = result.exported
      await writeJobRunLog(req, {
        jobName: 'archive-change-log',
        startedAt,
        finishedAt: new Date(),
        status: 'success',
        rowsProcessed,
        rowsArchived: result.exported,
        checksumOk: result.exported === 0 || result.checksum !== null,
        deletedCount: result.deleted,
        dryRun: result.dryRun,
        archiveKey: result.archiveKey,
        errorMessage: null,
      })
      return { output: { exported: result.exported, deleted: result.deleted, dryRun: result.dryRun } }
    } catch (err) {
      await writeJobRunLog(req, {
        jobName: 'archive-change-log',
        startedAt,
        finishedAt: new Date(),
        status: 'failed',
        rowsProcessed,
        rowsArchived: 0,
        checksumOk: false,
        deletedCount: 0,
        dryRun: !retentionEnabled(),
        archiveKey: null,
        errorMessage: err instanceof Error ? err.message : String(err),
      })
      throw err
    }
  },
}
