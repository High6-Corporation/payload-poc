# Change-History + Retention Phase 1 & 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Phase 1 (EmailLogs TTL index + AgentAuditLog archive-then-delete job, both inert by default) and Phase 2 (change-log collection + field-level diff hooks on SmtpSettings/Sites/Tenants/Users) plus Phase 2b (native versions on 6 Tier-1 content collections) of the signed-off change-history design.

**Architecture:** A hooks-only `change-log` collection captures field-level diffs via `afterChange`/`afterDelete` hooks on the four Tier-2 collections (actor + source attribution included). EmailLogs retention uses a Mongo TTL index created at `onInit` only when `ENABLE_RETENTION_DELETION=true` (dry-run log otherwise). AgentAuditLog retention is a Payload jobs-queue task with a `schedule` cron, exporting NDJSON + SHA-256 sidecar to the existing Supabase S3 bucket and deleting only when the same env flag is on. Tier-1 content gets native `versions: { maxPerDoc: 50 }`.

**Tech Stack:** Payload CMS 3.85.1, @payloadcms/db-mongodb (MongoDB Atlas), Next.js 16, `@aws-sdk/client-s3` (to be added), Node crypto, Vercel Cron.

**Spec:** [docs/payload/change-history-audit-trail-design.md](../payload/change-history-audit-trail-design.md) — this plan implements §3 Option C hybrid, §4 retention (EmailLogs 90d / AgentAuditLog 180d), and §6 Phase 1 + Phase 2. Phase 3 (ChangeLog archive) and Phase 4 (monitoring) are out of scope this session. Header/Footer ChangeLog is DEFERRED per sign-off (do not touch Header/Footer).

## Global Constraints

- Production database (MongoDB Atlas). All changes must be **additive**: no destructive migrations, no deletes unless gated by `ENABLE_RETENTION_DELETION === 'true'` (which stays **false** this entire session — never flip it).
- Never run `pnpm build` while the dev server is running (corrupts `.next`). `pnpm exec tsc --noEmit` is safe.
- Never edit `src/payload-types.ts` or `src/app/(payload)/admin/importMap.js` by hand — use `pnpm generate:types` / `pnpm generate:importmap`.
- Header/Footer globals: out of scope. Do not add hooks or versions to them.
- Do not log secret material: `apiKey`, `_apiKey`, `password`, `salt`, `hash`, tokens must never land in change-log rows.
- Verification credentials (super-admin): `payload.admin@high6.com` / `H1gh6Adm!nP@ass` (provided by the user for Playwright verification only — do not write into any file).
- Raw Mongo collection names are the Payload slug **as-is** (hyphens kept) — verified pattern in [src/utilities/resolveSmtpConfig.ts:24](../../src/utilities/resolveSmtpConfig.ts#L24).
- Known limitation to preserve: `afterChange`-based capture misses direct MongoDB writes (raw `conn.db` calls, `payload.db.deleteMany`). Only the email adapter and raw `_apiKey` reads bypass hooks today — same surface as the design doc states.

## Verified API facts (Payload 3.85.1 — do not re-derive)

- Jobs run endpoint is **GET** `/api/payload-jobs/run` ("GET instead of POST to allow it to be used in a Vercel Cron" — `node_modules/payload/dist/queues/endpoints/run.js`). It runs `handleSchedules` + drains the queue. The design doc said POST — GET is correct.
- `jobs.access.run` (already configured in [src/payload.config.ts:322](../../src/payload.config.ts#L322)) accepts `Authorization: Bearer ${CRON_SECRET}`; Vercel Cron sends exactly that header when the project defines a `CRON_SECRET` env var.
- Per-task scheduling: `TaskConfig.schedule?: ScheduleConfig[]` where `ScheduleConfig = { cron: string /* 6-field, seconds first */, hooks?, queue: string }` (`node_modules/payload/dist/queues/config/types/taskTypes.d.ts:215`). `getQueuesWithSchedules` reads `jobsConfig.tasks.filter(t => t.schedule?.length)`.
- `onInit?: (payload: Payload) => Promise<void> | void` (`node_modules/payload/dist/config/types.d.ts:209`).
- `afterChange` hook args include `previousDoc` (undefined on create); `afterDelete` fires per deleted doc (`node_modules/payload/dist/collections/config/types.d.ts`).
- Query operator for date cutoff: `{ confirmedAt: { less_than: '<ISO string>' } }`.
- Raw DB handle pattern: `(payload.db as any)?.connection` → `conn.db.collection('<slug-as-is>')` (see [resolveSmtpConfig.ts:113](../../src/utilities/resolveSmtpConfig.ts#L113)).
- `@aws-sdk/client-s3@3.1071.0` is present in the pnpm store as a transitive dep of `@payloadcms/storage-s3` — must be added to package.json with `pnpm add @aws-sdk/client-s3` to import it directly (pnpm does not hoist).
- Seed endpoint ([src/endpoints/seed/index.ts](../../src/endpoints/seed/index.ts)) touches tracked collections only for **users** (one `payload.delete` with `where: { email: { equals: 'demo-author@example.com' } }` and one `payload.create` of the demo author). Its bulk clears use `payload.db.deleteMany` (bypasses hooks). Sites/tenants are only *read* by seed.
- import-export plugin imports only into `custom-collection-entries` (Tier 4, deferred) — **no import path writes Tier-2 collections today**, so the skip-flag needs no import wiring this session.
- The agent (service account `AGENT_EMAIL`) has no actions on smtp-settings/sites/tenants/users today (ACTION_META covers FAQs/testimonials/portfolio/posts/pages/pricing/images/list only). Its writes arrive via REST PATCH as that user, so hooks capture them automatically with the agent as actor. **This does not duplicate AgentAuditLog today** — flagged for the handoff: if the agent later gains Tier-2 actions, both logs would record (intent log vs server-side truth log).

## Decisions taken (locked, no further sign-off)

- `source` field: v1 emits only `admin` | `agent` | `system`. `admin` covers both the admin UI and direct REST API calls (Payload sends no distinguishing admin header — verified: `@payloadcms/ui/dist/utilities/api.js` only merges auth headers). `agent` = authenticated user whose email equals `AGENT_EMAIL`. `system` = `req.payloadAPI === 'local'`. `api`/`public` stay in the select enum, unused, flagged in handoff.
- Archive filenames are run-stamped (`<ISO>.jsonl`), not "one file per day" — avoids dry-run/live-run filename collisions; still one file per run.
- Deletion uses raw `conn.db.collection(...).deleteMany` (one roundtrip), consistent with the verified raw-DB pattern; archive upload + read-back checksum verify happen *before* any delete.
- Users rows get `tenant: null, site: null` (users are cross-tenant; the interesting diff is the `tenants` array itself, captured via fieldPath).

---

## File Structure

| File | Create/Modify | Responsibility |
|---|---|---|
| `src/collections/ChangeLog.ts` | Create | The `change-log` collection (hooks-only writes, super-admin read) |
| `src/hooks/changeLog.ts` | Create | Reusable `afterChange`/`afterDelete` hook factory + diff/sanitize/actor/source helpers |
| `src/jobs/emailLogsTtl.ts` | Create | `ensureEmailLogsTtlIndex(payload)` — gated TTL index creation, dry-run log otherwise |
| `src/jobs/archiveAgentAuditLog.ts` | Create | Jobs-queue task: paginate → NDJSON → sha256 → S3 upload + sidecar → verify → gated delete |
| `src/payload.config.ts` | Modify | Register `ChangeLog`; add `onInit` TTL wiring; add task + schedule to `jobs` |
| `src/collections/SmtpSettings.ts` | Modify | Add change-log hooks (exclude apiKey paths) |
| `src/collections/Sites.ts` | Modify | Add change-log hooks |
| `src/collections/Tenants.ts` | Modify | Add change-log hooks |
| `src/collections/Users/index.ts` | Modify | Add change-log hooks (exclude auth-sensitive paths) |
| `src/endpoints/seed/index.ts` | Modify | `context: { skipChangeLog: true }` on the two users operations |
| `src/collections/FAQs.ts`, `Testimonials.ts`, `PortfolioItems.ts`, `PricingPlans.ts`, `MenuItems.ts`, `SiteSettings.ts` | Modify | Add `versions: { maxPerDoc: 50 }` |
| `.env.example` | Modify | Document 4 new env vars (no secrets) |
| `package.json` | Modify | `pnpm add @aws-sdk/client-s3` |
| `vercel.json` | Create | Cron hitting `/api/payload-jobs/run` hourly (inert until next deploy) |
| `tests/int/change-log.int.spec.ts` | Create | Pure unit tests for diff/sanitize/source/tenant-site helpers (no DB writes) |
| `docs/payload/change-history-audit-trail-design.md` | Modify | Update status header: Phases 1+2 implemented; flip-on runbook note |

---

### Task 1: Env var plumbing + S3 dependency

**Files:**
- Modify: `.env.example`
- Modify: `package.json` (via pnpm add)

**Interfaces:**
- Produces (read by Tasks 4 and 5): `process.env.EMAIL_LOGS_RETENTION_DAYS` (default 90), `AGENT_AUDIT_LOG_RETENTION_DAYS` (default 180), `AGENT_AUDIT_LOG_ARCHIVE_PATH` (default `archives/agent-audit-log/`), `ENABLE_RETENTION_DELETION` (default false). All read with fallback defaults — the app must boot without them.

- [ ] **Step 1: Add the S3 client dependency**

Run: `cd /Users/josh/work/payload-poc && pnpm add @aws-sdk/client-s3`
Expected: `package.json` gains `"@aws-sdk/client-s3": "^3.x"` matching the store version 3.1071.0.

- [ ] **Step 2: Document env vars in .env.example**

Append to `/Users/josh/work/payload-poc/.env.example`:

```
# Retention (change-history design doc §4) — all optional, defaults shown
# EMAIL_LOGS_RETENTION_DAYS: age (days) after which email-logs rows expire via Mongo TTL index
EMAIL_LOGS_RETENTION_DAYS=90
# AGENT_AUDIT_LOG_RETENTION_DAYS: age (days) after which agent-audit-log rows are archived to Supabase
AGENT_AUDIT_LOG_RETENTION_DAYS=180
# AGENT_AUDIT_LOG_ARCHIVE_PATH: prefix inside SUPABASE_BUCKET (no leading slash, trailing slash kept)
AGENT_AUDIT_LOG_ARCHIVE_PATH=archives/agent-audit-log/
# ENABLE_RETENTION_DELETION: SAFETY GATE — "true" enables real deletion (TTL index creation +
# archive-job deletes). Default false = dry-run only (logs what WOULD be deleted).
ENABLE_RETENTION_DELETION=false
```

- [ ] **Step 3: Verify app boots unchanged**

Run: `cd /Users/josh/work/payload-poc && pnpm exec tsc --noEmit`
Expected: no errors (env vars are not yet read).

- [ ] **Step 4: Commit**

```bash
git add .env.example package.json pnpm-lock.yaml
git commit -m "chore: add @aws-sdk/client-s3 + retention env var documentation"
```

---

### Task 2: EmailLogs TTL index (inert by default)

**Files:**
- Create: `src/jobs/emailLogsTtl.ts`
- Modify: `src/payload.config.ts`

**Interfaces:**
- Produces: `export async function ensureEmailLogsTtlIndex(payload: Payload): Promise<void>` — called from `onInit`.
- Consumes: `(payload.db as any)?.connection` → `conn.db.collection('email-logs')` (raw pattern from resolveSmtpConfig.ts); `process.env.EMAIL_LOGS_RETENTION_DAYS`, `ENABLE_RETENTION_DELETION`.

- [ ] **Step 1: Create `src/jobs/emailLogsTtl.ts`**

```ts
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
```

- [ ] **Step 2: Wire `onInit` in `src/payload.config.ts`**

Add import:

```ts
import { ensureEmailLogsTtlIndex } from './jobs/emailLogsTtl'
```

Add to `buildConfig({...})` (next to `hooks`, after `secret`):

```ts
  onInit: async (payload) => {
    await ensureEmailLogsTtlIndex(payload)
  },
```

- [ ] **Step 3: Verify dry-run log + no live index**

Start the dev server in background: `cd /Users/josh/work/payload-poc && pnpm dev > /tmp/payload-poc-dev.log 2>&1 &` (note: never `pnpm build` while it runs).
Wait for boot, then:
`grep "DRY-RUN EmailLogs TTL" /tmp/payload-poc-dev.log`
Expected: one DRY-RUN line containing `expireAfterSeconds=7776000 (90d)` and `Not created`.
Then confirm no TTL index exists in prod (do NOT create it):

```bash
cd /Users/josh/work/payload-poc && node -e "
import('mongodb').then(async ({ MongoClient }) => {
  const c = new MongoClient(process.env.DATABASE_URL)
  await c.connect()
  const idx = await c.db().collection('email-logs').indexes()
  console.log(idx.map(i => i.name).join('\n'))
  await c.close()
})
"
```

Expected: `ttl_sentAt` is NOT listed.

- [ ] **Step 4: Commit**

```bash
git add src/jobs/emailLogsTtl.ts src/payload.config.ts
git commit -m "feat(retention): EmailLogs TTL index onInit, dry-run by default (ENABLE_RETENTION_DELETION gate)"
```

---

### Task 3: AgentAuditLog archive-then-delete job (inert by default)

**Files:**
- Create: `src/jobs/archiveAgentAuditLog.ts`
- Modify: `src/payload.config.ts`
- Create: `vercel.json`

**Interfaces:**
- Produces: `export const archiveAgentAuditLogTask: TaskConfig<'archive-agent-audit-log'>` — consumed by `jobs.tasks` in payload.config. Handler returns `{ output: { exported: number; deleted: number; dryRun: boolean } }`.
- Consumes: `payload.find` on `agent-audit-log` (`less_than` on `confirmedAt`), S3 via `@aws-sdk/client-s3`, raw `deleteMany` via `conn.db`, env vars from Task 1.

- [ ] **Step 1: Create `src/jobs/archiveAgentAuditLog.ts`**

```ts
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
      docs.push(...result.docs)
      if (!result.hasNextPage) break
      page += 1
    }

    if (docs.length === 0) {
      payload.logger.info('[retention] agent-audit-log: nothing older than the cutoff — nothing to do.')
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
```

- [ ] **Step 2: Register task in `src/payload.config.ts`**

Add import:

```ts
import { archiveAgentAuditLogTask } from './jobs/archiveAgentAuditLog'
```

Change the existing `jobs` block (keep the existing `access` exactly as-is):

```ts
  jobs: {
    access: {
      // ... existing run access stays unchanged ...
    },
    tasks: [archiveAgentAuditLogTask],
  },
```

- [ ] **Step 3: Create `vercel.json` (inert until next deploy)**

```json
{
  "crons": [
    {
      "path": "/api/payload-jobs/run",
      "schedule": "17 * * * *"
    }
  ]
}
```

Note: Vercel Cron sends GET with `Authorization: Bearer ${CRON_SECRET}` automatically when the project env has `CRON_SECRET` — matching the existing `jobs.access.run` check. Hourly cadence lets Payload's `handleSchedules` pick up the daily 03:00 task cron. (The design doc said POST — the real endpoint is GET; see Verified API facts.)

- [ ] **Step 4: Dry-run verification via the real jobs queue**

With the dev server still running from Task 2:
1. Get an agent-user token (credentials already in `.env`):

```bash
cd /Users/josh/work/payload-poc
TOKEN=$(curl -s -X POST http://localhost:3000/api/users/login \
  -H 'Content-Type: application/json' \
  -d "{\"email\": \"$AGENT_EMAIL\", \"password\": \"$AGENT_PASSWORD\"}" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).token))")
```

2. Queue the task (jobs queue access defaults to logged-in users):

```bash
curl -s -X POST http://localhost:3000/api/payload-jobs/queue \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"task": "archive-agent-audit-log", "input": {}}'
```

3. Run the queue with the CRON secret (same auth as Vercel Cron):

```bash
curl -s "http://localhost:3000/api/payload-jobs/run" \
  -H "Authorization: Bearer $CRON_SECRET"
```

4. Inspect dev log:

```bash
grep "\[retention\]" /tmp/payload-poc-dev.log | tail -5
```

Expected: either `nothing older than the cutoff` (if prod has no rows >180d old — fine) or the DRY-RUN line with `exported N rows … WOULD DELETE N rows`. **No rows may be deleted from `agent-audit-log`.** Confirm via mongo count before/after (count must be unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/jobs/archiveAgentAuditLog.ts src/payload.config.ts vercel.json
git commit -m "feat(retention): AgentAuditLog archive-then-delete jobs task, dry-run by default"
```

---

### Task 4: change-log collection + hook machinery

**Files:**
- Create: `src/collections/ChangeLog.ts`
- Create: `src/hooks/changeLog.ts`
- Modify: `src/payload.config.ts` (register collection)

**Interfaces:**
- Produces: `ChangeLog: CollectionConfig` (slug `change-log`).
- Produces (consumed by Task 5): `buildChangeLogHooks(options?: { excludedPaths?: string[] }): { afterChange: CollectionAfterChangeHook; afterDelete: CollectionAfterDeleteHook }`.
- Produces (consumed by tests): `diffFields(prev, next, excludedPaths)`, `isExcludedPath(path, excludedPaths)`, `stripSensitive(value, excludedPaths)`, `getChangeLogSource(req)`, `getTenantAndSite(slug, doc)`.
- `req.context` flags: `skipChangeLog` (callers opt out — seed, future bulk ops) and `_changeLogWrite` (re-entry guard).

- [ ] **Step 1: Create `src/collections/ChangeLog.ts`**

```ts
import type { CollectionConfig } from 'payload'

import { superAdminOnly } from '@/access/tenantScoped'

/**
 * Immutable field-level change history across tracked collections.
 *
 * Writes come ONLY from the afterChange/afterDelete hooks in
 * src/hooks/changeLog.ts (create/update/delete access is () => false —
 * same pattern as EmailLogs). Read is super-admin only for now;
 * site/tenant-scoped read is a future enhancement.
 */
export const ChangeLog: CollectionConfig = {
  slug: 'change-log',
  labels: { singular: 'Change Log Entry', plural: 'Change Log' },
  access: {
    create: () => false,
    read: superAdminOnly,
    update: () => false,
    delete: () => false,
  },
  admin: {
    useAsTitle: 'collectionSlug',
    defaultColumns: ['collectionSlug', 'operation', 'fieldPath', 'actor', 'source', 'createdAt'],
    group: 'Logs',
    description:
      'Immutable field-level change history (Phase 2 of the change-history design doc). ' +
      'Written only by hooks on smtp-settings, sites, tenants, users. Super-admin read only.',
  },
  defaultSort: '-createdAt',
  fields: [
    {
      name: 'collectionSlug',
      type: 'text',
      required: true,
      admin: { description: 'Slug of the collection the change happened in.' },
    },
    {
      name: 'docId',
      type: 'text',
      required: true,
      admin: { description: 'ID of the changed document.' },
    },
    {
      name: 'operation',
      type: 'select',
      options: ['create', 'update', 'delete'],
      required: true,
    },
    {
      name: 'fieldPath',
      type: 'text',
      admin: { description: 'Dotted path of the changed field. Null = whole-document change.' },
    },
    {
      name: 'previousValue',
      type: 'json',
      admin: { description: 'Value before the change (null on create). Secret fields are stripped.' },
    },
    {
      name: 'newValue',
      type: 'json',
      admin: { description: 'Value after the change (null on delete). Secret fields are stripped.' },
    },
    {
      name: 'actor',
      type: 'relationship',
      relationTo: 'users',
      admin: { description: 'User who made the change. Null = system (adapter/job/seed).' },
    },
    {
      name: 'actorRole',
      type: 'text',
      admin: { description: 'Comma-joined roles of the actor at write time.' },
    },
    {
      name: 'source',
      type: 'select',
      options: ['admin', 'api', 'agent', 'public', 'system'],
      required: true,
      admin: {
        description:
          'admin = authenticated REST call (admin UI or direct API — not distinguishable in v1); ' +
          'agent = AGENT_EMAIL service account; system = local API (adapter/seed/jobs). ' +
          'api and public are reserved and unused in v1.',
      },
    },
    {
      name: 'tenant',
      type: 'relationship',
      relationTo: 'tenants',
      admin: { description: 'Attributed tenant when derivable (null for users).' },
    },
    {
      name: 'site',
      type: 'relationship',
      relationTo: 'sites',
      admin: { description: 'Attributed site when derivable.' },
    },
  ],
}
```

- [ ] **Step 2: Create `src/hooks/changeLog.ts`**

```ts
import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  PayloadRequest,
} from 'payload'

export type ChangeLogSource = 'admin' | 'api' | 'agent' | 'public' | 'system'

export interface ChangeLogRow {
  fieldPath: string | null
  previousValue: unknown
  newValue: unknown
}

const DEFAULT_EXCLUDED = new Set(['id', 'createdAt', 'updatedAt'])

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * Canonical JSON comparison — sorts object keys so key order differences
 * (admin payload vs stored doc) don't produce false-positive diffs.
 */
const stableStringify = (value: unknown): string => {
  if (value === null || value === undefined) return 'null'
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (isPlainObject(value)) {
    const entries = Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`)
    return `{${entries.join(',')}}`
  }
  return JSON.stringify(value)
}

/**
 * Path exclusion matches the exact path OR any suffix segment — so
 * 'apiKey' excludes both bare `apiKey` and nested `smtp.apiKey`.
 */
export function isExcludedPath(path: string, excludedPaths: string[]): boolean {
  return excludedPaths.some((p) => path === p || path.endsWith(`.${p}`))
}

/** Recursively remove excluded keys from any value before it is stored. */
export function stripSensitive(value: unknown, excludedPaths: string[]): unknown {
  if (Array.isArray(value)) return value.map((v) => stripSensitive(v, excludedPaths))
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      if (isExcludedPath(k, excludedPaths)) continue
      out[k] = stripSensitive(v, excludedPaths)
    }
    return out
  }
  return value
}

/**
 * Field-level diff between the stored doc and the saved doc.
 * Recurses into plain-object values (Payload tabs/groups store nested);
 * arrays and other non-plain values compare as a whole.
 */
export function diffFields(
  prev: Record<string, unknown>,
  next: Record<string, unknown>,
  excludedPaths: string[] = [],
): ChangeLogRow[] {
  const keys = new Set([...Object.keys(prev ?? {}), ...Object.keys(next ?? {})])
  const rows: ChangeLogRow[] = []
  for (const key of keys) {
    if (DEFAULT_EXCLUDED.has(key)) continue
    const path = key
    if (isExcludedPath(path, excludedPaths)) continue
    const pv = prev?.[key]
    const nv = next?.[key]
    if (isPlainObject(pv) && isPlainObject(nv)) {
      rows.push(...diffFields(pv, nv, excludedPaths))
    } else if (stableStringify(pv) !== stableStringify(nv)) {
      rows.push({
        fieldPath: path,
        previousValue: stripSensitive(pv, excludedPaths),
        newValue: stripSensitive(nv, excludedPaths),
      })
    }
  }
  return rows
}

/** v1 source detection — see collection field description for the collapse rationale. */
export function getChangeLogSource(req: PayloadRequest): ChangeLogSource {
  if (req.payloadAPI === 'local') return 'system'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const user = req.user as any
  if (!user) return 'public'
  const agentEmail = process.env.AGENT_EMAIL
  if (agentEmail && user.email === agentEmail) return 'agent'
  return 'admin'
}

const idOf = (v: unknown): string | null => {
  if (typeof v === 'string' && v) return v
  if (isPlainObject(v) && typeof v.id === 'string') return v.id
  return null
}

export function getTenantAndSite(
  slug: string,
  doc: Record<string, unknown>,
): { tenant: string | null; site: string | null } {
  switch (slug) {
    case 'tenants':
      // The doc IS the tenant
      return { tenant: typeof doc.id === 'string' ? doc.id : null, site: null }
    case 'sites':
      return { tenant: idOf(doc.tenant), site: typeof doc.id === 'string' ? doc.id : null }
    case 'smtp-settings':
      return { tenant: idOf(doc.tenant), site: idOf(doc.site) }
    case 'users':
      // Cross-tenant — the interesting diff (tenants array) is captured via fieldPath
      return { tenant: null, site: null }
    default:
      return { tenant: null, site: null }
  }
}

/**
 * Write change-log rows. Failures are logged and swallowed — audit capture
 * must never break the primary operation.
 */
async function writeChangeLogRows(
  req: PayloadRequest,
  slug: string,
  doc: Record<string, unknown>,
  operation: 'create' | 'update' | 'delete',
  rows: ChangeLogRow[],
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const user = req.user as any
  const { tenant, site } = getTenantAndSite(slug, doc)
  const base = {
    collectionSlug: slug,
    docId: String(doc.id),
    operation,
    actor: user?.id ?? null,
    actorRole: user?.roles?.length ? user.roles.join(',') : null,
    source: getChangeLogSource(req),
    tenant,
    site,
  }

  for (const row of rows) {
    try {
      await req.payload.create({
        collection: 'change-log',
        data: {
          ...base,
          fieldPath: row.fieldPath,
          previousValue: row.previousValue ?? null,
          newValue: row.newValue ?? null,
        },
        overrideAccess: true,
        context: { _changeLogWrite: true },
        req,
      })
    } catch (err) {
      console.error(`[change-log] failed to write row for ${slug}/${doc.id}:`, err)
    }
  }
}

export function buildChangeLogHooks(options: { excludedPaths?: string[] } = {}): {
  afterChange: CollectionAfterChangeHook
  afterDelete: CollectionAfterDeleteHook
} {
  const excludedPaths = options.excludedPaths ?? []

  const afterChange: CollectionAfterChangeHook = async ({
    collection,
    doc,
    previousDoc,
    operation,
    req,
    context,
  }) => {
    // Opt-out for bulk/system flows (seed) + re-entry guard
    if (context?.skipChangeLog || context?._changeLogWrite) return doc

    let rows: ChangeLogRow[]
    if (operation === 'create' || !previousDoc) {
      rows = [
        {
          fieldPath: null,
          previousValue: null,
          newValue: stripSensitive(doc, excludedPaths),
        },
      ]
    } else {
      rows = diffFields(previousDoc, doc, excludedPaths)
    }

    if (rows.length > 0) {
      await writeChangeLogRows(req, collection.slug, doc, 'update', rows)
    }
    return doc
  }

  const afterDelete: CollectionAfterDeleteHook = async ({
    collection,
    doc,
    req,
    context,
  }) => {
    if (context?.skipChangeLog || context?._changeLogWrite) return doc
    await writeChangeLogRows(req, collection.slug, doc, 'delete', [
      {
        fieldPath: null,
        previousValue: stripSensitive(doc, excludedPaths),
        newValue: null,
      },
    ])
    return doc
  }

  return { afterChange, afterDelete }
}
```

- [ ] **Step 3: Register the collection in `src/payload.config.ts`**

Add import `import { ChangeLog } from './collections/ChangeLog'` and add `ChangeLog` to the `collections` array right after `AgentAuditLog` (before `EmailLogs`).

- [ ] **Step 4: Type-check**

Run: `cd /Users/josh/work/payload-poc && pnpm exec tsc --noEmit`
Expected: clean (hooks are generic; the task/types come from payload).

- [ ] **Step 5: Commit**

```bash
git add src/collections/ChangeLog.ts src/hooks/changeLog.ts src/payload.config.ts
git commit -m "feat(change-log): hooks-only change-log collection + diff machinery"
```

---

### Task 5: Wire hooks into SmtpSettings, Sites, Tenants, Users + seed opt-out

**Files:**
- Modify: `src/collections/SmtpSettings.ts`
- Modify: `src/collections/Sites.ts`
- Modify: `src/collections/Tenants.ts`
- Modify: `src/collections/Users/index.ts`
- Modify: `src/endpoints/seed/index.ts`

**Interfaces:**
- Consumes: `buildChangeLogHooks` from Task 4.

- [ ] **Step 1: SmtpSettings — exclude the API key paths**

In `src/collections/SmtpSettings.ts` add import:

```ts
import { buildChangeLogHooks } from '@/hooks/changeLog'
```

Merge into the existing `hooks` block (keep `beforeValidate`/`afterRead`):

```ts
  hooks: {
    beforeValidate: [validateUniquePair],
    afterRead: [maskApiKey],
    ...buildChangeLogHooks({
      // Never record SMTP credentials — the apiKey fields live inside the
      // "smtp" tab, and the suffix match also covers the bare names.
      excludedPaths: ['apiKey', '_apiKey'],
    }),
  },
```

- [ ] **Step 2: Sites and Tenants — plain hooks**

In `src/collections/Sites.ts`:

```ts
import { buildChangeLogHooks } from '@/hooks/changeLog'

// inside the collection config:
  hooks: buildChangeLogHooks(),
```

Same two lines in `src/collections/Tenants.ts`.

- [ ] **Step 3: Users — exclude auth-sensitive fields**

In `src/collections/Users/index.ts` add import and hooks block:

```ts
import { buildChangeLogHooks } from '@/hooks/changeLog'

// inside the collection config:
  hooks: buildChangeLogHooks({
    // Auth-internal fields — never record password material or login noise.
    excludedPaths: [
      'password',
      'salt',
      'hash',
      'loginAttempts',
      'lockUntil',
      'resetPasswordToken',
      'resetPasswordExpiration',
      '_verificationToken',
      '_password',
    ],
  }),
```

- [ ] **Step 4: Seed opt-out (users operations only)**

In `src/endpoints/seed/index.ts`, add `context: { skipChangeLog: true }` to the two users operations:

```ts
  await payload.delete({
    collection: 'users',
    depth: 0,
    context: { skipChangeLog: true },
    where: {
      email: {
        equals: 'demo-author@example.com',
      },
    },
  })
```

and

```ts
    payload.create({
      collection: 'users',
      data: {
        name: 'Demo Author',
        email: 'demo-author@example.com',
        password: 'password',
      },
      context: { skipChangeLog: true },
    }),
```

(Seed's other writes touch only untracked collections; its bulk clears use `payload.db.deleteMany`, which bypasses hooks entirely.)

- [ ] **Step 5: Type-check + unit tests run**

Run: `cd /Users/josh/work/payload-poc && pnpm exec tsc --noEmit && pnpm test:int`
Expected: clean tsc; existing int specs still pass.

- [ ] **Step 6: Commit**

```bash
git add src/collections/SmtpSettings.ts src/collections/Sites.ts src/collections/Tenants.ts src/collections/Users/index.ts src/endpoints/seed/index.ts
git commit -m "feat(change-log): wire hooks into smtp-settings/sites/tenants/users + seed opt-out"
```

---

### Task 6: Unit tests for the diff machinery (no DB writes)

**Files:**
- Create: `tests/int/change-log.int.spec.ts`

**Interfaces:**
- Consumes: `diffFields`, `isExcludedPath`, `stripSensitive`, `getChangeLogSource`, `getTenantAndSite` from `@/hooks/changeLog`.
- Constraint: this spec must NOT write to the database (vitest loads `.env` → prod DATABASE_URL; keep it pure).

- [ ] **Step 1: Write the spec**

```ts
import { describe, it, expect } from 'vitest'

import {
  diffFields,
  getTenantAndSite,
  isExcludedPath,
  stripSensitive,
} from '@/hooks/changeLog'

describe('change-log diff machinery', () => {
  it('detects changed top-level fields and ignores unchanged ones', () => {
    const rows = diffFields(
      { title: 'Old', body: 'same', order: 1 },
      { title: 'New', body: 'same', order: 1 },
    )
    expect(rows).toEqual([{ fieldPath: 'title', previousValue: 'Old', newValue: 'New' }])
  })

  it('recurses into nested objects (Payload tab/group fields)', () => {
    const rows = diffFields(
      { smtp: { senderEmail: 'a@x.com', enabled: true } },
      { smtp: { senderEmail: 'b@x.com', enabled: true } },
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual({ fieldPath: 'senderEmail', previousValue: 'a@x.com', newValue: 'b@x.com' })
  })

  it('ignores excluded paths at any depth and strips them from stored values', () => {
    const rows = diffFields(
      { smtp: { apiKey: 'secret-1', senderEmail: 'a@x.com' } },
      { smtp: { apiKey: 'secret-2', senderEmail: 'b@x.com' } },
      ['apiKey', '_apiKey'],
    )
    expect(rows).toHaveLength(1) // only senderEmail
    expect(rows[0].fieldPath).toBe('senderEmail')
    expect(JSON.stringify(rows[0])).not.toContain('secret')
    expect(stripSensitive({ password: 'pw', name: 'x' }, ['password'])).toEqual({ name: 'x' })
  })

  it('handles create-style diffs (previous value null)', () => {
    const rows = diffFields({}, { name: 'New Site' })
    expect(rows).toEqual([{ fieldPath: 'name', previousValue: null, newValue: 'New Site' }])
  })

  it('treats arrays as atomic values', () => {
    const rows = diffFields(
      { tenants: [{ tenant: 'a' }] },
      { tenants: [{ tenant: 'b' }] },
    )
    expect(rows).toEqual([
      {
        fieldPath: 'tenants',
        previousValue: [{ tenant: 'a' }],
        newValue: [{ tenant: 'b' }],
      },
    ])
  })

  it('matches excluded paths by suffix', () => {
    expect(isExcludedPath('smtp.apiKey', ['apiKey', '_apiKey'])).toBe(true)
    expect(isExcludedPath('apiKey', ['apiKey', '_apiKey'])).toBe(true)
    expect(isExcludedPath('smtp.senderEmail', ['apiKey', '_apiKey'])).toBe(false)
  })

  it('attributes tenant/site per collection', () => {
    expect(getTenantAndSite('tenants', { id: 't1' })).toEqual({ tenant: 't1', site: null })
    expect(getTenantAndSite('sites', { id: 's1', tenant: 't1' })).toEqual({
      tenant: 't1',
      site: 's1',
    })
    expect(getTenantAndSite('smtp-settings', { tenant: 't1', site: 's1' })).toEqual({
      tenant: 't1',
      site: 's1',
    })
    expect(getTenantAndSite('smtp-settings', { tenant: { id: 't1' } })).toEqual({
      tenant: 't1',
      site: null,
    })
    expect(getTenantAndSite('users', { id: 'u1' })).toEqual({ tenant: null, site: null })
  })
})
```

- [ ] **Step 2: Run the spec**

Run: `cd /Users/josh/work/payload-poc && pnpm test:int`
Expected: all specs (including the new one) pass.

- [ ] **Step 3: Commit**

```bash
git add tests/int/change-log.int.spec.ts
git commit -m "test(change-log): unit tests for diff/sanitize/tenant-site helpers"
```

---

### Task 7: Phase 2b — native versions on Tier-1 content collections

**Files:**
- Modify: `src/collections/FAQs.ts`, `src/collections/Testimonials.ts`, `src/collections/PortfolioItems.ts`, `src/collections/PricingPlans.ts`, `src/collections/MenuItems.ts`, `src/collections/SiteSettings.ts`

**Interfaces:**
- None — pure config addition. Non-draft `versions: { maxPerDoc: 50 }` matches the Pages/Posts `maxPerDoc` convention; it adds snapshotting + admin "Versions" UI + restore, no draft/publish semantics.

- [ ] **Step 1: Add `versions` to each of the 6 collections**

In each file, add below the `slug` line (exact same block):

```ts
  versions: {
    maxPerDoc: 50,
  },
```

Targets: `FAQs.ts`, `Testimonials.ts`, `PortfolioItems.ts`, `PricingPlans.ts`, `MenuItems.ts`, `SiteSettings.ts`.
Do NOT touch Pages/Posts (already have drafts + maxPerDoc 50). Do NOT touch Header/Footer globals (deferred).

- [ ] **Step 2: Regenerate types**

Run: `cd /Users/josh/work/payload-poc && pnpm generate:types`
Expected: `src/payload-types.ts` regenerated with per-collection version types; command exits 0.

- [ ] **Step 3: Type-check + tests**

Run: `cd /Users/josh/work/payload-poc && pnpm exec tsc --noEmit && pnpm test:int`
Expected: clean; all specs pass.

- [ ] **Step 4: Commit**

```bash
git add src/collections/FAQs.ts src/collections/Testimonials.ts src/collections/PortfolioItems.ts src/collections/PricingPlans.ts src/collections/MenuItems.ts src/collections/SiteSettings.ts src/payload-types.ts
git commit -m "feat(versions): native versions (maxPerDoc 50) on Tier-1 content collections"
```

---

### Task 8: Browser verification (Playwright via dev server)

**Files:** none (verification only — screenshots into `/Users/josh/work/payload-poc/.playwright/` per project convention).

**Prereqs:** dev server running from Task 2 (restart it if stopped: `pnpm dev`, do not `pnpm build`). Super-admin credentials: `payload.admin@high6.com` / `H1gh6Adm!nP@ass`.

- [ ] **Step 1: Admin login + SmtpSettings change**

1. Navigate to `http://localhost:3000/admin`, log in as `payload.admin@high6.com`.
2. Open **SMTP Settings** (Tenant Management group) → first document.
3. Note the current `senderEmail` value (store it in the session — you will restore it).
4. Change `senderEmail` to `change-log-test@h6app.site`, **Save**.
5. Navigate to **Change Log** (Logs group). Expect the newest row: `collectionSlug: smtp-settings`, `operation: update`, `fieldPath: senderEmail` (field lives in the `smtp` tab — diff recurses into it), `previousValue: <old value>`, `newValue: change-log-test@h6app.site`, `actor: <the logged-in admin>`, `source: admin`.
6. Return to SMTP Settings and restore the original `senderEmail`, **Save** (produces a second, correct row — fine).

- [ ] **Step 2: FAQ version snapshot**

1. Open **FAQs** → any document, note the answer text, edit it (e.g. append ` (vtest)`), **Save**.
2. In the edit view, open the **Versions** UI (side panel) — expect a new snapshot entry with the save timestamp. Restore the original text afterwards if you prefer (also creates a snapshot — fine).

- [ ] **Step 3: Record evidence**

Screenshots to `.playwright/`: change-log list view showing the smtp-settings row; FAQ Versions panel showing the snapshot. Follow the project convention: absolute paths into `/Users/josh/work/payload-poc/.playwright/`.

- [ ] **Step 4: Confirm Phase 1 dry-run output once more**

`grep "\[retention\]" /tmp/payload-poc-dev.log | tail -10` — confirm DRY-RUN lines present and NO `deleted N rows` (live) lines. Confirm `ENABLE_RETENTION_DELETION` is unset/false in `.env` (it should not even be set — the code default is false).

---

### Task 9: Documentation + handoff notes

**Files:**
- Modify: `docs/payload/change-history-audit-trail-design.md` (status header + runbook note)

- [ ] **Step 1: Update the design doc status header**

Replace the `**Status:**` line with:

```
**Status:** IMPLEMENTED (Phases 1 + 2 + 2b) — EmailLogs TTL (dry-run by default), AgentAuditLog archive job (dry-run by default), change-log collection + hooks on smtp-settings/sites/tenants/users, native versions on Tier-1 content collections. Phase 3 (ChangeLog archive) and Phase 4 (monitoring) remain plan-only.
```

- [ ] **Step 2: Append the flip-on runbook**

At the end of the doc:

```markdown
## 7. Flip-On Runbook (ENABLE_RETENTION_DELETION)

Deletion is inert by default. To enable real deletion after a dry-run cycle has been observed:

1. Set `ENABLE_RETENTION_DELETION=true` in the deployment env (and `.env` for local).
2. Deploy. On first boot, `onInit` creates the EmailLogs TTL index `ttl_sentAt` (90d default).
3. The archive job's next scheduled run (daily 03:00, via Vercel Cron → GET /api/payload-jobs/run) will delete rows after verified archive upload.
4. If the flag is later set back to false, an existing TTL index is NOT removed automatically — drop it manually: `db['email-logs'].dropIndex('ttl_sentAt')`.
5. Manual dry-run at any time: POST /api/payload-jobs/queue `{ "task": "archive-agent-audit-log", "input": {} }` (any logged-in user) then GET /api/payload-jobs/run with `Authorization: Bearer $CRON_SECRET`.
```

- [ ] **Step 3: Commit**

```bash
git add docs/payload/change-history-audit-trail-design.md
git commit -m "docs: mark change-history phases 1+2+2b implemented + flip-on runbook"
```

---

## Self-Review

**Spec coverage (task brief → plan):**
- Phase 1 EmailLogs TTL, env-driven, dry-run default, no live index without flag → Task 2. ✅
- Phase 1 AgentAuditLog archive job: NDJSON + checksum + verify + gated delete → Task 3. ✅
- Jobs-queue wiring + Vercel Cron + CRON_SECRET → Tasks 2/3 (endpoint is GET, corrected). ✅
- Phase 2 change-log collection shape (collectionSlug, docId, operation, fieldPath, previousValue, newValue, actor, actorRole, source, tenant, site) → Task 4. ✅
- Access: create/update/delete `() => false`, read superAdminOnly → Task 4. ✅
- Hooks on SmtpSettings/Sites/Tenants/Users; loop guards; skip flag (seed; import plugin confirmed to not touch Tier 2) → Tasks 4/5. ✅
- Agent-write overlap with AgentAuditLog: verified no Tier-2 agent actions today; flagged, not guessed → Global Constraints + Task 5 commit message context. ✅
- Phase 2b versions on 6 Tier-1 collections, non-draft maxPerDoc 50 → Task 7. ✅
- Verification: tsc + test:int per phase; Playwright SmtpSettings edit → change-log row; FAQ edit → version snapshot; dry-run output confirmed; no live deletion → Tasks 2/3/6/8. ✅
- Header/Footer untouched; prod-additive; no pnpm build during dev; credentials used in-session only → Global Constraints. ✅

**Placeholder scan:** no TBD/TODO; every step has concrete code/commands. ✅

**Type consistency:** `buildChangeLogHooks` signature and `ChangeLogRow` shape consistent across Tasks 4/5/6; `TaskConfig<'archive-agent-audit-log'>` slug matches the schedule/queue references; env var names consistent across Tasks 1/2/3. ✅
