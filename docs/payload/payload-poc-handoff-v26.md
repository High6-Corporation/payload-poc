# Payload CMS Integration — Handoff Document

> **Branch:** `master` (production)
> **Date:** July 1, 2026
> **Version:** v26
> **Summary:** Two workstreams closed out this session, both extending Phase 18 (Custom Collections). (1) **Media field upload** — the `media` field type in `EntryDataField` no longer requires manually pasting a Payload Media document ID; it now uses Payload's native `useListDrawer` (browse existing + `allowCreate: true` for direct upload) with a resolved thumbnail preview and Replace/Remove affordances. Tested and confirmed working. (2) **apir-tayo integration proven** — built and validated fetch utilities (`fetchCustomCollections()`, `fetchCustomCollectionEntries()`, `fetchMediaUrl()`) in apir-tayo against real custom-collection data, confirmed the full round trip (schema → entries → generic per-field-type rendering, including media resolution) via a temporary test route. The test route has since been deleted (it was a live, unauthenticated route with a raw-data debug panel — not fit to leave in production); the pattern is preserved as a written reference doc for the other team, plus the fetch utilities themselves, which remain in the codebase as the real integration point. **Current status: Phase 18 — Custom Collections feature-complete and tested, including the media upload UX and a proven (documented, not yet wired-in) apir-tayo integration path.** **Next session:** decide whether/when to wire Custom Collections into an actual apir-tayo page (homepage section or new page), then scope Medusa architecture exploration before picking up the assigned Medusa project.

---

## 1. Overview

The Apirtayo marketing site consumes dynamic content from a **separately deployed Payload CMS instance** via Payload's REST API. The Payload CMS lives at `/Users/josh/work/payload-poc` — separate from the apir-tayo repo at `/Users/josh/work/apir-tayo`. The two projects communicate over HTTP at runtime.

```
┌─────────────────────────────┐       REST API        ┌──────────────────────────┐
│   apir-tayo (Next.js)        │ ◄──────────────────►  │   payload-poc (Next.js)   │
│                              │   fetch() at runtime  │                           │
│  app/page.tsx                │                       │  Payload CMS 3.85.1       │
│   └─ fetchFromPayload()     │   GET /api/{collection}│  MongoDB (Atlas)          │
│      └─ app/lib/payload/    │   ?where[site][equals] │  Supabase S3 (media)      │
│                              │   ={siteId}           │                           │
│  /portal/* (client portal)  │                       │  Port: 3000 (local)       │
│  Port: 3002 (local)         │                       │                           │
└─────────────────────────────┘                       └──────────────────────────┘
```

### Multi-tenant model

```
Tenant ("High6 Corporation")
  └── Site ("apir-tayo")          ← PAYLOAD_SITE_ID = 6a352f382054dfd250819c26
        ├── FAQs
        ├── Testimonials
        ├── Portfolio Items
        ├── Pricing Plans
        ├── Site Settings (one record per site)
        ├── Forms (contact form — tenant + site scoped)
        ├── Custom Collections (Phase 18 — schema definitions)
        └── Custom Collection Entries (Phase 18 — content rows)
  └── Site ("future-project-2")   ← code now supports this (Phase 15); not yet seeded or tested

PortalClients (separate auth collection)
  └── email + password (Payload-managed)
  └── tenant (relationship → Tenants)
```

### Cumulative achievements (Phases 1–18 + Production Promotion + Contact Form Migration)
- 4 of 11 homepage sections consume dynamic content from Payload (FAQs, Testimonials, Portfolio Items, Pricing Plans)
- Multi-tenant architecture with site-scoped content
- Both repos deployed to Vercel — verified end-to-end in production
- AI Agent client portal fully implemented (Phases 1–11) — agentic tasks benched until further notice
- Editable homepage headings via `site-settings` collection (Phase 13)
- Content Editor Guide + Integration & Testing Guide delivered to Website Team (Phase 14)
- Roadmap document generated covering Phases 15–22 (Phase 14 session)
- `getTenantSiteId()` and `fetchTenantRecords()` rewritten for multi-site support — code complete, build passing, **isolation test not yet run** (Phase 15)
- `feat/payload-cms` promoted to production on Hostinger VPS — add/update/delete verified working in production
- `forms` and `form-submissions` tenant-scoped with `site` fields, multi-tenant plugin registration, and CleanTalk anti-spam hook (Phase 16)
- SMTP2GO email integration via `nodemailerAdapter` — forgot-password email confirmed working in production. **SMTP2GO user: `investph-smtp`** (Phase 17)
- Contact page `/contact` fully migrated to Payload — fields fetched from Payload `forms` collection, submissions POSTed to Payload `form-submissions` collection. Gravity Forms kept as fallback for field fetching only. ✅ Confirmed working in production. Submissions confirmed visible in Payload admin. (this session)
- **Phase 18 — Custom Collections backend complete** — `custom-collections` and `custom-collection-entries` collections, FieldBuilder UI, EntryDataField dynamic form, Payload CSS variable theming.
- **Phase 18 — Media field upload** — `EntryDataField`'s `media` field type replaced manual document-ID entry with Payload's native `useListDrawer` (browse existing + `allowCreate: true` upload), thumbnail preview via `usePayloadAPI`, Replace/Remove affordances. Inline styles + Payload CSS vars only, consistent with the rest of the component. Tested and confirmed working. (this session)
- **apir-tayo Custom Collections integration — proven, documented, not yet wired in** — `fetchCustomCollection.ts` (three exports: `fetchCustomCollections()`, `fetchCustomCollectionEntries()`, `fetchMediaUrl()`) added to `app/lib/payload/`, following the existing `fetchFromPayload<T>()` contract exactly (null-on-failure, `next: { revalidate: 3600 }`). Validated against real data via a temporary test route (`/test-custom-collection`), which has been deleted post-confirmation. Pattern captured in a reference doc for the other team. (this session)
- Graphify knowledge graph: updated this session to reflect the media-upload change and the new apir-tayo fetch utilities/reference doc (test route removal also reflected)

### Key design decisions
| Decision | Rationale |
|---|---|
| REST API (not GraphQL) | Simpler, no client dependency needed |
| Server-side fetch (not client) | SEO, performance, ISR caching |
| `next: { revalidate: 60 }` | 60-second stale-while-revalidate (homepage sections) |
| `cache: 'no-store'` on Gravity Forms fetch | WP vars are VPS-only, must not cache null build-time responses |
| `null` on failure (not throw) | Page must render even when Payload is down |
| Payload in separate repo | Independent deploy cycles, shared across projects |
| PortalClients separate from Users | Clients can never get Payload admin access |
| Confirmation before PATCH/POST | All agent mutations require explicit client confirmation |
| Persistent audit log | AgentAuditLog collection records every confirmed change |
| Sequential field collection | One field per turn for creates — consistent, debuggable |
| SiteSettings as collection (not Global) | Payload Globals cannot be scoped per tenant/site |
| `.env` never committed to git | Env vars live in GitHub Secrets (build-time) and VPS `.env` file (runtime) only |
| Payload primary, Gravity Forms fallback | Contact form field fetch falls back to GF if Payload returns null; submission fully migrated to Payload |
| `tenant` included in form-submission POST | Multi-tenant plugin requires `tenant` on `form-submissions`; fetched from parent form doc before submitting |
| Custom Collections as meta-collection | Payload collections are code-defined; runtime schema creation uses JSON-stored field definitions + dynamic UI rather than real collection scaffolding |
| Inline styles only in custom components | Tailwind utility classes conflict with Payload admin's own CSS in custom React components |
| Payload CSS variables for theming | Custom components use `var(--theme-*)` tokens to match native Payload admin appearance |
| `useListDrawer` (not a custom uploader) for media fields | Reuses Payload's native relationship-picker UX (same pattern as every other relationship field in admin), and comes with auth, tenant scoping, file validation, and media processing already handled — no upload pipeline code to write or maintain |
| Custom Collections apir-tayo integration: test route deleted, utilities + doc kept | The test page proved the round trip but was a live, unauthenticated route with a raw-data debug panel — not safe to leave in production. Fetch utilities and a written reference doc are the reusable, safe artifacts for the other team |
| `richtext` fields render as plain text (escaped), not HTML | `EntryDataField`'s `richtext` type isn't backed by a real lexical editor — it's a generic input per FieldBuilder's "suggestions, not strict" design — so there's no structured/trusted HTML to render safely yet |

---

## 2. Collections in Payload

| Collection | Slug | Purpose |
|---|---|---|
| Tenants | `tenants` | Top-level org grouping. All ops: authenticated. |
| Sites | `sites` | One per frontend — scopes all content. All ops: authenticated. |
| FAQs | `faqs` | Question + answer pairs, order field. Read: public. |
| Testimonials | `testimonials` | Name, quote, position, optional image. Read: public. |
| Portfolio Items | `portfolio-items` | Title, category, optional url, optional image. Read: public. |
| Pricing Plans | `pricing-plans` | Label, price, optional description, optional features array. Read: public. |
| Site Settings | `site-settings` | One record per Site — heading/copy for all 6 homepage sections. Read: public. |
| Posts | `posts` | Blog posts with slugs. Read: authenticatedOrPublished. |
| Pages | `pages` | Named pages with slugs. Read: authenticatedOrPublished. |
| Media | `media` | Uploaded images, stored in Supabase S3. Read: public. |
| Categories | `categories` | Post categorization. Read: public. |
| Portal Clients | `portal-clients` | Auth-enabled collection for client portal users. All ops: authenticated. |
| Agent Audit Log | `agent-audit-log` | Immutable log of every confirmed agent mutation. Create/read: authenticated. Update/delete: hardcoded false. |
| Users | `users` | Payload admin accounts. All ops: authenticated. |
| **Custom Collections** | `custom-collections` | Schema definitions for site-specific custom content sections. Read: public. CUD: authenticated. Admin group: "Custom Content". (Phase 18) |
| **Custom Collection Entries** | `custom-collection-entries` | Content rows for custom collections. Read: public. CUD: authenticated. Admin group: "Custom Content". (Phase 18) |

**Plugin-added collections (auto-managed, do not hand-author):** `redirects`, `forms`, `form-submissions`, `search-results`

| Forms | `forms` | Contact/lead capture forms. ✅ Tenant-scoped (Phase 16). `site` relationship field (required, sidebar). Plugin-generated by form-builder. |
| Form Submissions | `form-submissions` | Submitted form data. ✅ Tenant-scoped (Phase 16). `site` auto-populated from parent form via `beforeChange` hook. `tenant` must be explicitly passed in the POST body (multi-tenant plugin requirement). CleanTalk spam check active. Public create access. |

> ⚠️ **`form-submissions` POST body must include `tenant`** — the multi-tenant plugin adds a required `tenant` field to `form-submissions`. The `site` field is auto-populated by the `beforeChange` hook from the parent form, but `tenant` is NOT — it must be explicitly included. See `submitPayloadFormAction()` in `app/lib/payload/submitPayloadForm.ts` for the pattern: fetch the parent form first, extract `formDoc.tenant`, include it in the POST body.

---

## 2a. Phase 18 — Custom Collections (Detail)

### Architecture

Two new collections, both Tenant → Site scoped following the same hierarchy as FAQs, Testimonials, etc.:

**`custom-collections`** — schema definitions
- `name` — text, required (e.g. "Team Members")
- `slug` — auto-generated from `name` via `slugField({ fieldToUse: 'name' })`. Global uniqueness (per-site uniqueness deferred).
- `fields` — flexible JSON array. Stores field blueprint objects. No strict shape enforced. Suggested shape per entry: `{ name, type, required, label }`.
- `site` — relationship → `sites` (required, sidebar)
- `tenant` — added by `multiTenantPlugin`

**`custom-collection-entries`** — content rows
- `parentCollection` — relationship → `custom-collections` (required, sidebar). **Named `parentCollection`, not `collection`** — `collection` is a reserved Mongoose schema pathname.
- `data` — flexible JSON object. Keys match field names from the parent schema. No enforced shape.
- `site` — relationship → `sites` (required, sidebar)
- `tenant` — added by `multiTenantPlugin`

### Field types — suggestions, not strict
The FieldBuilder UI presents these as quick-picks but does not enforce them. Custom types are allowed:
- `text` — plain text input
- `richtext` — rich text content
- `number` — numeric value
- `media` — **stores a Payload `media` document ID** (not a raw URL) — resolves via existing Supabase S3 setup. Admin UI: `useListDrawer` picker (browse existing media or upload new via `allowCreate: true`), with a resolved thumbnail preview and Replace/Remove affordances — no more manual document-ID entry. (Implemented this session)
- `url` — web address
- `toggle` — true/false boolean

### Custom components
| Component | File | Purpose |
|---|---|---|
| `FieldBuilder` | `src/components/FieldBuilder/index.tsx` | Replaces raw JSON editor on `custom-collections` `fields` field. Guided Add Field form with suggestions, field cards with edit/delete, field reordering. |
| `FieldBuilderDescription` | `src/components/FieldBuilder/FieldBuilderDescription/index.tsx` | Formatted helper text for the FieldBuilder |
| `EntryDataField` | `src/components/EntryDataField/index.tsx` | Replaces raw JSON editor on `custom-collection-entries` `data` field. Watches `parentCollection`, fetches schema from Payload, renders appropriate input per field type. |
| `EntryDataDescription` | `src/components/EntryDataField/EntryDataDescription/index.tsx` | Formatted helper text for EntryDataField |

### Critical implementation notes
- **Inline styles only** in all custom components — Tailwind utility classes conflict with Payload admin's CSS
- **Payload CSS variables** used for all theming — no hardcoded hex values. Key tokens:
  - `--theme-input-bg` / `--theme-elevation-800` / `--theme-elevation-150` — inputs
  - `--theme-elevation-0` — card surfaces
  - `--theme-elevation-400` — muted/dim text (Payload's most-used text color, 109 occurrences)
  - `--theme-error-500` / `--theme-error-50` — required markers, validation errors
  - `--theme-success-500` — active/confirm states
  - `--theme-elevation-200` / `--theme-elevation-800` — type badges
- **Mongoose warning** `'collection' is a reserved schema pathname` — resolved by renaming the relationship field to `parentCollection` in `CustomCollectionEntries.ts`
- **Input typing bug** — was caused by event handler intercepting focus/input events on a parent wrapper. Fixed. All input types (text, number, url, toggle, textarea, media) now accept keyboard input normally.

### apir-tayo integration — proven and documented, not wired into a live page (this session)
Fetch utilities exist and are validated against real data. Wiring them into an actual homepage section or new page is still a future-phase decision.

| File | Role |
|---|---|
| `app/lib/payload/fetchCustomCollection.ts` | `fetchCustomCollections(siteId)`, `fetchCustomCollectionEntries(siteId, collectionId)`, `fetchMediaUrl(mediaId)` — all follow the existing `fetchFromPayload<T>()` contract (same `BASE_URL`, null-on-failure never-throw, `PayloadListResponse<{ docs: T[] }>` shape, `next: { revalidate: 3600 }`) |
| `app/lib/payload/payload-types.ts` | `CustomCollectionField`, `CustomCollection`, `CustomCollectionEntry` interfaces added |
| `app/lib/payload/index.ts` | New functions and types re-exported from the barrel |
| `docs/custom-collection-integration-example.md` | Reference doc for the other team — data flow, trimmed rendering-switch code excerpt, `revalidate = 3600` rationale, and why `richtext` renders as plain text |

Validated via a temporary route (`app/(pages)/test-custom-collection/page.tsx`) that fetched a real custom collection + entry scoped to the apir-tayo site, rendered a generic table (per-field-type: text, richtext as escaped plain text, number, url as link, toggle, media via `fetchMediaUrl()`), and included a debug panel showing raw schema/entry/media-URL data. **Deleted after confirmation** — it was a live, unauthenticated route shipping raw data; not something to leave reachable once its job (proving the round trip) was done.

Remaining for a real integration (future phase):
1. Decide where Custom Collections content actually appears (new page vs. existing homepage section)
2. Wire the existing fetch utilities into that page/section
3. Move rendering beyond the generic-table pattern to real UI matching the site design

### Plugin registration
Both slugs registered in `multiTenantPlugin` in `src/plugins/index.ts`:
```ts
multiTenantPlugin<Config>({
  collections: {
    // ... existing ...
    "custom-collections": {},
    "custom-collection-entries": {},
  },
});
```

> ⚠️ `multiTenantPlugin` must remain last in the plugins array.

### Current status
- ✅ Backend complete — both collections working, Tenant → Site scoping confirmed
- ✅ FieldBuilder UI implemented and themed
- ✅ EntryDataField dynamic form implemented and themed
- ✅ Media field upload UX (`useListDrawer`, thumbnail preview, Replace/Remove) implemented and tested (this session)
- ✅ `pnpm build` clean, zero TypeScript errors (both payload-poc and apir-tayo)
- ✅ apir-tayo fetch utilities built and validated against real data (this session)
- ✅ Reference doc written for the other team (this session)
- ⏳ apir-tayo live-page wiring not yet done — utilities and doc are ready, actual page/section placement is a future-phase decision

---

## 3. Homepage Integration

### 3.1 `app/lib/payload/` (4 files, apir-tayo)
- `fetchPayload.ts` — `fetchFromPayload<T>()`, `fetchSiteSettings()`, `getCustomField()`
- `payload-types.ts` — TypeScript interfaces for all Payload collections
- `fetchPayloadForm.ts` — `fetchPayloadContactForm()`, `fetchPayloadFormFields()` — fetches and transforms Payload form fields to `DynamicFormField[]`
- `index.ts` — barrel exports

### 3.2 `app/page.tsx`
Async server component. Fetches all four content collections in parallel via `Promise.all`. Fetches SiteSettings and passes as props to all six section components.

### 3.3 Section components
- **Content sections** (FAQSection, TestimonialsSection, PortfolioSection, PricingSection) — accept dynamic content props, use `resolveImageUrl()` for media.
- **Heading sections** (HeroSection, WhyOnePageSection, HowItWorksSection, TrustSection, CTASection, Footer) — accept optional `settings` prop, render `settings?.field ?? "<hardcoded fallback>"`. Fallback is never blank.

### 3.4 Contact Page Integration
The `/contact` page (`app/(pages)/contact/page.tsx`) now fetches form fields from Payload at runtime via ISR:

```
ContactPage [page.tsx]  (export const revalidate = 3600)
  └─ fetchPayloadContactForm()  →  GET /api/forms?where[site][equals]={SITE_ID}&depth=1
       └─ returns { id, fields: DynamicFormField[] } | null
  └─ fallback: WP_GRAVITY_FORM_CONTACT_ID if Payload returns null
  └─ ContactFormSection (props: fields, formId)
       └─ ContactForm (props: fields, formId)
            └─ submitPayloadFormAction()  →  POST /api/form-submissions
                 └─ fetches parent form first to extract tenant ID
                 └─ includes { form, submissionData, tenant } in POST body
```

✅ Confirmed working in production. Submissions confirmed visible in Payload admin.

### 3.5 Remaining hardcoded items
| Item | Notes |
|---|---|
| CTA secondary button text | No SiteSettings field. Add `ctaSecondaryButtonText` if needed. |
| `customFields` in Site Settings | Stored in Payload, not yet wired to any component. Use `getCustomField(settings, key, fallback)`. |
| ISR 60s delay (homepage) | On-demand revalidation via webhook is a future item. |

### 3.6 SiteSettings — tabs field nesting (critical gotcha)
Payload serializes `tabs` field groups as nested objects in the REST API response.

```ts
// WRONG — returns undefined silently:
const headline = doc.heroHeadline;

// CORRECT:
const headline = doc.hero?.heroHeadline;
```

`fetchSiteSettings()` already handles this. Any new code reading site-settings must follow this pattern.

---

## 4. Environment Variables

**Convention:** all `*_URL` vars — base URLs with **no trailing slash**.

### apir-tayo — GitHub Secrets (build-time) + VPS `.env` (runtime) + `ecosystem.config.cjs` (PM2 runtime)

> ⚠️ **There is no `.env` in the git repo.** The `.env` file exists only on the VPS at `/home/projects/apirtayo/.env`. A `.env.backup` is kept alongside it. Both must be kept in sync manually when vars are added.

> ⚠️ **`ecosystem.config.cjs` must mirror all VPS-only runtime vars.** Next.js on PM2 does not auto-load `.env` at runtime. Any server-only env var that is NOT in GitHub Secrets must be explicitly added to the `env` block in `ecosystem.config.cjs`. Currently includes: `NODE_ENV`, `WP_SITE_URL`, `WP_GRAVITY_FORM_CONTACT_ID`, `WP_GRAVITY_API_KEY`, `WP_GRAVITY_API_SECRET`. After editing `ecosystem.config.cjs`, do `pm2 delete apirtayo && pm2 start ecosystem.config.cjs` — `pm2 reload --update-env` does NOT reliably pick up new vars.

| Variable | Scope | In GitHub Secrets? | In ecosystem.config.cjs? | Purpose |
|---|---|---|---|---|
| `PAYLOAD_API_URL` | Server-only | ✅ Yes | No (build-time only) | Payload REST API base URL |
| `PAYLOAD_SITE_ID` | Server-only | ✅ Yes | No (build-time only) | Payload site document ID: `6a352f382054dfd250819c26` |
| `NEXT_PUBLIC_PAYLOAD_API_URL` | Client-exposed | ✅ Yes | No | For `resolveImageUrl()` only |
| `NEXT_PUBLIC_GA_ID` | Client-exposed | ✅ Yes | No | GA4 measurement ID |
| `NEXT_PUBLIC_GTM_ID` | Client-exposed | ✅ Yes | No | GTM container ID |
| `NEXT_PUBLIC_META_PIXEL_ID` | Client-exposed | ✅ Yes | No | Meta Pixel ID |
| `SSH_PRIVATE_KEY` | CI/CD | ✅ Yes | No | VPS deploy key |
| `SSH_HOST` | CI/CD | ✅ Yes | No | VPS host |
| `SSH_USER` | CI/CD | ✅ Yes | No | VPS SSH user (`deploy`) |
| `SSH_PORT` | CI/CD | ✅ Yes | No | VPS SSH port |
| `DEPLOY_KEY` | CI/CD | ✅ Yes | No | GitHub deploy key |
| `GH_PAT` | CI/CD | ✅ Yes | No | GitHub personal access token |
| `WP_SITE_URL` | Server-only | VPS `.env` only | ✅ Yes | Gravity Forms REST API base URL |
| `WP_GRAVITY_FORM_CONTACT_ID` | Server-only | VPS `.env` only | ✅ Yes | Contact form ID (value: `1`) |
| `WP_GRAVITY_API_KEY` | Server-only | VPS `.env` only | ✅ Yes | Gravity Forms consumer key |
| `WP_GRAVITY_API_SECRET` | Server-only | VPS `.env` only | ✅ Yes | Gravity Forms consumer secret |
| `CLEANTALK_API_KEY` | Server-only | VPS `.env` only | No | ✅ Moved to payload-poc (Phase 16). `contactform.ts` still references it for the GF submission path — remove when fully cutting over. |
| `NODE_ENV` | Runtime | Auto | ✅ Yes | Controls `secure` cookie flag |

### deploy.yml — Step order (current)
1. **Checkout + Setup Node + Install + Build** — standard
2. **Fix .next ownership before rsync** — SSHes in as `deploy`, runs `sudo rm -rf /home/projects/apirtayo/.next`. Requires passwordless sudo rule in `/etc/sudoers`.
3. **Transfer build artifact to VPS** — rsync `.next/` as `deploy` user.
4. **Sync source & Reload PM2** — SSHes in, `sudo chown -R appuserwebsite:appuserwebsite /home/projects/apirtayo/.next`, git pull, npm ci, pm2 reload.

### payload-poc `.env.local` / Vercel
| Variable | Required? | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | MongoDB connection string |
| `PAYLOAD_SECRET` | Yes | JWT encryption and general secret |
| `NEXT_PUBLIC_SERVER_URL` | Yes (prod) | Must be set to `https://payload-poc-xi.vercel.app` in production. |
| `VERCEL_PROJECT_PRODUCTION_URL` | Auto | Vercel-injected fallback in `getServerSideURL()`. |
| `SUPABASE_BUCKET` | Yes | S3 bucket name |
| `SUPABASE_ACCESS_KEY_ID` | Yes | S3 credentials |
| `SUPABASE_SECRET_ACCESS_KEY` | Yes | S3 credentials |
| `SUPABASE_ENDPOINT` | Yes | S3 endpoint URL |
| `SUPABASE_REGION` | Yes | S3 region |
| `AGENT_EMAIL` | Yes | Service account for AI Agent |
| `AGENT_PASSWORD` | Yes | Service account password |
| `DEEPSEEK_API_KEY` | Yes | DeepSeek API key for agent intent parsing |
| `CRON_SECRET` | Optional | Auth for cron endpoints |
| `PREVIEW_SECRET` | Optional | Draft preview validation |
| `CLEANTALK_API_KEY` | Yes | Anti-spam key. Server-only. Added (Phase 16). |
| `SMTP2GO_HOST` | Yes | `mail.smtp2go.com` (Phase 17) |
| `SMTP2GO_PORT` | Yes | `2525` (Phase 17) |
| `SMTP2GO_FROM_EMAIL` | Yes | `no-reply@h6app.site` (Phase 17) |
| `SMTP2GO_USERNAME` | Yes | SMTP2GO user: `investph-smtp` (Phase 17) |
| `SMTP2GO_PASSWORD` | Yes | Reused from `email-app-backend/.env` (Phase 17) |

---

## 5. AI Agent Client Portal

*(Unchanged from v24 — see §5.1–5.8 of prior handoff for full detail)*

---

## 6. Medusa Commerce Integration — Research Complete

> **Status:** Research complete, direction confirmed by Sir Jeff. Medusa project is assigned. Work begins after Phase 18 UI polish is done and Medusa architecture has been explored.

**Confirmed architecture:** Medusa for commerce, Payload for content — fully independent systems, no sync, no virtual link. The storefront is the only shared touchpoint, querying both APIs separately.

```
┌──────────────────┐                    ┌──────────────────────────┐
│   Medusa          │                    │   Payload CMS             │
│   "Product CMS"  │     NO SYNC        │   "Website CMS"           │
│  Catalog, orders  │   (fully separate)  │  Pages, blog, editorial   │
│  Own DB + admin   │                    │  Existing High6 setup     │
└──────────────────┘                    └──────────────────────────┘
         │                                          │
         └──────────────────┬───────────────────────┘
                             ▼
              Next.js storefront (shared)
              Queries both APIs separately
```

**Why not the official Medusa+Payload integration tutorial:** The official tutorial (medusajs.com/blog/payload-integration) uses automatic syncing and a "virtual link" pattern — Sir Jeff explicitly declined this due to complexity. The confirmed direction is the simpler, no-sync route.

**Multi-tenant note:** Medusa supports multi-store natively (shared catalog, multiple storefronts) but NOT true multi-tenant isolation. Achieving true isolation requires either patching Medusa's core framework (PostgreSQL RLS, needs re-testing on every upgrade) or running a separate instance per tenant. Decision deferred until there's a real client requirement.

**Lightweight cross-referencing options (available later, not now):**
- Option A: Truly zero connection — `/shop` from Medusa, `/blog` from Payload, they never interact
- Option B: Manual reference — a Payload content piece stores a Medusa product ID in a plain text field; storefront fetches live product info when rendering
- Option C: Frontend-only soft linking — storefront layout decides where both appear together, no backend knowledge of each other

**Sequence:** Phase 18 UI polish → Medusa architecture exploration → Medusa project work.

---

## 7. Key Files Reference

### apir-tayo (`/Users/josh/work/apir-tayo`)
| File | Role |
|---|---|
| `middleware.ts` | Protects `/portal/chat` — redirects to `/portal/login` if `portal_token` absent |
| `app/(pages)/contact/page.tsx` | Contact page — fetches fields from Payload via `fetchPayloadContactForm()`, falls back to `WP_GRAVITY_FORM_CONTACT_ID`. `revalidate = 3600`. |
| `app/components/sections/contact/ContactFormSection.tsx` | Accepts `fields` and `formId` as props. |
| `app/components/sections/contact/ContactForm.tsx` | Renders dynamic fields, calls `submitPayloadFormAction()` on submit. |
| `app/lib/payload/fetchPayloadForm.ts` | `fetchPayloadContactForm()`, `fetchPayloadFormFields()` |
| `app/lib/payload/submitPayloadForm.ts` | `submitPayloadFormAction()` server action — fetches parent form for `tenant` ID, POSTs to `/api/form-submissions` |
| `app/lib/gravity-forms/contactform.ts` | GF fetch + submission logic. Kept as fallback. `validateCleanTalkToken` exported for reuse. |
| `app/lib/payload/fetchCustomCollection.ts` | `fetchCustomCollections()`, `fetchCustomCollectionEntries()`, `fetchMediaUrl()` — Custom Collections integration, validated against real data, not yet wired into a live page. (this session) |
| `docs/custom-collection-integration-example.md` | Reference doc for the other team on wiring Custom Collections into apir-tayo. (this session) |
| `ecosystem.config.cjs` | PM2 process config. Must include all VPS-only runtime env vars. |
| `.github/workflows/deploy.yml` | CD pipeline — rm .next → rsync → git pull + npm ci + pm2 reload. |

### payload-poc (`/Users/josh/work/payload-poc`)
| File | Role |
|---|---|
| `src/plugins/index.ts` | Plugin registrations. `multiTenantPlugin` must be last. Includes `custom-collections` and `custom-collection-entries`. |
| `src/collections/CustomCollections.ts` | Custom Collections schema-definition collection (Phase 18) |
| `src/collections/CustomCollectionEntries.ts` | Custom Collection Entries content-rows collection. Uses `parentCollection` field (not `collection` — reserved by Mongoose). (Phase 18) |
| `src/components/FieldBuilder/index.tsx` | Guided field builder UI for custom-collections. Inline styles + Payload CSS vars only. |
| `src/components/EntryDataField/index.tsx` | Dynamic entry data form. Watches `parentCollection`, fetches schema, renders inputs per type. `media` type uses `useListDrawer` picker + thumbnail preview (this session). |
| `src/collections/PortalClients.ts` | Auth-enabled collection |
| `src/collections/AgentAuditLog.ts` | Immutable audit log |
| `src/collections/SiteSettings.ts` | Tabs-grouped heading/copy fields per site |
| `graphify-out/GRAPH_REPORT.md` | Dependency graph audit report — load before any cross-cutting changes |
| `graphify-out/graph.json` | Raw graph data |

---

## 8. Remaining Work — Carry-Over Items

| Item | Priority | Notes |
|---|---|---|
| Phase 18 — Custom Collections | ✅ Complete | Backend, FieldBuilder UI, EntryDataField (incl. media upload UX), and apir-tayo fetch utilities all done and tested. |
| Medusa architecture exploration | 🔴 Next | Before starting assigned Medusa project work. |
| Medusa project | 🔴 Assigned | Starts after Phase 18 polish + Medusa exploration. |
| Two-site isolation test (Phase 15) | 🟡 Medium | Code complete, no second site seeded. |
| `apir-tayo` portal proxy missing `siteId` | 🟡 Medium | One-line fix identified, not yet applied. |
| Defensive error catch in apir-tayo agent proxy | 🟡 Medium | `app/api/portal/agent/route.ts` — non-2xx responses should return friendly fallback. |
| Remove `CLEANTALK_API_KEY` from apir-tayo VPS `.env` | 🟡 Medium | `contactform.ts` GF submission path still references it. Remove when GF submission is fully retired. |
| Phase 19 — Page Templates | 🟡 Medium | Template-key approach decided. Est. 3–5 days. |
| Phase 20 — Dashboard Refactor | 🟡 Medium | `PAYLOAD_SITE_ID` env var bug being fixed. Est. 3–4 days. |
| Phase 21 — Enhanced Agent Audit Log | 🟢 Low | Add `promptSent` + `rawModelOutput`. Est. 1 day. |
| Phase 22 — AI Agent Config Interface | 🟢 Low | Blocked by Phase 21. Est. 1–2 weeks. |
| apir-tayo integration for Custom Collections — live page wiring | 🟢 Low | Fetch utilities + reference doc are done and validated (this session). Remaining: decide placement (new page vs. existing section) and build real UI beyond the generic-table test pattern. |
| On-demand ISR revalidation | 🟡 Medium | `revalidateTag`/`revalidatePath` webhook. 60s/1h delays are confusing for clients. |
| Rotate exposed credentials | 🔴 High | `.env` was committed to `master` before repo went public. Not Josh's task. |
| MongoDB Atlas migration | 🟡 Medium | Migrate to new Atlas account. Keep same document IDs. |
| No `.env.example` in apir-tayo | 🟢 Low | Add alongside next env var change. |
| SPF/DKIM verification for payload-poc Vercel domain | 🟢 Low | May already be covered by `h6app.site` verified-domain status. |

---

## 9. Useful Commands

### payload-poc (`/Users/josh/work/payload-poc`)
```bash
pnpm dev              # Start Payload dev server (port 3000)
pnpm generate:types   # Regenerate TypeScript types from collections
pnpm generate:importmap # Regenerate import map
pnpm tsc --noEmit     # Type check
pnpm build            # Production build
```

### apir-tayo (`/Users/josh/work/apir-tayo`)
```bash
npm run dev           # Start Next.js dev server (port 3002)
npx tsc --noEmit      # Type check
npm run build         # Production build
```

### VPS maintenance
```bash
ssh deploy@72.60.195.99

sudo chown -R appuserwebsite:appuserwebsite /home/projects/apirtayo/.next
sudo su - appuserwebsite -s /bin/bash
cd /home/projects/apirtayo

pm2 list
pm2 env <id> | grep -E "WP_|NODE_ENV|PAYLOAD"

# After editing ecosystem.config.cjs — do NOT use pm2 reload --update-env:
pm2 delete apirtayo
pm2 start ecosystem.config.cjs

pm2 logs <id> --lines 50
rm -rf .next/cache/fetch-cache/*
```

---

## 10. Phase Summary

| Phase | What was built | Status |
|---|---|---|
| Phase 1 — Portal Auth | PortalClients collection, login page, session cookies | ✅ Complete |
| Phase 2 — Portal Chat UI | Middleware, chat page, ChatWindow, agent proxy | ✅ Complete |
| Phase 3 — Wire Agent to Tenant | Agent route accepts `{ message, tenantId }` | ✅ Complete |
| Phase 4 — Guardrails | Dry-run/confirm flow, AgentAuditLog collection | ✅ Complete |
| Phase 5 — Capability Expansion | 12 actions, image upload, capabilities panel | ✅ Complete |
| Phase 6 — Smart Record Resolution | List actions, numbered selection UX, `[resolved id]` convention | ✅ Complete |
| Refactor — Agent Modularity | route.ts split into 10 focused modules | ✅ Complete |
| Phase 7 — UAT + Smoke Test Fixes | Media upload fix, name-as-ID resolution, ID scrub from client messages | ✅ Complete |
| Phase 8 — Conversation Quality | Site-aware empty state/header, ChatWindow refactor, `awaiting_value` guard | ✅ Complete |
| Phase 9 — Create Records | `add_faq`, `add_testimonial`, `add_portfolio_item`, `add_pricing_plan` — `awaiting_fields` state machine | ✅ Complete |
| Phase 10 — Full-prompt Support | Parse all field values from a single message | ✅ Complete |
| Production Fixes | Production login CORS fix (server-side proxy), `getServerSideURL()` fallback fix | ✅ Complete |
| Phase 11 — Response Message Quality | Proposal format, list display, clarifying phrasing, cancellation message | 🔶 Partial — url extraction ⏸️ deprioritized. Agentic tasks benched. |
| Phase 12 — Sir Jeff Demo | First live portal demonstration. Production confirmed working. | ✅ Done |
| Phase 13 — Editable Homepage Headings | `site-settings` collection, 6 sections, fallback-safety, production-verified | ✅ Done |
| Phase 14 — Documentation | Content Editor Guide + Integration & Testing Guide (Word) for Website Team | ✅ Done |
| Phase 15 — `getTenantSiteId()` Multi-Site Fix | `getTenantSiteId()` + `fetchTenantRecords()` rewritten. Build passes, zero TS errors. | 🔶 Code complete — **two-site isolation test not yet run** |
| Production Promotion | `feat/payload-cms` → `staging` → `master`. Hostinger VPS deployment. | ✅ Done |
| Phase 16 — Forms Tenant Scoping + CleanTalk | `site` fields on `forms`/`form-submissions`, multi-tenant plugin registration, CleanTalk hook. | ✅ Complete |
| Phase 17 — SMTP2GO Email Integration | `nodemailerAdapter` with SMTP2GO (`investph-smtp` user). Forgot-password confirmed in production. | ✅ Complete |
| Contact Form Migration | Fields fetched from Payload, submissions wired to `form-submissions`. Gravity Forms as fallback. ✅ Submissions visible in Payload admin. | ✅ Complete |
| Infrastructure Fixes | `.next/` ownership fix (rm before rsync). WP vars added to PM2. `cache: 'no-store'` on GF fetch. | ✅ Complete |
| Phase 18 — Custom Collections | `custom-collections` + `custom-collection-entries` collections. FieldBuilder UI. EntryDataField dynamic form. Payload CSS variable theming. Bug fixes (markdown rendering, input events, Mongoose reserved field, inline style conflicts). Media field upload UX (`useListDrawer`). apir-tayo fetch utilities + reference doc, validated against real data. | ✅ Complete — feature-complete and tested; apir-tayo live-page wiring deferred to a future phase |

---

## 11. Payload CMS Configuration (Verified)

### Plugins (registered in `src/plugins/index.ts`, in order)
1. `@payloadcms/storage-s3` — Collection: `media`
2. `@payloadcms/plugin-redirects` — Collections: `pages`, `posts`
3. `@payloadcms/plugin-nested-docs` — Collections: `categories`
4. `@payloadcms/plugin-seo`
5. `@payloadcms/plugin-form-builder` — `formOverrides`: site field + lexical editor. `formSubmissionOverrides`: site auto-population hook + CleanTalk spam check hook.
6. `@payloadcms/plugin-search` — Collections: `posts`
7. `@payloadcms/plugin-multi-tenant` — Collections: `pages`, `posts`, `media`, `categories`, `forms`, `form-submissions`, `custom-collections`, `custom-collection-entries`. **Must be last.**

> ⚠️ Plugin ordering is critical. `multiTenantPlugin` must be registered last.

---

## 12. Production URLs

| Project | URL |
|---|---|
| Apir-tayo (frontend) | Hostinger VPS — PM2 process `apirtayo`, port 3002 |
| Apir-tayo files | `/home/projects/apirtayo/` on VPS |
| Payload CMS admin | https://payload-poc-xi.vercel.app/admin |
| Payload CMS REST API | https://payload-poc-xi.vercel.app/api |
| AI Agent portal login | `<apirtayo-domain>/portal/login` |

*Credentials provided separately via MD file.*

---

## 13. Known Architectural Gaps

| Gap | Impact | When to fix |
|---|---|---|
| `apir-tayo` portal proxy never forwards `siteId` to payload-poc | Single-site fallback is the only path exercised in production. One-line fix identified, not yet applied. | Phase 15 verification session |
| Two-site isolation unverified | Phase 15 code is written and builds clean, but no second site has been seeded. | Phase 15 verification session |
| `CLEANTALK_API_KEY` still in apir-tayo VPS `.env` | `contactform.ts` GF submission path still references it. Safe to leave until GF submission fully retired. | When retiring GF submission path |
| Exposed credentials not yet rotated | `.env` was committed to `master` before repo went public. | ASAP — not Josh's task |
| MongoDB Atlas migration pending | Migrate to new Atlas account. Keep same document IDs. | Before Atlas account handoff |
| No `.env.example` in apir-tayo | No documented list of required vars for new devs. | Low priority |
| SPF/DKIM not verified for payload-poc Vercel domain | May already be covered by `h6app.site` verified-domain status. | Low priority follow-up |
| Custom Collections apir-tayo integration | Fetch utilities built and validated against real data (this session); reference doc written. Not yet wired into a live page — no page/section has been decided. | Future phase |
| Custom Collections per-site slug uniqueness | `slug` is globally unique, not per-site. Compound index `{slug, site}` deferred. | When needed |
| Custom Collections cascade delete | Deleting a `custom-collection` leaves orphan entries. `beforeDelete` hook not yet added. | When needed |

---

## 14. Graphify Knowledge Graph

| File | Contents |
|---|---|
| `graphify-out/graph.html` | Interactive visualization — open in browser |
| `graphify-out/GRAPH_REPORT.md` | Full audit report with community breakdown |
| `graphify-out/graph.json` | Raw graph data for programmatic use |

### Stats (as of Phase 18c)
- **1,493 nodes**, **2,388 edges**, **112 communities**

### God nodes (touch with care)
| Node | Edges | Role |
|---|---|---|
| `cn()` | 57 | Tailwind class utility — bridges 8 communities |
| `getServerSideURL()` | 18 | URL resolution utility used across plugins, collections, and config |
| `authenticated()` | 17 | Core access control function |
| `compilerOptions` | 18 | TypeScript config |
| `POST()` | 15 | Route handler pattern used across all API routes |
| `useHeaderTheme()` | 15 | Header & Footer |

### How to use in agentic sessions
```
skill: "graphify"
Load graphify-out/GRAPH_REPORT.md and graphify-out/graph.json before making changes.
Pay special attention to god nodes — cn(), getServerSideURL(), and authenticated()
have wide blast radius.
```

---

## 15. Working Agreements

- **Step-by-step with confirmation** — one step at a time, wait for output before next step.
- **Understand the why** — explanations accompany recommendations.
- **Stakeholder messages** — short and direct, not comprehensive.
- **Agent plan responses** — when the AI Agent presents an implementation plan, Claude responds with a ready-to-send message for the Agent (not a direct answer). This keeps the Agent loop clean.
- **Test locally before pushing** — verify changes on local dev servers before deploying to production.
- **Graphify before touching cross-cutting files** — always load the graph report before modifying plugins, access control, hooks, or URL utilities.
- **Skills in every new Agent session** — always include `graphify`, `engram`, and `ui-ux-pro-max` in Claude Code prompts. Load the plan and skills first before implementation begins.
- **Inline styles only in custom Payload components** — no Tailwind, no CSS modules. Use Payload CSS variables (`var(--theme-*)`) for all theming.
- **`CLAUDE.md` is human-only** — not `AGENTS.md`. Agent sessions must not touch it.
- **Prefer native Payload UI over custom-built equivalents** — e.g. `useListDrawer`/`useDocumentDrawer` for pickers/uploaders instead of hand-rolled components, when the native primitive covers the need. Less custom code to maintain, and matches the UX admins already know.
- **Test routes/scaffolding get deleted after validation, not left live** — a working proof-of-concept route is not a production artifact. Once confirmed, capture the reusable pattern as code (utilities) and/or docs, then remove the live route — especially if it's unauthenticated or exposes raw data.
- **Update Graphify and Engram at the end of every implementation task** — not just when explicitly reminded.
