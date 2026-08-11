# Payload CMS POC — Session Handoff (v5)

> Date: 2026-06-19
> Project: apir-tayo (High6 Corporation)
> Supersedes: payload-poc-handoff-v4.md (2026-06-18)

---

## Background & Context

Sir Jeff tasked an exploration of **Payload CMS** as a potential headless CMS solution for apir-tayo and future client projects. The broader objective is to evaluate a multi-tenant CMS architecture where clients can manage content through an AI agent via voice/text commands — without ever touching the backend directly. The agent handles the changes with guardrails restricting what can be modified.

Sir Jeff has also noted that current client projects are built on WordPress, with a longer-term goal of moving toward headless. A parallel task was assigned to **Sir Gio**, who is evaluating **WordPress Multisite (IWP)** independently.

**Update from Sir Jeff (2026-06-18):** the direction has been clarified — eventually, the team will shift from WordPress headless to Payload CMS for succeeding projects. No need to evaluate WordPress directly; that stays on Sir Gio's track. Focus remains on proving out Payload.

**Open questions still pending with Sir Jeff:**
- Is there a deadline for this exploration / demo-ready target date?
- Is there an existing agent/AI setup at High6 to build on, or starting from scratch?
- MongoDB Atlas and Supabase are currently provisioned under a personal account (Josh's) — fine for POC, but should move to a company-owned account before anything production-adjacent.
- Which LLM to use in production — DeepSeek (currently used in POC) or another provider?

---

## Project Locations

### payload-poc (CMS backend)
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

### apir-tayo (frontend)
```
~/path/to/apir-tayo   # adjust to local path
```
```bash
cd ~/path/to/apir-tayo
git checkout feat/payload-cms
PORT=3001 pnpm dev
```
- Local frontend: `http://localhost:3001`

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
| 5.1. Agent — expand capabilities (hero.richText + role restrictions) | 🔄 In progress — next priority |
| 6. Align findings with Sir Gio's WordPress Multisite POC | ⬜ Pending Sir Jeff's input |
| 7. apir-tayo integration | 🔄 In progress — collections created + seeded, frontend wiring next |

---

## Next Session — Start Here

Two parallel workstreams to continue. Start with whichever Sir JM/Sir Jeff prioritizes.

---

### Workstream A — payload-poc: Expand Agent Capabilities (Phase 5.1)

#### Priority 1 — Update agent to handle `hero.richText`
The current agent only handles `update_post_title` and `update_page_title` (Payload document title field, not visible page content). The next meaningful capability is updating **visible page content** — specifically `hero.richText` on pages.

**Critical finding before attempting this:** `hero.richText` is a **Lexical rich text field**, not a plain string. You cannot PATCH it with `{ "hero.richText": "Hello World" }`. You must send the full Lexical JSON node tree:

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

#### Priority 2 — Payload-side role restrictions for the service account
Currently the agent's service account has no role restrictions — the route handler is the sole guardrail enforcer. Before this POC is shown to Sir Jeff, add a Payload access control role to the service account user that restricts it to only `update` on `posts` and `pages` collections, and blocks `delete`, `create`, and access to `media`, `tenants`, `users`. See `Pre-Production Hardening` section below.

#### Priority 3 — UAT remaining agent test cases
Two test cases not yet covered:
- Unknown action (e.g. "Delete the welcome post") — should be rejected by route handler before reaching Payload
- Nonsensical command (e.g. "do the thing") — should be handled gracefully by LLM parsing

---

### Workstream B — apir-tayo: Wire Frontend to Payload API (feat/payload-cms branch)

#### Context
The `feat/payload-cms` branch has been created off `master` in the apir-tayo repo. All content for the 4 high-priority sections has been seeded into payload-poc already, scoped to the `apir-tayo` tenant (ID: `6a33cc24b8484fab9369a4d3`).

The architecture:
- `payload-poc` runs at `http://localhost:3000` — the CMS backend
- `apir-tayo` runs at `http://localhost:3001` on the `feat/payload-cms` branch — the frontend

Integration is purely HTTP fetch — no shared codebase. Add `PAYLOAD_API_URL` and `PAYLOAD_TENANT_ID` to apir-tayo's `.env.local`:

```env
PAYLOAD_API_URL=http://localhost:3000
PAYLOAD_TENANT_ID=6a33cc24b8484fab9369a4d3
```

#### What's been done
- `feat/payload-cms` branch created and pushed to remote
- 4 new Payload collections created in payload-poc (see Collections section below)
- `apir-tayo` tenant created in Payload admin (ID: `6a33cc24b8484fab9369a4d3`)
- Seed script created and run: `src/scripts/seed-apirtayo.ts` — 18 records seeded, idempotent
- `image` field made optional on `Testimonials` and `PortfolioItems` (media to be handled separately)
- `CLAUDE.md` in apir-tayo updated with Payload integration context

#### What's next — replace hardcoded content with Payload fetch calls

**Priority order (highest value first):**

1. **FAQSection.tsx** — replace hardcoded `faqs` array with fetch from `/api/faqs?where[tenant][equals]={id}&sort=order`
2. **TestimonialsSection.tsx** — replace hardcoded `testimonials` array with fetch from `/api/testimonials?where[tenant][equals]={id}`
3. **PortfolioSection.tsx** — replace hardcoded `projects` array with fetch from `/api/portfolio-items?where[tenant][equals]={id}`
4. **PricingSection.tsx** — replace hardcoded pricing feature lists with fetch from `/api/pricing-plans?where[tenant][equals]={id}&sort=order`

**Approach for each component:**
- Since these are `"use client"` components, use `useEffect` + `useState` to fetch on mount, or convert to server components and fetch at the page level passing data as props (preferred for SEO — apir-tayo is a marketing site)
- The server component approach is cleaner: fetch in `app/page.tsx` (or a server wrapper), pass data down as props to the section components

**After frontend wiring:**
- Upload portfolio and testimonial images to Payload media (assign to apir-tayo tenant)
- Link media records to existing PortfolioItems and Testimonials records via PATCH
- Then handle lower-priority sections: HowItWorksSection, WhyOnePageSection, CTASection, HeroSection (via a `SiteSettings` global)

---

## Collections in payload-poc

### Existing (before this session)
`Pages`, `Posts`, `Media`, `Categories`, `Tenants`, `Users`

### New (added 2026-06-19) — all tenant-scoped via multiTenantPlugin

| Collection | Slug | Fields |
|---|---|---|
| Testimonials | `testimonials` | `quote` (textarea, req), `name` (text, req), `position` (text, req), `image` (upload → media, optional) |
| FAQs | `faqs` | `question` (text, req), `answer` (textarea, req), `order` (number, default: 0) |
| PortfolioItems | `portfolio-items` | `title` (text, req), `category` (text, req), `url` (text, req), `image` (upload → media, optional) |
| PricingPlans | `pricing-plans` | `label` (text, req), `items` (array of `{ item: text }`), `order` (number, default: 0) |

All follow existing collection patterns: anyone read access, authenticated create/update/delete, `useAsTitle` on display field.

### Seeded data (apir-tayo tenant — ID: `6a33cc24b8484fab9369a4d3`)

**FAQs (5):** Is this custom? / Can I upgrade later? / Is there a contract? / What do I need to prepare? / Is maintenance included?

**Pricing Plans (4):** Website Essentials / Technical Setup / Ongoing Support / Flexible & Transparent

**Testimonials (3):** Jason Go (GTGO Enterprises) / Gene Nicolas (Premiere Builders Corp.) / Claudia Soriano (All About People)

**Portfolio Items (6):** Soding Bros / Tipping Point PH / Ad-Haven / Michael James Love / City Tech / Edgetech

Seed script location: `src/scripts/seed-apirtayo.ts` — safe to re-run (idempotent, deduplicates by tenant + unique field).

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
| `collections` | `pages`, `posts`, `media`, `categories` + 4 new | Content collections that get the tenant field |
| `cleanupAfterTenantDelete` | `false` | Prevents accidental cascade-deletion during POC |
| `userHasAccessToAllTenants` | `() => true` | POC shortcut — replace with real role check before production |
| `useTenantsListFilter` | `false` | Tenants list shows all tenants regardless of nav selector |

### Session 2 (2026-06-18) — Content API Test
- Verified REST API correctly scopes content by tenant ID (`?where[tenant][equals]=<id>`)
- Verified GraphQL with `where: { tenant: { equals: "<id>" } }` also works
- Built throwaway Next.js test page proving correct two-step fetch pattern end-to-end

**Critical finding — slug vs ID filtering:**
Filtering by tenant slug instead of its MongoDB ID silently returns unassigned/null-tenant content instead of erroring — a data leakage risk. Fix: always resolve slug → ID first, validate ID format (24-char hex), then query.

**Additional finding:** `/api/tenants` requires authentication — anonymous REST calls return 403. Agent's slug→ID resolution step always needs authenticated context.

**Conclusion:** the two-step "resolve slug → validate ObjectId format → query by ID" pattern is a hard requirement for all agent implementations.

### Session 3 (2026-06-18) — Image Storage (Phase 4) ✅

**Provider decision:** Supabase Storage (free tier, no card required, S3-compatible). Trade-off: free projects auto-pause after 7 days of inactivity (log in to unpause, no data loss), 1GB cap.

**Supabase setup:**
- Free project, Public bucket (`payload-poc-media`)
- Generated S3-compatible access keys (`payload-poc-local-dev`)

**Payload-side config:**
- Installed `@payloadcms/storage-s3`, version-matched to Payload version
- Added `s3Storage()` to plugins array in `src/plugins/index.ts` with `forcePathStyle: true`
- New env vars: `SUPABASE_BUCKET`, `SUPABASE_ACCESS_KEY_ID`, `SUPABASE_SECRET_ACCESS_KEY`, `SUPABASE_ENDPOINT`, `SUPABASE_REGION`

**Per-tenant folder separation:**
- Hidden `prefix` text field added to `Media.ts`
- `beforeOperation` hook derives tenant ID and writes it to `prefix` before file save
- S3 adapter uses per-document `prefix` to build storage key → separate virtual folder per tenant

**Upload guardrails — all UAT confirmed:**

| Guardrail | Implementation | UAT Result |
|---|---|---|
| MIME type allow-list | `mimeTypes` in `Media.ts` `upload` config | ✅ Disallowed types rejected at upload UI |
| File size limit (5MB) | `beforeOperation` hook with `APIError` | ✅ Rejected with accurate message |
| Magic bytes validation | `beforeOperation` hook checks file buffer against known signatures | ✅ Renamed `.exe` → `.jpg` caught and rejected |
| No-tenant upload blocked | `beforeOperation` hook throws if tenant ID not resolved | ✅ Confirmed |

**Important:** do NOT use Payload's global `upload.limits.fileSize` in `payload.config.ts` — it fires before the hook and produces a generic error. Let the hook be the sole enforcer.

### Session 4 (2026-06-18) — Frontend Tenant Filtering Fix (Phase 3.5) ✅

Discovered frontend posts listing page was showing all posts across all tenants.

**Bug 1 — Missing tenant filter:** `@payloadcms/plugin-multi-tenant` scopes admin panel only, not frontend fetch calls. Fixed by creating `src/utilities/resolveTenant.ts` with `resolveTenantIdFromSlug()` and `buildTenantWhereClause()`, applied across all frontend fetch files.

**Bug 2 — `force-static` on posts listing page:** `export const dynamic = 'force-static'` caused Next.js to pre-render with no searchParams, caching unfiltered result. Removed.

**Known behavior:** `?tenant=nonexistent` falls back to all posts rather than empty. Acceptable for POC — production should return empty/404 for invalid slug.

### Session 4 (2026-06-18) — Agent Concept POC (Phase 5) ✅

**Architecture:**
- `src/utilities/payloadAuth.ts` — service account JWT management with expiry-aware caching
- `src/app/api/agent/route.ts` — POST route handler (tenant resolution → LLM parsing → slug→ID lookup → PATCH)
- `src/app/(frontend)/agent/page.tsx` — chat UI

**LLM:** DeepSeek API (`deepseek-chat` / DeepSeek V3) via OpenAI-compatible endpoint at `https://api.deepseek.com`

**Guardrails enforced in route handler:**
- Allowed actions: `update_post_title`, `update_page_title` only
- All other LLM-parsed actions rejected before reaching Payload
- Slug→ID lookups always tenant-scoped
- Exact-one-match validation on slug→ID — 0 or >1 results → 404

**UAT results:**

| Test | Result |
|---|---|
| "Change the title of the home page to Hello World" (client-b) | ✅ PATCH succeeded |
| Cross-tenant access attempt (client-b scoped, targeting client-a content) | ✅ Correctly returned 404 |
| Unknown action ("Delete the welcome post") | ⬜ Not UAT'd yet |
| Nonsensical command ("do the thing") | ⬜ Not UAT'd yet |

### Session 5 (2026-06-19) — apir-tayo Integration Start (Phase 7) 🔄

- Created `feat/payload-cms` branch off `master` in apir-tayo repo, pushed to remote
- Ran `/init` in apir-tayo repo, updated `CLAUDE.md` with Payload integration context
- Full content audit of all 11 homepage section components
- Created 4 new Payload collections in payload-poc (Testimonials, FAQs, PortfolioItems, PricingPlans)
- Registered collections in `payload.config.ts` and `src/plugins/index.ts`
- Created `apir-tayo` tenant in Payload admin (ID: `6a33cc24b8484fab9369a4d3`)
- Wrote and ran seed script (`src/scripts/seed-apirtayo.ts`) — 18 records seeded, idempotent confirmed
- Made `image` field optional on Testimonials and PortfolioItems for seedability

**Remaining for this phase:** frontend wiring (replace hardcoded arrays with Payload fetch calls), then media upload + linking.

---

## Pre-Production Hardening Checklist

- [ ] Move MongoDB Atlas + Supabase from Josh's personal account to company-owned account
- [ ] Replace `userHasAccessToAllTenants: () => true` with real role-based access control
- [ ] Add Payload-side role to service account — restrict to `update` on `posts` and `pages` only; block `delete`, `create`, `media`, `tenants`, `users`
- [ ] Evaluate `signedDownloads` on S3 adapter (Public bucket → presigned URLs)
- [ ] Tighten WebP magic bytes check to validate bytes 8–11 (`WEBP` marker), not just `RIFF` header
- [ ] Distinguish "no tenant param" vs "invalid tenant param" in frontend fetch fallback behavior
- [ ] Confirm LLM provider with Sir Jeff (DeepSeek vs Claude API vs other)
- [ ] Make `image` field required again on Testimonials and PortfolioItems after media upload is handled

---

## Environment Variables

### payload-poc (`~/work/payload-poc/.env`)
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

### apir-tayo (`~/path/to/apir-tayo/.env.local`) — add these
```env
PAYLOAD_API_URL=http://localhost:3000
PAYLOAD_TENANT_ID=6a33cc24b8484fab9369a4d3
```

---

## Resources

- [Payload Docs](https://payloadcms.com/docs/getting-started/what-is-payload)
- [Payload GitHub](https://github.com/payloadcms/payload)
- [Payload Multi-Tenant Plugin](https://payloadcms.com/docs/plugins/multi-tenant)
- [Payload Cloud Storage](https://payloadcms.com/docs/plugins/cloud-storage)
- [Lexical Rich Text Editor (Payload)](https://payloadcms.com/docs/rich-text/lexical)
- [MongoDB Atlas](https://cloud.mongodb.com)
- Project `CLAUDE.md` files — in both `payload-poc` and `apir-tayo` repos
