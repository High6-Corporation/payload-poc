# Payload CMS POC — Session Handoff (v4)

> Date: 2026-06-18
> Project: apir-tayo (High6 Corporation)
> Supersedes: payload-poc-handoff-v3.md (2026-06-18)

---

## Background & Context

Sir Jeff tasked an exploration of **Payload CMS** as a potential headless CMS solution for apir-tayo and future client projects. The broader objective is to evaluate a multi-tenant CMS architecture where clients can manage content through an AI agent via voice/text commands — without ever touching the backend directly. The agent handles the changes with guardrails restricting what can be modified.

Sir Jeff has also noted that current client projects are built on WordPress, with a longer-term goal of moving toward headless. A parallel task was assigned to **Sir Gio**, who is evaluating **WordPress Multisite (IWP)** independently.

**Update from Sir Jeff (2026-06-18):** the direction has been clarified — eventually, the team will shift from WordPress headless to Payload CMS for succeeding projects. No need to evaluate WordPress directly; that stays on Sir Gio's track. Focus remains on proving out Payload.

**Open questions still pending with Sir Jeff:**
- Is there a deadline for this exploration?
- Is there an existing agent/AI setup at High6 to build on, or starting from scratch?
- MongoDB Atlas and Supabase are currently provisioned under a personal account (Josh's) — fine for POC, but should move to a company-owned account before anything production-adjacent.
- Which LLM to use in production — DeepSeek (currently used in POC) or another provider?

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
- Agent chat UI: `http://localhost:3000/agent`

---

## Phase Status

| Phase | Status |
|---|---|
| 1. Initial scaffold + MongoDB Atlas connection | ✅ Done (session 1) |
| 2. Multi-tenancy (`@payloadcms/plugin-multi-tenant`) | ✅ Validated |
| 3. Content API test (REST + GraphQL, tenant-scoped) | ✅ Validated + hands-on UAT confirmed (2026-06-18) |
| 3.5. Frontend tenant-scoped filtering fix | ✅ Done (2026-06-18) |
| 4. Image/media storage with upload guardrails | ✅ Done — all guardrails UAT-confirmed (2026-06-18) |
| 5. Agent concept POC (plain-language → Payload API) | ✅ Done — core flow + tenant isolation UAT-confirmed (2026-06-18) |
| 6. Align findings with Sir Gio's WordPress Multisite POC | ⬜ Pending Sir Jeff's input |
| 7. apir-tayo integration (if POC proves out) | ⬜ Future — replace hardcoded content + WP/Gravity Forms backend with Payload |

---

## Next Session — Start Here

Phase 5 is complete. The agent concept is proven. Next priorities in order:

### Priority 1 — Expand agent capabilities (Phase 5 follow-up)
The current agent only handles `update_post_title` and `update_page_title` (Payload document title field, not visible page content). The next meaningful capability is updating **visible page content** — specifically `hero.richText` on pages.

**Critical finding before attempting this:** `hero.richText` is a **Lexical rich text field**, not a plain string. You cannot PATCH it with `{ "hero.richText": "Hello World" }`. You must send the full Lexical JSON node tree. The correct shape is:

```json
{
  "hero": {
    "richText": {
      "root": {
        "type": "root",
        "children": [
          {
            "type": "paragraph",
            "version": 1,
            "children": [
              {
                "type": "text",
                "text": "Your new text here",
                "version": 1,
                "detail": 0,
                "format": 0,
                "mode": "normal",
                "style": ""
              }
            ],
            "direction": null,
            "format": "",
            "indent": 0,
            "textFormat": 0,
            "textStyle": ""
          }
        ],
        "direction": null,
        "format": "",
        "indent": 0,
        "version": 1
      }
    }
  }
}
```

The agent's DeepSeek system prompt and the route handler must be updated to construct this shape when updating hero content. A plain string value will silently PATCH without error but not render any visible change.

### Priority 2 — Payload-side role restrictions for the service account
Currently the agent's service account has no role restrictions — the route handler is the sole guardrail enforcer. Before this POC is shown to Sir Jeff, add a Payload access control role to the service account user that restricts it to only `update` on `posts` and `pages` collections, and blocks `delete`, `create`, and access to `media`, `tenants`, `users`. See `Pre-Production Hardening` section below.

### Priority 3 — Flag findings to Sir Jeff
The POC is ready for a review conversation. Key items to raise:
- The `hero.richText` Lexical structure requirement (impacts how complex the agent needs to be)
- Public Supabase bucket → presigned URLs (`signedDownloads`) needed before production
- Personal account infrastructure (MongoDB Atlas + Supabase) needs to move to company-owned
- LLM provider decision — DeepSeek is used now, confirm if that's acceptable for production or if Claude API / another provider is preferred

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

**Conclusion:** the two-step "resolve slug → validate ObjectId format → query by ID" pattern is not just best practice — it's necessary. Treat it as a hard requirement for all agent implementations.

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

### Session 4 (2026-06-18) — Frontend Tenant Filtering Fix (Phase 3.5) ✅

Discovered that the frontend posts listing page was showing all posts across all tenants. Root causes were two separate bugs:

**Bug 1 — Missing tenant filter in frontend fetch calls**
The `@payloadcms/plugin-multi-tenant` plugin scopes content in the admin panel only. Frontend fetch calls have no automatic tenant filtering — it must be added explicitly. Fixed by:
- Creating `src/utilities/resolveTenant.ts` — shared utility with `resolveTenantIdFromSlug()` and `buildTenantWhereClause()` exports
- Applying tenant `where` clause to `posts/page.tsx`, `posts/page/[pageNumber]/page.tsx`, `posts/[slug]/page.tsx`, `ArchiveBlock/Component.tsx`, `RenderBlocks.tsx`, and `[slug]/page.tsx`
- Tenant context sourced from `?tenant=<slug>` searchParam — consistent with existing `test-tenant-fetch` page pattern

**Bug 2 — `force-static` on posts listing page**
`export const dynamic = 'force-static'` on `posts/page.tsx` caused Next.js to pre-render the page at build time with no searchParams, caching the unfiltered result for all requests. Removed — Next.js 15 auto-detects `searchParams` access and renders dynamically per-request.

**Tenant isolation UAT — confirmed:**
- `/posts?tenant=client-b` → only Client B's posts ✅
- `/posts?tenant=client-a` → only Client A's posts ✅
- `/posts` (no param) → all posts (existing behavior preserved) ✅
- `/posts?tenant=nonexistent` → falls back to all posts (resolution fails gracefully) ✅

**Known behavior to flag:** `?tenant=nonexistent` (invalid slug provided) falls back to showing all posts rather than returning empty. Acceptable for POC. Production behavior should distinguish between "no param" (show all) and "invalid param" (show nothing / 404).

### Session 4 (2026-06-18) — Agent Concept POC (Phase 5) ✅

**Architecture:**
- `src/utilities/payloadAuth.ts` — service account JWT management with expiry-aware caching
- `src/app/api/agent/route.ts` — POST route handler (tenant resolution → LLM parsing → slug→ID lookup → PATCH)
- `src/app/(frontend)/agent/page.tsx` — chat UI (full-viewport layout, dark theme, timestamp per message)

**LLM:** DeepSeek API (`deepseek-chat` / DeepSeek V3) via OpenAI-compatible endpoint at `https://api.deepseek.com`

**Auth — service account JWT:**
- Service account user: `agent@payload-poc.local` (created in Payload admin, no tenant assigned)
- `getAgentToken()` logs in via `POST /api/users/login`, caches JWT with expiry timestamp decoded from the JWT `exp` claim
- 5-minute proactive refresh buffer before expiry; falls back to 2-hour TTL if `exp` can't be decoded
- `clearAgentToken()` exported for 401 retry logic in the route handler
- On 401 from a PATCH: clears token, re-logs in, retries once — if second attempt 401s, returns 500

**Guardrails enforced in route handler:**
- Allowed actions: `update_post_title`, `update_page_title` only
- All other LLM-parsed actions rejected before reaching Payload
- Slug→ID lookups always tenant-scoped (both `slug` and `tenant` filters in the same query)
- Exact-one-match validation on slug→ID — 0 or >1 results → 404

**UAT results:**

| Test | Result |
|---|---|
| "Change the title of the home page to Hello World" (client-b) | ✅ PATCH succeeded, `title` field updated in MongoDB |
| "Change the title of Client A home page to Compromised Page" (scoped to client-b) | ✅ Correctly returned 404 — cross-tenant access blocked |
| Unknown action ("Delete the welcome post") | ⬜ Not UAT'd yet — test next session |
| Nonsensical command ("do the thing") | ⬜ Not UAT'd yet — test next session |

**Critical finding — `title` vs visible page content:**
The agent successfully patches the Payload `title` field (document label), but this field does NOT render as visible content on the page. The visible hero heading lives in `hero.richText`, which is a **Lexical rich text field** requiring a full JSON node tree in the PATCH body — not a plain string. See "Next Session — Start Here" for the required Lexical shape.

---

## Pre-Production Hardening Checklist

Items required before any production-adjacent deployment:

- [ ] Move MongoDB Atlas + Supabase from Josh's personal account to company-owned account
- [ ] Replace `userHasAccessToAllTenants: () => true` with real role-based access control
- [ ] Add Payload-side role to service account — restrict to `update` on `posts` and `pages` only; block `delete`, `create`, `media`, `tenants`, `users`
- [ ] Evaluate `signedDownloads` on S3 adapter (Public bucket → presigned URLs)
- [ ] Tighten WebP magic bytes check to validate bytes 8–11 (`WEBP` marker), not just `RIFF` header
- [ ] Distinguish "no tenant param" vs "invalid tenant param" in frontend fetch fallback behavior
- [ ] Confirm LLM provider with Sir Jeff (DeepSeek vs Claude API vs other)

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
AGENT_EMAIL=agent@payload-poc.local
AGENT_PASSWORD=<service-account-password>
DEEPSEEK_API_KEY=<your-deepseek-api-key>
```

---

## Resources

- [Payload Docs](https://payloadcms.com/docs/getting-started/what-is-payload)
- [Payload GitHub](https://github.com/payloadcms/payload)
- [Payload Multi-Tenant Plugin](https://payloadcms.com/docs/plugins/multi-tenant)
- [Payload Cloud Storage](https://payloadcms.com/docs/plugins/cloud-storage)
- [Lexical Rich Text Editor (Payload)](https://payloadcms.com/docs/rich-text/lexical)
- [MongoDB Atlas](https://cloud.mongodb.com)
- Project `CLAUDE.md` — technical reference + Project Context section for future Claude Code sessions
