# Payload CMS Integration — Handoff Document

> **Branch:** `feat/payload-cms`
> **Date:** June 2026 (updated post–production-login-fix + Phase 10 full-prompt confirmation)
> **Summary:** Wired the Apirtayo Next.js frontend to an external Payload CMS for dynamic homepage content. Both repos are deployed to Vercel. Production login was broken (CORS) and has been fixed via a proper server-side proxy — see §1.1. The AI Agent client portal is fully implemented through Phase 10: create-record support across all 4 collections (FAQs, Testimonials, Portfolio Items, Pricing Plans) works both via sequential step-by-step prompting (Phase 9) AND full-prompt single-message parsing (Phase 10) — both confirmed working in manual chat testing post-login-fix. Update flows (list-pick and direct/unambiguous) and image linking also confirmed working. Remaining open items: Phase 8 wording rewrite + FAQ "which field" step (still pending — status unconfirmed this session, needs explicit re-test), apir-tayo defensive error catch (still pending), Sir Jeff escalation (blocked on Phase 8 items), and the Agent Setup interface in Payload (future).

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
- **AI Agent client portal fully implemented** — Phases 1–10 complete (see §5)
- **Portal login lives within the same frontend URL** (`/portal/login`) — kept there intentionally to reduce complexity and speed up evaluation
- **Smoke test bugs resolved** — media upload tenant ID coercion, record name-as-ID resolution, `link_image` DeepSeek misfire, raw IDs scrubbed from all client-facing messages
- **Portal capability messaging shipped (Phase 8)** — empty-state chat panel and header are now site-aware (resolved dynamically, no hardcoded site name), capability list is a single shared source of truth (`app/lib/portal/agentCapabilities.ts`) used by both the empty state and the "What can I do?" modal
- **ChatWindow.tsx refactored** — split from ~1,380 lines into a thin orchestrator + focused components (`ChatHeader`, `ChatEmptyState`, `CapabilitiesModal`, `MessageList`, `MessageInput`, `ProposalConfirmation`) and hooks (`useChatSession`, `useImageUpload`); pure structural refactor, no behavior change; build verified clean
- **`awaiting_value` guard added** — agent no longer attempts an update action with a missing required field and surfaces a raw error/JSON to the client; it now asks a plain-text clarifying question instead. Confirmed working for the FAQ list-pick path.
- **Create-record support added (Phase 9)** — `add_faq`, `add_testimonial`, `add_portfolio_item`, `add_pricing_plan` actions implemented across both repos. Sequential `awaiting_fields` state machine collects one field per turn. All 4 flows confirmed working via step-by-step prompting. (Full-prompt support was added later — see next bullet, Phase 10.)
- **Full-prompt create support confirmed working (Phase 10)** — clients can now send all field values in a single message (e.g. "Add a FAQ, question is X, answer is Y") and the agent pre-fills correctly instead of asking field-by-field. Confirmed via manual chat testing across FAQs, testimonials, portfolio items, and pricing plans, including optional-field omission and comma-separated features parsing. Step-by-step flow (no values in initial message) still works as a fallback.
- **Production login bug found and fixed** — `/portal/login` was broken in production (`"Cannot connect to the server"`). Root cause: the login form made a **direct browser-to-payload-poc fetch** using a `NEXT_PUBLIC_`-exposed env var, which hit a CORS preflight failure (payload-poc has no CORS headers configured, and was never meant to be called from the browser directly). Fixed by adding a proper server-side proxy route (`app/api/portal/login/route.ts`) in apir-tayo, matching the existing pattern used by `/api/portal/agent`. **Separately**, a payload-poc-side bug was also found and fixed: 5 `getServerURL()` functions only checked `NEXT_PUBLIC_SERVER_URL` and fell back to `localhost:3000`, breaking internal/self-referencing calls in production. Fixed via `getServerSideURL()` adding `VERCEL_PROJECT_PRODUCTION_URL` as a fallback. These are two distinct, unrelated bugs that surfaced in the same debugging session — do not conflate them.

---

## 1.1 Production Login Fix (this session)

**Symptom:** Logging in at `https://apir-tayo.vercel.app/portal/login` returned "Cannot connect to the server. This may be a network or configuration issue. Please try again later."

**Root cause:** The login page (`app/(portal)/portal/login/page.tsx`) was a Client Component making a **direct browser fetch** to payload-poc:
```ts
const payloadUrl = process.env.NEXT_PUBLIC_PAYLOAD_API_URL;
const loginRes = await fetch(`${payloadUrl}/api/portal-clients/login`, { ... });
```
This is a cross-origin request (browser on `apir-tayo.vercel.app` → `payload-poc-xi.vercel.app`). Payload has no CORS headers configured for that origin, so the browser blocked the preflight: `No 'Access-Control-Allow-Origin' header is present on the requested resource.` This also contradicted the project's own architecture — every other call to payload-poc (chat agent, uploads) is proxied server-side specifically so the browser never talks to payload-poc directly.

**Fix:** Added `app/api/portal/login/route.ts` — a server-side proxy mirroring `app/api/portal/agent/route.ts`'s pattern:
- Receives `{ email, password }` from the browser (same-origin, no CORS issue)
- Server-side `fetch()`s `${PAYLOAD_API_URL}/api/portal-clients/login` (server-only env var, never exposed to the browser)
- Resolves `tenantId` from the response (handles both populated-object and bare-string `user.tenant`, same logic as the old `session/route.ts`)
- Sets `portal_token` + `portal_tenant_id` httpOnly cookies directly
- Returns a generic error message on failure (does not leak payload-poc's raw error to the client)

`page.tsx`'s `handleSubmit` was simplified from two fetches (direct-to-payload, then `/api/portal/session`) down to one fetch to the new `/api/portal/login`.

**Left as-is (decisions made, not yet acted on):**
- `app/api/portal/session/route.ts`'s `POST` handler is now dead code (its `DELETE` handler is still used for logout via `ChatWindow.tsx`). Small, harmless, flagged for a future cleanup pass — not removed yet.
- `NEXT_PUBLIC_PAYLOAD_API_URL` is **still required** — `TestimonialsSection.tsx` and `PortfolioSection.tsx` use it client-side for `resolveImageUrl()` on the homepage. Do not remove this env var; only the login page stopped using it.
- Error messaging from the new route is currently a single generic string for all failure types (bad credentials, account lockout, payload-poc downtime all look the same to the client). Identified as a minor follow-up, not done this session.

**Unrelated but adjacent fix, also verified this session:** payload-poc's own `NEXT_PUBLIC_SERVER_URL` was confirmed empty in production (visible directly in a raw HTML response: `"serverURL":"","..."` and `og:image` URLs resolving to `localhost:3000`). This is the `getServerSideURL()` fix described in §4 — confirmed necessary and should remain in place. It is a different bug from the login CORS issue (self-reference inside payload-poc vs. cross-origin call from apir-tayo's browser) — don't conflate the two or assume fixing one obsoletes the other.

---

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
| Confirmation before PATCH/POST | All agent mutations require explicit client confirmation |
| Persistent audit log | AgentAuditLog collection records every confirmed change |
| Sequential field collection | One field per turn for creates — consistent, debuggable, avoids parsing ambiguity |

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

**Convention:** all `*_URL` env vars in this stack are base URLs with **no trailing slash** (confirmed/enforced this session on `NEXT_PUBLIC_SERVER_URL`). A trailing slash produces double-slash paths (`...//api/...`) when code concatenates `${URL}/path`.

### apir-tayo `.env.local` / Vercel
| Variable | Purpose |
|---|---|
| `PAYLOAD_API_URL` | Payload REST API base URL (server-only). Used by `/api/portal/agent`, `/api/portal/login` (new, this session), homepage fetches. |
| `NEXT_PUBLIC_PAYLOAD_API_URL` | Public URL — **client-side only, narrow scope.** Used only by `TestimonialsSection.tsx`/`PortfolioSection.tsx` for `resolveImageUrl()` on the homepage. As of this session, the login page no longer uses this var (it caused the production CORS bug — see §1.1). Treat any *new* client-side use of this var with suspicion; calls to payload-poc should default to being server-side proxied unless there's a specific reason (like public media URLs) that they can't be. |
| `PAYLOAD_SITE_ID` | Tenant site ID for `where[site][equals]=` filter |
| `PAYLOAD_TENANT_ID` | Seen in Vercel project env vars (per dashboard screenshot, this session) — not yet cross-referenced against code in this doc. Confirm usage if touching tenant resolution. |
| `CLEANTALK_API_KEY` | Spam filtering (unrelated to Payload integration) — seen in Vercel dashboard, not otherwise documented here. |

### payload-poc `.env.local` / Vercel
| Variable | Purpose |
|---|---|
| `DEEPSEEK_API_KEY` | DeepSeek API key for agent intent parsing |
| `AGENT_EMAIL` | Service account email for Payload auth |
| `AGENT_PASSWORD` | Service account password |
| `NEXT_PUBLIC_SERVER_URL` | Payload's own base URL — self-reference, used internally (e.g. `serverURL` in admin config, OG image generation, internal sub-requests via `getServerSideURL()`). **Confirmed empty in production this session**, causing `serverURL` and OG image URLs to fall back to `localhost:3000` in live responses. Fixed: set to `https://payload-poc-xi.vercel.app` (no trailing slash) and confirmed via `getServerSideURL()`'s `VERCEL_PROJECT_PRODUCTION_URL` fallback already being in place as a safety net. **This is unrelated to the login CORS bug in §1.1** — this var is about payload-poc's self-reference, not about apir-tayo calling payload-poc. |

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
                    ↓ confirmed: PATCH/POST + audit log
```

### 5.2 Session cookies
| Cookie | Value | Set by |
|---|---|---|
| `portal_token` | Payload JWT | `POST /api/portal/session` in apir-tayo |
| `portal_tenant_id` | Tenant ID (resolved from PortalClient.tenant) | same |

Key detail: Payload returns the tenant relationship as a nested object on login. The session route handles both `typeof user.tenant === 'object' ? user.tenant.id : user.tenant`.

### 5.3 Agent capabilities

The agent supports **16 actions** across 5 collections:

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

| Action | Required fields | Optional fields |
|---|---|---|
| `add_faq` | `question`, `answer` | — |
| `add_testimonial` | `name`, `quote` | `position` |
| `add_portfolio_item` | `title`, `category` | `url` |
| `add_pricing_plan` | `label`, `price` | `description`, `features` (comma-separated → items array) |

**Schema changes made for Phase 9:**
- `PricingPlans.ts` — added `price` (number, required) and `description` (textarea, optional) fields
- `Testimonials.ts` — changed `image` from `required: true` → `required: false`
- `PortfolioItems.ts` — changed `image` and `url` from `required: true` → `required: false`

**What the agent cannot do (enforced at route level):**
- Delete records
- Create new records for Posts or Pages
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

**Create flow (sequential, step-by-step — current working mode):**
```
Client: "Add a new FAQ"
Agent:  → "What should the question be?"
Client: "How do I get started?"
Agent:  → "What should the answer be?"
Client: "Contact us via email and we'll reply within 24 hours."
Agent:  → proposal: question + answer
Client: "confirm"
Agent:  → executes POST → writes AgentAuditLog → returns success
```

**Create flow (full-prompt — confirmed working, Phase 10):**
```
Client: "Add a FAQ, question is 'How do I get started?' and answer is 'Contact us via email.'"
Agent:  → pre-fills both fields from the structured `fields` map → goes straight to proposal
         → confirmed working for FAQs, testimonials (incl. optional position),
            portfolio items (incl. optional url), and pricing plans (incl.
            comma-separated features → items array)
         → step-by-step flow still works as fallback when no values are provided
```

**Image upload flow:**
```
Client: attaches image file + types "attach this to the Testing testimonial"
ChatWindow: POSTs file to /api/portal/upload → gets mediaId back
Agent:  → list_testimonials → client picks → link_image proposal
Client: "confirm"
Agent:  → PATCHes image field → writes audit log
```

**Cancellation during awaiting_fields:**
```
Client: "Add a new FAQ"
Agent:  → "What should the question be?"
Client: "Update a testimonial"   ← command verb detected
Agent:  → "Previous request cancelled." → processes as fresh command
         No partial record created.
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

### 5.7 `awaiting_fields` state machine (Phase 9)

The create flow uses a new multi-turn state machine parallel to the existing `awaiting_value` and `awaiting_selection` states.

**Backend (`src/app/api/agent/shared.ts`):**
- `CREATE_FIELD_DEFS` — field definitions (required/optional/labels) per create action
- `initCreateFlow()` — entry point when a create action is first detected; pre-fills any fields already in `parsed.value`, returns first missing required field prompt
- `advanceFieldCollection()` — called on each round-trip; merges new value into `collected`, tracks skipped optional fields via `_skippedOptional` sentinel, finds next missing field
- `executeCreate()` — called when all required fields are collected; strips `_skippedOptional` from POST body, POSTs to Payload, writes audit log
- `handleAwaitingFieldsRoundTrip()` — orchestrates round-trips between the above

**Frontend (`useChatSession.ts`):**
- `awaitingFields` state: `{ action, field, collected, prompt } | null`
- 6th response chain (after the existing 5): fires when `awaitingFields` is non-null and the message is not a command verb
- Command-cancellation heuristic: if message starts with `update|add|create|new|list|change|edit|delete` or matches a `SUGGESTION_CHIPS` label, clears `awaitingFields` and falls through to cancel block + normal send
- `awaiting_fields` handler added to ALL 5 existing chains (previously only 3 had it — caused raw JSON for portfolio/pricing)

**Optional field handling:**
- Client types "skip" (case-insensitive, trimmed) for an optional field
- Field is added to `_skippedOptional` sentinel in `collected`, NOT stored as the string "skip"
- `_skippedOptional` is forwarded on every subsequent round-trip so skipped fields are never re-asked
- `_skippedOptional` is deleted from the POST body before sending to Payload

### 5.8 Conversation-quality fixes (Phase 8, partially complete)

**`awaiting_value` guard (done):** Agent no longer surfaces raw errors when a required field is missing. Returns a plain-language clarifying question instead.

**Known wording issue (flagged, not yet fixed):** The clarifying question phrasing (e.g. *"What should the new question be for 'Is this custom?'?"*) reads like a code-variable substitution. Confirmed confusing in manual testing. See §7 for the planned rewrite.

**FAQ "which field" step (specified, not yet run):** After selecting an FAQ record, the agent always asks for the question field by default. No way to update the answer field or both. Prompt in §7.

**Safety net (specified, not yet implemented):** Defensive catch in `apir-tayo`'s `app/api/portal/agent/route.ts` for any raw/unexpected error from payload-poc. Prompt in §7.

---

## 6. Key Files Reference

### In apir-tayo (`/Users/josh/work/apir-tayo`)
| File | Role |
|---|---|
| `middleware.ts` | Protects `/portal/chat` — redirects to `/portal/login` if `portal_token` absent |
| `app/(portal)/layout.tsx` | Minimal portal layout, no main site nav |
| `app/(portal)/portal/login/page.tsx` | Login form → Payload auth → session cookies → redirect |
| `app/(portal)/portal/chat/page.tsx` | Server component — reads cookies, resolves tenant name AND site name/slug, renders ChatWindow with both |
| `app/(portal)/portal/chat/ChatWindow.tsx` | Thin orchestrator (~80 lines) — owns top-level state, composes all child components and hooks; passes `awaitingFields` to `MessageInput` |
| `app/api/portal/session/route.ts` | `DELETE` clears cookies (logout, still used by `ChatWindow.tsx`). `POST` (cookie-setter) is now dead code — login no longer calls it. Not yet removed. |
| `app/api/portal/login/route.ts` | **New (this session).** Server-side login proxy — receives `{ email, password }`, server-side `fetch()`s payload-poc's `/api/portal-clients/login` using server-only `PAYLOAD_API_URL`, resolves tenantId, sets `portal_token`/`portal_tenant_id` httpOnly cookies, returns generic error on failure. Replaces the old direct-browser-to-payload-poc call that caused a CORS failure in production. |
| `app/api/portal/agent/route.ts` | Proxy — reads cookies, forwards `{ message, tenantId, confirmed, proposal, awaitingFields }` to payload-poc |
| `app/api/portal/upload/route.ts` | Image upload proxy — forwards file + tenantId to payload-poc agent-upload |
| `app/lib/payload/fetchPayload.ts` | Homepage fetch helper |
| `app/lib/payload/payload-types.ts` | TypeScript interfaces for Payload collections |
| `app/lib/portal/agentCapabilities.ts` | Single source of truth — `AGENT_CAPABILITIES`, `HELP_ITEMS`, `CANNOT_ITEMS`, `SUGGESTION_CHIPS` (includes 4 create actions; "Create new records (coming soon)" removed) |
| `app/(portal)/portal/chat/types.ts` | Shared `Message`, `ProposalPayload`, `SelectionContext`, `AwaitingFieldsContext` interfaces |
| `app/(portal)/portal/chat/components/ChatHeader.tsx` | Site name (primary) + tenant name (secondary) + header buttons |
| `app/(portal)/portal/chat/components/ChatEmptyState.tsx` | Site-aware "You're managing {siteName}" panel, capability summary, suggestion chips |
| `app/(portal)/portal/chat/components/CapabilitiesModal.tsx` | "What can I do?" modal |
| `app/(portal)/portal/chat/components/MessageList.tsx` | Scrollable message history + loading indicator |
| `app/(portal)/portal/chat/components/MessageInput.tsx` | Text input, attach button, send button; `awaitingFields` prop drives placeholder text |
| `app/(portal)/portal/chat/components/ProposalConfirmation.tsx` | Confirm/cancel bar — unchanged, works for both updates and creates |
| `app/(portal)/portal/chat/hooks/useChatSession.ts` | All agent API calls — 6 response chains: awaiting-value, awaiting-field, awaiting-fields (new), selection-resolution, confirmation, normal-send |
| `app/(portal)/portal/chat/hooks/useImageUpload.ts` | File selection, preview, upload to `/api/portal/upload` |

### In payload-poc (`/Users/josh/work/payload-poc`)
| File | Role |
|---|---|
| `src/collections/PortalClients.ts` | Auth-enabled collection — email, password, tenant relationship |
| `src/collections/AgentAuditLog.ts` | Immutable audit log — tenant, action, collection, documentId, slug, previousValue, newValue, confirmedAt |
| `src/collections/PricingPlans.ts` | Added `price` (number, req) and `description` (textarea, opt) in Phase 9 |
| `src/collections/Testimonials.ts` | `image` changed to `required: false` in Phase 9 |
| `src/collections/PortfolioItems.ts` | `image` and `url` changed to `required: false` in Phase 9 |
| `src/app/api/agent/route.ts` | Orchestration shell — parses body, gets token, calls DeepSeek, delegates to action handlers; includes `awaiting_fields` path |
| `src/app/api/agent/types.ts` | `ParsedAction`, `ProposalPayload`, `SelectionRecord`, `AwaitingFieldsResponse`, `AwaitingFieldsRequest`, `CreateFieldDef` interfaces |
| `src/app/api/agent/prompts.ts` | `SYSTEM_PROMPT` — includes create action section for 4 new add_ actions |
| `src/app/api/agent/deepseek.ts` | `callDeepSeek()` — calls DeepSeek API, strips fences, parses + validates JSON |
| `src/app/api/agent/resolver.ts` | `resolveSlugToId()`, `resolveRecordTenant()`, `fetchTenantRecords()` |
| `src/app/api/agent/shared.ts` | `awaiting_value` guard + full `awaiting_fields` state machine: `CREATE_FIELD_DEFS`, `initCreateFlow()`, `advanceFieldCollection()`, `executeCreate()`, `handleAwaitingFieldsRoundTrip()` |
| `src/app/api/agent/audit.ts` | `writeAuditLog()` |
| `src/app/api/agent/actions/shared.ts` | `patchRecord()`, `patchWithRetry()`, `postRecord()`, `createWithRetry()`, `getTenantSiteId()` (POC assumption: one site per tenant) |
| `src/app/api/agent/actions/posts.ts` | `update_post_title`, `update_page_title` |
| `src/app/api/agent/actions/faqs.ts` | `update_faq_question`, `update_faq_answer`, `handleCreateFaq()` |
| `src/app/api/agent/actions/testimonials.ts` | `update_testimonial_*`, `handleCreateTestimonial()` |
| `src/app/api/agent/actions/portfolio.ts` | `update_portfolio_*`, `handleCreatePortfolio()` |
| `src/app/api/agent/actions/pricing.ts` | New file — `handlePricing()` with features→items transform, price string→float coercion |
| `src/app/api/agent/actions/images.ts` | `link_image` handler |
| `src/app/api/agent/actions/list.ts` | `list_faqs`, `list_testimonials`, `list_portfolio_items` |
| `src/app/api/agent-upload/route.ts` | Accepts multipart file + tenantId, uploads to Payload media, returns `{ mediaId, url }` |
| `src/utilities/resolveSite.ts` | Resolves Site slug ↔ ID |
| `src/utilities/payloadAuth.ts` | `getAgentToken()`, `clearAgentToken()` |

---

## 7. Remaining Work

### Phase 10 — Full-prompt support for create actions — ✅ Confirmed working this session

**Status update:** Confirmed working via manual chat testing in production (post-login-fix). Tested and passed:
- `"Add a FAQ, question is 'X' and answer is 'Y'"` → straight to proposal, no field prompts
- Testimonial with name + quote pre-filled, optional `position` either omitted cleanly or asked once
- Portfolio item with/without optional `url`
- Pricing plan with comma-separated `features` parsed into items array, and with only required fields
- Step-by-step flow (no values in initial message) still works as fallback — regression-checked, not broken by the full-prompt change

**Not independently re-verified this session (carry forward as open questions for next session if it matters):**
- Whether DeepSeek's extraction is reliable across a *wide* range of real-world phrasings, or just the specific test phrasings used — only a handful of messages were tested, not an exhaustive phrasing sweep
- Whether the underlying code change matches the original spec exactly (structured `fields` map in `ParsedAction`, `initCreateFlow()` reading from it) — this session verified *behavior* via chat testing, not by reading the diff. Worth a quick code review next session if anyone wants to extend this pattern (e.g. to update actions) to confirm the implementation is reusable rather than a one-off.

**Original problem/spec (kept for reference — implementation should now reflect this):**

Real clients will not send fields one by one. They will send messages like:

```
"Add a FAQ, question is 'How do I get started?' and answer is 'Contact us via email.'"
"Add a testimonial from Maria Santos, CEO of SantasCo: 'High6 transformed our online presence.'"
"Add a pricing plan called Enterprise at $299.99 with features: Unlimited pages, Dedicated manager, 24/7 support"
```

The fix instructs DeepSeek to return a structured `fields` object (not a single freeform `value` string) for create actions, and `initCreateFlow()` reads from `parsed.fields`, merging pre-filled values into `collected` before deciding what to ask for — skipping straight to proposal if all required fields are already present.

**Files changed:** `src/app/api/agent/prompts.ts`, `src/app/api/agent/shared.ts`, `src/app/api/agent/types.ts` (per original spec — not re-confirmed by direct code review this session, see above).

---

### Phase 8 — Remaining conversation quality fixes (status unconfirmed this session — re-verify first)

| Item | Priority | Status |
|---|---|---|
| FAQ "which field" step (question/answer/both) | High | **Specified, not yet run.** Prompt below. |
| Natural-language wording rewrite for clarifying questions | High | **Specified, not yet run.** Bundled into same prompt below. |
| Defensive error-message catch in apir-tayo | Medium | **Specified, not yet run.** Prompt below. |

**Recommendation:** Phase 10 (full-prompt support) is now confirmed working, so the next priority is the Phase 8 wording/field-selection fixes — these were specified but their implementation status was not re-checked this session. **Start next session by re-testing the FAQ update flow** (does it ask "question, answer, or both?" yet, or still default to question-only with the old confusing wording?) before assuming the prompts below still need to be run — they may have landed silently, or may still be fully pending. Either way, this is the last blocker before the Sir Jeff escalation.

**Next prompt to run (payload-poc) — FAQ field selection + wording:**
> Add a "which field" step to the FAQ update flow, building on the working `awaiting_value` guard. After a client selects an FAQ record, the agent should ask "Would you like to update the question, the answer, or both?" before asking for the new value (currently it always defaults to asking for the new question text, with no way to choose the answer). If "both," collect the new question first, then the new answer, as two separate turns — not a combined prompt. Also rewrite the clarifying-question wording everywhere it's used: replace the current pattern ("What should the new question be for 'Is this custom?'?" — confirmed confusing to a real client in manual testing, reads like a code variable substitution) with natural phrasing like "What would you like the question to say instead?" with no repeated quoted old value. Scope this to FAQs only for now (faqs.ts); testimonials/portfolio/posts can follow the same pattern later as a separate task. Verify by testing the full flow manually and pasting the actual rendered chat messages, not just describing the code change.

**Safety-net prompt to run (apir-tayo):**
> Add a defensive guard in `app/api/portal/agent/route.ts` (or wherever the agent response is rendered) so that any non-2xx or error-shaped response from payload-poc is replaced with a generic friendly fallback ("Something went wrong on my end — could you try rephrasing that?") before reaching the client — regardless of what causes the error. Log the real error server-side. This is independent of the payload-poc-side fixes above; it's a safety net for any future error shape, known or unknown.

---

### Portal — other next steps
| Item | Priority | Notes |
|---|---|---|
| FAQ "which field" + wording fix | 🔴 High | **Next session — start here.** From Phase 8, status unconfirmed this session — re-test before re-running the fix prompt. Needed before Sir Jeff demo. |
| Escalate to Sir Jeff | 🔴 High | After wording fix confirmed (full-prompt support already landed). Portal is otherwise POC-ready. |
| Defensive error catch in apir-tayo | 🟡 Medium | Safety net — run after wording fix. Note: a *different* error-message gap was found this session in the new login route (`app/api/portal/login/route.ts` returns one generic message for all failure types — bad credentials, account lockout, payload-poc downtime). Consider whether to fix both in the same pass. |
| Remove dead `POST` handler in `app/api/portal/session/route.ts` | 🟢 Low | Now dead code after the login proxy fix (this session). `DELETE` handler still used for logout — don't remove the whole file. |
| Audit other `NEXT_PUBLIC_*`-prefixed env vars for accidental direct-browser-to-payload-poc calls | 🟡 Medium | The login CORS bug (this session) was caused by a `NEXT_PUBLIC_` var being used for a server-side-appropriate call. `NEXT_PUBLIC_PAYLOAD_API_URL` is still legitimately used client-side for media URLs in `TestimonialsSection.tsx`/`PortfolioSection.tsx` — that's fine — but worth a quick scan for any other place a `NEXT_PUBLIC_` var might be used for something that should be proxied. |
| On-demand revalidation | 🟡 Medium | Clients expect instant content changes, not 60s ISR delay. Use `revalidateTag`/`revalidatePath` webhook from Payload. |
| AGENT_EMAIL role restrictions | 🟡 Medium | Service account has broader Payload access than needed. Lock down to agent-used collections only. |
| Extend "which field" to testimonials/portfolio | 🟢 Low | After FAQ pattern confirmed working. |
| Lexical rich text fields | 🟢 Low | Hero text etc. use Payload Lexical JSON node structure — plain string patches won't work. Deferred. |
| Delete records via agent | 🟢 Low | Out of scope for POC. Needs separate confirmation UX. |

### Known gaps
- **`getTenantSiteId()` assumes one site per tenant** — documented with a comment in `actions/shared.ts`. Will break for multi-site tenants. POC-only assumption.
- **No type safety at the API boundary** — `fetchFromPayload` uses a type assertion. Run `pnpm generate:types` in payload-poc and sync generated types to apir-tayo for full safety.
- **`PAYLOAD_TENANT_SLUG` in CLAUDE.md is unused** — references a variable the code doesn't use. Should be cleaned up.
- **CI/CD does not inject Payload vars** — Hostinger VPS pipeline missing Payload env vars in build step. Lower priority while Vercel is active deploy path.
- **Cancellation behavior on `awaiting_value` not explicitly re-verified** — confirmed for `awaiting_selection`; not re-tested this session for `awaiting_value` specifically.
- **Diagnostic `console.log` left in `executeCreate()`** — added in Phase 9 for debugging. Should be removed or replaced with proper structured logging before production.
- **Login route error messages are not differentiated** (new, this session) — `app/api/portal/login/route.ts` returns the same generic "Login failed. Please check your credentials." for bad credentials, account lockout, and payload-poc downtime alike. Not a correctness bug, just a UX gap — flagged but not fixed this session.
- **`app/api/portal/session/route.ts`'s `POST` handler is dead code** (new, this session) — superseded by `app/api/portal/login/route.ts`. The `DELETE` handler is still live (logout). Not removed yet — low priority, harmless.

### Future Phases — Agent Setup in Payload
The current AI agent configuration is fully hardcoded — the model (DeepSeek), API key, system prompt, and supported actions are all defined in code. Future phases should introduce an **Agent Setup interface within Payload admin** to allow configuration without code changes.

| Item | Notes |
|---|---|
| AI provider management | Switch between DeepSeek, OpenAI, Anthropic, etc. via admin UI — no code deploy needed |
| API key management | Store and rotate provider API keys through Payload admin instead of `.env` |
| System prompt editor | Allow content managers to tune agent behavior and tone per tenant |
| Supported actions config | Enable/disable specific agent actions (e.g. image linking, FAQ updates) per site |
| Per-tenant agent config | Different tenants could have different models, prompts, or capability sets |

### Homepage — remaining hardcoded sections
| Section | Notes |
|---|---|
| HeroSection | Would need a Payload Global or collection |
| WhyOnePageSection | Feature list — could be a collection |
| HowItWorksSection | Step-by-step — could be a collection |
| TrustSection | Client logos/stats |
| CTASection | Single CTA block — could be a Global |
| Footer | Links and copyright — could be a Global |

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
| Phase 3 — Wire Agent to Tenant | Agent route accepts `{ message, tenantId }`, slug resolution removed | ✅ Complete |
| Phase 4 — Guardrails | Dry-run/confirm flow, AgentAuditLog collection, disclaimer banner | ✅ Complete |
| Phase 5 — Capability Expansion | 12 actions, image upload, tenant name in header, capabilities panel | ✅ Complete |
| Phase 6 — Smart Record Resolution | List actions, numbered selection UX, `[resolved id]` convention, RESOLVE_NEEDED removed | ✅ Complete |
| Refactor — Agent Modularity | route.ts split into 10 focused modules under `src/app/api/agent/` | ✅ Complete |
| Phase 7 — UAT + Smoke Test Fixes | Media upload tenant ID fix, name-as-ID resolution, link_image misfire guard, ID scrub from client messages | ✅ Complete |
| Phase 8 — Conversation Quality + Capability Messaging | Site-aware empty state/header, shared capabilities source, ChatWindow refactor, `awaiting_value` guard | 🔶 Partial — FAQ field-selection + wording rewrite and apir-tayo safety-net catch still pending |
| Phase 9 — Create Records | `add_faq`, `add_testimonial`, `add_portfolio_item`, `add_pricing_plan` — sequential `awaiting_fields` state machine, skip handling, command-cancellation heuristic, all 4 flows confirmed working | ✅ Complete (step-by-step only) |
| Phase 10 — Full-prompt support | Parse all field values from a single natural-language message; skip field prompts for pre-filled fields | ✅ Confirmed working via manual chat testing — code-level review not done this session, see §7 |
| Production Fixes (this session) | Fixed production login CORS failure via new server-side proxy (`/api/portal/login`) in apir-tayo; confirmed payload-poc's earlier `getServerSideURL()` self-reference fix is in place and necessary | ✅ Complete — see §1.1 |
| Phase 11 — Sir Jeff Escalation | Present full portal flow, get sign-off | ⏳ Blocked on Phase 8 wording fix only (status unconfirmed — re-check first) |
| Future — Agent Setup in Payload | Payload admin UI for AI provider, API keys, system prompt, supported actions per tenant | 🔜 Planned |
