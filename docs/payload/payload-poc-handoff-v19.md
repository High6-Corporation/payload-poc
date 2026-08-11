# Payload CMS Integration — Handoff Document

> **Branch:** `feat/payload-cms`
> **Date:** June 27, 2026
> **Version:** v19
> **Summary:** Phase 15 implementation session. `getTenantSiteId()` and `fetchTenantRecords()` rewritten to support multi-site tenants — `siteId` threaded end-to-end through `route.ts` and all action handlers. TypeScript build passes, zero errors. **Not yet verified end-to-end:** the two-site isolation test has not been run — no second site is seeded, so Site A / Site B isolation is unconfirmed in practice. A real gap in `apir-tayo` was found and documented but **not applied**: the portal proxy never forwarded `siteId` to begin with. **Next session:** seed a second site, run the 5-step manual verification in §10 (Phase 15), and apply the one-line apir-tayo proxy fix once Joshie approves it.

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
        └── ...

PortalClients (separate auth collection)
  └── email + password (Payload-managed)
  └── tenant (relationship → Tenants)
```

### Cumulative achievements (Phases 1–14, all complete)
- 4 of 11 homepage sections consume dynamic content from Payload (FAQs, Testimonials, Portfolio Items, Pricing Plans)
- Multi-tenant architecture with site-scoped content
- Both repos deployed to Vercel — verified end-to-end in production
- AI Agent client portal fully implemented (Phases 1–11, partial on 8 and 11)
- Editable homepage headings via `site-settings` collection (Phase 13)
- Content Editor Guide + Integration & Testing Guide delivered to Website Team (Phase 14)
- Roadmap document generated covering Phases 15–21 (Phase 14 session)
- `getTenantSiteId()` and `fetchTenantRecords()` rewritten for multi-site support — code complete, build passing, **isolation test not yet run** (Phase 15, this session)

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

> ⚠️ **`forms` and `form-submissions` are not tenant-scoped.** The multi-tenant plugin does not cover these collections. See §10 (Phase 15) for the fix.

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

### apir-tayo `.env.local` / Vercel
| Variable | Scope | Purpose |
|---|---|---|
| `PAYLOAD_API_URL` | Server-only | Payload REST API base URL. Used by all server-side fetches and proxy routes. |
| `PAYLOAD_SITE_ID` | Server-only | Payload document ID of the site record — used in `where[site][equals]=`. Must be the document ID, not the slug. |
| `NEXT_PUBLIC_PAYLOAD_API_URL` | Client-exposed | Narrow scope only: `TestimonialsSection.tsx` and `PortfolioSection.tsx` use it for `resolveImageUrl()`. Do not use for any new Payload API calls. |
| `PAYLOAD_TENANT_ID` | Server-only | Present in Vercel env vars — usage not fully verified in source. Confirm before touching tenant resolution. |
| `NODE_ENV` | Runtime | Controls `secure` cookie flag in login proxy. |
| `NEXT_PUBLIC_GA_ID` | Client-exposed | GA4 measurement ID |
| `NEXT_PUBLIC_GTM_ID` | Client-exposed | GTM container ID |
| `NEXT_PUBLIC_META_PIXEL_ID` | Client-exposed | Meta Pixel ID |
| `WP_SITE_URL` | Server-only | Gravity Forms REST API |
| `WP_GRAVITY_FORM_CONTACT_ID` | Server-only | Contact form ID |
| `WP_GRAVITY_API_KEY` | Server-only | Gravity Forms consumer key |
| `WP_GRAVITY_API_SECRET` | Server-only | Gravity Forms consumer secret |
| `WORDPRESS_URL` | Server-only | Present in `.env.local` — usage not verified. |

> ⚠️ `CLEANTALK_API_KEY` currently in apir-tayo `.env` — **move to payload-poc** as part of Phase 16. It must never be `NEXT_PUBLIC_`.

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
| `CLEANTALK_API_KEY` | Pending (Phase 16) | Move here from apir-tayo |
| `SMTP2GO_*` | Pending (Phase 16) | SMTP credentials — host, port, username, password, from address |

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
| `src/app/api/agent/resolver.ts` | `resolveSlugToId()`, `resolveRecordTenant()`, `fetchTenantRecords()` — now accepts optional `siteId`; single-site query path with ownership validation when provided, all-sites fallback when not (Phase 15) |
| `src/app/api/agent/shared.ts` | `awaiting_value` guard + `awaiting_fields` state machine + `buildCreateProposal` + `buildFieldPrompt` + `executeCreate()` — now accepts `explicitSiteId`, threads to `getTenantSiteId()` (Phase 15) |
| `src/app/api/agent/audit.ts` | `writeAuditLog()` |
| `src/app/api/agent/actions/shared.ts` | `patchRecord()`, `patchWithRetry()`, `postRecord()`, `createWithRetry()`, **`getTenantSiteId(tenantId, token, siteId?)`** — rewritten Phase 15: explicit `siteId` validated against tenant ownership; no `siteId` + 1 site → backward-compat return; no `siteId` + 2+ sites → throws, no silent first-result pick. `handleTextUpdate` also gained a `siteId` param. |
| `src/app/api/agent/actions/posts.ts` | `update_post_title`, `update_page_title`. `handlePosts` accepts `_siteId` (unused — posts use direct tenant scoping, param kept for signature consistency) |
| `src/app/api/agent/actions/faqs.ts` | `update_faq_question`, `update_faq_answer`, `handleCreateFaq()` — `handleFaqs`/`handleCreateFaq` now accept `siteId` |
| `src/app/api/agent/actions/testimonials.ts` | `update_testimonial_*`, `handleCreateTestimonial()` — now accept `siteId` |
| `src/app/api/agent/actions/portfolio.ts` | `update_portfolio_*`, `handleCreatePortfolio()` — now accept `siteId` |
| `src/app/api/agent/actions/pricing.ts` | `handlePricing()` — features→items transform, price string→float coercion — now accepts `siteId` |
| `src/app/api/agent/actions/images.ts` | `link_image` handler — `handleImages` now accepts `siteId`, threaded to `fetchTenantRecords` fuzzy-match path |
| `src/app/api/agent/actions/list.ts` | `list_faqs`, `list_testimonials`, `list_portfolio_items` — `handleList` now accepts `siteId`, threaded to `fetchTenantRecords` |
| `src/app/api-upload/route.ts` | Accepts multipart file + tenantId, uploads to Payload media, returns `{ mediaId, url }` |
| `src/utilities/resolveSite.ts` | Resolves Site slug ↔ ID |
| `src/utilities/payloadAuth.ts` | `getAgentToken()`, `clearAgentToken()` |
| `src/utilities/getURL.ts` | `getServerSideURL()` and `getClientSideURL()` |
| `src/plugins/index.ts` | Plugin registrations — multi-tenant scopes `pages`, `posts`, `media`, `categories` only |

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
| FAQ "which field" step | 🔴 High | Prompt above. Run before safety-net catch. |
| Defensive error catch in apir-tayo | 🟡 Medium | Prompt above. Run after FAQ fix. |
| On-demand ISR revalidation | 🟡 Medium | `revalidateTag`/`revalidatePath` webhook. 60s delay is confusing for clients. |
| AGENT_EMAIL role restrictions | 🟡 Medium | Lock service account to only agent-used collections. |
| Audit `NEXT_PUBLIC_*` env vars | 🟡 Medium | Check for any direct browser-to-Payload calls beyond the fixed login page. |
| `url` field extraction | ⏸️ Low | Deprioritized post-demo. Prompt above. |
| Extend "which field" to testimonials/portfolio | 🟢 Low | After FAQ pattern confirmed working. |
| Differentiate login error messages | 🟢 Low | All failure types return same generic message. |
| CTA secondary button field | 🟢 Low | Add `ctaSecondaryButtonText` to SiteSettings if needed. |
| Delete diagnostic `console.log` in `executeCreate()` | 🟢 Low | Debug log from Phase 9, not yet removed. |
| Remove dead `POST` handler in `session/route.ts` | 🟢 Low | `DELETE` still live for logout — do not remove the file, only the POST handler. |
| `PAYLOAD_TENANT_SLUG` in CLAUDE.md | 🟢 Low | References a variable the code doesn't use. Cleanup only. |

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
| Phase 8 — Conversation Quality | Site-aware empty state/header, ChatWindow refactor, `awaiting_value` guard | 🔶 Partial — FAQ field-selection + safety-net catch pending |
| Phase 9 — Create Records | `add_faq`, `add_testimonial`, `add_portfolio_item`, `add_pricing_plan` — `awaiting_fields` state machine | ✅ Complete |
| Phase 10 — Full-prompt Support | Parse all field values from a single message | ✅ Complete |
| Production Fixes | Production login CORS fix (server-side proxy), `getServerSideURL()` fallback fix | ✅ Complete |
| Phase 11 — Response Message Quality | Proposal format, list display, clarifying phrasing, cancellation message | 🔶 Partial — url extraction ⏸️ deprioritized |
| Phase 12 — Sir Jeff Demo | First live portal demonstration. Production confirmed working. | ✅ Done |
| Phase 13 — Editable Homepage Headings | `site-settings` collection, 6 sections, fallback-safety, production-verified | ✅ Done |
| Phase 14 — Documentation | Content Editor Guide + Integration & Testing Guide (Word) for Website Team | ✅ Done |
| Phase 15 — `getTenantSiteId()` Multi-Site Fix | `getTenantSiteId()` + `fetchTenantRecords()` rewritten, `siteId` threaded through `route.ts` and all action handlers. Build passes, zero TS errors. | 🔶 Code complete — **two-site isolation test not yet run.** See §10 for required verification steps. |

---

## 10. Roadmap — Future Phases

The Roadmap Word document (`Payload-CMS-Future-Roadmap.docx`) is the authoritative reference for Phases 15–21 with full implementation details, effort estimates, and sequencing. This section is the quick-reference summary.

### Phase 15 — `getTenantSiteId()` Multi-Site Fix ← 🔶 **CODE COMPLETE, VERIFICATION PENDING**

**Files:** `src/app/api/agent/actions/shared.ts`, `src/app/api/agent/resolver.ts`, `src/app/api/agent/shared.ts`, `src/app/api/agent/route.ts`, and all files under `src/app/api/agent/actions/`.

**What was wrong:** `getTenantSiteId()` fetched the sites collection filtered by tenant and returned the first result's ID unconditionally — silently breaking for any tenant with 2+ sites. Investigation also surfaced a second, related gap not previously documented: `fetchTenantRecords()` in `resolver.ts` queried **all sites** for a tenant, so even reads/updates (not just creates) could cross site boundaries.

**What changed:**
- `getTenantSiteId(tenantId, token, siteId?)` — if `siteId` given, validates it belongs to the tenant and returns it; if not given: 0 sites → throws (unchanged), 1 site → returns it (backward compatible), 2+ sites → throws `"Multiple sites exist for tenant X — a siteId must be specified"` (no silent first-result pick).
- `fetchTenantRecords(collection, tenantId, token, siteId?)` — same pattern: scoped single-site query when `siteId` given, existing all-sites query as fallback.
- `siteId?: string` threaded as an optional parameter through `route.ts` → every action handler (`faqs.ts`, `testimonials.ts`, `portfolio.ts`, `pricing.ts`, `images.ts`, `list.ts`) → `executeCreate()` / `handleTextUpdate()` → the two functions above. `posts.ts` accepts the param for signature consistency but doesn't use it (posts are tenant-scoped directly, not site-scoped).
- TypeScript build: ✅ zero errors. Static generation: ✅ all 21 pages. One pre-existing integration test (`fetches users`) still passes.

**What's NOT yet done — required before calling this phase closed:**
1. **No second site has been seeded.** The two-site isolation test — the actual point of this phase — has not been run. Code compiling is not the same as Site A/Site B being confirmed isolated.
2. **A real gap in `apir-tayo` was found:** the portal proxy (`app/api/portal/agent/route.ts`) never forwarded `siteId` to payload-poc at all. `ChatWindow` receives `siteSlug` as a prop but explicitly discards it. `PAYLOAD_SITE_ID` exists as a server env var in `page.tsx` but is only used to fetch the site name for display, never passed to the agent call. **This means even after the payload-poc fix, the agent still has no `siteId` reaching it from the frontend today** — the single-site backward-compat path is currently the only path actually exercised in production.
3. Proposed fix for the above (1 line, not yet applied — needs explicit approval before merging):
   ```diff
     body: JSON.stringify({
       message: body.message,
       tenantId,
   +   siteId: process.env.PAYLOAD_SITE_ID,
       confirmed: body.confirmed,
       ...
     }),
   ```

**Required verification steps (next session, in order):**
1. Seed a second site under High6 Corporation (`POST /api/sites { name, url, tenant }`), and seed at least one FAQ under it.
2. **Test 1 — no `siteId`, multi-site tenant:** confirm the request throws the "multiple sites exist" error rather than guessing.
3. **Test 2 — create with `siteId`:** `add_faq` with Site A's ID → confirm the FAQ lands in Site A, not Site B.
4. **Test 3 — read scoping:** `list_faqs` with Site A's ID → confirm only Site A's FAQs come back.
5. **Test 4 — single-site backward compat:** remove the second site, omit `siteId` → confirm existing behavior is unchanged (no error, correct site).
6. **Test 5 — full E2E regression:** run the §8 flow (login → update FAQ → add FAQ → confirm → check `AgentAuditLog`) end-to-end.
7. Once 2–6 pass, get explicit go-ahead and apply the apir-tayo one-liner above — without it, the payload-poc fix has no live caller providing `siteId`.

**Scope:** `payload-poc` code changes complete. `apir-tayo` change identified but intentionally not applied — awaiting approval. No changes were made to `src/plugins/index.ts`, `forms`/`form-submissions` (Phase 16 territory), or `AGENTS.md`, per original scope constraints.

---

### Phase 16 — Forms: Tenant Scoping + Anti-Spam (CleanTalk)

**Critical gap identified this session:** `forms` and `form-submissions` have no `tenant` or `site` field. The multi-tenant plugin (`src/plugins/index.ts:29-34`) only scopes `pages`, `posts`, `media`, `categories` — not forms. The `Form` type (`payload-types.ts:720`) and `FormSubmission` type (`payload-types.ts:1051`) confirm this.

**Consequences:**
- Any tenant's page can reference any form (no isolation)
- Submissions have no tenant provenance after the fact
- No admin filtering by tenant
- Inconsistent with every other content collection in the project

**Part A — Tenant scoping fix (do first):**
- Add `site` relationship field (required) to `forms` collection — mirror the FAQs/Testimonials pattern
- Add `site` relationship field to `form-submissions` — auto-populated from parent form via `beforeChange` hook
- Add `forms` and `form-submissions` to the multi-tenant plugin's collections list in `src/plugins/index.ts`
- Update seed data (`src/endpoints/seed/contact-form.ts`) to assign the contact form to the correct site
- Verify admin filtering by tenant works after the fix

**Part B — CleanTalk anti-spam hook (after Part A):**
- `beforeChange` hook on `form-submissions` collection
- Extracts submitter IP (`x-forwarded-for`) and user-agent from request headers
- ⚠️ Verify these headers are forwarded by the apir-tayo form proxy before writing the hook — if stripped, CleanTalk receives the server IP and its check is useless
- Calls CleanTalk API — rejects write on spam, fail-open on CleanTalk timeout
- `CLEANTALK_API_KEY` moves to `payload-poc` env — remove from apir-tayo

**Effort:** 2–3 days. **Repo:** payload-poc.

---

### Phase 17 — SMTP2GO Email Integration

**Blocked by:** Phase 16 Part A (site field must exist on `forms` before email config is useful).

- Configure `nodemailerAdapter` from `@payloadcms/email-nodemailer` in `payload.config.ts`
- Store SMTP2GO credentials as server-only env vars in payload-poc (`SMTP2GO_HOST`, `SMTP2GO_PORT`, `SMTP2GO_USERNAME`, `SMTP2GO_PASSWORD`, `SMTP2GO_FROM`)
- Verify plugin's `emails[]` template variable replacement (`{{fieldName}}`, `{{*}}`) works with new transport
- Verify SPF/DKIM records for the payload-poc Vercel domain
- Scope: instance-wide sender address. Per-tenant from-addresses are out of scope for this phase.

**Effort:** 1–2 days. **Repo:** payload-poc.

---

### Phase 18 — Custom Collections per Site

**Needs scoping session first.** Evaluate whether `customFields` array in SiteSettings covers real client needs before building a full dynamic schema. If clients need structured records with images and ordering (e.g. Team Members, Services), build the full solution. If they just need extra text fields, extend `customFields`.

**Full solution (if warranted):**
- `CustomCollections` collection in Payload — one record per Site with a JSON field schema config
- Dynamic collection registration via plugin or custom function at startup
- REST API exposes custom collections scoped to tenant
- Frontend fetches via existing `fetchFromPayload` helper

**Effort:** 3–5 days. **Repo:** payload-poc (schema) + frontend repos (rendering).

---

### Phase 19 — Page Templates

**Architecture decided:** template-key approach (not a page builder).

- Add `template` select field to `Sites` collection in Payload — initial options: `one-page-marketing`, `portfolio-heavy`, `minimal-landing`
- `app/page.tsx` (apir-tayo) reads template key from site record and renders matching template component
- Extract existing apir-tayo homepage into `one-page-marketing` template as the first instance
- Build a second template to prove the switching mechanism works
- Template components are React Server Components — new templates always require a frontend deploy
- AI Agent can support `set_site_template` action once the collection field exists

**What this does not do:** clients cannot rearrange sections or add new ones. Layout selection only.

**Effort:** 3–5 days (first two templates). **Repos:** both.

---

### Phase 20 — Dashboard Refactor / Redesign

- Replace `BeforeDashboard` component in `payload-poc` admin with a full management dashboard
- Tenant-scoped content stats: FAQ count, Testimonial count, Portfolio Item count, Pricing Plan count
- Recent activity feed: last 5 edited records across collections
- Quick-action shortcuts: Add FAQ, Add Testimonial, View Portfolio Items
- System health indicators: Supabase S3 status, last form submission timestamp
- Use Payload's local API for server-side stats — no external fetch needed
- No new UI library — use Payload's existing CSS variables

**Effort:** 3–4 days. **Repo:** payload-poc only.

---

### Phase 21 — Enhanced Agent Audit Log

**Prerequisite for Phase 22.**

- Add two fields to `AgentAuditLog` collection: `promptSent` (textarea/json — full messages array sent to DeepSeek) and `rawModelOutput` (textarea/json — complete model response before action dispatch)
- `route.ts` passes these to `writeAuditLog()` alongside existing fields
- Access control unchanged: read authenticated only, update/delete hardcoded false
- Update admin view to display these fields readably

**Effort:** 1 day. **Repo:** payload-poc.

---

### Phase 22 — AI Agent Configuration Interface ← Scheduled Last

**Blocked by Phase 21.** Deliberately last — system prompt editor is only useful once real usage data from the audit log exists to inform decisions.

- New `AgentConfig` collection — one record per Tenant. Fields: `aiProvider` (select), `apiKey` (encrypted text), `systemPrompt` (textarea), `enabledActions` (checkbox array of all 16 action keys)
- Agent `route.ts` fetches tenant's `AgentConfig` at the start of each request
- Provider abstraction wraps `callDeepSeek()` — routes to correct provider client based on `aiProvider`
- API keys stored with Payload field-level encryption — never returned in REST responses
- `enabledActions` enforced in dispatch layer before any action handler is called

**Effort:** 1–2 weeks. **Repo:** payload-poc.

---

## 11. Payload CMS Configuration (Verified)

### Plugins (registered in `payload.config.ts`, in order)
1. `@payloadcms/plugin-multi-tenant` — Collections: `pages`, `posts`, `media`, `categories`. `userHasAccessToAllTenants: () => true`. `cleanupAfterTenantDelete: false`. `useTenantsListFilter: false`.
2. `@payloadcms/storage-s3` — Collection: `media`. Bucket: `SUPABASE_BUCKET`. `forcePathStyle: true`.
3. `@payloadcms/plugin-redirects` — Collections: `pages`, `posts`. `afterChange` hook: `revalidateRedirects`.
4. `@payloadcms/plugin-nested-docs` — Collections: `categories`. Breadcrumb URL: `/<slug>/<slug>/...`.
5. `@payloadcms/plugin-seo` — `generateTitle`: `"${doc.title} | Payload Website Template"`.
6. `@payloadcms/plugin-form-builder` — Payment: disabled. Custom `confirmationMessage` editor. ⚠️ `forms` and `form-submissions` not yet tenant-scoped.
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
| Apir-tayo (frontend) | https://apir-tayo.vercel.app |
| Payload CMS admin | https://payload-poc-xi.vercel.app/admin |
| Payload CMS REST API | https://payload-poc-xi.vercel.app/api |
| AI Agent portal login | https://apir-tayo.vercel.app/portal/login |

*Credentials provided separately via MD file.*

---

## 13. Known Architectural Gaps

| Gap | Impact | When to fix |
|---|---|---|
| `apir-tayo` portal proxy never forwards `siteId` to payload-poc | Even with Phase 15's payload-poc fix in place, the agent currently receives no `siteId` from any real request — the single-site fallback path is the only one exercised in production today. One-line fix identified, not yet applied. | **Next session — apply after Phase 15 verification passes** |
| Two-site isolation unverified | Phase 15 code is written and builds clean, but no second site has been seeded and the isolation test (§10, Phase 15) has not been run. Don't treat Phase 15 as closed until this passes. | **Next session (Phase 15 verification)** |
| `forms` / `form-submissions` not tenant-scoped | Cross-tenant form access possible. No submission provenance. | Phase 16 |
| No type safety at the API boundary | `fetchFromPayload` uses type assertion. Run `pnpm generate:types` in payload-poc and sync to apir-tayo. | When adding a second frontend |
| CI/CD missing Payload env vars | Hostinger VPS build missing vars. Lower priority while Vercel is active. | Before moving off Vercel |
