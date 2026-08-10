# Payload CMS Integration — Handoff Document

> **Branch:** `master` (production)
> **Date:** June 30, 2026
> **Version:** v22
> **Summary:** Phase 15 siteId one-liner applied and verified (apir-tayo portal proxy now forwards `siteId` to payload-poc, deploy to separate prod URL still a manual step). Phase 17 (SMTP2GO) still **blocked** — SMTP host/port/from-address confirmed, but SMTP user username/password still pending teammate response (see Phase 17 section for full context on what was resolved this session vs. still blocked). Phase 20 (Dashboard Refactor) started ahead of schedule due to Phase 17 blockage — scope simplified to 3 instance-wide stat cards + Quick Actions, Recent Activity removed from UI, a `PAYLOAD_SITE_ID` env var bug fixed (was incorrectly referenced inside payload-poc). **Next session:** follow up on SMTP2GO SMTP user credentials; continue Phase 20 dashboard work if still blocked.

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
        └── Site Settings (one record per site)
  └── Site ("future-project-2")   ← code now supports this (Phase 15); not yet seeded or tested

PortalClients (separate auth collection)
  └── email + password (Payload-managed)
  └── tenant (relationship → Tenants)
```

### Cumulative achievements (Phases 1–16 + Production Promotion)
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
- Graphify knowledge graph built: 948 nodes, 1797 edges, 73 communities — graph artifacts at `graphify-out/` in payload-poc

### Key design decisions
| Decision | Rationale |
|---|---|
| REST API (not GraphQL) | Simpler, no client dependency needed |
| Server-side fetch (not client) | SEO, performance, ISR caching |
| `next: { revalidate: 60 }` | 60-second stale-while-revalidate |
| `null` on failure (not throw) | Page must render even when Payload is down |
| Payload in separate repo | Independent deploy cycles, shared across projects |
| PortalClients separate from Users | Clients can never get Payload admin access |
| Confirmation before PATCH/POST | All agent mutations require explicit client confirmation |
| Persistent audit log | AgentAuditLog collection records every confirmed change |
| Sequential field collection | One field per turn for creates — consistent, debuggable |
| SiteSettings as collection (not Global) | Payload Globals cannot be scoped per tenant/site |
| `.env` never committed to git | Env vars live in GitHub Secrets (build-time) and VPS `.env` file (runtime) only |

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

**Plugin-added collections (auto-managed, do not hand-author):** `redirects`, `forms`, `form-submissions`, `search-results`

| Forms | `forms` | Contact/lead capture forms. ✅ Tenant-scoped (Phase 16). `site` relationship field (required, sidebar). Plugin-generated by form-builder. |
| Form Submissions | `form-submissions` | Submitted form data. ✅ Tenant-scoped (Phase 16). `site` auto-populated from parent form via `beforeChange` hook. CleanTalk spam check active. Public create access. |

> ℹ️ `forms` and `form-submissions` are plugin-generated by `@payloadcms/plugin-form-builder`. Their `site` fields, hook ordering, and multi-tenant registration are injected via `formOverrides` / `formSubmissionOverrides` in `src/plugins/index.ts`. Do not hand-author separate collection files for these.

---

## 3. Homepage Integration

### 3.1 `app/lib/payload/` (3 files, apir-tayo)
- `fetchPayload.ts` — `fetchFromPayload<T>()`, `fetchSiteSettings()`, `getCustomField()`
- `payload-types.ts` — TypeScript interfaces for all Payload collections
- `index.ts` — barrel exports

### 3.2 `app/page.tsx`
Async server component. Fetches all four content collections in parallel via `Promise.all`. Fetches SiteSettings and passes as props to all six section components.

### 3.3 Section components
- **Content sections** (FAQSection, TestimonialsSection, PortfolioSection, PricingSection) — accept dynamic content props, use `resolveImageUrl()` for media.
- **Heading sections** (HeroSection, WhyOnePageSection, HowItWorksSection, TrustSection, CTASection, Footer) — accept optional `settings` prop, render `settings?.field ?? "<hardcoded fallback>"`. Fallback is never blank.

### 3.4 Remaining hardcoded items
| Item | Notes |
|---|---|
| CTA secondary button text | No SiteSettings field. Add `ctaSecondaryButtonText` if needed. |
| `customFields` in Site Settings | Stored in Payload, not yet wired to any component. Use `getCustomField(settings, key, fallback)`. |
| ISR 60s delay | On-demand revalidation via webhook is a future item. |

### 3.5 SiteSettings — tabs field nesting (critical gotcha)
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

### apir-tayo — GitHub Secrets (build-time) + VPS `.env` (runtime)

> ⚠️ **There is no `.env` in the git repo.** The `.env` file exists only on the VPS at `/home/projects/apirtayo/.env`. A `.env.backup` is kept alongside it. Both must be kept in sync manually when vars are added.

| Variable | Scope | In GitHub Secrets? | Purpose |
|---|---|---|---|
| `PAYLOAD_API_URL` | Server-only | ✅ Yes | Payload REST API base URL. Used by all server-side fetches and proxy routes. |
| `PAYLOAD_SITE_ID` | Server-only | ✅ Yes | Payload document ID of the site record — used in `where[site][equals]=`. Must be the document ID, not the slug. Value: `6a352f382054dfd250819c26` |
| `NEXT_PUBLIC_PAYLOAD_API_URL` | Client-exposed | ✅ Yes | Narrow scope only: `TestimonialsSection.tsx` and `PortfolioSection.tsx` use it for `resolveImageUrl()`. Do not use for any new Payload API calls. |
| `NEXT_PUBLIC_GA_ID` | Client-exposed | ✅ Yes | GA4 measurement ID |
| `NEXT_PUBLIC_GTM_ID` | Client-exposed | ✅ Yes | GTM container ID |
| `NEXT_PUBLIC_META_PIXEL_ID` | Client-exposed | ✅ Yes | Meta Pixel ID |
| `SSH_PRIVATE_KEY` | CI/CD | ✅ Yes | VPS deploy key |
| `SSH_HOST` | CI/CD | ✅ Yes | VPS host |
| `SSH_USER` | CI/CD | ✅ Yes | VPS SSH user (`appuserwebsite`) |
| `SSH_PORT` | CI/CD | ✅ Yes | VPS SSH port |
| `DEPLOY_KEY` | CI/CD | ✅ Yes | GitHub deploy key |
| `GH_PAT` | CI/CD | ✅ Yes | GitHub personal access token |
| `WP_SITE_URL` | Server-only | VPS `.env` only | Gravity Forms REST API |
| `WP_GRAVITY_FORM_CONTACT_ID` | Server-only | VPS `.env` only | Contact form ID |
| `WP_GRAVITY_API_KEY` | Server-only | VPS `.env` only | Gravity Forms consumer key |
| `WP_GRAVITY_API_SECRET` | Server-only | VPS `.env` only | Gravity Forms consumer secret |
| `CLEANTALK_API_KEY` | Server-only | VPS `.env` only | ✅ Moved to payload-poc (Phase 16). Remove from VPS `.env` when apir-tayo migrates off Gravity Forms. `app/lib/gravity-forms/contactform.ts` still references this key — out of scope until migration. |
| `WORDPRESS_URL` | Server-only | VPS `.env` only | Present in `.env` — usage not fully verified |
| `NODE_ENV` | Runtime | Auto | Controls `secure` cookie flag in login proxy |

> ✅ `CLEANTALK_API_KEY` has been moved to payload-poc (`.env` + Vercel). It must never be `NEXT_PUBLIC_`. Remove from apir-tayo VPS `.env` when migrating off Gravity Forms.

### deploy.yml — Build step env vars
The `deploy.yml` injects these at build time (in the `env:` block of the Build step):
```yaml
NEXT_PUBLIC_GA_ID: ${{ secrets.NEXT_PUBLIC_GA_ID }}
NEXT_PUBLIC_GTM_ID: ${{ secrets.NEXT_PUBLIC_GTM_ID }}
NEXT_PUBLIC_META_PIXEL_ID: ${{ secrets.NEXT_PUBLIC_META_PIXEL_ID }}
PAYLOAD_API_URL: ${{ secrets.PAYLOAD_API_URL }}
NEXT_PUBLIC_PAYLOAD_API_URL: ${{ secrets.NEXT_PUBLIC_PAYLOAD_API_URL }}
PAYLOAD_SITE_ID: ${{ secrets.PAYLOAD_SITE_ID }}
```

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
| `AGENT_EMAIL` | Yes | Service account for AI Agent to authenticate with Payload |
| `AGENT_PASSWORD` | Yes | Service account password |
| `DEEPSEEK_API_KEY` | Yes | DeepSeek API key for agent intent parsing |
| `CRON_SECRET` | Optional | Auth for cron endpoints |
| `PREVIEW_SECRET` | Optional | Draft preview validation |
| `CLEANTALK_API_KEY` | Yes | Anti-spam key for CleanTalk. ✅ Added (Phase 16). Server-only. Added to `.env`, `.env.example`, and Vercel (Production + Preview). |
| `SMTP2GO_HOST` | Confirmed value, not yet added | `mail.smtp2go.com` |
| `SMTP2GO_PORT` | Confirmed value, not yet added | `2525` (alts: 8025, 587, 80, 25) |
| `SMTP2GO_FROM_EMAIL` | Confirmed value, not yet added | `no-reply@h6app.site` |
| `SMTP2GO_USERNAME` | ⛔ Blocked | Pending — reuse `wecare-smtp` or request new dedicated SMTP user, awaiting teammate response |
| `SMTP2GO_PASSWORD` | ⛔ Blocked | Pending — tied to whichever username above |

### `getServerSideURL()` fallback chain (payload-poc)
Priority: `NEXT_PUBLIC_SERVER_URL` → `https://{VERCEL_PROJECT_PRODUCTION_URL}` → `http://localhost:3000`

---

## 5. AI Agent Client Portal

### 5.1 Portal architecture

```
Client browser
  └── /portal/login (apir-tayo)
        ↓ POST /api/portal/login (apir-tayo proxy)
              ↓ POST /api/portal-clients/login (payload-poc)
              ↓ JWT + tenantId stored as httpOnly cookies
  └── /portal/chat (apir-tayo, protected by middleware)
        ↓ POST /api/portal/agent (apir-tayo proxy)
              ↓ reads portal_token + portal_tenant_id cookies
              ↓ POST /api/agent (payload-poc)
                    ↓ DeepSeek parses intent
                    ↓ dry-run: returns proposal
                    ↓ confirmed: PATCH/POST + audit log
```

### 5.2 Session cookies
| Cookie | Value | Set by |
|---|---|---|
| `portal_token` | Payload JWT | `POST /api/portal/login` in apir-tayo |
| `portal_tenant_id` | Tenant ID (resolved from `PortalClient.tenant`) | same |

Cookie options: `{ httpOnly: true, path: "/", sameSite: "lax", secure: process.env.NODE_ENV === "production" }`.

`user.tenant` can be a populated object `{ id }` or a bare string — both handled in the login proxy.

### 5.3 Agent capabilities (16 actions across 5 collections)

| Collection | Update actions | Create actions |
|---|---|---|
| Posts | `update_post_title` | — |
| Pages | `update_page_title` | — |
| FAQs | `update_faq_question`, `update_faq_answer` | `add_faq` |
| Testimonials | `update_testimonial_quote`, `update_testimonial_name`, `update_testimonial_position` | `add_testimonial` |
| Portfolio Items | `update_portfolio_title`, `update_portfolio_category`, `update_portfolio_url` | `add_portfolio_item` |
| Pricing Plans | — | `add_pricing_plan` |
| Media | `link_image` | — |
| — | `list_faqs`, `list_testimonials`, `list_portfolio_items` | — |

**Create action field definitions:**
| Action | Required | Optional |
|---|---|---|
| `add_faq` | `question`, `answer` | — |
| `add_testimonial` | `name`, `quote` | `position` |
| `add_portfolio_item` | `title`, `category` | `url` |
| `add_pricing_plan` | `label`, `price` | `description`, `features` (comma-separated → items array) |

**Agent cannot:** delete records, create Posts/Pages, modify schemas, reassign content between tenants, access records outside the authenticated tenant.

### 5.4 Conversation flows

**Standard update:**
```
Client: "Update the FAQ about pricing"
Agent:  → list_faqs → numbered list
Client: "2"
Agent:  → resolves ID internally → proposes change
Client: "confirm"
Agent:  → PATCH → AgentAuditLog → success
```

**Create (full-prompt, Phase 10):**
```
Client: "Add a FAQ, question is 'How do I get started?' and answer is 'Contact us via email.'"
Agent:  → pre-fills both fields → proposal
Client: "confirm"
Agent:  → POST → AgentAuditLog → success
```

**Create (sequential fallback):**
```
Client: "Add a new FAQ"
Agent:  → "What would you like the question to say?"
Client: "How do I get started?"
Agent:  → "What should the answer be?"
Client: "Contact us via email and we'll reply within 24 hours."
Agent:  → proposal → confirm → POST + audit log
```

**Cancellation during `awaiting_fields`:**
```
Client: "Add a new FAQ"
Agent:  → "What would you like the question to say?"
Client: "Update a testimonial"   ← command verb detected
Agent:  → "Got it, I've set that aside. What would you like to do?"
         → processes as fresh command. No partial record created.
```

### 5.5 Record resolution convention
When a client picks from a list, ChatWindow appends `[resolved id: 64abc123...]` to the next agent message. SYSTEM_PROMPT instructs DeepSeek to extract this — the client never sees the ID.

### 5.6 Guardrails
- All mutations are two-phase: dry-run (proposal) → confirmed (execute)
- Tenant scoping enforced on every action — 403 if record belongs to a different tenant
- Every confirmed change writes an immutable `AgentAuditLog` record
- Image uploads proxied through apir-tayo — browser never calls payload-poc directly

### 5.7 `awaiting_fields` state machine

**Backend (`src/app/api/agent/shared.ts`):**
- `CREATE_FIELD_DEFS` — field definitions (required/optional/labels) per create action
- `initCreateFlow()` — entry; pre-fills fields already in `parsed.value`, returns first missing required field prompt
- `advanceFieldCollection()` — merges value into `collected`, tracks skipped optional fields via `_skippedOptional` sentinel
- `executeCreate()` — strips `_skippedOptional`, POSTs to Payload, writes audit log
- `handleAwaitingFieldsRoundTrip()` — orchestrates round-trips

**Frontend (`useChatSession.ts`):**
- `awaitingFields` state: `{ action, field, collected, prompt } | null`
- 6th response chain: fires when `awaitingFields` is non-null and message is not a command verb
- Command-cancellation: message starting with `update|add|create|new|list|change|edit|delete` clears `awaitingFields`
- `awaiting_fields` handler present on ALL 5 existing chains

**Optional field handling:** client types "skip" → stored in `_skippedOptional` (not as the string "skip"), deleted from POST body before submission.

### 5.8 Response message quality (Phase 11, partially complete)
- Proposal format: natural-language proposals. Dry-run wrapper bypassed — `newValue` sent directly. ✅ Fixed.
- List display: plain text, collection-appropriate snippets. ✅ Done.
- Clarifying question phrasing: 12 field-specific prompts, optional fields include skip hint. ✅ Done.
- Cancellation message: "Got it, I've set that aside." ✅ Done.
- `url` field extraction — does not handle `url https://...` (only `url: https://...`). ⏸️ Deprioritized (demo already done). Prompt ready in §7.

---

## 6. Key Files Reference

### apir-tayo (`/Users/josh/work/apir-tayo`)
| File | Role |
|---|---|
| `middleware.ts` | Protects `/portal/chat` — redirects to `/portal/login` if `portal_token` absent |
| `app/(portal)/layout.tsx` | Minimal portal layout, no main site nav |
| `app/(portal)/portal/login/page.tsx` | Login form → proxy → session cookies → redirect |
| `app/(portal)/portal/chat/page.tsx` | Server component — reads cookies, resolves tenant + site name/slug, renders ChatWindow |
| `app/(portal)/portal/chat/ChatWindow.tsx` | Thin orchestrator (~80 lines) — owns top-level state, composes child components and hooks |
| `app/api/portal/session/route.ts` | `DELETE` clears cookies (logout). `POST` is dead code — do not remove file. |
| `app/api/portal/login/route.ts` | Server-side login proxy. Sets httpOnly cookies. |
| `app/api/portal/agent/route.ts` | Proxy — forwards `{ message, tenantId, confirmed, proposal, awaitingFields }` to payload-poc |
| `app/api/portal/upload/route.ts` | Image upload proxy — forwards file + tenantId to payload-poc |
| `app/lib/payload/fetchPayload.ts` | `fetchFromPayload<T>()`, `fetchSiteSettings()`, `getCustomField()` |
| `app/lib/payload/payload-types.ts` | TypeScript interfaces for Payload collections |
| `app/lib/portal/agentCapabilities.ts` | Single source of truth — `AGENT_CAPABILITIES`, `HELP_ITEMS`, `CANNOT_ITEMS`, `SUGGESTION_CHIPS` |
| `app/(portal)/portal/chat/types.ts` | Shared interfaces: `Message`, `ProposalPayload`, `SelectionContext`, `AwaitingFieldsContext` |
| `app/(portal)/portal/chat/components/ChatHeader.tsx` | Site name + tenant name + header buttons |
| `app/(portal)/portal/chat/components/ChatEmptyState.tsx` | Site-aware "You're managing {siteName}" panel |
| `app/(portal)/portal/chat/components/CapabilitiesModal.tsx` | "What can I do?" modal |
| `app/(portal)/portal/chat/components/MessageList.tsx` | Scrollable message history + loading indicator |
| `app/(portal)/portal/chat/components/MessageInput.tsx` | Text input, attach, send |
| `app/(portal)/portal/chat/components/ProposalConfirmation.tsx` | Confirm/cancel bar |
| `app/(portal)/portal/chat/hooks/useChatSession.ts` | All agent API calls — 6 response chains |
| `app/(portal)/portal/chat/hooks/useImageUpload.ts` | File selection, preview, upload |
| `.github/workflows/deploy.yml` | CD pipeline — triggers on push to `master`, builds with Payload env vars, rsyncs `.next/` to VPS, SSHes in to `git pull` + `npm ci` + `pm2 reload` |

### payload-poc (`/Users/josh/work/payload-poc`)
| File | Role |
|---|---|
| `src/collections/PortalClients.ts` | Auth-enabled collection — email, password, tenant relationship |
| `src/collections/AgentAuditLog.ts` | Immutable audit log — tenant, action, collection, documentId, slug, previousValue, newValue, confirmedAt |
| `src/collections/SiteSettings.ts` | Tabs-grouped heading/copy fields per site |
| `src/collections/PricingPlans.ts` | `price` (number, req), `description` (textarea, opt) |
| `src/collections/Testimonials.ts` | `image` is `required: false` |
| `src/collections/PortfolioItems.ts` | `image` and `url` are `required: false` |
| `src/app/api/agent/route.ts` | Orchestration shell — parses body (now incl. optional `siteId`), gets token, calls DeepSeek, threads `siteId` to all handler dispatch sites |
| `src/app/api/agent/types.ts` | `ParsedAction`, `ProposalPayload`, `SelectionRecord`, `AwaitingFieldsResponse`, `AwaitingFieldsRequest`, `CreateFieldDef` |
| `src/app/api/agent/prompts.ts` | `SYSTEM_PROMPT` with `PROPOSAL DISPLAY RULES`, `LIST DISPLAY RULES`, `PROMPT PHRASING RULES` |
| `src/app/api/agent/deepseek.ts` | `callDeepSeek()` — calls DeepSeek, strips fences, parses JSON |
| `src/app/api/agent/resolver.ts` | `resolveSlugToId()`, `resolveRecordTenant()`, `fetchTenantRecords()` — now accepts optional `siteId` (Phase 15) |
| `src/app/api/agent/shared.ts` | `awaiting_value` guard + `awaiting_fields` state machine + `buildCreateProposal` + `buildFieldPrompt` + `executeCreate()` — now accepts `explicitSiteId` (Phase 15) |
| `src/app/api/agent/audit.ts` | `writeAuditLog()` |
| `src/app/api/agent/actions/shared.ts` | `patchRecord()`, `patchWithRetry()`, `postRecord()`, `createWithRetry()`, **`getTenantSiteId(tenantId, token, siteId?)`** — rewritten Phase 15 |
| `src/app/api/agent/actions/posts.ts` | `update_post_title`, `update_page_title` |
| `src/app/api/agent/actions/faqs.ts` | `update_faq_question`, `update_faq_answer`, `handleCreateFaq()` — accept `siteId` |
| `src/app/api/agent/actions/testimonials.ts` | `update_testimonial_*`, `handleCreateTestimonial()` — accept `siteId` |
| `src/app/api/agent/actions/portfolio.ts` | `update_portfolio_*`, `handleCreatePortfolio()` — accept `siteId` |
| `src/app/api/agent/actions/pricing.ts` | `handlePricing()` — features→items transform, price string→float coercion — accepts `siteId` |
| `src/app/api/agent/actions/images.ts` | `link_image` handler — accepts `siteId` |
| `src/app/api/agent/actions/list.ts` | `list_faqs`, `list_testimonials`, `list_portfolio_items` — accepts `siteId` |
| `src/app/api-upload/route.ts` | Accepts multipart file + tenantId, uploads to Payload media, returns `{ mediaId, url }` |
| `src/utilities/resolveSite.ts` | Resolves Site slug ↔ ID |
| `src/utilities/payloadAuth.ts` | `getAgentToken()`, `clearAgentToken()` |
| `src/utilities/getURL.ts` | `getServerSideURL()` and `getClientSideURL()` |
| `src/plugins/index.ts` | Plugin registrations — multi-tenant scopes `pages`, `posts`, `media`, `categories` only. ⚠️ `forms`/`form-submissions` not yet scoped — Phase 16. |

---

## 7. Remaining Work — Carry-Over Items

These are incomplete items from prior phases. Resolve before or alongside new roadmap phases.

### Ready-to-run prompts

**FAQ "which field" step (payload-poc) — 🔴 High:**
```
Add a "which field" step to the FAQ update flow, building on the working `awaiting_value` guard.
After a client selects an FAQ record, the agent should ask:
"Would you like to update the question, the answer, or both?"
before asking for the new value. If "both," collect the new question first, then the new answer
as two separate turns. Scope to FAQs only (faqs.ts).
Verify by testing the full flow manually and pasting actual rendered chat messages.
```

**Safety-net catch in apir-tayo — 🟡 Medium:**
```
Add a defensive guard in `app/api/portal/agent/route.ts` so that any non-2xx or
error-shaped response from payload-poc is replaced with a generic friendly fallback:
"Something went wrong on my end — could you try rephrasing that?"
Log the real error server-side. Run after the FAQ fix.
```

**`url` field extraction (payload-poc) — ⏸️ Deprioritized:**
```
Fix the extraction pattern for `url` in the full-prompt field extraction logic
to handle all of these phrasings (case-insensitive):
  - url https://...  |  url: https://...  |  url is https://...
  - link https://... |  link: https://... |  website https://...  |  at https://...
The pattern should capture the full URL including https://.
Do not change the step-by-step fallback.
Verify: "Add a portfolio item called 'X', url https://example.com" → pre-filled, no prompt.
```

### Open items table
| Item | Priority | Notes |
|---|---|---|
| apir-tayo form submission proxy | 🟡 Medium | No proxy route exists — contact form still uses Gravity Forms. When migrating, proxy must forward `x-forwarded-for` and `user-agent` headers to Payload for CleanTalk to work. |
| apir-tayo `contactform.ts` CLEANTALK reference | 🟡 Medium | `app/lib/gravity-forms/contactform.ts` still references `process.env.CLEANTALK_API_KEY`. Will fail-open when key is removed from VPS `.env`. Clean up when migrating off Gravity Forms. |
| Defensive error catch in apir-tayo | 🟡 Medium | Add guard in `app/api/portal/agent/route.ts` — non-2xx or error-shaped response from payload-poc returns a friendly fallback message. Agentic tasks benched. |
| On-demand ISR revalidation | 🟡 Medium | `revalidateTag`/`revalidatePath` webhook. 60s delay is confusing for clients. |
| AGENT_EMAIL role restrictions | 🟡 Medium | Lock service account to only agent-used collections. Agentic tasks benched. |
| Audit `NEXT_PUBLIC_*` env vars | 🟡 Medium | Check for any direct browser-to-Payload calls beyond the fixed login page. |
| Rotate exposed credentials | 🔴 High | `.env` was committed to `master` before repo went public. Not Josh's task. |
| `url` field extraction | ⏸️ Low | Deprioritized. Agentic tasks benched. |
| Differentiate login error messages | 🟢 Low | All failure types return same generic message. |
| CTA secondary button field | 🟢 Low | Add `ctaSecondaryButtonText` to SiteSettings if needed. |
| Delete diagnostic `console.log` in `executeCreate()` | 🟢 Low | Debug log from Phase 9, not yet removed. Agentic tasks benched. |
| Remove dead `POST` handler in `session/route.ts` | 🟢 Low | `DELETE` still live for logout — do not remove the file, only the POST handler. Agentic tasks benched. |
| `PAYLOAD_TENANT_SLUG` in CLAUDE.md | 🟢 Low | References a variable the code doesn't use. Cleanup only. |
| Add `.env.example` to apir-tayo | 🟢 Low | Neither branch has one. Documents required vars for new devs and deployments. |
| MongoDB Atlas migration | 🟡 Medium | Migrate to new Atlas account. Use "Migrate from Atlas" in Migration Hub (Atlas-to-Atlas live migration). Do MongoDB first, then Supabase storage. Keep same document IDs — media prefixes depend on them. Update `DATABASE_URL` in Vercel env vars after cutover. |

---

## 8. Useful Commands

### payload-poc (`/Users/josh/work/payload-poc`)
```bash
pnpm dev              # Start Payload dev server (port 3000)
pnpm generate:types   # Regenerate TypeScript types from collections
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
# SSH into VPS
sudo su - appuserwebsite -s /bin/bash
cd /home/projects/apirtayo

# Check PM2 logs
pm2 logs apirtayo --lines 50

# Check .env
cat .env

# Clear Next.js image cache (if rsync permission errors occur)
rm -rf .next/cache/images/

# After git pull issues (local changes / untracked .env)
git stash
git clean -f .env
git pull origin master
cp .env.backup .env
# Then re-append any new vars manually
```

### Testing the portal end-to-end
```bash
# 1. Start both servers
cd /Users/josh/work/payload-poc && pnpm dev
cd /Users/josh/work/apir-tayo && npm run dev

# 2. Create a PortalClient record in Payload admin
open http://localhost:3000/admin  # Portal Clients → Create New

# 3. Log in via the portal
open http://localhost:3002/portal/login

# 4. Test flows:
# - "Update the title of the post with slug home to Welcome Home"
# - "Update a FAQ" → pick from list → update → confirm
# - "Add a new FAQ" → step-by-step field collection → confirm
# - Attach image → link to a testimonial → confirm
# - Check AgentAuditLog in Payload admin for entries
```

---

## 9. Phase Summary

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
| Phase 15 — `getTenantSiteId()` Multi-Site Fix | `getTenantSiteId()` + `fetchTenantRecords()` rewritten, `siteId` threaded through all handlers. Build passes, zero TS errors. | 🔶 Code complete — **two-site isolation test not yet run** |
| Production Promotion | `feat/payload-cms` → `staging` → `master`. Hostinger VPS deployment. Add/update/delete verified in production. | ✅ Done |
| Phase 16 — Forms Tenant Scoping + CleanTalk | `site` fields on `forms`/`form-submissions`, multi-tenant plugin registration, seed update, CleanTalk anti-spam hook. `CLEANTALK_API_KEY` moved to payload-poc. | ✅ Complete |

---

## 10. Roadmap — Future Phases

The Roadmap Word document (`Payload-CMS-Future-Roadmap.docx`) is the authoritative reference for Phases 15–21 with full implementation details, effort estimates, and sequencing. This section is the quick-reference summary.

### Phase 15 — `getTenantSiteId()` Multi-Site Fix ← 🔶 **CODE COMPLETE, VERIFICATION PENDING**

**What's NOT yet done — required before calling this phase closed:**
1. **No second site has been seeded.** The two-site isolation test has not been run.
2. **A real gap in `apir-tayo`:** the portal proxy (`app/api/portal/agent/route.ts`) never forwards `siteId` to payload-poc. The single-site backward-compat path is the only path exercised in production today.
3. Proposed one-line fix for the above (not yet applied — needs explicit approval):
   ```diff
     body: JSON.stringify({
       message: body.message,
       tenantId,
   +   siteId: process.env.PAYLOAD_SITE_ID,
       confirmed: body.confirmed,
       ...
     }),
   ```

**Required verification steps (next time multi-site is prioritized):**
1. Seed a second site under High6 Corporation (`POST /api/sites { name, url, tenant }`), seed at least one FAQ under it.
2. **Test 1 — no `siteId`, multi-site tenant:** confirm throws "multiple sites exist" error.
3. **Test 2 — create with `siteId`:** `add_faq` with Site A's ID → confirm FAQ lands in Site A only.
4. **Test 3 — read scoping:** `list_faqs` with Site A's ID → only Site A's FAQs returned.
5. **Test 4 — single-site backward compat:** remove second site, omit `siteId` → no error, correct site.
6. **Test 5 — full E2E regression:** login → update FAQ → add FAQ → confirm → check `AgentAuditLog`.
7. Once 2–6 pass, apply the apir-tayo one-liner above.

---

### Phase 16 — Forms: Tenant Scoping + Anti-Spam (CleanTalk) ← ✅ **COMPLETE**

**Critical gap:** `forms` and `form-submissions` have no `tenant` or `site` field. The multi-tenant plugin only scopes `pages`, `posts`, `media`, `categories` — not forms.

**Consequences:**
- Any tenant's page can reference any form (no isolation)
- Submissions have no tenant provenance after the fact
- No admin filtering by tenant

**Part A — Tenant scoping fix (do first):**
- Add `site` relationship field (required) to `forms` collection — mirror the FAQs/Testimonials pattern
- Add `site` relationship field to `form-submissions` — auto-populated from parent form via `beforeChange` hook
- Add `forms` and `form-submissions` to the multi-tenant plugin's collections list in `src/plugins/index.ts`
- Update seed data (`src/endpoints/seed/contact-form.ts`) to assign the contact form to the correct site
- Verify admin filtering by tenant works after the fix

**Part B — CleanTalk anti-spam hook (after Part A):**
- `beforeChange` hook on `form-submissions` collection
- Extracts submitter IP (`x-forwarded-for`) and user-agent from request headers
- ⚠️ Verify these headers are forwarded by the apir-tayo form proxy before writing the hook
- Calls CleanTalk API — rejects write on spam, fail-open on CleanTalk timeout
- `CLEANTALK_API_KEY` moves to `payload-poc` env — remove from apir-tayo

**Effort:** 2–3 days. **Repo:** payload-poc.

---

### Phase 17 — SMTP2GO Email Integration

**Status: BLOCKED — waiting on SMTP user credentials.** Not unblocked despite Phase 16 being complete; new blocker discovered mid-investigation (see below).

**What's confirmed/resolved so far (June 30, 2026 session):**
- SMTP2GO is the chosen email provider (existing High6 account, not something to set up fresh)
- The main SMTP2GO account login (Zoho Vault entry `smtp2go.com`, user `wecare@high6.com`) is **NOT** what's needed for this integration — that's dashboard login access only, and current view permission on that password is restricted anyway. Confirmed via teammate that this isn't the credential type required.
- SMTP2GO uses a separate **SMTP Users** layer (Settings → Sending → SMTP Users) — dedicated username/password pairs scoped for programmatic sending, distinct from the dashboard login. This is the credential type actually needed for `nodemailerAdapter`.
- Existing SMTP users on the account include `wecare-smtp`, `hospikaya-smtp`, `investph-smtp`, `iwp-smtp`, `journeyshield-smtp`, `warrantycare-smtp`, `zurich-smtp` — likely tied to other High6 projects, not necessarily reusable as-is for payload-poc.
- **Sender domain verification:** `h6app.site` is confirmed **Verified** as a sender domain (SMTP2GO → Verified Senders → Sender domains). `high6.com` was checked and is **NOT verified**.
- **From address resolved:** since SMTP2GO verifies at the domain level (not per-mailbox), any address under a verified domain works even if that mailbox doesn't technically exist. Confirmed `no-reply@h6app.site` as the From address to use — `wecare@high6.com` style addresses are NOT usable since `high6.com` isn't verified.

**Variables needed for the integration — current status:**
| Variable | Value | Status |
|---|---|---|
| SMTP Host | `mail.smtp2go.com` | ✅ Confirmed |
| SMTP Port | `2525` (alts: 8025, 587, 80, 25; SSL on 465, 8465, 443) | ✅ Confirmed |
| From Email Address | `no-reply@h6app.site` | ✅ Confirmed |
| SMTP Username | TBD — either reuse existing `wecare-smtp` or request new dedicated SMTP user | ⛔ Pending |
| SMTP Password | TBD — tied to whichever username above | ⛔ Pending |

**Open question sent to teammate (awaiting response):** whether to reuse the existing `wecare-smtp` SMTP user, or have a new SMTP user created specifically for the payload-poc/Payload integration (cleaner scoping, recommended but not yet confirmed).

**Remaining tasks once credentials are received:**
- Configure `nodemailerAdapter` from `@payloadcms/email-nodemailer` in `payload.config.ts` using the 5 variables above
- Store SMTP2GO credentials as server-only env vars in payload-poc
- Verify plugin's `emails[]` template variable replacement works with new transport
- Verify SPF/DKIM records for the payload-poc Vercel domain (note: may already be covered by `h6app.site`'s existing verified-domain status — needs confirming, not yet checked)

**Effort:** 1–2 days once credentials are in hand. **Repo:** payload-poc.

---

### Phase 20 — Dashboard Refactor (in progress)

**Started ahead of Phase 18/19 due to Phase 17 credential blockage.** Replaces `BeforeDashboard` with a real management dashboard.

**Scope confirmed (revised down from original 4-widget plan):**
- 3 top-level stat cards: Tenants count, Sites count, total registered Collections count — instance-wide, not site-scoped
- Quick Actions section (common shortcuts: Add FAQ, Add Testimonial, View Forms, View Form Submissions) — kept as originally built, working correctly
- Recent Activity feed — **removed from UI** per review feedback (too noisy alongside the per-collection stat cards it was paired with); `getRecentActivity()` function kept as dead code for potential future reuse
- Original 8-card per-collection stats display (FAQs, Testimonials, Portfolio Items, Pricing Plans, Posts, Pages, Forms, Submissions) — **replaced**, was showing incorrect `0` counts for most collections due to a `site` relationship field query bug; root cause not yet confirmed (suspected: `site` field shape differs between the original 4 collections and collections added later like `forms`)

**Known issue found and being fixed:** dashboard data layer was referencing `process.env.PAYLOAD_SITE_ID` inside payload-poc — this env var is a frontend-deployment concept (used by apir-tayo to identify which Site it represents) and does not belong in payload-poc, since payload-poc is the shared backend serving all Sites, not a single-site deployment. Caused a runtime error on dashboard load. Fix: remove the env var dependency entirely from the dashboard's active code path, since the simplified 3-card stats are instance-wide and don't need site-scoping in the first place.

**Effort:** Originally estimated 3–4 days, in progress.

---

### Phase 18 — Custom Collections per Site

**Needs scoping session first.** Evaluate whether `customFields` array in SiteSettings covers real client needs before building a full dynamic schema.

**Full solution (if warranted):**
- `CustomCollections` collection in Payload — one record per Site with a JSON field schema config
- Dynamic collection registration via plugin or custom function at startup
- REST API exposes custom collections scoped to tenant
- Frontend fetches via existing `fetchFromPayload` helper

**Effort:** 3–5 days. **Repo:** payload-poc (schema) + frontend repos (rendering).

---

### Phase 19 — Page Templates

**Architecture decided:** template-key approach (not a page builder).

- Add `template` select field to `Sites` collection
- `app/page.tsx` reads template key and renders matching template component
- Extract existing apir-tayo homepage into `one-page-marketing` template as first instance
- Build a second template to prove switching mechanism works

**Effort:** 3–5 days (first two templates). **Repos:** both.

---

### Phase 20 — Dashboard Refactor / Redesign

- Replace `BeforeDashboard` component with a full management dashboard
- Tenant-scoped content stats, recent activity feed, quick-action shortcuts, system health indicators
- Use Payload's local API — no external fetch needed

**Effort:** 3–4 days. **Repo:** payload-poc only.

---

### Phase 21 — Enhanced Agent Audit Log

**Prerequisite for Phase 22.**

- Add `promptSent` and `rawModelOutput` fields to `AgentAuditLog`
- `route.ts` passes these to `writeAuditLog()`
- Update admin view to display these fields readably

**Effort:** 1 day. **Repo:** payload-poc.

---

### Phase 22 — AI Agent Configuration Interface ← Scheduled Last

**Blocked by Phase 21.**

- New `AgentConfig` collection — one record per Tenant
- Provider abstraction wraps `callDeepSeek()` — routes to correct provider
- API keys stored with Payload field-level encryption
- `enabledActions` enforced in dispatch layer

**Effort:** 1–2 weeks. **Repo:** payload-poc.

---

## 11. Payload CMS Configuration (Verified)

### Plugins (registered in `payload.config.ts`, in order)
1. `@payloadcms/plugin-multi-tenant` — Collections: `pages`, `posts`, `media`, `categories`. `userHasAccessToAllTenants: () => true`. `cleanupAfterTenantDelete: false`. `useTenantsListFilter: false`.
2. `@payloadcms/storage-s3` — Collection: `media`. Bucket: `SUPABASE_BUCKET`. `forcePathStyle: true`.
3. `@payloadcms/plugin-redirects` — Collections: `pages`, `posts`. `afterChange` hook: `revalidateRedirects`.
4. `@payloadcms/plugin-nested-docs` — Collections: `categories`. Breadcrumb URL: `/<slug>/<slug>/...`.
5. `@payloadcms/plugin-seo` — `generateTitle`: `"${doc.title} | Payload Website Template"`.
6. `@payloadcms/plugin-form-builder` — Payment: disabled. Custom `confirmationMessage` editor. ✅ `forms` and `form-submissions` tenant-scoped (Phase 16). Configured with `formOverrides` (site field + lexical editor) and `formSubmissionOverrides` (site auto-population hook + CleanTalk spam check hook). **Plugin ordering critical:** multi-tenant plugin must be last in the array so it can add `tenant` fields to plugin-generated collections.
7. `@payloadcms/plugin-search` — Collections: `posts`. Custom `beforeSync` hook.

### Database
```ts
db: mongooseAdapter({ url: process.env.DATABASE_URL || "" });
```

### Admin
- User collection: `users`
- Custom components: `High6Logo`, `BeforeLogin`, `BeforeDashboard`, `SidebarOrderFix`
- Live preview breakpoints: Mobile (375×667), Tablet (768×1024), Desktop (1440×900)

### Globals
- `Header` — `src/Header/config`
- `Footer` — `src/Footer/config`

### CORS origins
```ts
cors: [getServerSideURL(), "http://localhost:3001", "http://localhost:3002"].filter(Boolean);
```

### Media upload config
- Max: 5MB. MIME types: JPEG, PNG, WebP, GIF, PDF. Magic bytes validated.
- Auto-generated sizes: `thumbnail` (300w), `square` (500×500), `small` (600w), `medium` (900w), `large` (1400w), `xlarge` (1920w), `og` (1200×630 crop center)
- Storage: Supabase S3. `prefix` auto-populated from tenant ID via `beforeOperation` hook.

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
| `apir-tayo` portal proxy never forwards `siteId` to payload-poc | Even with Phase 15's payload-poc fix in place, the agent receives no `siteId` from any real request — single-site fallback is the only path exercised in production. One-line fix identified, not yet applied. | Phase 15 verification session |
| Two-site isolation unverified | Phase 15 code is written and builds clean, but no second site has been seeded and the isolation test has not been run. | Phase 15 verification session |
| apir-tayo form proxy missing (forms) | Contact form still uses Gravity Forms. CleanTalk hook relies on headers forwarded by a future apir-tayo proxy. | When apir-tayo migrates off Gravity Forms |
| No type safety at the API boundary | `fetchFromPayload` uses type assertion. Run `pnpm generate:types` in payload-poc and sync to apir-tayo. | When adding a second frontend |
| CI/CD missing Payload env vars on VPS build | VPS does `git pull` + `npm ci` — runtime vars come from `/home/projects/apirtayo/.env`. Build-time `NEXT_PUBLIC_*` vars are injected by GitHub Actions. Both sets now documented. | Stable — document only |
| Exposed credentials not yet rotated | `.env` was committed to `master` before repo went public. Secrets were removed from git but not rotated. | ASAP — before next production incident |
| MongoDB Atlas migration pending | Migrate to new Atlas account using "Migrate from Atlas" in Migration Hub. Keep same document IDs — Supabase media prefixes depend on them. | Before Atlas account handoff |
| No `.env.example` in apir-tayo | No documented list of required vars for new devs or deployments. | Low priority, but add alongside next env var change |

---

## 14. Graphify Knowledge Graph

A full dependency graph of the `payload-poc` codebase was built during Phase 16 using Graphify. Use it in future agentic coding sessions to orient the agent before making changes.

### Graph artifacts (`graphify-out/` in payload-poc)
| File | Contents |
|---|---|
| `graph.html` | Interactive visualization — open in browser |
| `GRAPH_REPORT.md` | Full audit report with community breakdown |
| `graph.json` | Raw graph data for programmatic use |

### Stats
- **948 nodes**, **1797 edges**, **73 communities**

### God nodes (most connected — touch with care)
| Node | Edges | Role |
|---|---|---|
| `cn()` | 57 | Tailwind class utility — bridges 8 communities |
| Graphify Knowledge Graph Tool | 21 | Graph tooling node |
| `getServerSideURL()` | 19 | URL resolution utility used across plugins, collections, and config |
| `authenticated()` | 15 | Core access control function |
| `POST()` | 15 | Route handler pattern used across all API routes |

### Notable finding
The graph surfaced an **inferred edge between the Multi-Tenancy Plugin and the Access Control Wrapper Pattern** — the plugin architecture maps directly to Payload's three-layer access control system (collection-level → field-level → query constraint). This is the architectural reason why plugin ordering matters (see §11).

### Known cycles (pre-existing, do not fix without scoping)
- `preview/route.ts` → `payload.config.ts` → `Pages/Posts` → `generatePreviewPath.ts` → `preview/route.ts` (two 4-file cycles)

### How to use in agentic sessions
Before starting any session that touches cross-cutting concerns (plugins, access control, hooks, URL utilities), instruct the agent:
```
skill: "graphify"
Use graphify-out/GRAPH_REPORT.md and graphify-out/graph.json to understand the dependency 
graph before making changes. Pay special attention to god nodes — changes to cn(), 
getServerSideURL(), and authenticated() have wide blast radius.
```

