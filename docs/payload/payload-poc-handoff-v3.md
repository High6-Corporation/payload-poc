# Payload CMS POC — Session Handoff (v3)

> Date: 2026-06-18
> Project: apir-tayo (High6 Corporation)
> Supersedes: payload-poc-handoff-v2.md (2026-06-18)

---

## Background & Context

Sir Jeff tasked an exploration of **Payload CMS** as a potential headless CMS solution for apir-tayo and future client projects. The broader objective is to evaluate a multi-tenant CMS architecture where clients can manage content through an AI agent via voice/text commands — without ever touching the backend directly. The agent handles the changes with guardrails restricting what can be modified.

Sir Jeff has also noted that current client projects are built on WordPress, with a longer-term goal of moving toward headless. A parallel task was assigned to **Sir Gio**, who is evaluating **WordPress Multisite (IWP)** independently.

**Update from Sir Jeff (2026-06-18):** the direction has been clarified — eventually, the team will shift from WordPress headless to Payload CMS for succeeding projects. No need to evaluate WordPress directly; that stays on Sir Gio's track. Focus remains on proving out Payload.

**Open questions still pending with Sir Jeff:**
- Is there a deadline for this exploration?
- Is there an existing agent/AI setup at High6 to build on, or starting from scratch?
- MongoDB Atlas and Supabase are currently provisioned under a personal account (Josh's) — fine for POC, but should move to a company-owned account before anything production-adjacent.

---

## Project Location

```
~/work/payload-poc/
```

```bash
cd ~/work/payload-poc
pnpm dev
```
- Frontend: `http://localhost:3000`
- Admin panel: `http://localhost:3000/admin`

---

## Phase Status

| Phase | Status |
|---|---|
| 1. Initial scaffold + MongoDB Atlas connection | ✅ Done (session 1) |
| 2. Multi-tenancy (`@payloadcms/plugin-multi-tenant`) | ✅ Validated |
| 3. Content API test (REST + GraphQL, tenant-scoped) | ✅ Validated + hands-on UAT confirmed (2026-06-18) |
| 4. Image/media storage with upload guardrails | ✅ Done — all guardrails UAT-confirmed (2026-06-18) |
| 5. Agent concept POC (plain-language → Payload API) | ⬅ Next |
| 6. Align findings with Sir Gio's WordPress Multisite POC | ⬜ Pending Sir Jeff's input |
| 7. apir-tayo integration (if POC proves out) | ⬜ Future — replace hardcoded content + WP/Gravity Forms backend with Payload |

---

## Next Session — Start Here

Phase 4 is complete. Move directly to **Phase 5 — Agent Concept POC**.

Goal: build a basic agent that accepts plain-language commands and calls the Payload API to make content changes.

- Example flow: client says "change the hero headline to X" → agent calls Payload API → content updates
- Use the validated slug→ID→content pattern from Phase 3 as the safe access path (hard requirement, not optional — see Phase 3 gotchas)
- Define what fields/collections the agent is allowed to modify (guardrails)
- The agent's slug→ID resolution step needs an authenticated context (API key or service account) — `/api/tenants` returns 403 for anonymous calls

**Pre-production hardening item (not blocking Phase 5):**
The Supabase bucket is currently **Public**. Tenant isolation for media exists only at Payload's application layer — anyone with a direct file URL can fetch it regardless of tenant. Acceptable for POC. Before this goes production-adjacent, evaluate adding `signedDownloads` to the S3 adapter config to switch from permanent public URLs to presigned ones. Flag this for Sir Jeff when the POC is ready for review.

---

## What Was Accomplished

### Session 1 (2026-06-17)
- Scaffolded Payload CMS (`website` template, MongoDB, pnpm) at `~/work/payload-poc`
- Connected to MongoDB Atlas (`payload-poc` cluster), seeded sample content
- Confirmed frontend + admin panel working locally

### Session 2 (2026-06-18) — Multi-Tenancy
- Installed `@payloadcms/plugin-multi-tenant`
- Created `Tenants` collection (`name`, `slug`, `useAsTitle: 'name'`)
- Applied tenant field to `pages`, `posts`, `media`, `categories`
- Confirmed tenant selector in admin nav filters content correctly per tenant
- Confirmed existing seeded/unassigned content was untouched

**Plugin config decisions (in `src/plugins/index.ts`):**

| Option | Value | Reason |
|---|---|---|
| `collections` | `pages`, `posts`, `media`, `categories` | Content collections that get the tenant field |
| `cleanupAfterTenantDelete` | `false` | Prevents accidental cascade-deletion during POC |
| `userHasAccessToAllTenants` | `() => true` | POC shortcut — replace with real role check before production |
| `useTenantsListFilter` | `false` | Tenants list shows all tenants regardless of nav selector |

### Session 2 (2026-06-18) — Content API Test
- Verified REST API correctly scopes content by tenant ID (`?where[tenant][equals]=<id>`)
- Verified GraphQL returns equivalent tenant-scoped results
- Verified negative cases (nonexistent ID, `exists: true` filter) behave safely
- Built a throwaway Next.js test page (`src/app/(frontend)/test-tenant-fetch/page.tsx`) proving the correct fetch pattern end-to-end

**Key gotchas documented:**
1. **Tenant field is a plain ID string, not a populated relationship** — `tenant.slug` dot-notation queries fail in REST (`QueryError`) and return `null` subfields in GraphQL.
2. **Critical safety gotcha:** filtering by a non-ObjectId string (e.g. a slug) does *not* error — it silently returns unassigned/null-tenant content. A naive agent implementation filtering directly on a user-provided slug would leak cross-tenant-adjacent data.
3. **Fix / recommended pattern:** always resolve `slug → tenant ID` via a separate query first, validate the ID is a proper 24-character hex ObjectId, then query content using that ID. Use `where[tenant][exists]=true` to exclude null-tenant docs when needed.

```ts
// Step 1: Resolve slug → ID
const { docs: [tenant] } = await payload.find({
  collection: 'tenants',
  where: { slug: { equals: 'client-a' } },
  depth: 0,
})
if (!tenant) return [] // or notFound()

// Step 2: Query content with the validated ID
const pages = await payload.find({
  collection: 'pages',
  where: { tenant: { equals: tenant.id } },
})
```

**Confirmed — the critical safety gotcha is real:**
```bash
curl -g "http://localhost:3000/api/pages?where[tenant][equals]=client-a"
# → returns "Home" and "Contact" (tenant: null) — NOT Client A's content. totalDocs: 2
```

**Confirmed — nonexistent-but-valid ObjectId fails closed (safe):**
```bash
curl -g "http://localhost:3000/api/pages?where[tenant][equals]=000000000000000000000000"
# → totalDocs: 0, no error
```

**Confirmed — dot-notation queries fail loudly rather than misbehaving silently:**
```bash
curl -g "http://localhost:3000/api/pages?where[tenant.slug][equals]=client-a"
# → QueryError: "The following path cannot be queried: slug"
```

**Additional finding:** `/api/tenants` requires authentication — anonymous REST calls return a 403. The agent's slug→ID resolution step will need an authenticated context (API key or service account).

**Conclusion:** the two-step "resolve slug → validate ObjectId format → query by ID" pattern is not just best practice — it's necessary. Treat it as a hard requirement for the Phase 5 agent implementation.

### Session 3 (2026-06-18) — Image Storage (Phase 4) ✅

**Provider decision:** switched from Cloudflare R2 (requires payment method even for free tier) to **Supabase Storage** — free tier, no card required, S3-compatible so `@payloadcms/storage-s3` works unchanged. Trade-off: free projects auto-pause after 7 days of inactivity (log in to unpause, no data loss), 1GB free tier cap.

**Supabase setup:**
- Created a free project, Public bucket (`payload-poc-media`)
- Generated S3-compatible access keys (`payload-poc-local-dev`)
- No RLS policies — S3 keys bypass RLS entirely; only relevant if connecting via Supabase anon/user JWT later

**Payload-side config:**
- Installed `@payloadcms/storage-s3`, version-matched to Payload version
- Added `s3Storage()` to plugins array in `src/plugins/index.ts` alongside `multiTenantPlugin`, with `forcePathStyle: true`
- New env vars: `SUPABASE_BUCKET`, `SUPABASE_ACCESS_KEY_ID`, `SUPABASE_SECRET_ACCESS_KEY`, `SUPABASE_ENDPOINT`, `SUPABASE_REGION`

**Per-tenant folder separation:**
- Added a hidden `prefix` text field to `Media.ts`
- Added a `beforeOperation` hook that derives tenant ID and writes it to `prefix` before the file is saved
- S3 adapter uses the per-document `prefix` to build the storage key → separate virtual folder per tenant
- **UAT confirmed:** Client A and Client B uploads land in separate tenant-ID-named folders in the Supabase bucket browser

**Upload guardrails — all UAT confirmed:**

| Guardrail | Implementation | UAT Result |
|---|---|---|
| MIME type allow-list | `mimeTypes` in `Media.ts` `upload` config | ✅ Disallowed types rejected at upload UI |
| File size limit (5MB) | `beforeOperation` hook with `APIError` | ✅ Rejected with accurate message including filename + actual size |
| Magic bytes validation | `beforeOperation` hook checks file buffer against known signatures | ✅ Renamed `.exe` → `.jpg` caught and rejected with "does not appear to be a valid JPEG" message |
| No-tenant upload blocked | `beforeOperation` hook throws if tenant ID not resolved | ✅ Confirmed |

**Important implementation note — file size limit:** do NOT use Payload's global `upload.limits.fileSize` in `payload.config.ts`. It fires before the `beforeOperation` hook and produces a generic, unhelpful error. Let the hook be the sole enforcer so the accurate `APIError` message reaches the UI.

**Known upstream caveats:**
- Payload issue #14561: two tenants uploading a same-named file can result in an unwanted `-1` suffix on the second, even under different prefixes — cosmetic only, not a cross-tenant leak
- The magic bytes check for WebP validates the `RIFF` header (bytes 0–3) but not the `WEBP` marker (bytes 8–11), which is shared by other RIFF-based formats. Fine for POC; tighten before production

**Storage security posture (known trade-off):**
The bucket is Public. Per-tenant folder separation is organizational only — anyone with a direct file URL can fetch it. Tenant isolation that matters lives in Payload's collection query layer, not storage. Pre-production hardening: evaluate `signedDownloads` on the S3 adapter for presigned URLs.

---

## Next Things to Explore

### 1. Agent Concept POC (Phase 5 — next)
Build a basic agent that accepts plain-language commands and calls the Payload API to make content changes, using the validated slug→ID→content pattern as the safe access path.
- Goal: client says "change the hero headline to X" → agent calls Payload API → content updates
- Guardrails: define what fields/collections the agent is allowed to modify; reuse the ID-validation pattern from Phase 3 to prevent cross-tenant leakage
- Agent needs authenticated context for slug→ID resolution (anonymous `/api/tenants` returns 403)

### 2. apir-tayo Integration (future, if POC proves out)
1. Replace hardcoded content in apir-tayo's Next.js components with API calls to Payload
2. Replace WordPress/Gravity Forms contact form backend with Payload's form builder or a custom collection
3. Connect Payload to the existing Next.js frontend (apir-tayo) as a separate service (own port/subdomain, not installed inside the apir-tayo repo)
4. Build the agent layer on top of Payload's API

### 3. Pre-Production Hardening (before any production-adjacent deployment)
- Move MongoDB Atlas and Supabase from personal account (Josh's) to company-owned account
- Replace `userHasAccessToAllTenants: () => true` with real role-based check
- Evaluate `signedDownloads` on S3 adapter (Public bucket → presigned URLs)
- Tighten WebP magic bytes check to validate bytes 8–11 (`WEBP` marker), not just `RIFF` header

---

## Environment Variables (`.env`)

Located at `~/work/payload-poc/.env`:

```env
DATABASE_URL=mongodb+srv://joshsosme_db_user:<password>@payload-poc.nxpvmoj.mongodb.net/?appName=payload-poc
PAYLOAD_SECRET=<your-secret>
SUPABASE_BUCKET=payload-poc-media
SUPABASE_ACCESS_KEY_ID=<your-access-key-id>
SUPABASE_SECRET_ACCESS_KEY=<your-secret-access-key>
SUPABASE_ENDPOINT=<your-project-ref>.supabase.co/storage/v1/s3
SUPABASE_REGION=<your-region>
```

---

## Resources

- [Payload Docs](https://payloadcms.com/docs/getting-started/what-is-payload)
- [Payload GitHub](https://github.com/payloadcms/payload)
- [Payload Multi-Tenant Plugin](https://payloadcms.com/docs/plugins/multi-tenant)
- [Payload Cloud Storage](https://payloadcms.com/docs/plugins/cloud-storage)
- [MongoDB Atlas](https://cloud.mongodb.com)
- Project `CLAUDE.md` — technical reference + Project Context section for future Claude Code sessions
