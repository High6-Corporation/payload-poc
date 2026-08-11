# Payload CMS Integration — Handoff Document

> **Branch:** `feat/payload-cms`
> **Date:** June 2026 (updated post–Phase 9 create-records implementation)
> **Summary:** Wired the Apirtayo Next.js frontend to an external Payload CMS for dynamic homepage content. Both repos are deployed to Vercel. The AI Agent client portal is fully implemented through Phase 9, which added create-record support across all 4 collections (FAQs, Testimonials, Portfolio Items, Pricing Plans) via a sequential `awaiting_fields` multi-turn state machine. All create flows are working via step-by-step prompting. The next priority (Phase 10) is full-prompt support — clients are expected to send all field values in a single message (e.g. "Add a FAQ, question is X, answer is Y") and the agent should parse and pre-fill all provided fields rather than asking for them one by one. DeepSeek currently does not reliably extract multi-field values from a single message; the SYSTEM_PROMPT needs a structured extraction pass before the `awaiting_fields` flow begins. Future phases will include the Phase 8 wording fixes (still pending), Sir Jeff escalation, and an Agent Setup interface in Payload.

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
- **AI Agent client portal fully implemented** — Phases 1–9 complete (see §5)
- **Portal login lives within the same frontend URL** (`/portal/login`) — kept there intentionally to reduce complexity and speed up evaluation
- **Smoke test bugs resolved** — media upload tenant ID coercion, record name-as-ID resolution, `link_image` DeepSeek misfire, raw IDs scrubbed from all client-facing messages
- **Portal capability messaging shipped (Phase 8)** — empty-state chat panel and header are now site-aware (resolved dynamically, no hardcoded site name), capability list is a single shared source of truth (`app/lib/portal/agentCapabilities.ts`) used by both the empty state and the "What can I do?" modal
- **ChatWindow.tsx refactored** — split from ~1,380 lines into a thin orchestrator + focused components (`ChatHeader`, `ChatEmptyState`, `CapabilitiesModal`, `MessageList`, `MessageInput`, `ProposalConfirmation`) and hooks (`useChatSession`, `useImageUpload`); pure structural refactor, no behavior change; build verified clean
- **`awaiting_value` guard added** — agent no longer attempts an update action with a missing required field and surfaces a raw error/JSON to the client; it now asks a plain-text clarifying question instead. Confirmed working for the FAQ list-pick path.
- **Create-record support added (Phase 9)** — `add_faq`, `add_testimonial`, `add_portfolio_item`, `add_pricing_plan` actions implemented across both repos. Sequential `awaiting_fields` state machine collects one field per turn. All 4 flows confirmed working via step-by-step prompting. Full-prompt support (all fields in one message) is not yet implemented — see §7.

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

**Create flow (full-prompt — NOT YET SUPPORTED, next priority):**
```
Client: "Add a FAQ, question is 'How do I get started?' and answer is 'Contact us via email.'"
Agent:  → should pre-fill both fields and go straight to proposal
         → currently ignores the field values and asks for each one anyway
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
| `app/api/portal/session/route.ts` | POST sets cookies; DELETE clears (logout) |
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

### Phase 10 — Full-prompt support for create actions (next priority)

**The problem:** Real clients will not send fields one by one. They will send messages like:

```
"Add a FAQ, question is 'How do I get started?' and answer is 'Contact us via email.'"
"Add a testimonial from Maria Santos, CEO of SantasCo: 'High6 transformed our online presence.'"
"Add a pricing plan called Enterprise at $299.99 with features: Unlimited pages, Dedicated manager, 24/7 support"
```

Currently the agent ignores any field values provided in the initial message and asks for every field from scratch. DeepSeek's `initCreateFlow()` receives `parsed.value` from the initial message but does not reliably extract structured field values from natural language — it was designed for the sequential flow, not pre-fill.

**Root cause:** The SYSTEM_PROMPT create action section instructs DeepSeek to emit `{ "action": "add_faq", "value": "<any fields client provided>" }` — but `value` is a single string, not a structured map. `initCreateFlow()` attempts to use this string as a pre-fill hint, but there is no reliable parsing of "question is X and answer is Y" from a freeform string.

**What needs to change:**

1. **SYSTEM_PROMPT** (`prompts.ts`) — For create actions, instruct DeepSeek to return a structured `fields` object instead of (or in addition to) `value`:
   ```json
   {
     "action": "add_faq",
     "fields": {
       "question": "How do I get started?",
       "answer": "Contact us via email."
     }
   }
   ```
   DeepSeek should extract as many fields as it can confidently parse from the message. Any fields not mentioned remain absent from `fields` (not null — absent, so `initCreateFlow` knows to ask for them).

2. **`initCreateFlow()` in `shared.ts`** — Read from `parsed.fields` (structured map) instead of `parsed.value` (freeform string). Merge pre-filled fields into `collected` before deciding the first field to ask for. If all required fields are already in `parsed.fields`, skip directly to proposal.

3. **`types.ts`** — Add `fields?: Record<string, string>` to `ParsedAction` to carry the structured pre-fill map.

**Acceptance criteria:**
- `"Add a FAQ, question is 'X', answer is 'Y'"` → straight to proposal, no field prompts
- `"Add a FAQ about pricing"` (no values) → asks for question, then answer as before
- `"Add a testimonial from Maria Santos: 'quote text'"` → pre-fills name + quote, asks only for position (or skips to proposal if position omitted)
- `"Add a pricing plan called Enterprise at $299.99 with features: A, B, C"` → pre-fills label, price, features; asks only for description (or skips)
- Step-by-step flow (no values in initial message) still works exactly as before

**Files to change:** `src/app/api/agent/prompts.ts`, `src/app/api/agent/shared.ts`, `src/app/api/agent/types.ts`

**Note:** This is a prompt-engineering task as much as a code task. The SYSTEM_PROMPT change needs to be tested with several real-world phrasings to verify DeepSeek extracts fields correctly. Paste actual rendered chat messages in verification, not just code descriptions.

---

### Phase 8 — Remaining conversation quality fixes (still pending)

| Item | Priority | Status |
|---|---|---|
| FAQ "which field" step (question/answer/both) | High | **Specified, not yet run.** Prompt below. |
| Natural-language wording rewrite for clarifying questions | High | **Specified, not yet run.** Bundled into same prompt below. |
| Defensive error-message catch in apir-tayo | Medium | **Specified, not yet run.** Prompt below. |

**Recommendation:** Run the Phase 10 full-prompt support first (higher UX impact), then come back to the Phase 8 wording fixes before the Sir Jeff escalation. The wording issue would be visible in a live demo.

**Next prompt to run (payload-poc) — FAQ field selection + wording:**
> Add a "which field" step to the FAQ update flow, building on the working `awaiting_value` guard. After a client selects an FAQ record, the agent should ask "Would you like to update the question, the answer, or both?" before asking for the new value (currently it always defaults to asking for the new question text, with no way to choose the answer). If "both," collect the new question first, then the new answer, as two separate turns — not a combined prompt. Also rewrite the clarifying-question wording everywhere it's used: replace the current pattern ("What should the new question be for 'Is this custom?'?" — confirmed confusing to a real client in manual testing, reads like a code variable substitution) with natural phrasing like "What would you like the question to say instead?" with no repeated quoted old value. Scope this to FAQs only for now (faqs.ts); testimonials/portfolio/posts can follow the same pattern later as a separate task. Verify by testing the full flow manually and pasting the actual rendered chat messages, not just describing the code change.

**Safety-net prompt to run (apir-tayo):**
> Add a defensive guard in `app/api/portal/agent/route.ts` (or wherever the agent response is rendered) so that any non-2xx or error-shaped response from payload-poc is replaced with a generic friendly fallback ("Something went wrong on my end — could you try rephrasing that?") before reaching the client — regardless of what causes the error. Log the real error server-side. This is independent of the payload-poc-side fixes above; it's a safety net for any future error shape, known or unknown.

---

### Portal — other next steps
| Item | Priority | Notes |
|---|---|---|
| Full-prompt support for create actions | 🔴 High | **Next session.** See §7 above for full spec and prompt. |
| FAQ "which field" + wording fix | 🔴 High | Still pending from Phase 8 — needed before Sir Jeff demo. |
| Escalate to Sir Jeff | 🔴 High | After full-prompt + wording fix land. Portal is otherwise POC-ready. |
| Defensive error catch in apir-tayo | 🟡 Medium | Safety net — run after wording fix. |
| On-demand revalidation | 🟡 Medium | Clients expect instant content changes, not 60s ISR delay. Use `revalidateTag`/`revalidatePath` webhook from Payload. |
| AGENT_EMAIL role restrictions | 🟡 Medium | Service account has broader Payload access than needed. Lock down to agent-used collections only. |
| Extend "which field" to testimonials/portfolio | 🟢 Low | After FAQ pattern confirmed working. |
| Lexical rich text fields | 🟢 Low | Hero text etc. use Payload Lexical JSON node structure — plain string patches won't work. Deferred. |
| Delete records via agent | 🟢 Low | Out of scope for POC. Needs separate confirmation UX. |

### Known gaps
- **Full-prompt create not supported** — all field values must be entered one turn at a time. Real clients will send everything in one message and expect it to work. This is the most impactful missing feature.
- **`getTenantSiteId()` assumes one site per tenant** — documented with a comment in `actions/shared.ts`. Will break for multi-site tenants. POC-only assumption.
- **No type safety at the API boundary** — `fetchFromPayload` uses a type assertion. Run `pnpm generate:types` in payload-poc and sync generated types to apir-tayo for full safety.
- **`PAYLOAD_TENANT_SLUG` in CLAUDE.md is unused** — references a variable the code doesn't use. Should be cleaned up.
- **CI/CD does not inject Payload vars** — Hostinger VPS pipeline missing Payload env vars in build step. Lower priority while Vercel is active deploy path.
- **Cancellation behavior on `awaiting_value` not explicitly re-verified** — confirmed for `awaiting_selection`; not re-tested this session for `awaiting_value` specifically.
- **Diagnostic `console.log` left in `executeCreate()`** — added in Phase 9 for debugging. Should be removed or replaced with proper structured logging before production.

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
| Phase 10 — Full-prompt support | Parse all field values from a single natural-language message; skip field prompts for pre-filled fields | 🔜 Next session — spec in §7 |
| Phase 11 — Sir Jeff Escalation | Present full portal flow, get sign-off | ⏳ After Phase 10 + Phase 8 wording fix |
| Future — Agent Setup in Payload | Payload admin UI for AI provider, API keys, system prompt, supported actions per tenant | 🔜 Planned |
