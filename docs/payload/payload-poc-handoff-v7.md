# Payload CMS POC — Session Handoff (v7)

> Date: 2026-06-19
> Project: apir-tayo (High6 Corporation)
> Supersedes: payload-poc-handoff-v6.md (2026-06-19)

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
- **New (asked, awaiting reply):** does High6 already have an existing Vercel Pro account, or any other server besides the Hostinger VPS, that should be used instead of provisioning something new?
- **New:** the "make repos public" instruction — confirm scope (payload-poc only, or apir-tayo too?) and confirm the team is fully aware this means all code, agent logic, and tenant structure become publicly visible on GitHub.

---

## ⚠️ Carry into Next Session — Blocked / In-Progress Items

1. **Hostinger server git divergence (apir-tayo) — BLOCKED, needs investigation before next deploy.** The live deploy directory (`/home/projects/apirtayo`) is currently **15 commits ahead of `origin/master`**, with uncommitted local modifications to `ecosystem.config.cjs` (PM2 config — may hold real prod values never committed to the repo) and `next-env.d.ts`. Root cause: other devs have been using Remote-SSH to edit/commit directly on the server instead of going through git properly. **Do not let the CI/CD workflow run `git pull` on this server again until this is resolved** — risk of merge conflict or silent overwrite of production PM2 config. Diagnostic commands prepared but not yet run:
   ```bash
   git log origin/master..HEAD --oneline
   git diff ecosystem.config.cjs
   git diff next-env.d.ts
   ```
   Josh is currently configuring proper CI/CD for the team specifically to stop this pattern going forward; needs to raise current findings with the other devs before proceeding.

2. **apir-tayo `.env` removed from git tracking — partially done.** `.env` was committed in `master`'s history (secrets exposure risk, especially now that public repos are on the table). Remediation so far:
   - Backed up live file on Hostinger: `/home/projects/apirtayo/.env.backup`
   - Ran `git rm --cached .env` directly on the Hostinger server (file untouched on disk, just untracked)
   - Added `.env` to `.gitignore` and pushed the untracking commit to GitHub (`master`)
   - **Not yet confirmed:** whether the next automated deploy pulls cleanly — blocked behind item #1 above, since the same `git pull` is affected by the divergence issue.

3. **Secret rotation — not yet started.** Since `.env` was in git history, treat all values in it as compromised regardless of the untracking fix: DB password, `PAYLOAD_SECRET`, Supabase access keys, `DEEPSEEK_API_KEY`, etc. Rotate and update directly in Hostinger's `.env` + relevant GitHub Secrets once rotated.

4. **apir-tayo env vars — pending update.** Once `payload-poc` is confirmed stable on Vercel, update apir-tayo's env vars to point at it instead of localhost:
   ```
   PAYLOAD_API_URL=https://payload-poc-xi.vercel.app
   NEXT_PUBLIC_PAYLOAD_API_URL=https://payload-poc-xi.vercel.app
   ```

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
| **8. GitHub repos, deployment, CI/CD rebuild trigger** | 🔄 **In progress — deployment platform decided, blocked on Hostinger git divergence (see top of doc)** |

---

## Next Session — Start Here

### Phase 8 — Repos, Deployment, and the Missing Rebuild Trigger

**Decisions made this session:**
- **Hosting platform: Vercel for both apps** (not Hostinger/PM2 for payload-poc). `apir-tayo` stays on Hostinger VPS via PM2 for now (existing CI/CD) but is also being connected to Vercel; `payload-poc` is now live on Vercel.
- **payload-poc deployed:** `https://payload-poc-xi.vercel.app` — `NEXT_PUBLIC_SERVER_URL` set to this value in Vercel project settings.
- **Repos: going public** (per team instruction) — this was the workaround for Vercel's Hobby-plan restriction on deploying private GitHub-organization repos (Pro plan required for private org repos; public org repos deploy fine on Hobby). **Action before finalizing:** scrub/rotate secrets first (see blocked item #2/#3 above) — do not flip to public until that's done.
- **apir-tayo `feat/payload-cms` branch: staying as a branch**, not split into a separate repo — Vercel's automatic branch preview deployments cover the "test in isolation" need without forking history or duplicating CI/CD.
- **Rebuild trigger approach (still to implement):** now that both apps are Vercel-bound, lean toward Payload `afterChange` hook → Vercel Deploy Hook / on-demand revalidation, rather than the original GitHub Actions `repository_dispatch` plan — Vercel's built-in deploy hooks are a more natural fit and require less custom plumbing.

**What's blocking progress (see "Carry into Next Session" section at top of doc):**
1. Hostinger server git divergence (15 unpushed commits + modified `ecosystem.config.cjs`/`next-env.d.ts`) — must be investigated/resolved with the team before any further automated `git pull` deploys on that server.
2. Secret rotation for everything that was in apir-tayo's committed `.env`.
3. apir-tayo env vars still need to be pointed at the live payload-poc URL.

**Once unblocked, remaining steps in order:**
1. Resolve the Hostinger divergence (review the 15 commits, decide what in `ecosystem.config.cjs` needs to be captured back into the repo vs. discarded)
2. Rotate exposed secrets, update Hostinger `.env` + GitHub Secrets
3. Confirm `payload-poc` and `apir-tayo` Vercel projects have the correct **Production Branch** set (Project Settings → Environments → Branch Tracking)
4. Update + redeploy apir-tayo with the live payload-poc URL
5. Get Sir Jeff's answer on existing Vercel Pro/server account, and on public-repo scope
6. Flip repos to public (only after secrets are rotated/scrubbed)
7. Build the `afterChange` → Vercel Deploy Hook rebuild trigger on the 4 content collections first (Testimonials, FAQs, PortfolioItems, PricingPlans)
8. Extend to Pages/Posts once Workstream A (agent `hero.richText`) resumes

**This work is currently benched:** Workstream A (agent capabilities — Priority 1 `hero.richText`, Priority 2 service-account role restrictions, Priority 3 remaining UAT cases) remains paused until Phase 8 is fully sorted out.

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

### Session 7 (2026-06-19) — Deployment Platform Decision, Repo/Secrets Cleanup (Phase 8) 🔄

**Hosting decision:** Evaluated Vercel vs. Railway vs. staying on Hostinger for both apps; landed on **Vercel for both** `payload-poc` and `apir-tayo`. Considered but didn't pursue: Railway (no org-repo plan restriction, persistent-container model better suited to Payload's long-running server, but team preference settled on Vercel).

**Vercel private-org-repo restriction discovered and resolved:**
- Vercel's Hobby plan can't deploy private repos owned by a GitHub Organization (Pro plan, $20/mo, required) — confirmed via Vercel docs and community threads
- Vercel offers a 14-day Pro trial ($20 credit, one per user account) — useful for short evaluation, not a long-term fix; also Hobby plan ToS prohibit commercial use, so not a real option for a client project regardless
- **Resolved via team instruction: repos will be made public** instead of paying for Pro — public org repos deploy fine on Vercel Hobby. Public repos remove the billing blocker but raise the secrets-in-history issue below.

**`payload-poc` deployed to Vercel:**
- Live at `https://payload-poc-xi.vercel.app`
- `NEXT_PUBLIC_SERVER_URL=https://payload-poc-xi.vercel.app` set in Vercel project env vars

**apir-tayo branch strategy decided:** keep `feat/payload-cms` as a branch in the existing repo (not a separate repo) — Vercel's automatic per-branch preview deployments give the same "test in isolation" benefit without forking history or duplicating CI/CD config.

**Security issue found — apir-tayo `.env` committed to `master` history.** Discovered while preparing for the public-repo move. Investigated the existing GitHub Actions → Hostinger deploy workflow first (plain `git pull` + PM2 reload via SSH, no destructive `git clean`/`reset`) to assess risk before touching anything live.

Remediation in progress:
- Backed up live `.env` on Hostinger (`.env.backup`)
- Ran `git rm --cached .env` directly on the server to pre-empt a merge conflict on the next pull
- Added `.env` to `.gitignore`, committed, pushed to `master` on GitHub
- **Discovered a second, unrelated problem while doing this:** the Hostinger deploy directory is 15 commits ahead of `origin/master` with uncommitted changes to `ecosystem.config.cjs` and `next-env.d.ts` — caused by other devs editing/committing directly on the server via Remote-SSH instead of going through git properly. This blocks safely trusting the next automated `git pull`. Paused here — Josh is setting up proper CI/CD specifically to stop this pattern, but needs to loop in the other devs before resolving the current divergence. See "Carry into Next Session" section at top of doc for exact next steps.

**Vercel branch/production config documented:** Project Settings → Environments → Production → Branch Tracking lets you pick any branch (not just `main`) as the production-deploying branch; everything else gets preview deployments automatically.

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
- [ ] **New:** decide and implement a content-change → rebuild/revalidate trigger for apir-tayo (Phase 8) — now planned as Vercel Deploy Hook
- [x] **New:** confirm `payload-poc` has a GitHub remote / is deployed somewhere reachable beyond localhost — **done session 7, live on Vercel**
- [ ] **New, session 7:** rotate all secrets that were in apir-tayo's committed `.env` (DB password, `PAYLOAD_SECRET`, Supabase keys, `DEEPSEEK_API_KEY`) — required regardless of git history cleanup, and **before** flipping repos public
- [ ] **New, session 7:** resolve Hostinger server git divergence (15 unpushed commits + uncommitted `ecosystem.config.cjs`/`next-env.d.ts` changes) before trusting further automated deploys
- [ ] **New, session 7:** lock down `/home/projects/apirtayo` on Hostinger to CI/CD-pipeline-only write access; stop devs editing live via Remote-SSH
- [ ] **New, session 7:** update apir-tayo env vars (`PAYLOAD_API_URL`, `NEXT_PUBLIC_PAYLOAD_API_URL`) to the live payload-poc Vercel URL and redeploy

---

## Environment Variables

### payload-poc (`~/work/payload-poc/.env` — local dev)
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

### payload-poc (Vercel production env vars — added session 7)
```env
NEXT_PUBLIC_SERVER_URL=https://payload-poc-xi.vercel.app
```
(plus all of the local-dev vars above, set in Vercel project settings — same values, production secrets ideally rotated, see Hardening Checklist)

### apir-tayo (`~/path/to/apir-tayo/.env.local` — local dev)
```env
PAYLOAD_API_URL=http://localhost:3000
PAYLOAD_TENANT_ID=6a33cc24b8484fab9369a4d3
NEXT_PUBLIC_PAYLOAD_API_URL=http://localhost:3000
```

### apir-tayo (production — pending update, session 7)
Once payload-poc on Vercel is confirmed stable, update to:
```env
PAYLOAD_API_URL=https://payload-poc-xi.vercel.app
NEXT_PUBLIC_PAYLOAD_API_URL=https://payload-poc-xi.vercel.app
```
**Note:** apir-tayo's `master` had `.env` committed to git history (security issue found session 7 — see "Carry into Next Session" at top of doc). Untracked from git on the Hostinger server; secrets still need rotating.

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
