# Change-History Phase 3 + 4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the ChangeLog archive-then-delete job with a row-count reconcile step (Phase 3) and a job-run-log mechanism giving super-admins admin-UI visibility into archive-job success/failure (Phase 4). Execution mode: inline (established preference from the Phase 1+2 session).

**Architecture:** Extract the existing AgentAuditLog archive pipeline into a shared `runArchiveJob(req, options)` helper in `src/jobs/archiveShared.ts`, adding the Phase 3 reconcile (read-back line count === archived row count before delete; `deletedCount === archived` after delete). Both tasks (existing agent-audit-log + new change-log) wrap the helper and record one `job-run-log` row per run (success or failed) via a new hooks-closed collection visible to super-admins under Logs. No external alert channel this session (none confirmed available — admin-UI visibility + structured logging only).

**Tech Stack:** Payload 3.85.1, MongoDB Atlas (prod — additive only), @aws-sdk/client-s3 (already a dep), node:crypto, Payload jobs queue.

**Spec:** [docs/payload/change-history-audit-trail-design.md §6–7](../payload/change-history-audit-trail-design.md) — this plan implements Phase 3 (ChangeLog archive + verify step) and Phase 4 (monitoring/alerting). The Phase 1 job in `src/jobs/archiveAgentAuditLog.ts` is the pattern being mirrored.

## Global Constraints

- `ENABLE_RETENTION_DELETION` stays OFF/false — both archive jobs run dry-run only this session. Never flip it.
- Production database — additive changes only (new `job-run-log` collection, new task; no deletes beyond the gated ones which are off).
- Never run `pnpm build` while the dev server is running.
- A failed archive step must block the delete step — never proceed silently (design principle, already in the Phase 1 job; preserved and extended by the reconcile).
- Revert any deliberately-broken config (bad Supabase bucket) immediately after the failure-path test.
- Raw Mongo collection names are the slug as-is (`change-log`, `agent-audit-log`).
- `change-log.previousValue/newValue` store JSON-encoded text (prior-session gotcha) — the ChangeLog archive exports docs as-is, no re-encoding needed; do NOT strip fields.

## Verified facts from the prior session (do not re-derive)

- Jobs run endpoint GET `/api/payload-jobs/run`; no REST queue endpoint (queue via local API).
- `TaskConfig.schedule = [{ cron: '6-field', queue: 'default' }]`; handleSchedules checks on every /run hit.
- `(payload.db as any)?.connection` → `conn.db.collection('<slug-as-is>')` for raw reads/deletes.
- Temp vitest specs (jsdom + dotenv) can invoke a task handler directly with `{ req: { payload } }` and `process.env` overrides scoped to the test process — the established dry-run verification pattern.
- `payload.count({ collection })` works for before/after assertions.

---

### Task A: JobRunLog collection + env vars

**Files:**
- Create: `src/collections/JobRunLog.ts`
- Modify: `src/payload.config.ts` (register)
- Modify: `.env.example` (CHANGE_LOG_* vars)

**Interfaces:**
- Produces: `JobRunLog: CollectionConfig` (slug `job-run-log`) — hooks-closed writes (`create/update/delete: () => false`), `read: superAdminOnly`, admin group `Logs`.
- Produces env contracts consumed by Task C: `CHANGE_LOG_RETENTION_DAYS` (default 365), `CHANGE_LOG_ARCHIVE_PATH` (default `archives/change-log/`).

- [ ] **Step 1: Create `src/collections/JobRunLog.ts`**

```ts
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
      admin: { description: 'Rows deleted. 0 while ENABLE_RETENTION_DELETION is off (dry-run).' },
    },
    {
      name: 'dryRun',
      type: 'checkbox',
      admin: { description: 'True when deletion was gated off for this run.' },
    },
    {
      name: 'archiveKey',
      type: 'text',
      admin: { description: 'Supabase object key of the NDJSON archive (null when nothing archived).' },
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
```

- [ ] **Step 2: Register in `src/payload.config.ts`**

Add import `import { JobRunLog } from './collections/JobRunLog'` and add `JobRunLog` to the collections array right after `ChangeLog`.

- [ ] **Step 3: Document env vars in `.env.example`**

Append:

```
# ChangeLog retention (change-history design doc §4) — optional, defaults shown
CHANGE_LOG_RETENTION_DAYS=365
CHANGE_LOG_ARCHIVE_PATH=archives/change-log/
```

- [ ] **Step 4: Type-check + commit**

Run: `cd /Users/josh/work/payload-poc && pnpm exec tsc --noEmit`
Expected: clean.
Commit: `git add src/collections/JobRunLog.ts src/payload.config.ts .env.example` — `chore(phase-4): job-run-log collection + ChangeLog retention env vars`.

---

### Task B: Shared archive helper with reconcile + run-log writes

**Files:**
- Create: `src/jobs/archiveShared.ts`
- Modify: `src/jobs/archiveAgentAuditLog.ts` (refactor onto the helper + run-log)

**Interfaces:**
- Produces: `runArchiveJob(req: PayloadRequest, options: ArchiveJobOptions): Promise<ArchiveResult>`
- Produces: `writeJobRunLog(req, entry: JobRunLogEntry): Promise<void>` — swallows its own failures.
- Produces (tested in Task D): `countArchiveLines(body: string): number`, `ArchiveJobOptions`, `ArchiveResult`, `JobRunLogEntry`.

- [ ] **Step 1: Create `src/jobs/archiveShared.ts`**

```ts
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
    payload.logger.info(`[retention] ${options.jobName}: nothing older than the cutoff — nothing to do.`)
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
    new PutObjectCommand({ Bucket: bucket, Key: key, Body: ndjson, ContentType: 'application/x-ndjson' }),
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
      data: { ...entry },
      overrideAccess: true,
      req,
    })
  } catch (err) {
    console.error(`[retention] failed to write job-run-log row for ${entry.jobName}:`, err)
  }
}
```

- [ ] **Step 2: Refactor `src/jobs/archiveAgentAuditLog.ts` onto the helper**

Replace the whole file with:

```ts
import type { TaskConfig } from 'payload'

import { runArchiveJob, writeJobRunLog } from './archiveShared'

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
        dryRun: !process.env.ENABLE_RETENTION_DELETION || process.env.ENABLE_RETENTION_DELETION !== 'true',
        archiveKey: null,
        errorMessage: err instanceof Error ? err.message : String(err),
      })
      throw err
    }
  },
}
```

Wait — the dryRun flag on the failed path: derive from the env gate directly: `const dryRun = process.env.ENABLE_RETENTION_DELETION !== 'true'` — reuse `retentionEnabled()` from archiveShared. Adjust: import { retentionEnabled } and use `dryRun: !retentionEnabled()`.

- [ ] **Step 3: Type-check**

Run: `cd /Users/josh/work/payload-poc && pnpm exec tsc --noEmit`
Expected: clean (note: `collection: options.collectionSlug as never` sidesteps the typed collection slug — acceptable and commented).

- [ ] **Step 4: Commit**

`git add src/jobs/archiveShared.ts src/jobs/archiveAgentAuditLog.ts` — `refactor(retention): shared archive pipeline with Phase 3 row-count reconcile + job-run-log`.

---

### Task C: ChangeLog archive task

**Files:**
- Create: `src/jobs/archiveChangeLog.ts`
- Modify: `src/payload.config.ts` (add task to `jobs.tasks`)

**Interfaces:**
- Consumes: `runArchiveJob`, `writeJobRunLog`, `retentionEnabled` from Task B.
- Produces: `archiveChangeLogTask: TaskConfig<'archive-change-log'>`.

- [ ] **Step 1: Create `src/jobs/archiveChangeLog.ts`**

```ts
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
```

- [ ] **Step 2: Register in `src/payload.config.ts`**

Add import `import { archiveChangeLogTask } from './jobs/archiveChangeLog'` and change `tasks: [archiveAgentAuditLogTask]` to `tasks: [archiveAgentAuditLogTask, archiveChangeLogTask]`.

- [ ] **Step 3: Type-check + commit**

`pnpm exec tsc --noEmit` then
`git add src/jobs/archiveChangeLog.ts src/payload.config.ts` — `feat(retention): ChangeLog archive job (03:05, 365d default, dry-run gated)`.

---

### Task D: Unit tests for the reconcile helpers

**Files:**
- Create: `tests/int/archive-reconcile.int.spec.ts` (pure functions only — no DB writes)

- [ ] **Step 1: Write the spec**

```ts
import { describe, it, expect } from 'vitest'

import { countArchiveLines, envDays } from '@/jobs/archiveShared'

describe('archive reconcile helpers', () => {
  it('counts non-empty NDJSON lines and ignores trailing whitespace lines', () => {
    expect(countArchiveLines('{"a":1}\n{"b":2}\n')).toBe(2)
    expect(countArchiveLines('{"a":1}\n\n  \n{"b":2}\n')).toBe(2)
    expect(countArchiveLines('')).toBe(0)
  })

  it('matches rows exactly for the common shapes', () => {
    const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    const ndjson = rows.map((r) => JSON.stringify(r)).join('\n') + '\n'
    expect(countArchiveLines(ndjson)).toBe(rows.length)
  })

  it('envDays falls back on missing/invalid values', () => {
    delete process.env.TEST_RETENTION_DAYS
    expect(envDays('TEST_RETENTION_DAYS', 365)).toBe(365)
    process.env.TEST_RETENTION_DAYS = '0'
    expect(envDays('TEST_RETENTION_DAYS', 365)).toBe(365)
    process.env.TEST_RETENTION_DAYS = '-5'
    expect(envDays('TEST_RETENTION_DAYS', 365)).toBe(365)
    process.env.TEST_RETENTION_DAYS = 'abc'
    expect(envDays('TEST_RETENTION_DAYS', 365)).toBe(365)
    process.env.TEST_RETENTION_DAYS = '7'
    expect(envDays('TEST_RETENTION_DAYS', 365)).toBe(7)
    delete process.env.TEST_RETENTION_DAYS
  })
})
```

- [ ] **Step 2: Run tests**

Run: `cd /Users/josh/work/payload-poc && pnpm test:int`
Expected: all specs pass (80 previous + 3 new).

- [ ] **Step 3: Commit**

`git add tests/int/archive-reconcile.int.spec.ts` — `test(retention): reconcile helper unit tests`.

---

### Task E: Dry-run verification of both jobs

**Files:** temporary `tests/int/tmp-phase34-dry-run.int.spec.ts` (deleted after verification).

- [ ] **Step 1: Write the temp spec**

```ts
import { getPayload, Payload } from 'payload'
import config from '@/payload.config'

import { describe, it, beforeAll, expect } from 'vitest'

import { archiveAgentAuditLogTask } from '@/jobs/archiveAgentAuditLog'
import { archiveChangeLogTask } from '@/jobs/archiveChangeLog'

let payload: Payload

describe('Phase 3/4 dry-run (temporary)', () => {
  beforeAll(async () => {
    const payloadConfig = await config
    payload = await getPayload({ config: payloadConfig })
  })

  it('change-log job dry-runs: export + verify + reconcile, zero deletions', async () => {
    const before = await payload.count({ collection: 'change-log' })
    process.env.CHANGE_LOG_RETENTION_DAYS = '1'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (archiveChangeLogTask.handler as any)({ req: { payload }, input: {} })
    delete process.env.CHANGE_LOG_RETENTION_DAYS
    const after = await payload.count({ collection: 'change-log' })
    console.log('CHANGE-LOG DRY-RUN:', JSON.stringify(result.output))
    expect(result.output.exported).toBeGreaterThan(0)
    expect(result.output.deleted).toBe(0)
    expect(result.output.dryRun).toBe(true)
    expect(after.totalDocs).toBe(before.totalDocs)
  })

  it('agent-audit-log job dry-runs and records a run-log row', async () => {
    const before = await payload.count({ collection: 'job-run-log' })
    process.env.AGENT_AUDIT_LOG_RETENTION_DAYS = '1'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (archiveAgentAuditLogTask.handler as any)({ req: { payload }, input: {} })
    delete process.env.AGENT_AUDIT_LOG_RETENTION_DAYS
    console.log('AGENT DRY-RUN:', JSON.stringify(result.output))
    expect(result.output.dryRun).toBe(true)
    const { docs } = await payload.find({
      collection: 'job-run-log',
      where: { jobName: { equals: 'archive-agent-audit-log' } },
      sort: '-startedAt',
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    expect(docs.length).toBe(1)
    const row = docs[0] as Record<string, unknown>
    expect(row.status).toBe('success')
    expect(row.dryRun).toBe(true)
    expect(row.deletedCount).toBe(0)
  })
})
```

- [ ] **Step 2: Run it**

Run: `pnpm vitest run tests/int/tmp-phase34-dry-run.int.spec.ts 2>&1 | tail -25`
Expected: both tests pass; CHANGE-LOG DRY-RUN shows exported N > 0 (the change-log rows from last session's browser verification, ~1 day old at cutoff 1d), deleted 0, dryRun true; run-log row exists with status success, dryRun true.

- [ ] **Step 3: Delete the temp spec**

`rm tests/int/tmp-phase34-dry-run.int.spec.ts`

---

### Task F: Prove the failure path blocks deletion (then revert)

**Files:** temporary `tests/int/tmp-phase34-failure.int.spec.ts` (deleted after verification).

- [ ] **Step 1: Write the temp spec**

```ts
import { getPayload, Payload } from 'payload'
import config from '@/payload.config'

import { describe, it, beforeAll, expect } from 'vitest'

import { archiveChangeLogTask } from '@/jobs/archiveChangeLog'

let payload: Payload

describe('Phase 3/4 failure path (temporary)', () => {
  beforeAll(async () => {
    const payloadConfig = await config
    payload = await getPayload({ config: payloadConfig })
  })

  it('broken Supabase bucket blocks deletion and records a failed run-log row', async () => {
    const beforeChangeLog = await payload.count({ collection: 'change-log' })
    const beforeRuns = await payload.count({ collection: 'job-run-log' })

    const originalBucket = process.env.SUPABASE_BUCKET
    process.env.SUPABASE_BUCKET = 'definitely-not-a-bucket-xyz'
    process.env.CHANGE_LOG_RETENTION_DAYS = '1'

    let thrown: Error | null = null
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (archiveChangeLogTask.handler as any)({ req: { payload }, input: {} })
    } catch (err) {
      thrown = err as Error
    }

    // REVERT immediately — even if the assertions below fail
    process.env.SUPABASE_BUCKET = originalBucket
    delete process.env.CHANGE_LOG_RETENTION_DAYS

    const afterChangeLog = await payload.count({ collection: 'change-log' })
    const afterRuns = await payload.count({ collection: 'job-run-log' })

    expect(thrown).not.toBeNull()
    expect(afterChangeLog.totalDocs).toBe(beforeChangeLog.totalDocs) // deletion blocked

    const { docs } = await payload.find({
      collection: 'job-run-log',
      where: { and: [{ jobName: { equals: 'archive-change-log' } }, { status: { equals: 'failed' } }] },
      sort: '-startedAt',
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    expect(docs.length).toBe(1)
    const row = docs[0] as Record<string, unknown>
    expect(row.status).toBe('failed')
    expect(String(row.errorMessage)).toContain('definitely-not-a-bucket')
    console.log('FAILED RUN ROW:', JSON.stringify({ status: row.status, error: row.errorMessage }))
  })
})
```

- [ ] **Step 2: Run it**

Run: `pnpm vitest run tests/int/tmp-phase34-failure.int.spec.ts 2>&1 | tail -25`
Expected: test passes — handler threw, change-log count unchanged (delete blocked by the failed upload), one failed run-log row with the bucket name in errorMessage. Env reverted inside the test.

- [ ] **Step 3: Delete the temp spec and re-verify env**

`rm tests/int/tmp-phase34-failure.int.spec.ts` and confirm `.env` has no ENABLE_RETENTION_DELETION and no bogus bucket (the override was in-process only — confirm via `grep -c ENABLE_RETENTION_DELETION .env` = 0).

---

### Task G: Docs, types, final checks

**Files:**
- Modify: `docs/payload/change-history-audit-trail-design.md` (status line + §7 notes)
- Regenerate: `src/payload-types.ts`

- [ ] **Step 1: Update design doc status + implementation notes**

Change the `**Status:**` line to include Phases 3 + 4:
`IMPLEMENTED (Phases 1 + 2 + 2b + 3 + 4) — … Phase 3: ChangeLog archive job with row-count reconcile; Phase 4: job-run-log collection for admin-UI failure visibility (no external alert channel).`

Append to §7 implementation notes:
- `job-run-log` collection (Logs group, super-admin read) records one row per archive run — success or failed — including rowsArchived, checksumOk, deletedCount, dryRun, and errorMessage. Check it for failed runs instead of server logs.
- ChangeLog archive runs at 03:05 (5 min after AgentAuditLog) to avoid both jobs hitting Supabase at once; `CHANGE_LOG_RETENTION_DAYS` 365 / `CHANGE_LOG_ARCHIVE_PATH` archives/change-log/.
- Phase 3 reconcile: read-back line count must equal archived row count pre-delete, and deletedCount must equal archived count post-delete — mismatch aborts/throws, never silently proceeds.
- Phase 4 alerting: deliberately no Slack/email channel (none confirmed available) — admin-UI visibility + structured console logging only.

- [ ] **Step 2: Regenerate types + final checks**

Run: `pnpm generate:types && pnpm exec tsc --noEmit && pnpm test:int`
Expected: clean; all specs pass (83 total).

- [ ] **Step 3: Commit**

`git add src/payload-types.ts docs/payload/change-history-audit-trail-design.md` — `docs(retention): mark phases 3+4 implemented + job-run-log notes`.

- [ ] **Step 4: graphify update + memory saves** — see Execution Handoff notes; run `graphify update` flow and save engram memories for the Phase 3/4 decisions.

---

## Self-Review

**Spec coverage (task brief → plan):**
- Phase 3 mirrors archiveAgentAuditLog pattern → Tasks B (shared helper preserves the exact flow) + C. ✅
- Row-count reconcile before delete + hard error on mismatch → Task B step 5/7 + Task D tests. ✅
- Same safety gate, dry-run default → Task B step 6 + Tasks E/F. ✅
- Wire into jobs queue/schedule; offset 03:05 vs 03:00 → Task C. ✅
- Phase 4 run history fields (name, started/finished, processed, archived, checksum, delete/dry-run, success/failure, error) → Task A collection + Tasks B/C writes. ✅
- Failed archive blocks delete (principle preserved, not weakened) → Tasks B + F (proven empirically). ✅
- Admin-UI visibility for super-admin, no external alert channel (none confirmed) → Task A (Logs group list) + Task G note. ✅
- Verification: tsc/test:int, dry-run confirmations, deliberate failure test with immediate revert → Tasks D/E/F. ✅
- Constraints: deletion stays OFF, additive-only, no pnpm build during dev, no guessing at alert channels → Global Constraints. ✅

**Placeholder scan:** no TBD/TODO; all steps carry concrete code/commands. ✅

**Type consistency:** `runArchiveJob(req, ArchiveJobOptions) → ArchiveResult`, `writeJobRunLog(req, JobRunLogEntry)` used identically in both tasks; task slugs `archive-agent-audit-log` / `archive-change-log` match jobName values; env names consistent across Tasks A/C/E/F. ✅
