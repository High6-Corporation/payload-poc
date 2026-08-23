import type { CollectionConfig } from 'payload'

import { superAdminOnly } from '@/access/tenantScoped'

/**
 * Run history for the retention archive jobs (agent-audit-log, change-log).
 *
 * Written ONLY by the job handlers via local API (overrideAccess) — one row
 * per run, success or failed. Super-admins read it in the admin UI under
 * Logs; a failed run is visible there without checking server logs.
 * There is deliberately no external alert channel (Slack/email) — none
 * confirmed available; structured console logging accompanies each row.
 */
export const JobRunLog: CollectionConfig = {
  slug: 'job-run-log',
  labels: { singular: 'Job Run', plural: 'Job Runs' },
  access: {
    create: () => false,
    read: superAdminOnly,
    update: () => false,
    delete: () => false,
  },
  admin: {
    useAsTitle: 'jobName',
    defaultColumns: [
      'jobName',
      'status',
      'rowsArchived',
      'deletedCount',
      'dryRun',
      'startedAt',
      'finishedAt',
    ],
    group: 'Logs',
    description:
      'Run history for retention archive jobs. Written by the job handlers themselves; ' +
      'a failed archive run appears here as status=failed with the error message.',
  },
  defaultSort: '-startedAt',
  fields: [
    {
      name: 'jobName',
      type: 'text',
      required: true,
      admin: { description: 'Task slug of the archive job.' },
    },
    {
      name: 'status',
      type: 'select',
      options: ['success', 'failed'],
      required: true,
    },
    {
      name: 'startedAt',
      type: 'date',
      required: true,
      admin: { date: { pickerAppearance: 'dayAndTime' } },
    },
    {
      name: 'finishedAt',
      type: 'date',
      admin: { date: { pickerAppearance: 'dayAndTime' } },
    },
    {
      name: 'rowsProcessed',
      type: 'number',
      admin: { description: 'Rows older than the cutoff found for this run.' },
    },
    {
      name: 'rowsArchived',
      type: 'number',
      admin: { description: 'Rows exported to the NDJSON archive.' },
    },
    {
      name: 'checksumOk',
      type: 'checkbox',
      admin: { description: 'Read-back sha256 verification passed.' },
    },
    {
      name: 'deletedCount',
      type: 'number',
      admin: {
        description: 'Rows deleted. 0 while ENABLE_RETENTION_DELETION is off (dry-run).',
      },
    },
    {
      name: 'dryRun',
      type: 'checkbox',
      admin: { description: 'True when deletion was gated off for this run.' },
    },
    {
      name: 'archiveKey',
      type: 'text',
      admin: {
        description: 'Supabase object key of the NDJSON archive (null when nothing archived).',
      },
    },
    {
      name: 'errorMessage',
      type: 'textarea',
      admin: {
        condition: (_, siblingData) => siblingData?.status === 'failed',
        description: 'Failure reason when status is failed.',
      },
    },
  ],
}
