# Payload CMS Integration — Handoff Document

> **Branch:** `master` (production)
> **Date:** July 9, 2026
> **Version:** v27
> **Summary:** One workstream closed out this session, extending Phase 18 (Custom Collections). **Category support added** — a new `category` field type was added to Custom Collections, mirroring the `media` field's `useListDrawer` picker pattern from the previous session. Cardinality (single vs. multiple categories per entry) was investigated against existing precedent (`Posts`' `hasMany: true` relationship to `categories`, plus `plugin-nested-docs` hierarchy) and confirmed as **multiple categories per entry** (array of document IDs). Both `payload-poc` (admin UI) and `apir-tayo` (fetch utilities + types + reference doc) were updated. A key technical finding: `useListDrawer` has no native multi-select — the picker mirrors Payload's own core `hasMany` relationship field pattern (repeated single-select cycles, chip list with remove). Validated end-to-end, including the empty-array edge case, via a temporary test route (since deleted). **Current status: Phase 19 (Category Support) feature-complete and tested, not yet wired into a live apir-tayo page** (Custom Collections itself is still not wired into a live page either — that decision remains deferred). **Next session:** confirm phase-numbering with the team (see note below), then continue with previously-planned roadmap items.

> ⚠️ **Phase numbering note:** This work was tracked internally as "Phase 19 — Category Support for Custom Collections." The original roadmap (generated in the Phase 14 session, see §8) already had a **different** "Phase 19 — Page Templates" planned. These are two different pieces of work sharing the same number. Recommend renumbering with the team next session — e.g. treat this session's work as **Phase 18b** (an extension of Phase 18, same as the media field upload was), and keep the roadmap's Phase 19–22 numbering intact for Page Templates onward. Not renumbered in this doc yet, pending team confirmation.

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
        └── Custom Collection Entries (Phase 18 — content rows; now with category support)
  └── Site ("future-project-2")   ← code now supports this (Phase 15); not yet seeded or tested

PortalClients (separate auth collection)
  └── email + password (Payload-managed)
  └── tenant (relationship → Tenants)
```

### Cumulative achievements (Phases 1–18 + Category Support + Production Promotion + Contact Form Migration)
- 4 of 11 homepage sections consume dynamic content from Payload (FAQs, Testimonials, Portfolio Items, Pricing Plans)
- Multi-tenant architecture with site-scoped content
- Both repos deployed to Vercel — verified end-to-end in production
- AI Agent client portal fully implemented (Phases 1–11) — agentic tasks benched until further notice
- Editable homepage headings via `site-settings` collection (Phase 13)
- Content Editor Guide + Integration & Testing Guide delivered to Website Team (Phase 14)
- Roadmap document generated covering Phases 15–22 (Phase 14 session) — **see phase-numbering note above**
- `getTenantSiteId()` and `fetchTenantRecords()` rewritten for multi-site support — code complete, build passing, **isolation test not yet run** (Phase 15)
- `feat/payload-cms` promoted to production on Hostinger VPS — add/update/delete verified working in production
- `forms` and `form-submissions` tenant-scoped with `site` fields, multi-tenant plugin registration, and CleanTalk anti-spam hook (Phase 16)
- SMTP2GO email integration via `nodemailerAdapter` — forgot-password email confirmed working in production. **SMTP2GO user: `investph-smtp`** (Phase 17)
- Contact page `/contact` fully migrated to Payload — fields fetched from Payload `forms` collection, submissions POSTed to Payload `form-submissions` collection. Gravity Forms kept as fallback for field fetching only. ✅ Confirmed working in production. Submissions confirmed visible in Payload admin.
- **Phase 18 — Custom Collections backend complete** — `custom-collections` and `custom-collection-entries` collections, FieldBuilder UI, EntryDataField dynamic form, Payload CSS variable theming.
- **Phase 18 — Media field upload** — `EntryDataField`'s `media` field type replaced manual document-ID entry with Payload's native `useListDrawer` (browse existing + `allowCreate: true` upload), thumbnail preview via `usePayloadAPI`, Replace/Remove affordances.
- **apir-tayo Custom Collections integration — proven, documented, not yet wired in** — `fetchCustomCollection.ts` added to `app/lib/payload/`, following the existing `fetchFromPayload<T>()` contract exactly. Validated against real data via a temporary test route (deleted post-confirmation). Pattern captured in a reference doc for the other team.
- **Category Support for Custom Collections (this session)** — new `category` field type in `FieldBuilder`/`EntryDataField`, `CategoryPicker` component (`useListDrawer` browse-only + chip list, mirroring Payload's core `hasMany` relationship UX since `useListDrawer` has no native multi-select), storing an array of category document IDs per entry. `fetchCategoryNames()` added to apir-tayo, resolving IDs to names in parallel. Validated end-to-end including empty-array edge case via a temporary test route (deleted post-confirmation).
- Graphify knowledge graph: updated this session to reflect the new `category` field type, `CategoryPicker` component, and `fetchCategoryNames()` utility

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
| `useListDrawer` (not a custom uploader) for media fields | Reuses Payload's native relationship-picker UX, comes with auth, tenant scoping, file validation, media processing already handled |
| Custom Collections apir-tayo integration: test route deleted, utilities + doc kept | The test page proved the round trip but was a live, unauthenticated route with a raw-data debug panel — not safe to leave in production. Fetch utilities and a written reference doc are the reusable, safe artifacts for the other team |
| `richtext` fields render as plain text (escaped), not HTML | `EntryDataField`'s `richtext` type isn't backed by a real lexical editor — it's a generic input per FieldBuilder's "suggestions, not strict" design |
| **Category cardinality: multiple (array of IDs)** | Matches established `hasMany: true` precedent from `Posts` and the Archive block. Categories are hierarchical via `plugin-nested-docs`; a tree taxonomy naturally supports multi-select (e.g. "Products > Widgets" AND "Industries > Healthcare"). Picking single would have been inconsistent with the rest of the codebase. |
| **Category field: browse-only, no `allowCreate`** | Unlike the `media` field, categories are curated/managed centrally, not created ad hoc while filling out an entry. |
| **`useListDrawer` for multi-select via repeated single-select cycles** | `useListDrawer` has no native multi-select mode. Implementation mirrors how Payload's own core `Relationship` field renders `hasMany`: open drawer → pick one doc → append to array → close, repeat. Chip list with remove buttons represents the running selection. |

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
| Posts | `posts` | Blog posts with slugs. `categories` field: `relationship`, `hasMany: true` → `categories`. Read: authenticatedOrPublished. |
| Pages | `pages` | Named pages with slugs. Read: authenticatedOrPublished. |
| Media | `media` | Uploaded images, stored in Supabase S3. Read: public. |
| Categories | `categories` | Post categorization. Hierarchical via `plugin-nested-docs` (parent/child + breadcrumbs, no explicit fields — managed by the plugin). Read: public. **Now also referenced by Custom Collection Entries via the `category` field type (this session).** |
| Portal Clients | `portal-clients` | Auth-enabled collection for client portal users. All ops: authenticated. |
| Agent Audit Log | `agent-audit-log` | Immutable log of every confirmed agent mutation. Create/read: authenticated. Update/delete: hardcoded false. |
| Users | `users` | Payload admin accounts. All ops: authenticated. |
| **Custom Collections** | `custom-collections` | Schema definitions for site-specific custom content sections. Read: public. CUD: authenticated. Admin group: "Custom Content". (Phase 18) |
| **Custom Collection Entries** | `custom-collection-entries` | Content rows for custom collections. Now supports a `category` field type storing an array of `categories` document IDs. Read: public. CUD: authenticated. Admin group: "Custom Content". (Phase 18, category support this session) |

**Plugin-added collections (auto-managed, do not hand-author):** `redirects`, `forms`, `form-submissions`, `search-results`

| Forms | `forms` | Contact/lead capture forms. ✅ Tenant-scoped (Phase 16). `site` relationship field (required, sidebar). Plugin-generated by form-builder. |
| Form Submissions | `form-submissions` | Submitted form data. ✅ Tenant-scoped (Phase 16). `site` auto-populated from parent form via `beforeChange` hook. `tenant` must be explicitly passed in the POST body (multi-tenant plugin requirement). CleanTalk spam check active. Public create access. |

> ⚠️ **`form-submissions` POST body must include `tenant`** — the multi-tenant plugin adds a required `tenant` field to `form-submissions`. The `site` field is auto-populated by the `beforeChange` hook from the parent form, but `tenant` is NOT — it must be explicitly included. See `submitPayloadFormAction()` in `app/lib/payload/submitPayloadForm.ts` for the pattern.

---

## 2a. Phase 18 — Custom Collections (Detail)

### Architecture

Two collections, both Tenant → Site scoped following the same hierarchy as FAQs, Testimonials, etc.:

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
- `media` — stores a Payload `media` document ID (not a raw URL) — resolves via existing Supabase S3 setup. Admin UI: `useListDrawer` picker (browse existing media or upload new via `allowCreate: true`), with a resolved thumbnail preview and Replace/Remove affordances.
- `url` — web address
- `toggle` — true/false boolean
- **`category`** — stores an **array** of Payload `categories` document IDs. Admin UI: `CategoryPicker` — `useListDrawer` (browse-only, no `allowCreate`) + chip list with remove buttons, parallel name resolution via `/api/categories/{id}`. **(Added this session)**

### Custom components
| Component | File | Purpose |
|---|---|---|
| `FieldBuilder` | `src/components/FieldBuilder/index.tsx` | Replaces raw JSON editor on `custom-collections` `fields` field. Guided Add Field form with suggestions (now including `category`), field cards with edit/delete, field reordering. |
| `FieldBuilderDescription` | `src/components/FieldBuilder/FieldBuilderDescription/index.tsx` | Formatted helper text for the FieldBuilder. Includes `category` in `FIELD_TYPES` + example JSON + callout. |
| `EntryDataField` | `src/components/EntryDataField/index.tsx` | Replaces raw JSON editor on `custom-collection-entries` `data` field. Watches `parentCollection`, fetches schema from Payload, renders appropriate input per field type. Includes `CategoryPicker` component and the `'category'` case in `getInputComponent()`. |
| `EntryDataDescription` | `src/components/EntryDataField/EntryDataDescription/index.tsx` | Formatted helper text for EntryDataField. Includes `category` in `TYPE_MAPPINGS` + example JSON + callout. |

### Critical implementation notes
- **Inline styles only** in all custom components — Tailwind utility classes conflict with Payload admin's CSS
- **Payload CSS variables** used for all theming — no hardcoded hex values. Key tokens:
  - `--theme-input-bg` / `--theme-elevation-800` / `--theme-elevation-150` — inputs
  - `--theme-elevation-0` — card surfaces
  - `--theme-elevation-400` — muted/dim text
  - `--theme-error-500` / `--theme-error-50` — required markers, validation errors
  - `--theme-success-500` — active/confirm states
  - `--theme-elevation-200` / `--theme-elevation-800` — type badges
- **Mongoose warning** `'collection' is a reserved schema pathname` — resolved by renaming the relationship field to `parentCollection` in `CustomCollectionEntries.ts`
- **Input typing bug** (resolved, prior session) — event handler was intercepting focus/input events on a parent wrapper.
- **`useListDrawer` has no native multi-select** (this session's finding) — `CategoryPicker` implements multi-select via repeated single-select cycles (open drawer → pick one → append to array → close), mirroring how Payload's own core `Relationship` field renders `hasMany`. Worth reusing this pattern for any future multi-select field type rather than re-investigating.
- **`CategoryPicker` UX polish:** 20×20px remove buttons on chips, focus-visible ring, `aria-label` on interactive elements, subtle transitions. Built with the `ui-ux-pro-max` skill.

### apir-tayo integration — proven and documented, not wired into a live page

| File | Role |
|---|---|
| `app/lib/payload/fetchCustomCollection.ts` | `fetchCustomCollections(siteId)`, `fetchCustomCollectionEntries(siteId, collectionId)`, `fetchMediaUrl(mediaId)`, **`fetchCategoryNames(categoryIds)`** (this session) — all follow the existing `fetchFromPayload<T>()` contract (same `BASE_URL`, null-on-failure never-throw, `next: { revalidate: 3600 }`). `fetchCategoryNames` resolves an array of IDs in parallel to `Record<id, title>`; handles an empty array without throwing. |
| `app/lib/payload/payload-types.ts` | `CustomCollectionField`, `CustomCollection`, `CustomCollectionEntry` interfaces. `"category"` added to the `CustomCollectionField.type` union (this session). |
| `app/lib/payload/index.ts` | New functions and types re-exported from the barrel, including `fetchCategoryNames` (this session). |
| `docs/custom-collection-integration-example.md` | Reference doc for the other team — data flow, rendering-switch code excerpt (now including the `"category"` case), `revalidate = 3600` rationale, why `richtext` renders as plain text, and the category resolution pattern (this session). |

**Validation (this session):** A temporary route (`app/(pages)/test-custom-collection/page.tsx`) was rebuilt to fetch a real custom collection + entry with populated `category` data, resolve names via `fetchCategoryNames()`, and render them as chips in the generic per-field-type table alongside text, richtext, number, url, toggle, and media. A debug panel showed raw schema/entry/resolved-names data. Confirmed:
- Schema fetch (4 fields incl. `category: category`) ✅
- Entry data (`"category": ["6a4f5eba..."]`) ✅
- `fetchCategoryNames()` ID → name resolution ✅
- Chip rendering with resolved names ✅
- `fetchCategoryNames([])` → `{}`, no throw (empty-array edge case) ✅
- Media + category co-resolution on the same page ✅

**Deleted after confirmation** — same rule as always: proof-of-concept routes are not production artifacts, especially unauthenticated ones exposing raw data.

Remaining for a real integration (future phase, unchanged):
1. Decide where Custom Collections content actually appears (new page vs. existing homepage section)
2. Wire the existing fetch utilities into that page/section
3. Move rendering beyond the generic-table pattern to real UI matching the site design

### Plugin registration
Unchanged — both slugs registered in `multiTenantPlugin` in `src/plugins/index.ts`, which must remain last in the plugins array.

### Current status
- ✅ Backend complete — both collections working, Tenant → Site scoping confirmed
- ✅ FieldBuilder UI implemented and themed, including `category` field type
- ✅ EntryDataField dynamic form implemented and themed, including `CategoryPicker`
- ✅ Media field upload UX implemented and tested
- ✅ **Category field type implemented and tested (this session)** — multi-select via `useListDrawer` + chip list, browse-only
- ✅ `tsc --noEmit` clean on both payload-poc and apir-tayo
- ✅ apir-tayo fetch utilities built and validated against real data, including `fetchCategoryNames()`
- ✅ Reference doc updated for the other team
- ⏳ apir-tayo live-page wiring not yet done — utilities and doc are ready, actual page/section placement is a future-phase decision

---

## 3. Homepage Integration

*(Unchanged from v26 — see §3.1–3.6 of prior handoff for full detail: `app/lib/payload/`, `app/page.tsx`, section components, Contact Page integration, remaining hardcoded items, SiteSettings tabs-field-nesting gotcha.)*

---

## 4. Environment Variables

*(Unchanged from v26 — no new env vars introduced this session. See §4 of prior handoff for the full apir-tayo GitHub Secrets / VPS `.env` / `ecosystem.config.cjs` table and payload-poc `.env.local` / Vercel table.)*

---

## 5. AI Agent Client Portal

*(Unchanged from v24 — see §5.1–5.8 of v24 handoff for full detail.)*

---

## 6. Medusa Commerce Integration — Research Complete

*(Unchanged from v26 — see §6 of prior handoff. Status: research complete, direction confirmed by Sir Jeff. Sequence: Phase 18 UI polish → Medusa architecture exploration → Medusa project work. Category Support counts toward "Phase 18 UI polish.")*

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
| `app/lib/payload/fetchCustomCollection.ts` | `fetchCustomCollections()`, `fetchCustomCollectionEntries()`, `fetchMediaUrl()`, **`fetchCategoryNames()` (this session)** — Custom Collections integration, validated against real data, not yet wired into a live page. |
| `docs/custom-collection-integration-example.md` | Reference doc for the other team on wiring Custom Collections into apir-tayo, including category resolution (this session). |
| `ecosystem.config.cjs` | PM2 process config. Must include all VPS-only runtime env vars. |
| `.github/workflows/deploy.yml` | CD pipeline — rm .next → rsync → git pull + npm ci + pm2 reload. |

### payload-poc (`/Users/josh/work/payload-poc`)
| File | Role |
|---|---|
| `src/plugins/index.ts` | Plugin registrations. `multiTenantPlugin` must be last. Includes `custom-collections` and `custom-collection-entries`. |
| `src/collections/CustomCollections.ts` | Custom Collections schema-definition collection (Phase 18) |
| `src/collections/CustomCollectionEntries.ts` | Custom Collection Entries content-rows collection. Uses `parentCollection` field (not `collection` — reserved by Mongoose). |
| `src/components/FieldBuilder/index.tsx` | Guided field builder UI for custom-collections. Inline styles + Payload CSS vars only. Includes `category` in `SUGGESTED_TYPES`. |
| `src/components/EntryDataField/index.tsx` | Dynamic entry data form. Watches `parentCollection`, fetches schema, renders inputs per type. `media` type uses `useListDrawer` + thumbnail preview. **`category` type uses `CategoryPicker` — `useListDrawer` (browse-only) + chip list with remove buttons + parallel name resolution (this session).** |
| `src/collections/PortalClients.ts` | Auth-enabled collection |
| `src/collections/AgentAuditLog.ts` | Immutable audit log |
| `src/collections/SiteSettings.ts` | Tabs-grouped heading/copy fields per site |
| `graphify-out/GRAPH_REPORT.md` | Dependency graph audit report — load before any cross-cutting changes |
| `graphify-out/graph.json` | Raw graph data — 1,504 nodes, 2,401 edges, 115 communities (updated this session) |

---

## 8. Remaining Work — Carry-Over Items

| Item | Priority | Notes |
|---|---|---|
| Phase 18 — Custom Collections | ✅ Complete | Backend, FieldBuilder UI, EntryDataField (media + category), and apir-tayo fetch utilities all done and tested. |
| **Category Support for Custom Collections** | ✅ Complete (this session) | See §2a. Phase-numbering conflict with roadmap — see note at top of doc. |
| Medusa architecture exploration | 🔴 Next | Before starting assigned Medusa project work. |
| Medusa project | 🔴 Assigned | Starts after Phase 18 polish + Medusa exploration. |
| Two-site isolation test (Phase 15) | 🟡 Medium | Code complete, no second site seeded. |
| `apir-tayo` portal proxy missing `siteId` | 🟡 Medium | One-line fix identified, not yet applied. |
| Defensive error catch in apir-tayo agent proxy | 🟡 Medium | `app/api/portal/agent/route.ts` — non-2xx responses should return friendly fallback. |
| Remove `CLEANTALK_API_KEY` from apir-tayo VPS `.env` | 🟡 Medium | `contactform.ts` GF submission path still references it. Remove when GF submission is fully retired. |
| Roadmap Phase 19 — Page Templates | 🟡 Medium | Template-key approach decided. Est. 3–5 days. **Needs renumbering discussion — see note at top of doc.** |
| Roadmap Phase 20 — Dashboard Refactor | 🟡 Medium | `PAYLOAD_SITE_ID` env var bug being fixed. Est. 3–4 days. |
| Roadmap Phase 21 — Enhanced Agent Audit Log | 🟢 Low | Add `promptSent` + `rawModelOutput`. Est. 1 day. |
| Roadmap Phase 22 — AI Agent Config Interface | 🟢 Low | Blocked by Phase 21. Est. 1–2 weeks. |
| apir-tayo integration for Custom Collections — live page wiring | 🟢 Low | Fetch utilities + reference doc are done and validated, including category resolution. Remaining: decide placement (new page vs. existing section) and build real UI beyond the generic-table test pattern. |
| Custom Collections per-site slug uniqueness | 🟢 Low | `slug` is globally unique, not per-site. Compound index `{slug, site}` deferred. |
| Custom Collections cascade delete | 🟢 Low | Deleting a `custom-collection` leaves orphan entries. `beforeDelete` hook not yet added. |
| On-demand ISR revalidation | 🟡 Medium | `revalidateTag`/`revalidatePath` webhook. 60s/1h delays are confusing for clients. |
| Rotate exposed credentials | 🔴 High | `.env` was committed to `master` before repo went public. Not Josh's task. |
| MongoDB Atlas migration | 🟡 Medium | Migrate to new Atlas account. Keep same document IDs. |
| No `.env.example` in apir-tayo | 🟢 Low | Add alongside next env var change. |
| SPF/DKIM verification for payload-poc Vercel domain | 🟢 Low | May already be covered by `h6app.site` verified-domain status. |

---

## 9. Useful Commands

*(Unchanged from v26 — see §9 of prior handoff for payload-poc / apir-tayo dev commands and VPS maintenance commands.)*

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
| Phase 18 — Custom Collections | `custom-collections` + `custom-collection-entries` collections. FieldBuilder UI. EntryDataField dynamic form. Payload CSS variable theming. Bug fixes. Media field upload UX (`useListDrawer`). apir-tayo fetch utilities + reference doc, validated against real data. | ✅ Complete |
| **Category Support for Custom Collections** (this session) | `category` field type — `CategoryPicker` (`useListDrawer` browse-only + chip list, multi-select via repeated single-select cycles), FieldBuilder/EntryDataField updates, `fetchCategoryNames()` in apir-tayo, reference doc updated. Validated incl. empty-array edge case. | ✅ Complete — apir-tayo live-page wiring still deferred |

---

## 11. Payload CMS Configuration (Verified)

*(Unchanged from v26 — see §11 of prior handoff for plugin registration order.)*

---

## 12. Production URLs

*(Unchanged from v26 — see §12 of prior handoff.)*

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
| Custom Collections apir-tayo integration | Fetch utilities (incl. category resolution) built and validated against real data; reference doc written. Not yet wired into a live page — no page/section has been decided. | Future phase |
| Custom Collections per-site slug uniqueness | `slug` is globally unique, not per-site. Compound index `{slug, site}` deferred. | When needed |
| Custom Collections cascade delete | Deleting a `custom-collection` leaves orphan entries. `beforeDelete` hook not yet added. | When needed |
| **Phase-numbering conflict** | This session's "Category Support" work was tracked as Phase 19, colliding with the roadmap's existing "Phase 19 — Page Templates." Needs a team decision on renumbering (see top-of-doc note). | Next session, before further phase work is scoped |
| **`useListDrawer` has no native multi-select** | Not a bug, but not documented anywhere until now — any future field type needing multi-select should reuse the `CategoryPicker` pattern (repeated single-select + chip list) rather than re-discovering this. | N/A — informational, captured in Engram |

---

## 14. Graphify Knowledge Graph

| File | Contents |
|---|---|
| `graphify-out/graph.html` | Interactive visualization — open in browser |
| `graphify-out/GRAPH_REPORT.md` | Full audit report with community breakdown |
| `graphify-out/graph.json` | Raw graph data for programmatic use |

### Stats (as of this session)
- **1,504 nodes**, **2,401 edges**, **115 communities** (up from 1,493 / 2,388 / 112 in v26)

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
- **Prefer native Payload UI over custom-built equivalents** — e.g. `useListDrawer`/`useDocumentDrawer` for pickers/uploaders instead of hand-rolled components, when the native primitive covers the need. Less custom code to maintain, and matches the UX admins already know. **When the native primitive doesn't fully cover the need (e.g. no multi-select), mirror Payload's own core field patterns rather than inventing something new.**
- **Test routes/scaffolding get deleted after validation, not left live** — a working proof-of-concept route is not a production artifact. Once confirmed, capture the reusable pattern as code (utilities) and/or docs, then remove the live route — especially if it's unauthenticated or exposes raw data.
- **Update Graphify and Engram at the end of every implementation task** — not just when explicitly reminded.
- **Investigate before assuming on ambiguous scope (new this session)** — when a requirement is underspecified (e.g. field cardinality), check existing precedent in the codebase first and present findings before implementing, rather than guessing or asking the human to decide from scratch.
