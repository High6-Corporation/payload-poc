# Payload CMS Integration — Handoff Document

> **Branch:** `feat/payload-cms`
> **Date:** June 2026 (updated post-deployment, pre–AI Agent solidification)
> **Summary:** Wired the Apirtayo Next.js frontend to an external Payload CMS for dynamic homepage content, replacing hardcoded data in four homepage sections. Both repos are now deployed to Vercel. Admin UI/UX branding pass and a standalone team-facing explainer are in progress. Next session's focus: solidifying the AI Agent feature (Workstream A).

---

## 1. Overview

The Apirtayo marketing site previously used hardcoded content for all homepage sections (FAQ questions, testimonials, portfolio items, pricing plans). This integration replaces those hardcoded arrays with live data fetched from a **separately deployed Payload CMS instance** using Payload's REST API.

The Payload CMS itself lives in a **different project** at `/Users/josh/work/payload-poc` — it is not part of the apir-tayo repository. The two projects communicate over HTTP at runtime.

### What was achieved
- **4 of 11 homepage sections** now consume dynamic content from Payload
- Content editors can manage FAQs, testimonials, portfolio items, and pricing plans via the Payload admin UI
- Multi-tenant architecture: one Payload instance can serve multiple frontends, each scoped to its own "Site"
- Zero downtime on Payload failure — all fetches fail gracefully to empty arrays
- **Both repos deployed to Vercel** (`payload-poc` and `apir-tayo`) — verified end-to-end in production: an upload/edit in the live Payload admin correctly flows through to the live apir-tayo site (subject to the 60s ISR window, see §6)
- **Admin UI/UX branding pass in progress** — replacing Payload's default login screen, theme, dashboard empty states, and the public-facing landing page with High6 branding (frontend-design pass, not yet merged)
- **Standalone team-facing explainer built** — a single self-contained HTML file ("What is Payload, why we use it, how it works") for the upcoming team presentation, separate from this technical handoff and from the live demo

---

## 2. Architecture

```
┌─────────────────────────────┐       REST API        ┌──────────────────────────┐
│   apir-tayo (Next.js 16)    │ ◄──────────────────►  │   payload-poc (Next.js)   │
│                              │   fetch() at runtime  │                           │
│  app/page.tsx                │                       │  Payload CMS 3.85.1       │
│   └─ fetchFromPayload()     │   GET /api/{collection}│  MongoDB (Atlas)          │
│      └─ app/lib/payload/    │   ?where[site][equals] │  Supabase S3 (media)      │
│                              │   ={siteId}           │                           │
│  Port: 3002 (production)    │                       │  Port: 3000 (local)       │
└─────────────────────────────┘                       └──────────────────────────┘
```

### Multi-tenant model

```
Tenant ("High6 Corporation")
  └── Site ("apir-tayo")          ← PAYLOAD_SITE_ID = 6a352f382054dfd250819c26
        ├── FAQs
        ├── Testimonials
        ├── Portfolio Items
        └── Pricing Plans
  └── Site ("future-project-2")
        └── ...
```

Each content document has a `site` relationship field. The frontend filters by `PAYLOAD_SITE_ID` so it only receives content belonging to its tenant site.

### Key design decisions
| Decision | Rationale |
|---|---|
| REST API (not GraphQL) | Simpler, no client dependency needed |
| Server-side fetch (not client) | SEO, performance, ISR caching |
| `next: { revalidate: 60 }` | 60-second stale-while-revalidate — good balance of freshness vs. Payload load |
| `null` on failure (not throw) | Page must render even when Payload is down |
| Payload in separate repo | Independent deploy cycles, shared across projects |

---

## 3. Changes Made

### 3.1 New files: `app/lib/payload/` (3 files)

#### `app/lib/payload/fetchPayload.ts`
The core data-fetching utility. A single generic function:

```ts
fetchFromPayload<T>(collection, siteId, sortOrDepth?, depth?): Promise<T[] | null>
```

- Constructs the URL: `${PAYLOAD_API_URL}/api/${collection}?where[site][equals]=${siteId}`
- Appends optional `&sort=` and `&depth=` params
- Uses Next.js `fetch()` with `{ next: { revalidate: 60 } }` for ISR
- Returns `null` on any error (missing env vars, network failure, non-2xx)
- Logs errors to `console.error` with `[fetchFromPayload]` prefix

#### `app/lib/payload/payload-types.ts`
TypeScript interfaces for the four Payload collections:

| Interface | Fields |
|---|---|
| `PayloadFAQ` | `id`, `question`, `answer`, `order?` |
| `PayloadTestimonial` | `id`, `quote`, `name`, `position`, `image?` (upload object or string) |
| `PayloadPortfolioItem` | `id`, `title`, `category`, `url`, `image?` (upload object or string) |
| `PayloadPricingPlan` | `id`, `label`, `items?` (array of `{item, id?}`), `order?` |

The `image` field is typed as `{ id: string; url: string } | string | null` because Payload returns upload fields as objects with `depth=1` but as string IDs at `depth=0`.

#### `app/lib/payload/index.ts`
Barrel export re-exporting `fetchFromPayload` and all four types.

### 3.2 Modified: `app/page.tsx`

**Before:** Synchronous server component with no data fetching. Section props were absent — components used internal hardcoded data.

**After:** `async function Page()` that:
1. Reads `process.env.PAYLOAD_SITE_ID`
2. Fetches all four collections in parallel with `Promise.all`
3. Passes results as props to section components
4. Guards with `if (siteId)` — if the env var is missing, arrays remain empty

```ts
const [faqsData, testimonialsData, projectsData, plansData] =
  await Promise.all([
    fetchFromPayload<PayloadFAQ>("faqs", siteId, "order"),
    fetchFromPayload<PayloadTestimonial>("testimonials", siteId, 1),
    fetchFromPayload<PayloadPortfolioItem>("portfolio-items", siteId, 1),
    fetchFromPayload<PayloadPricingPlan>("pricing-plans", siteId, "order"),
  ]);
if (faqsData) faqs = faqsData;
```

Note: `depth=1` is used for collections with image uploads (`testimonials`, `portfolio-items`) so the API returns the full image object with `url` instead of just the media ID.

### 3.3 Modified: section components (4 files)

All four components followed the same pattern change:

| Component | Prop added | What was removed |
|---|---|---|
| `FAQSection` | `faqs: { question, answer }[]` | 5-item hardcoded `faqs` array |
| `TestimonialsSection` | `testimonials: { quote, name, position, image? }[]` | 3-item hardcoded `testimonials` array + `testimonialImageMap` |
| `PortfolioSection` | `projects: { title, category, url, image? }[]` | 6-item hardcoded `projects` array + `portfolioImageMap` |
| `PricingSection` | `plans: { label, items? }[]` | 4 hardcoded plan `<div>` blocks |

Additional changes in `TestimonialsSection` and `PortfolioSection`:
- Added `resolveImageUrl()` helper that prepends `NEXT_PUBLIC_PAYLOAD_API_URL` to relative media URLs (e.g., `/api/media/file.jpg` → `http://localhost:3000/api/media/file.jpg`)
- Switched from local `/assets/` images to Payload-served images with a `/assets/placeholder.png` fallback
- Old `portfolioImageMap` and `testimonialImageMap` are preserved as commented-out code for reference
- The `PricingSection` retains a hardcoded `pricingIconMap` (icons are still local SVGs, not from Payload)

### 3.4 Modified: `.gitignore`
Added `.env.local` to prevent committing secrets. (The `.env` entry already existed.)

### 3.5 Modified: `CLAUDE.md`
Added the "Payload CMS Integration" section documenting architecture direction, env vars, and integration approach.

---

## 4. Environment Variables

Three new variables required (added to `.env.local`):

| Variable | Example | Used by | Purpose |
|---|---|---|---|
| `PAYLOAD_API_URL` | `http://localhost:3000` | `fetchPayload.ts` (server) | Payload REST API base URL |
| `NEXT_PUBLIC_PAYLOAD_API_URL` | `http://localhost:3000` | `PortfolioSection`, `TestimonialsSection` (client) | Public URL for resolving media paths in `<img>` tags |
| `PAYLOAD_SITE_ID` | `6a352f382054dfd250819c26` | `app/page.tsx` (server) | Tenant site ID for `where[site][equals]=` filter |

**Why two URL variables?** `PAYLOAD_API_URL` is server-only (not prefixed with `NEXT_PUBLIC_`), used for server-side `fetch()`. `NEXT_PUBLIC_PAYLOAD_API_URL` is the client-visible variant, used by `"use client"` components to construct image URLs. In production these might differ (internal vs. public hostnames).

---

## 5. How to Replicate — Wiring a New Frontend

To connect a new Next.js frontend to the same Payload instance:

### Step 1: Create the Payload library

Copy the `app/lib/payload/` directory (3 files) to the new project:

```bash
cp -r apir-tayo/app/lib/payload new-project/app/lib/
```

Or create them from scratch — the files are small and self-contained.

### Step 2: Create a new "Site" in Payload

1. Log into the Payload admin panel (`http://localhost:3000/admin`)
2. Go to **Sites** → **Create New**
3. Fill in:
   - **Name:** Your project name
   - **Slug:** URL-friendly identifier
   - **URL:** Production URL of the frontend
   - **Tenant:** Select the parent tenant (e.g., "High6 Corporation")
4. Note the generated Site `id` — this becomes `PAYLOAD_SITE_ID`

### Step 3: Add content in Payload

Create entries in the four content collections (FAQs, Testimonials, Portfolio Items, Pricing Plans), assigning each to the new Site via the `site` relationship field. Use `order` fields to control display sequence.

### Step 4: Add env vars to the frontend

```bash
PAYLOAD_API_URL=http://localhost:3000        # or production Payload URL
NEXT_PUBLIC_PAYLOAD_API_URL=http://localhost:3000
PAYLOAD_SITE_ID=<your-site-id-from-step-2>
```

### Step 5: Convert homepage to async, add props

Make `app/page.tsx` an `async` server component. Import `fetchFromPayload` and the types. Fetch collections in `Promise.all`, pass results as props to section components.

### Step 6: Update section components to accept props

For each section being wired:
1. Define a props interface (e.g., `{ faqs: ...[] }`)
2. Add the prop to the component function signature
3. Replace hardcoded data with `props.xxx`
4. If the section has images, add the `resolveImageUrl` helper reading `NEXT_PUBLIC_PAYLOAD_API_URL`

### Step 7: Handle media URLs (if applicable)

If your section displays uploaded images, Payload returns them as relative paths like `/api/media/file-123.jpg`. Client components need to prepend the Payload base URL:

```ts
const PAYLOAD_BASE = process.env.NEXT_PUBLIC_PAYLOAD_API_URL || "";

function resolveImageUrl(url: string): string {
  if (url.startsWith("/api/media/") && PAYLOAD_BASE) {
    return `${PAYLOAD_BASE}${url}`;
  }
  return url;
}
```

> **Important:** When fetching a collection with image uploads, pass `depth=1` to `fetchFromPayload`. Otherwise Payload returns the media ID as a string instead of the full `{ id, url, filename, ... }` object.

---

## 6. Data Flow

```
1. Request arrives at apir-tayo
2. page.tsx (server component) reads PAYLOAD_SITE_ID from process.env
3. fetchFromPayload() called 4× in parallel (Promise.all)
4. Each call → GET {PAYLOAD_API_URL}/api/{collection}?where[site][equals]={siteId}
5. Payload REST API queries MongoDB, returns { docs: [...], totalDocs: N }
6. fetchFromPayload extracts .docs, returns T[]
7. page.tsx passes arrays as props to section components
8. ISR caches the fetched HTML for 60 seconds
9. Client components render images using NEXT_PUBLIC_PAYLOAD_API_URL + relative path
```

### Caching
- **ISR revalidation:** 60 seconds (`next: { revalidate: 60 }` in fetch options)
- This means content changes in Payload take up to 60 seconds to appear on the live site
- On the first request after the 60-second window, Next.js serves the stale cached page while re-fetching in the background
- To reduce this, lower `revalidate` (e.g., `30` for 30 seconds) — but this increases load on the Payload server

### Error handling
- If `PAYLOAD_API_URL` is not set → `console.error`, returns `null`
- If Payload is unreachable → `console.error`, returns `null`
- If Payload returns non-2xx → `console.error`, returns `null`
- Callers check for `null` and fall back to empty arrays → page renders without that section's dynamic content
- The page **never crashes** due to Payload unavailability

---

## 7. Remaining Work

### Sections still using hardcoded content
| Section | Status | Notes |
|---|---|---|
| HeroSection | Hardcoded | Would need a Payload collection (hero headline, subtitle, CTA text, background) |
| WhyOnePageSection | Hardcoded | Feature list — could be a Payload collection |
| HowItWorksSection | Hardcoded | Step-by-step process — could be a Payload collection |
| TrustSection | Hardcoded | Client logos/stats — could be a Payload collection |
| CTASection | Hardcoded | Single CTA block — could be a Payload singleton/global |
| Footer | Hardcoded | Footer links, copyright — could be a Payload global |

### Known gaps
- **No revalidation on content change:** Payload doesn't notify the frontend when content changes. The frontend relies on ISR's time-based revalidation. A webhook-based on-demand revalidation (using `revalidateTag` / `revalidatePath`) would give instant updates. **Status: deprioritized, not abandoned** — evaluated and intentionally deferred, since the active pain point this would solve (instant feedback for AI Agent–driven edits) doesn't apply yet while Workstream A is benched. Worth flagging as deprioritized rather than dropped when discussed with the team.
- **No type safety at the API boundary:** `fetchFromPayload` returns `json.docs` with a type assertion (`as PayloadListResponse<T>`). If the Payload schema changes, there's no compile-time error. Use `pnpm generate:types` in the Payload project and copy the generated types to the frontend for full safety.
- **`PAYLOAD_TENANT_SLUG` in CLAUDE.md is unused:** The CLAUDE.md references `PAYLOAD_TENANT_SLUG` but the actual code uses `PAYLOAD_SITE_ID`. This should be updated.
- ~~**Production URLs not configured**~~ — **Resolved.** Both `payload-poc` and `apir-tayo` are deployed to Vercel, with apir-tayo's production env vars pointed at the live Payload deployment URL (not `localhost`). Verified working end-to-end in production.
- **CI/CD does not inject Payload vars:** The GitHub Actions deploy workflow (Hostinger VPS path, separate from the Vercel deploys above) still does not include Payload env vars in its build step. Lower priority now that Vercel is the active deploy path, but worth fixing if the Hostinger pipeline resumes use.

---

## 7.5 Next Session: Solidifying the AI Agent Feature (Workstream A)

This is the planned focus for the next working session. Context to carry forward:

### Current state of the agent
- A working **proof of concept** exists from an earlier phase: plain-language instructions (e.g. "change the title of the home page") are parsed by the **DeepSeek API** and translated into scoped Payload REST API calls.
- Lives at `src/app/api/agent/route.ts` in `payload-poc`.
- Core flow and tenant/site isolation enforcement are **UAT-confirmed** at the POC level.
- **Status: intentionally benched**, not abandoned — paused pending team discussion on direction, scope, and priority. This is by design, not a stall.

### What changed underneath it since the POC was built
The Tenant → Site migration (see §2, "Multi-tenant model") happened *after* the agent POC was built. The route currently resolves a **tenant** slug → ID for its isolation checks — but the model has since shifted to **Tenant → Site → Content**, where content is scoped by `site`, not directly by `tenant` anymore.

A `// TODO(Workstream A)` comment was left in the route at the point where this resolution happens, flagging that it needs to resolve **Site** slug → ID instead (deriving tenant via `site.tenant` if still needed for any higher-level checks). **No agent logic was changed during the migration** — this is the first real item to address when this work resumes.

### Known remaining gaps (from the original POC notes, still open)
- Updating *visible page content* via Lexical rich text fields isn't done — hero text and similar rich-text fields use a specific JSON structure, not a plain string, so the agent's content-update logic needs to produce that structure correctly, not just write plain text.
- Payload-side role restrictions on the agent's service account (`AGENT_EMAIL` user) aren't locked down yet — currently broader than strictly needed.

### Open questions to settle with the team before/during next session
- Scope: should the agent be limited to text-field edits only (titles, FAQ answers, etc.), or eventually handle structural changes (adding/removing items, reordering)?
- Where does it sit in the actual product — admin-only tool, or eventually client-facing (see the "should clients use Payload" discussion — the agent was always intended as the client-safe interface, not raw Payload admin access)?
- Does on-demand revalidation (the deprioritized item in §7) become relevant again once the agent makes edits that a client expects to see reflected near-instantly? Worth revisiting that decision once agent scope is clearer — the original case for *not* building it assumed the agent wasn't active yet.

---

## 8. Key Files Reference

### In apir-tayo (frontend consumer)
| File | Role |
|---|---|
| [`app/lib/payload/fetchPayload.ts`](app/lib/payload/fetchPayload.ts) | Fetch helper — single entry point for all Payload queries |
| [`app/lib/payload/payload-types.ts`](app/lib/payload/payload-types.ts) | TypeScript interfaces for collection shapes |
| [`app/lib/payload/index.ts`](app/lib/payload/index.ts) | Barrel exports |
| [`app/page.tsx`](app/page.tsx) | Homepage — fetches data server-side, passes as props |
| [`app/components/sections/homepage/FAQSection.tsx`](app/components/sections/homepage/FAQSection.tsx) | Accepts `faqs` prop |
| [`app/components/sections/homepage/PricingSection.tsx`](app/components/sections/homepage/PricingSection.tsx) | Accepts `plans` prop |
| [`app/components/sections/homepage/PortfolioSection.tsx`](app/components/sections/homepage/PortfolioSection.tsx) | Accepts `projects` prop + image URL resolution |
| [`app/components/sections/homepage/TestimonialsSection.tsx`](app/components/sections/homepage/TestimonialsSection.tsx) | Accepts `testimonials` prop + image URL resolution |
| [`.env.local`](.env.local) | Payload env vars (not committed) |
| [`CLAUDE.md`](CLAUDE.md) | Architecture documentation |

### In payload-poc (CMS server — separate repo at `/Users/josh/work/payload-poc`)
| File | Role |
|---|---|
| `src/payload.config.ts` | Payload configuration (collections, globals, plugins) |
| `src/collections/FAQs.ts` | FAQ collection definition with `site` relationship |
| `src/collections/Testimonials.ts` | Testimonial collection with `image` upload field |
| `src/collections/PortfolioItems.ts` | Portfolio collection with `image` upload field |
| `src/collections/PricingPlans.ts` | Pricing plan collection with `items` array field |
| `src/collections/Sites.ts` | Sites collection (tenant scoping) |
| `src/collections/Tenants.ts` | Tenants collection (top-level org) |
| `src/utilities/resolveSite.ts` | Resolves Site slug ↔ ID (renamed from `resolveTenant.ts` during the Tenant→Site migration) |
| `src/app/api/agent/route.ts` | **AI Agent route (Workstream A, benched).** Parses plain-language instructions via DeepSeek API into scoped Payload updates. Contains a `// TODO(Workstream A)` flag where tenant-slug resolution needs updating to site-slug resolution — see §7.5 |
| `src/scripts/seed-apirtayo.ts` | Seed script that populated initial apir-tayo content |
| `src/access/anyone.ts` | Public read access (`() => true`) |

---

## 9. Useful Commands

### Payload CMS (in `/Users/josh/work/payload-poc`)
```bash
pnpm dev              # Start Payload dev server (port 3000)
pnpm generate:types   # Regenerate TypeScript types from collections
pnpm build            # Production build
```

### Apir-tayo frontend (in `/Users/josh/work/apir-tayo`)
```bash
npm run dev           # Start Next.js dev server (port 3002)
npm run build         # Production build
npm run start         # Production server
```

### Testing the integration
```bash
# Check that Payload is responding
curl http://localhost:3000/api/faqs?where[site][equals]=6a352f382054dfd250819c26

# Check that apir-tayo can reach Payload (start both dev servers, then visit)
open http://localhost:3002
```

---

## 10. Commit History

Key commits on `feat/payload-cms`:

| Commit | Message |
|---|---|
| `e66aecd` | `fix: rewired for data model changes for multi-tenant` |
| `4ee76b6` | `chore: env in gitignore` |
| `cc2c0db` | `chore: hide env variables in prod` |
| `d06920e` | `feat: wired with payload poc` |

The base branch (`master`) contains the pre-Payload version with all-hardcoded content and WordPress-only backend.
