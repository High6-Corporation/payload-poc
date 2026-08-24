import type { TaskConfig } from 'payload'

import { retentionEnabled, runArchiveJob, writeJobRunLog } from './archiveShared'

// Raw Mongo collection name = Payload slug AS-IS — same convention as
// SMTP_SETTINGS_COLLECTION in src/utilities/resolveSmtpConfig.ts.
const AGENT_AUDIT_LOG_COLLECTION = 'agent-audit-log'

/**
 * Archive-then-delete for AgentAuditLog rows older than the retention
 * window. Pipeline lives in archiveShared.ts; this task adds the schedule,
 * the run-history row, and the failure surfacing.
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
    const startedAt = new Date()
    let rowsProcessed = 0
    try {
      const result = await runArchiveJob(req, {
        jobName: 'archive-agent-audit-log',
        collectionSlug: 'agent-audit-log',
        rawCollectionName: AGENT_AUDIT_LOG_COLLECTION,
        cutoffField: 'confirmedAt',
        retentionDaysEnv: 'AGENT_AUDIT_LOG_RETENTION_DAYS',
        archivePathEnv: 'AGENT_AUDIT_LOG_ARCHIVE_PATH',
        defaultPath: 'archives/agent-audit-log/',
        defaultDays: 180,
      })
      rowsProcessed = result.exported
      await writeJobRunLog(req, {
        jobName: 'archive-agent-audit-log',
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
        jobName: 'archive-agent-audit-log',
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
