# Payload CMS POC — Session Handoff (v6)

> Date: 2026-06-19
> Project: apir-tayo (High6 Corporation)
> Supersedes: payload-poc-handoff-v5.md (2026-06-19)

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
- **New:** where should apir-tayo + payload-poc ultimately be hosted (Hostinger VPS alongside the existing PM2-managed app, or a separate host for the Payload backend)?

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
| 3. Content API test (REST + GraphQL, tenant-scoped) | ✅ Validated + hands-on UAT confirmed |
| 3.5. Frontend tenant-scoped filtering fix | ✅ Done |
| 4. Image/media storage with upload guardrails | ✅ Done — all guardrails UAT-confirmed |
| 5. Agent concept POC (plain-language → Payload API) | ✅ Done — core flow + tenant isolation UAT-confirmed |
| 5.1. Agent — expand capabilities (hero.richText + role restrictions) | ⬜ Benched — resumed after Phase 8 |
| 6. Align findings with Sir Gio's WordPress Multisite POC | ⬜ Pending Sir Jeff's input |
| 7. apir-tayo integration (frontend wiring + media) | ✅ Done (session 6) — see below |
| 7.5. Payload admin UX — Tenant Management sidebar grouping | ✅ Done (session 6) |
| **8. GitHub repos, deployment, CI/CD rebuild trigger** | 🔄 **In progress — next priority** |

---

## Next Session — Start Here

### Phase 8 — Repos, Deployment, and the Missing Rebuild Trigger

**The problem:** Editing content in Payload admin (e.g. updating a Testimonial) does **not** automatically rebuild/update the live apir-tayo site. The current frontend wiring fetches Payload data with `next: { revalidate: 60 }` (ISR), which works for *local dev* and would eventually self-heal on a deployed Next.js host with ISR support — but there's no actual deployment pipeline yet, and likely no automatic rebuild trigger wired to Payload's `afterChange` hooks for a statically-built or PM2-served setup.

**What needs to happen:**
1. **Get both repos properly hosted on GitHub** (confirm: is `payload-poc` already a GitHub repo, or still local-only? `apir-tayo` already has a remote with the `feat/payload-cms` branch pushed — confirm current state of both before planning further.)
2. **Decide the deployment target for `payload-poc`** — same Hostinger VPS as apir-tayo (via PM2, matching the existing CI/CD pattern already built for apir-tayo), or a separate host. MongoDB Atlas + Supabase are already cloud-hosted, so only the Payload Node app itself needs a server.
3. **Build the actual rebuild trigger.** Options to evaluate:
   - Payload `afterChange` hook (on Testimonials, FAQs, PortfolioItems, PricingPlans, and eventually Pages/Posts) → fires a `repository_dispatch` or `workflow_dispatch` event to apir-tayo's GitHub Actions, triggering a redeploy/rebuild
   - Or, if apir-tayo stays on Next.js ISR with on-demand revalidation: Payload `afterChange` hook → calls apir-tayo's `/api/revalidate` route (Next.js `revalidatePath`/`revalidateTag`) directly over HTTP — no GitHub Actions involved, faster, but requires apir-tayo to expose an authenticated revalidation endpoint
   - The two aren't mutually exclusive — ISR revalidation is the lighter-weight fix for content-only changes; full GitHub Actions rebuild matters more for code changes
4. **Reuse the existing CI/CD pattern** already built for apir-tayo (GitHub Actions + PM2) rather than inventing a new one from scratch — extend it, don't replace it.

**Recommend tackling in this order:** (a) confirm/create GitHub repo for `payload-poc`, (b) decide ISR-revalidation-webhook vs full-rebuild-trigger (or both), (c) implement the chosen trigger on the `afterChange` hooks of the 4 new collections first (lowest risk, content-only), (d) extend to Pages/Posts once the agent's `hero.richText` work resumes.

**This work is currently benched:** Workstream A (agent capabilities — Priority 1 `hero.richText`, Priority 2 service-account role restrictions, Priority 3 remaining UAT cases) is paused until Phase 8 is sorted out, since a working deploy/update pipeline matters more right now than expanding agent capabilities on a POC that isn't reachable outside localhost.

---

## What's Been Done — apir-tayo Integration (Phase 7) ✅

### Frontend wiring (4 sections)
All 4 high-priority homepage sections now fetch from Payload instead of using hardcoded arrays:

| File | Status |
|---|---|
| `FAQSection.tsx` | ✅ Fetches `/api/faqs`, accepts `faqs` prop |
| `TestimonialsSection.tsx` | ✅ Fetches `/api/testimonials`, accepts `testimonials` prop, resolves image via Payload Media |
| `PortfolioSection.tsx` | ✅ Fetches `/api/portfolio-items`, accepts `projects` prop, resolves image via Payload Media |
| `PricingSection.tsx` | ✅ Fetches `/api/pricing-plans`, accepts `plans` prop, dynamic `pricingIconMap` by label |

**Architecture decisions:**
- Server-side fetch at `app/page.tsx` level (`async` page component), `Promise.all` across all 4 collections, passed down as props — preferred over client-side `useEffect` fetching, better for SEO on a marketing site
- Tenant scoping uses a **static `PAYLOAD_TENANT_ID` env var** directly — no slug→ID resolution at the frontend layer, since `/api/tenants` requires authentication and this is a single-tenant site (slug resolution remains a hard requirement only for the *agent's* route handler, which serves multiple tenants)
- New file: `app/lib/payload/fetchPayload.ts` — generic `fetchFromPayload<T>(collection, tenantId, sort?, depth?)`, returns `null` on any failure, never throws; `next: { revalidate: 60 }` for ISR caching
- New file: `app/lib/payload/payload-types.ts` — `PayloadFAQ`, `PayloadTestimonial`, `PayloadPortfolioItem`, `PayloadPricingPlan` interfaces
- Graceful degradation: if Payload is unreachable, all sections still render headers/CTAs with empty content arrays — no crashes, no loading spinners (server-rendered, always complete HTML)

### Media upload + linking ✅ (session 6)
All 9 images (3 testimonials, 6 portfolio items) uploaded from apir-tayo's local `/assets` files into Payload Media, linked to their records:

- New script: `payload-poc/src/scripts/upload-apirtayo-media.ts` — uses **Payload Local API** (`getPayload({ config })` + `payload.create()`/`payload.update()`), deliberately **not** the agent's `getAgentToken()` service-account JWT, to stay decoupled from the agent's permission scope (which is slated for lockdown — see Hardening Checklist)
- `all-about-people.png` (6.4 MB) exceeded the 5 MB upload guardrail — auto-compressed to 1.8 MB via `sharp` (resize + quality 85) before upload
- Idempotent — re-running the script skips all 9 already-linked records
- Frontend updated: `fetchFromPayload` now accepts a `depth` param (`depth: 1` for testimonials/portfolio-items so the `image` relationship returns `{ id, url }` instead of a bare ID); `resolveImageUrl()` helper added to both `TestimonialsSection.tsx` and `PortfolioSection.tsx` — Payload URL first, falls back to the static `testimonialImageMap`/`portfolioImageMap` only if `image` is null, then to `/assets/placeholder.png`
- `image` field flipped back to `required: true` on `Testimonials.ts` and `PortfolioItems.ts` now that all records are confirmed linked (closes that item on the Hardening Checklist)
- New env var: `NEXT_PUBLIC_PAYLOAD_API_URL=http://localhost:3000` (apir-tayo)

**Verification confirmed:** images served from `http://localhost:3000/api/media/file/...?prefix=<tenantId>` (Supabase-backed), `tsc --noEmit` clean in both repos, both `pnpm build`s pass.

---

## What's Been Done — Payload Admin UX (Phase 7.5) ✅

The `Tenants` collection — the multi-tenancy backbone every other collection depends on — was visually indistinguishable from regular content collections (Pages, Posts, etc.) in the admin sidebar.

**Change made (admin-display only, no schema/data change):**
- Added `admin.group: 'Tenant Management'` to `Tenants.ts`
- Reordered `Tenants` to the front of the `collections` array in `payload.config.ts` (Payload's sidebar renders groups in order of first encounter, so this puts "Tenant Management" above the default "Collections" group)

Resulting sidebar order: **Tenant Management → Collections → Globals**. The "Filter by Tenant" dropdown (separate plugin-injected UI element) was confirmed unaffected.

---

## Collections in payload-poc

### Existing (before session 5)
`Pages`, `Posts`, `Media`, `Categories`, `Tenants`, `Users`

### Added session 5 — all tenant-scoped via multiTenantPlugin

| Collection | Slug | Fields |
|---|---|---|
| Testimonials | `testimonials` | `quote` (textarea, req), `name` (text, req), `position` (text, req), `image` (upload → media, **required**) |
| FAQs | `faqs` | `question` (text, req), `answer` (textarea, req), `order` (number, default: 0) |
| PortfolioItems | `portfolio-items` | `title` (text, req), `category` (text, req), `url` (text, req), `image` (upload → media, **required**) |
| PricingPlans | `pricing-plans` | `label` (text, req), `items` (array of `{ item: text }`), `order` (number, default: 0) |

*(`image` flipped from optional → required in session 6 once media linking was confirmed complete — see Phase 7 above.)*

All follow existing collection patterns: anyone read access, authenticated create/update/delete, `useAsTitle` on display field.

### Seeded data (apir-tayo tenant — ID: `6a33cc24b8484fab9369a4d3`)

**FAQs (5):** Is this custom? / Can I upgrade later? / Is there a contract? / What do I need to prepare? / Is maintenance included?

**Pricing Plans (4):** Website Essentials / Technical Setup / Ongoing Support / Flexible & Transparent

**Testimonials (3):** Jason Go (GTGO Enterprises) / Gene Nicolas (Premiere Builders Corp.) / Claudia Soriano (All About People) — all with linked images

**Portfolio Items (6):** Soding Bros / Tipping Point PH / Ad-Haven / Michael James Love / City Tech / Edgetech — all with linked images

Seed script: `src/scripts/seed-apirtayo.ts` (content) — idempotent.
Media script: `src/scripts/upload-apirtayo-media.ts` (images) — idempotent.

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

**Additional finding:** `/api/tenants` requires authentication — anonymous REST calls return 403. Agent's slug→ID resolution step always needs authenticated context. (apir-tayo's frontend sidesteps this entirely by using a static tenant ID — see Phase 7.)

**Conclusion:** the two-step "resolve slug → validate ObjectId format → query by ID" pattern is a hard requirement for all *agent* implementations specifically (multi-tenant-aware callers), not for single-tenant frontends.

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
| File size limit (5MB) | `beforeOperation` hook with `APIError` | ✅ Rejected with accurate message; auto-compression added session 6 for legitimate oversized uploads |
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
| Unknown action ("Delete the welcome post") | ⬜ Not UAT'd yet — benched with rest of Workstream A |
| Nonsensical command ("do the thing") | ⬜ Not UAT'd yet — benched with rest of Workstream A |

### Session 5 (2026-06-19) — apir-tayo Integration Start (Phase 7) 🔄

- Created `feat/payload-cms` branch off `master` in apir-tayo repo, pushed to remote
- Ran `/init` in apir-tayo repo, updated `CLAUDE.md` with Payload integration context
- Full content audit of all 11 homepage section components
- Created 4 new Payload collections in payload-poc (Testimonials, FAQs, PortfolioItems, PricingPlans)
- Registered collections in `payload.config.ts` and `src/plugins/index.ts`
- Created `apir-tayo` tenant in Payload admin (ID: `6a33cc24b8484fab9369a4d3`)
- Wrote and ran seed script (`src/scripts/seed-apirtayo.ts`) — 18 records seeded, idempotent confirmed
- Made `image` field optional on Testimonials and PortfolioItems for seedability

### Session 6 (2026-06-19) — Frontend Wiring, Media Upload, Admin UX (Phases 7, 7.5) ✅

- Wired all 4 priority sections (FAQ, Testimonials, Portfolio, Pricing) to fetch from Payload server-side, replacing hardcoded arrays — see Phase 7 above for full detail
- Caught and corrected a planning issue before implementation: original plan proposed slug→ID tenant resolution via `/api/tenants`, which would have 403'd per the Session 2 finding — corrected to use a static `PAYLOAD_TENANT_ID` env var instead
- Built and ran `upload-apirtayo-media.ts` to move all 9 existing local images into Payload Media, linked to their records — deliberately used Payload Local API instead of the agent's service-account JWT to avoid future coupling with the planned agent permission lockdown
- Flipped `image` back to `required: true` on Testimonials and PortfolioItems, closing that Hardening Checklist item
- Enhanced Payload admin sidebar UX — `Tenants` now grouped under its own "Tenant Management" heading, positioned above "Collections"

**Remaining for Phase 7:** lower-priority sections (HowItWorksSection, WhyOnePageSection, CTASection, HeroSection via a `SiteSettings` global) — not yet started.

---

## Pre-Production Hardening Checklist

- [ ] Move MongoDB Atlas + Supabase from Josh's personal account to company-owned account
- [ ] Replace `userHasAccessToAllTenants: () => true` with real role-based access control
- [ ] Add Payload-side role to service account — restrict to `update` on `posts` and `pages` only; block `delete`, `create`, `media`, `tenants`, `users` *(benched with Workstream A until Phase 8 lands)*
- [ ] Evaluate `signedDownloads` on S3 adapter (Public bucket → presigned URLs)
- [ ] Tighten WebP magic bytes check to validate bytes 8–11 (`WEBP` marker), not just `RIFF` header
- [ ] Distinguish "no tenant param" vs "invalid tenant param" in frontend fetch fallback behavior
- [ ] Confirm LLM provider with Sir Jeff (DeepSeek vs Claude API vs other)
- [x] Make `image` field required again on Testimonials and PortfolioItems after media upload is handled — **done session 6**
- [ ] **New:** decide and implement a content-change → rebuild/revalidate trigger for apir-tayo (Phase 8)
- [ ] **New:** confirm `payload-poc` has a GitHub remote / is deployed somewhere reachable beyond localhost

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

### apir-tayo (`~/path/to/apir-tayo/.env.local`)
```env
PAYLOAD_API_URL=http://localhost:3000
PAYLOAD_TENANT_ID=6a33cc24b8484fab9369a4d3
NEXT_PUBLIC_PAYLOAD_API_URL=http://localhost:3000
```

---

## Resources

- [Payload Docs](https://payloadcms.com/docs/getting-started/what-is-payload)
- [Payload GitHub](https://github.com/payloadcms/payload)
- [Payload Multi-Tenant Plugin](https://payloadcms.com/docs/plugins/multi-tenant)
- [Payload Cloud Storage](https://payloadcms.com/docs/plugins/cloud-storage)
- [Payload Hooks (afterChange, etc.)](https://payloadcms.com/docs/hooks/overview)
- [Lexical Rich Text Editor (Payload)](https://payloadcms.com/docs/rich-text/lexical)
- [MongoDB Atlas](https://cloud.mongodb.com)
- [Next.js On-Demand Revalidation](https://nextjs.org/docs/app/building-your-application/data-fetching/incremental-static-regeneration#on-demand-revalidation)
- [GitHub Actions — repository_dispatch event](https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#repository_dispatch)
- Project `CLAUDE.md` files — in both `payload-poc` and `apir-tayo` repos
