# Payload CMS Integration — Handoff Document

> **Branch:** `feat/payload-cms`
> **Date:** June 2026 (updated post–Phase 6 + agent refactor)
> **Summary:** Wired the Apirtayo Next.js frontend to an external Payload CMS for dynamic homepage content. Both repos are deployed to Vercel. The AI Agent client portal is now fully implemented through Phase 6 — clients can log in, manage content via plain-language chat, upload images, and all changes go through a confirmation + audit log flow. The agent route has been refactored into a modular structure. Next session: UAT smoke tests + escalation to Sir Jeff.

---

## 1. Overview

The Apirtayo marketing site previously used hardcoded content for all homepage sections (FAQ questions, testimonials, portfolio items, pricing plans). This integration replaces those hardcoded arrays with live data fetched from a **separately deployed Payload CMS instance** using Payload's REST API.

The Payload CMS itself lives in a **different project** at `/Users/josh/work/payload-poc` — it is not part of the apir-tayo repository. The two projects communicate over HTTP at runtime.

### What was achieved
- **4 of 11 homepage sections** now consume dynamic content from Payload
- Content editors can manage FAQs, testimonials, portfolio items, and pricing plans via the Payload admin UI
- Multi-tenant architecture: one Payload instance can serve multiple frontends, each scoped to its own "Site"
- Zero downtime on Payload failure — all fetches fail gracefully to empty arrays
- **Both repos deployed to Vercel** (`payload-poc` and `apir-tayo`) — verified end-to-end in production
- **Media filename sanitization fix applied** — strips/replaces disallowed characters before upload to Supabase S3
- **AI Agent client portal fully implemented** — Phases 1–6 complete (see §7.5)

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
        └── Pricing Plans
  └── Site ("future-project-2")
        └── ...

PortalClients (separate auth collection)
  └── email + password (Payload-managed)
  └── tenant (relationship → Tenants)
```

### Key design decisions
| Decision | Rationale |
|---|---|
| REST API (not GraphQL) | Simpler, no client dependency needed |
| Server-side fetch (not client) | SEO, performance, ISR caching |
| `next: { revalidate: 60 }` | 60-second stale-while-revalidate |
| `null` on failure (not throw) | Page must render even when Payload is down |
| Payload in separate repo | Independent deploy cycles, shared across projects |
| PortalClients separate from Users | Clients can never get Payload admin access |
| Confirmation before PATCH | All agent mutations require explicit client confirmation |
| Persistent audit log | AgentAuditLog collection records every confirmed change |

---

## 3. Homepage Integration (unchanged from v9)

### 3.1 New files: `app/lib/payload/` (3 files)
- `fetchPayload.ts` — generic fetch helper with ISR, error handling, site scoping
- `payload-types.ts` — TypeScript interfaces for PayloadFAQ, PayloadTestimonial, PayloadPortfolioItem, PayloadPricingPlan
- `index.ts` — barrel exports

### 3.2 Modified: `app/page.tsx`
Async server component, fetches all four collections in parallel via `Promise.all`, passes as props to section components.

### 3.3 Modified: section components (4 files)
FAQSection, TestimonialsSection, PortfolioSection, PricingSection — all now accept dynamic data as props with `resolveImageUrl()` helpers for media.

---

## 4. Environment Variables

### apir-tayo `.env.local`
| Variable | Purpose |
|---|---|
| `PAYLOAD_API_URL` | Payload REST API base URL (server-only) |
| `NEXT_PUBLIC_PAYLOAD_API_URL` | Public URL for resolving media paths in `<img>` tags |
| `PAYLOAD_SITE_ID` | Tenant site ID for `where[site][equals]=` filter |

### payload-poc `.env.local`
| Variable | Purpose |
|---|---|
| `DEEPSEEK_API_KEY` | DeepSeek API key for agent intent parsing |
| `AGENT_EMAIL` | Service account email for Payload auth |
| `AGENT_PASSWORD` | Service account password |
| `NEXT_PUBLIC_SERVER_URL` | Payload's own base URL |

---

## 5. AI Agent Client Portal

### 5.1 Portal architecture

```
Client browser
  └── /portal/login (apir-tayo)
        ↓ POST /api/portal-clients/login (payload-poc)
        ↓ JWT + tenantId stored as httpOnly cookies
  └── /portal/chat (apir-tayo, protected by middleware)
        ↓ POST /api/portal/agent (apir-tayo proxy)
              ↓ reads portal_token + portal_tenant_id cookies
              ↓ POST /api/agent (payload-poc)
                    ↓ DeepSeek parses intent
                    ↓ dry-run: returns proposal
                    ↓ confirmed: PATCH + audit log
```

### 5.2 Session cookies
| Cookie | Value | Set by |
|---|---|---|
| `portal_token` | Payload JWT | `POST /api/portal/session` in apir-tayo |
| `portal_tenant_id` | Tenant ID (resolved from PortalClient.tenant) | same |

Key detail: Payload returns the tenant relationship as a nested object on login. The session route handles both `typeof user.tenant === 'object' ? user.tenant.id : user.tenant`.

### 5.3 Agent capabilities

The agent supports 12 actions across 5 collections:

| Collection | Supported actions |
|---|---|
| Posts | `update_post_title` |
| Pages | `update_page_title` |
| FAQs | `update_faq_question`, `update_faq_answer` |
| Testimonials | `update_testimonial_quote`, `update_testimonial_name`, `update_testimonial_position` |
| Portfolio Items | `update_portfolio_title`, `update_portfolio_category`, `update_portfolio_url` |
| Media | `link_image` (links an uploaded media ID to a testimonial or portfolio item) |
| — | `list_faqs`, `list_testimonials`, `list_portfolio_items` (resolution flow) |

**What the agent cannot do (enforced at route level):**
- Delete records
- Create new records
- Modify collection schemas or frontend code
- Reassign content between tenants
- Access records outside the authenticated tenant

### 5.4 Conversation flows

**Standard update flow:**
```
Client: "Update the FAQ about pricing"
Agent:  → list_faqs → returns numbered list of tenant-scoped FAQs
Client: "2"
Agent:  → resolves to record ID internally → proposes change
Client: "confirm"
Agent:  → executes PATCH → writes AgentAuditLog → returns success
```

**Direct update flow (when record is unambiguous):**
```
Client: "Update the post titled home to say Welcome Home"
Agent:  → resolves slug → proposes change with current/new values
Client: "confirm"
Agent:  → executes PATCH → writes AgentAuditLog → returns success
```

**Image upload flow:**
```
Client: attaches image file + types "attach this to the Testing testimonial"
ChatWindow: POSTs file to /api/portal/upload → gets mediaId back
Agent:  → list_testimonials → client picks → link_image proposal
Client: "confirm"
Agent:  → PATCHes image field → writes audit log
```

**Cancellation:**
```
Client: sends any message other than "confirm" while a proposal is pending
ChatWindow: clears proposal, shows "Previous proposal cancelled", treats new message as fresh command
```

### 5.5 Record resolution convention

When a client picks a record from a list, ChatWindow resolves the selection to an internal ID and appends it to the next agent call:

```
message: "update the quote [resolved id: 64abc123...]"
```

The SYSTEM_PROMPT instructs DeepSeek to extract `[resolved id: x]` and use it directly as the `id` field — the client never sees the ID at any point.

### 5.6 Guardrails
- All mutations are two-phase: dry-run (proposal) → confirmed (execute)
- Tenant scoping enforced on every action — 403 if record belongs to a different tenant
- Every confirmed change writes an immutable `AgentAuditLog` record in Payload
- Image uploads proxied through apir-tayo — browser never calls payload-poc directly

---

## 6. Key Files Reference

### In apir-tayo (`/Users/josh/work/apir-tayo`)
| File | Role |
|---|---|
| `middleware.ts` | Protects `/portal/chat` — redirects to `/portal/login` if `portal_token` absent |
| `app/(portal)/layout.tsx` | Minimal portal layout, no main site nav |
| `app/(portal)/portal/login/page.tsx` | Login form → Payload auth → session cookies → redirect |
| `app/(portal)/portal/chat/page.tsx` | Server component — reads cookies, fetches tenant name, renders ChatWindow |
| `app/(portal)/portal/chat/ChatWindow.tsx` | Client component — full chat UX, confirmation flow, image upload, record selection |
| `app/api/portal/session/route.ts` | POST sets cookies; DELETE clears (logout) |
| `app/api/portal/agent/route.ts` | Proxy — reads cookies, forwards `{ message, tenantId, confirmed, proposal }` to payload-poc |
| `app/api/portal/upload/route.ts` | Image upload proxy — forwards file + tenantId to payload-poc agent-upload |
| `app/lib/payload/fetchPayload.ts` | Homepage fetch helper |
| `app/lib/payload/payload-types.ts` | TypeScript interfaces for Payload collections |

### In payload-poc (`/Users/josh/work/payload-poc`)
| File | Role |
|---|---|
| `src/collections/PortalClients.ts` | Auth-enabled collection — email, password, tenant relationship |
| `src/collections/AgentAuditLog.ts` | Immutable audit log — tenant, action, collection, documentId, slug, previousValue, newValue, confirmedAt |
| `src/app/api/agent/route.ts` | Orchestration shell (~100 lines) — parses body, gets token, calls DeepSeek, delegates to action handlers |
| `src/app/api/agent/types.ts` | ParsedAction, ProposalPayload, SelectionRecord interfaces + isParsedAction() guard |
| `src/app/api/agent/prompts.ts` | SYSTEM_PROMPT, DEEPSEEK_MODEL, DEEPSEEK_BASE_URL |
| `src/app/api/agent/deepseek.ts` | callDeepSeek() — calls DeepSeek API, strips fences, parses + validates JSON |
| `src/app/api/agent/resolver.ts` | resolveSlugToId(), resolveRecordTenant(), fetchTenantRecords() |
| `src/app/api/agent/audit.ts` | writeAuditLog() — POSTs to AgentAuditLog collection |
| `src/app/api/agent/actions/posts.ts` | update_post_title, update_page_title handlers |
| `src/app/api/agent/actions/faqs.ts` | update_faq_question, update_faq_answer handlers |
| `src/app/api/agent/actions/testimonials.ts` | update_testimonial_* handlers |
| `src/app/api/agent/actions/portfolio.ts` | update_portfolio_* handlers |
| `src/app/api/agent/actions/images.ts` | link_image handler |
| `src/app/api/agent/actions/list.ts` | list_faqs, list_testimonials, list_portfolio_items handlers |
| `src/app/api/agent-upload/route.ts` | Accepts multipart file + tenantId, uploads to Payload media, returns { mediaId, url } |
| `src/utilities/resolveSite.ts` | Resolves Site slug ↔ ID (used by homepage, not by agent) |
| `src/utilities/payloadAuth.ts` | getAgentToken(), clearAgentToken() — service account JWT management |

---

## 7. Remaining Work

### Portal — immediate next steps
| Item | Priority | Notes |
|---|---|---|
| UAT smoke tests | High | Run both dev servers, test all flows end-to-end before escalating to Sir Jeff |
| Escalate to Sir Jeff | High | Portal is POC-ready — present the full flow for sign-off |
| On-demand revalidation | Medium | Clients expect content changes to appear instantly, not after the 60s ISR window. Use `revalidateTag` / `revalidatePath` webhook from Payload. Deprioritized but worth flagging in the Sir Jeff escalation. |
| AGENT_EMAIL role restrictions | Medium | Service account currently has broader Payload access than strictly needed. Lock down to only the collections the agent writes to. |
| Lexical rich text fields | Low | Hero text and similar fields use a specific JSON node structure — plain string patches won't work. Deferred; agent currently only handles text/title fields. |
| Create new records via agent | Low | Currently not supported. Would require add_faq, add_testimonial etc. actions. |
| Delete records via agent | Low | Out of scope for POC. Would need a separate confirmation UX pattern. |

### Homepage — remaining hardcoded sections
| Section | Notes |
|---|---|
| HeroSection | Would need a Payload Global or collection |
| WhyOnePageSection | Feature list — could be a collection |
| HowItWorksSection | Step-by-step — could be a collection |
| TrustSection | Client logos/stats |
| CTASection | Single CTA block — could be a Global |
| Footer | Links and copyright — could be a Global |

### Known gaps
- **No type safety at the API boundary** — `fetchFromPayload` uses a type assertion. Run `pnpm generate:types` in payload-poc and sync the generated types to apir-tayo for full safety.
- **`PAYLOAD_TENANT_SLUG` in CLAUDE.md is unused** — references a variable the code doesn't use. Should be cleaned up.
- **CI/CD does not inject Payload vars** — the Hostinger VPS pipeline is missing Payload env vars in its build step. Lower priority while Vercel is the active deploy path.

---

## 8. Useful Commands

### Payload CMS (`/Users/josh/work/payload-poc`)
```bash
pnpm dev              # Start Payload dev server (port 3000)
pnpm generate:types   # Regenerate TypeScript types from collections
pnpm tsc --noEmit     # Type check
pnpm build            # Production build
```

### Apir-tayo frontend (`/Users/josh/work/apir-tayo`)
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
# - Attach image → link to a testimonial → confirm
# - Check AgentAuditLog in Payload admin for entries
```

---

## 9. Phase Summary

| Phase | What was built | Status |
|---|---|---|
| Phase 1 — Portal Auth | PortalClients collection, login page, session cookies | ✅ Complete |
| Phase 2 — Portal Chat UI | Middleware, chat page, ChatWindow, agent proxy | ✅ Complete |
| Phase 3 — Wire Agent to Tenant | Agent route accepts { message, tenantId }, slug resolution removed | ✅ Complete |
| Phase 4 — Guardrails | Dry-run/confirm flow, AgentAuditLog collection, disclaimer banner | ✅ Complete |
| Phase 5 — Capability Expansion | 12 actions, image upload, tenant name in header, capabilities panel | ✅ Complete |
| Phase 6 — Smart Record Resolution | List actions, numbered selection UX, [resolved id] convention, RESOLVE_NEEDED removed | ✅ Complete |
| Refactor — Agent Modularity | route.ts split into 10 focused modules under src/app/api/agent/ | ✅ Complete |
| Phase 7 — UAT + Escalation | Smoke tests, Sir Jeff sign-off | ⏳ Next session |
