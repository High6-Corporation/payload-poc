# Payload CMS POC — Session Handoff (v2)

> Date: 2026-06-18
> Project: apir-tayo (High6 Corporation)
> Supersedes: payload-poc-handoff.md (2026-06-17)

---

## Background & Context

Sir Jeff tasked an exploration of **Payload CMS** as a potential headless CMS solution for apir-tayo and future client projects. The broader objective is to evaluate a multi-tenant CMS architecture where clients can manage content through an AI agent via voice/text commands — without ever touching the backend directly. The agent handles the changes with guardrails restricting what can be modified.

Sir Jeff has also noted that current client projects are built on WordPress, with a longer-term goal of moving toward headless. A parallel task was assigned to **Sir Gio**, who is evaluating **WordPress Multisite (IWP)** independently.

**Update from Sir Jeff (2026-06-18):** the direction has been clarified — eventually, the team will shift from WordPress headless to Payload CMS for succeeding projects. No need to evaluate WordPress directly; that stays on Sir Gio's track. Focus remains on proving out Payload.

**Open questions still pending with Sir Jeff:**
- Is there a deadline for this exploration?
- Is there an existing agent/AI setup at High6 to build on, or starting from scratch?

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
| 4. Image/media storage with upload guardrails | 🟡 In progress — storage connected + per-tenant folder hook added; file-type & size guardrails pending |
| 5. Agent concept POC (plain-language → Payload API) | ⬜ Not started |
| 6. Align findings with Sir Gio's WordPress Multisite POC | ⬜ Pending Sir Jeff's input |
| 7. apir-tayo integration (if POC proves out) | ⬜ Future — replace hardcoded content + WP/Gravity Forms backend with Payload |

---

## Next Session — Start Here

Phase 4 is partway done. In priority order:

1. **Verify the per-tenant prefix hook actually works** — this was just implemented but not yet tested. Upload a file as Client A, then as Client B, and check the Supabase bucket browser for two separate tenant-ID-named folders rather than everything flat in the root.
2. **Implement the file-type guardrail** — add a `mimeTypes` allow-list to `Media.ts`'s `upload` config, then try uploading a disallowed type to confirm it's rejected.
3. **Implement the file-size guardrail** — add a global `upload.limits.fileSize` in `payload.config.ts` (note: Payload only supports this globally, not per-collection, out of the box), then try uploading something oversized to confirm rejection.
4. **Run a full UAT pass on all three guardrails together**, same rigor as the Phase 3 content-API testing — actually try to break each one rather than trusting the config is correct.
5. **Decide on storage hardening** — the bucket is currently Public, which means tenant isolation for media exists only at Payload's application layer, not at the storage layer (anyone with a direct file URL can fetch it regardless of tenant). Acceptable for POC; flag whether `signedDownloads` is worth adding before this goes further.
6. Once Phase 4 guardrails are UAT-confirmed, move to **Phase 5 (Agent Concept POC)**.

Also worth bundling into the existing "open questions for Sir Jeff" list: both MongoDB Atlas and Supabase are currently provisioned under personal accounts (Josh's), not a company-owned account — fine for POC, but should move before anything production-adjacent.

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

### Session 2 (2026-06-18, later same day) — Hands-On UAT of Content API Test

The Content API Test phase above had been marked "Validated," but that validation hadn't been independently confirmed by hand — only run by Claude Code. Did a manual UAT pass via `curl` against the live dev server before relying on this pattern for the Phase 5 agent POC.

**Test data used:**
- Client A — tenant ID `6a3258c4a0a8aeb76577a9ed`, slug `client-a`
- Client B — tenant ID `6a3258dea0a8aeb76577aa22`, slug `client-b`
- Pre-tenant legacy seed content ("Home", "Contact" pages, `tenant: null`) — predates multi-tenancy implementation, left in place from session 1

**Confirmed — happy path scoping works cleanly:**
```bash
curl -g "http://localhost:3000/api/pages?where[tenant][equals]=6a3258c4a0a8aeb76577a9ed"
# → only "Home - Client A" (totalDocs: 1)

curl -g "http://localhost:3000/api/pages?where[tenant][equals]=6a3258dea0a8aeb76577aa22"
# → only "Home - Client B" (totalDocs: 1)
```
No cross-contamination between tenants.

**Confirmed — the critical safety gotcha is real, reproduced with a genuine slug (not just an arbitrary string):**
```bash
curl -g "http://localhost:3000/api/pages?where[tenant][equals]=client-a"
# → returns "Home" and "Contact" (tenant: null) — NOT Client A's content. totalDocs: 2
```
`client-a` is Client A's actual, valid slug — exactly what a naive agent would receive from a user or URL path. Filtering the `tenant` field with it directly, instead of resolving to the tenant's ID first, silently returns unrelated legacy null-tenant content rather than Client A's page or an error. This is the cross-tenant-adjacent leak the original notes warned about, now confirmed live with realistic input.

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

**Tested — `exists:true` as a secondary filter:**
```bash
curl -g "http://localhost:3000/api/pages?where[tenant][equals]=client-a&where[tenant][exists]=true"
# → totalDocs: 0
```
Adding `exists:true` did zero out the leak in this case, but likely because Payload's cast-fallback for an invalid ObjectId string happens to match only null-tenant docs, which `exists:true` then excludes — not because `exists:true` independently validates input. Treat this as a reasonable secondary filter, not a substitute for explicit ObjectId format validation before the query is built.

**Additional finding:** `/api/tenants` (list/read) requires authentication — anonymous REST calls return a 403. Relevant for Phase 5: the agent's slug→ID resolution step will need an authenticated context (API key or service account), not anonymous access.

**Conclusion:** the two-step "resolve slug → validate ObjectId format → query by ID" pattern documented above is not just best practice — it's necessary. Skipping it produces a real, reproducible cross-tenant data leak using only valid, realistic input (a real tenant's real slug). This should be treated as a hard requirement for the Phase 5 agent implementation, not an optional safeguard.

### Session 3 (2026-06-18, continued) — Image Storage (Phase 4, in progress)

**Provider decision:** Cloudflare R2 was the original plan, but Cloudflare requires a payment method to activate R2 even for free-tier usage. Switched to **Supabase Storage** instead — free tier requires no card, includes 1GB storage, and is S3-compatible, so the same `@payloadcms/storage-s3` adapter works unchanged. Trade-off: free Supabase projects auto-pause after 7 days of inactivity (just log in to unpause, no data loss) and the free tier caps at 1GB, fine for a POC but not for real client volume.

**Supabase setup:**
- Created a free project, no card required
- Created a **Public** bucket (`payload-poc-media`) — Public only governs unauthenticated *downloads*; it has no effect on uploads, which always go through the S3 keys
- Generated S3-compatible access keys (named `payload-poc-local-dev` to distinguish from any future production key) via Storage → Settings → Access Keys
- Copied the S3-compatible endpoint and region from the same settings page
- **No RLS policies configured, intentionally** — S3 access keys bypass Supabase's Row Level Security entirely (full access to all storage operations), so policies on `storage.objects` aren't relevant to Payload's connection. RLS only matters if something later connects via Supabase's anon/user JWT instead of the S3 keys.

**Payload-side config:**
- Installed `@payloadcms/storage-s3`, version-matched to the project's Payload version
- Added `s3Storage()` to the plugins array in `src/plugins/index.ts` (alongside the existing `multiTenantPlugin`), pointed at Supabase's S3-compatible endpoint with `forcePathStyle: true`
- New env vars in `.env`: `SUPABASE_BUCKET`, `SUPABASE_ACCESS_KEY_ID`, `SUPABASE_SECRET_ACCESS_KEY`, `SUPABASE_ENDPOINT`, `SUPABASE_REGION`
- **Confirmed working:** uploaded a test file via the admin panel, verified it appears in the Supabase bucket browser rather than on local disk. (The `s3Storage` plugin automatically sets `disableLocalStorage: true` for configured collections, so `Media.ts`'s old `staticDir` setting is now unused but harmless to leave in place.)

**Gap found:** with just the adapter connected, all uploads from every tenant landed in one flat, shared location in the bucket — no per-tenant separation. Caught this visually in the Supabase bucket browser rather than assuming the Phase 2 multi-tenancy setup extended to storage automatically (it doesn't, by default).

**Fix implemented:** added a hidden `prefix` text field to `Media.ts`, plus a `beforeOperation` hook that derives the tenant ID (from `data.tenant`, falling back to `getTenantFromCookie` from `@payloadcms/plugin-multi-tenant/utilities`, falling back to `req.user.tenant`) and writes it into that field before the file is saved. The S3 adapter uses this per-document `prefix` value to build the storage key, giving each tenant a separate virtual folder. This is a community-documented pattern (see Payload GitHub Discussion #11967), not an officially documented one — the plugin's built-in `prefix` config option is a static string set at config time, not dynamic per-document; the field + hook combination is what makes it dynamic. **Not yet tested end-to-end** — implemented but no upload has been done since adding it.

**Known upstream caveats to keep in mind, not bugs in this setup:**
- Payload issue #14561: two tenants uploading a same-named file (e.g. both `logo.png`) can result in an unwanted `-1` suffix on the second one, even though they're stored under different prefixes — Payload's filename-collision check doesn't currently account for prefix. Cosmetic only, not a cross-tenant leak.
- Payload's `upload.limits.fileSize` is global-only, not configurable per collection out of the box — relevant when implementing the file-size guardrail next session.

**Important distinction documented for future reference:** the per-tenant prefix folder is an *organizational* convenience, not a security boundary. Because the bucket is Public, anyone with a direct file URL can fetch it regardless of which tenant's folder it's in — the actual tenant isolation that matters continues to live in Payload's `pages`/`media` collection queries (the same pattern UAT'd in the Phase 3 section above), not in the storage layer. If this needs to harden later, Payload's S3 adapter supports `signedDownloads` for presigned URLs instead of permanent public ones.

### Documentation
- Ran `/init` in Claude Code to generate `CLAUDE.md` (stack, commands, architecture, collections, plugin config reference)
- Added a **Project Context** section to `CLAUDE.md` capturing the business background (Sir Jeff's original ask, comparison with Sir Gio's track, apir-tayo integration path, open questions) so it isn't lost in future sessions

---

## Next Things to Explore

### 1. Image Storage (in progress — see Session 3 notes and "Next Session — Start Here" above)
Storage connection (Supabase, S3-compatible) and the per-tenant folder hook are implemented. Remaining:
- Verify the per-tenant prefix hook end-to-end (no test upload done since adding it)
- Add and test a `mimeTypes` allow-list on `Media.ts`
- Add and test a global file-size limit
- Decide whether `signedDownloads` is worth adding to move beyond the current Public-bucket model

### 2. Agent Concept POC
Build a basic agent that accepts plain-language commands and calls the Payload API to make content changes, using the validated slug→ID→content pattern as the safe access path.
- Goal: client says "change the hero headline to X" → agent calls Payload API → content updates
- Guardrails: define what fields/collections the agent is allowed to modify; reuse the ID-validation pattern from the Content API Test phase to prevent cross-tenant leakage

### 3. apir-tayo Integration (future, if POC proves out)
1. Replace hardcoded content in apir-tayo's Next.js components with API calls to Payload
2. Replace WordPress/Gravity Forms contact form backend with Payload's form builder or a custom collection
3. Connect Payload to the existing Next.js frontend (apir-tayo) as a separate service (own port/subdomain, not installed inside the apir-tayo repo)
4. Build the agent layer on top of Payload's API

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
