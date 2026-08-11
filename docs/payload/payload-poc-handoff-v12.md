# Payload CMS Integration — Handoff Document

> **Branch:** `feat/payload-cms`
> **Date:** June 2026 (updated post–Phase 8 conversation-quality pass)
> **Summary:** Wired the Apirtayo Next.js frontend to an external Payload CMS for dynamic homepage content. Both repos are deployed to Vercel. The AI Agent client portal is fully implemented through Phase 7, and this session (Phase 8) focused on making the agent conversation itself clearer and more robust: site-aware capability messaging in the portal UI, a structural refactor of the 1.4k-line ChatWindow component, and fixing a conversation-flow gap where the agent attempted updates with missing required fields instead of asking the client for them. One fix (FAQ field selection: question/answer/both) is specified but not yet implemented — see §7 for the exact next prompt to run. Future phases will include an Agent Setup interface within Payload for managing AI configuration (model, API keys, system prompt, supported actions) without code changes.

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
- **AI Agent client portal fully implemented** — Phases 1–7 complete (see §5)
- **Portal login lives within the same frontend URL** (`/portal/login`) — kept there intentionally to reduce complexity and speed up evaluation
- **Smoke test bugs resolved** — media upload tenant ID coercion, record name-as-ID resolution, `link_image` DeepSeek misfire, raw IDs scrubbed from all client-facing messages
- **Portal capability messaging shipped (Phase 8)** — empty-state chat panel and header are now site-aware (resolved dynamically, no hardcoded site name), capability list is a single shared source of truth (`app/lib/portal/agentCapabilities.ts`) used by both the empty state and the "What can I do?" modal
- **ChatWindow.tsx refactored** — split from ~1,380 lines into a thin orchestrator + focused components (`ChatHeader`, `ChatEmptyState`, `CapabilitiesModal`, `MessageList`, `MessageInput`, `ProposalConfirmation`) and hooks (`useChatSession`, `useImageUpload`); pure structural refactor, no behavior change; build verified clean
- **`awaiting_value` guard added** — agent no longer attempts an update action with a missing required field and surfaces a raw error/JSON to the client; it now asks a plain-text clarifying question instead. Confirmed working for the FAQ list-pick path.

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

### 5.7 Conversation-quality fixes (Phase 8, this session)

**Problem found:** A real client used the most natural possible phrasing — clicked a suggestion chip / typed "Update a FAQ," picked a record from the numbered list, and stopped there (no instruction on what to change it to). This is the *expected* primary path, not an edge case. The agent had no guard for "record resolved, but the required `value` field is empty" — it attempted the `update_faq_question` action anyway, which failed, and the raw error string `Missing "id" or "value" for action update_faq_question` was shown directly to the client.

**Fix — `awaiting_value` guard (done, confirmed working):**
- Added a code-level guard (not prompt-engineered) at the point where a parsed action is finalized, before being dispatched to the action handlers in `src/app/api/agent/actions/*.ts`.
- If the action's required field (typically `value`) is missing after resolution, the route now returns an `awaiting_value` status with a plain-language `prompt` string instead of calling the handler.
- This guard fires on **both** resolution paths that converge at the same point — confirmed in `shared.ts:197` (`!parsed.id || !parsed.value`) and mirrored in `posts.ts:79`:
  - **List-pick path:** client picks a number from `list_faqs` etc. → re-sent with `[resolved id: x]` → value still missing → guard fires
  - **Direct path:** client names a record unambiguously in one message (e.g. "update the FAQ about pricing") with no new value → guard fires at the same convergence point, no duplicate guard logic
- Client now sees a normal chat message asking for the missing value (e.g. *"What should the new question be for 'Is this custom?'?"*) instead of an error or raw JSON.

**Follow-up bug found and fixed:** The first version of this fix only worked on the "normal send" response chain in `useChatSession.ts`. ChatWindow's `handleSend` actually has **four separate response-processing chains** (normal send, selection-resolution, awaiting-value round-trip, confirmation), and only one had `awaiting_value` handling — the selection-resolution chain fell through to a raw `JSON.stringify(data)` display. Fixed by adding the same `awaiting_value` handler to the selection-resolution chain (`useChatSession.ts:235`). Confirmed working end-to-end via manual test: list-pick → plain-text clarifying question (no JSON, no error).

**Known wording issue (flagged, not yet fixed):** The clarifying question's phrasing — *"What should the new question be for 'Is this custom?'?"* — repeats the field name and old value back in a way that reads like a code-shaped variable substitution rather than a natural question. Confirmed confusing in manual testing. See §7 for the planned rewrite + the related "which field" feature gap (FAQs only ask about the `question` field by default; there's no way to choose to update the `answer` field, or both).

**Safety net (specified, not yet implemented):** A defensive catch in `apir-tayo`'s `app/api/portal/agent/route.ts` so that *any* future raw/unexpected error response from payload-poc is replaced with a generic friendly fallback before reaching the client, independent of whatever payload-poc-side guards exist. Prompt for this is in §7.

---

## 6. Key Files Reference

### In apir-tayo (`/Users/josh/work/apir-tayo`)
| File | Role |
|---|---|
| `middleware.ts` | Protects `/portal/chat` — redirects to `/portal/login` if `portal_token` absent |
| `app/(portal)/layout.tsx` | Minimal portal layout, no main site nav |
| `app/(portal)/portal/login/page.tsx` | Login form → Payload auth → session cookies → redirect |
| `app/(portal)/portal/chat/page.tsx` | Server component — reads cookies, resolves tenant name AND site name/slug (new `fetchSiteName()`, calls `GET {PAYLOAD_API_URL}/api/sites/{PAYLOAD_SITE_ID}`), renders ChatWindow with both |
| `app/(portal)/portal/chat/ChatWindow.tsx` | Thin orchestrator (~80 lines, refactored from ~1,380) — owns top-level state, composes header/empty-state/message-list/input/modal components and the two session hooks below |
| `app/api/portal/session/route.ts` | POST sets cookies; DELETE clears (logout) |
| `app/api/portal/agent/route.ts` | Proxy — reads cookies, forwards `{ message, tenantId, confirmed, proposal }` to payload-poc |
| `app/api/portal/upload/route.ts` | Image upload proxy — forwards file + tenantId to payload-poc agent-upload |
| `app/lib/payload/fetchPayload.ts` | Homepage fetch helper |
| `app/lib/payload/payload-types.ts` | TypeScript interfaces for Payload collections |
| `app/lib/portal/agentCapabilities.ts` | Single source of truth for agent capabilities — `AGENT_CAPABILITIES`, `HELP_ITEMS`, `CANNOT_ITEMS`, `SUGGESTION_CHIPS` |
| `app/(portal)/portal/chat/types.ts` | Shared `Message`, `ProposalPayload`, `SelectionContext` interfaces |
| `app/(portal)/portal/chat/components/ChatHeader.tsx` | Site name (primary) + tenant name (secondary) + header buttons |
| `app/(portal)/portal/chat/components/ChatEmptyState.tsx` | Site-aware "You're managing {siteName}" panel, capability summary, suggestion chips |
| `app/(portal)/portal/chat/components/CapabilitiesModal.tsx` | "What can I do?" modal, renders `HELP_ITEMS` / `CANNOT_ITEMS` |
| `app/(portal)/portal/chat/components/MessageList.tsx` | Scrollable message history + loading indicator |
| `app/(portal)/portal/chat/components/MessageInput.tsx` | Text input, attach button, send button, image preview bar |
| `app/(portal)/portal/chat/components/ProposalConfirmation.tsx` | Confirm/cancel bar shown during pending proposal |
| `app/(portal)/portal/chat/hooks/useChatSession.ts` | Messages, send/confirm/cancel logic, agent API calls (4 response chains: normal send, selection-resolution, awaiting-value round-trip, confirmation) |
| `app/(portal)/portal/chat/hooks/useImageUpload.ts` | File selection, preview, upload to `/api/portal/upload` |

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
| `src/app/api/agent/shared.ts` | Shared guard logic across action handlers — includes the new `awaiting_value` check (`!parsed.id \|\| !parsed.value`) at `shared.ts:197`, fires before dispatch on both list-pick and direct-resolution paths |
| `src/app/api/agent/audit.ts` | writeAuditLog() — POSTs to AgentAuditLog collection |
| `src/app/api/agent/actions/posts.ts` | update_post_title, update_page_title handlers; mirrors the `awaiting_value` guard at `posts.ts:79` |
| `src/app/api/agent/actions/faqs.ts` | update_faq_question, update_faq_answer handlers — **next session:** needs a "which field" step (question/answer/both) before requesting the new value, see §7 |
| `src/app/api/agent/actions/testimonials.ts` | update_testimonial_* handlers |
| `src/app/api/agent/actions/portfolio.ts` | update_portfolio_* handlers |
| `src/app/api/agent/actions/images.ts` | link_image handler |
| `src/app/api/agent/actions/list.ts` | list_faqs, list_testimonials, list_portfolio_items handlers |
| `src/app/api/agent-upload/route.ts` | Accepts multipart file + tenantId, uploads to Payload media, returns { mediaId, url } |
| `src/utilities/resolveSite.ts` | Resolves Site slug ↔ ID (used by homepage, not by agent) |
| `src/utilities/payloadAuth.ts` | getAgentToken(), clearAgentToken() — service account JWT management |

---

## 7. Remaining Work

### Conversation quality — next session priority (Phase 8 continued)
This is the most immediate, well-specified next chunk of work. The prompt below is ready to run as-is.

| Item | Priority | Status |
|---|---|---|
| FAQ "which field" step (question/answer/both) | High | **Specified, not yet run.** Prompt below. |
| Natural-language wording rewrite for clarifying questions | High | **Specified, not yet run.** Bundled into the same prompt below. |
| Defensive error-message catch in apir-tayo (`app/api/portal/agent/route.ts`) | Medium | **Specified, not yet run.** Safety net so raw backend errors never reach a client regardless of future payload-poc bugs. Prompt in next section. |
| Extend "which field" pattern to testimonials/portfolio/posts | Low | Deferred on purpose — confirm FAQ pattern works well first, then repeat for other collections as a separate task. |

**Next prompt to run (payload-poc) — FAQ field selection + wording:**
> Add a "which field" step to the FAQ update flow, building on the working `awaiting_value` guard. After a client selects an FAQ record, the agent should ask "Would you like to update the question, the answer, or both?" before asking for the new value (currently it always defaults to asking for the new question text, with no way to choose the answer). If "both," collect the new question first, then the new answer, as two separate turns — not a combined prompt. Also rewrite the clarifying-question wording everywhere it's used: replace the current pattern ("What should the new question be for 'Is this custom?'?" — confirmed confusing to a real client in manual testing, reads like a code variable substitution) with natural phrasing like "What would you like the question to say instead?" with no repeated quoted old value. Scope this to FAQs only for now (faqs.ts); testimonials/portfolio/posts can follow the same pattern later as a separate task. Verify by testing the full flow manually and pasting the actual rendered chat messages, not just describing the code change.

**Safety-net prompt to run (apir-tayo):**
> Add a defensive guard in `app/api/portal/agent/route.ts` (or wherever the agent response is rendered) so that any non-2xx or error-shaped response from payload-poc is replaced with a generic friendly fallback ("Something went wrong on my end — could you try rephrasing that?") before reaching the client — regardless of what causes the error. Log the real error server-side. This is independent of the payload-poc-side fixes above; it's a safety net for any future error shape, known or unknown.

### Portal — other next steps
| Item | Priority | Notes |
|---|---|---|
| UAT smoke tests | ✅ Done | Smoke tests completed — bugs resolved in earlier session |
| Capability messaging (site-aware empty state + header) | ✅ Done | Phase 8, this session — see §5.7 and Key Files |
| ChatWindow structural refactor | ✅ Done | Phase 8, this session — verified via `tsc`/build, not yet re-confirmed visually post-refactor by Josh |
| `awaiting_value` guard for missing required fields | ✅ Done | Confirmed working for FAQ list-pick path; direct-resolution path uses same shared guard, not separately re-tested |
| Escalate to Sir Jeff | High | Portal is POC-ready — present the full flow for sign-off. Consider waiting until the FAQ field-selection + wording fix lands, since the current clarifying-question phrasing would likely confuse Sir Jeff in a live demo the same way it did in testing. |
| On-demand revalidation | Medium | Clients expect content changes to appear instantly, not after the 60s ISR window. Use `revalidateTag` / `revalidatePath` webhook from Payload. Deprioritized but worth flagging in the Sir Jeff escalation. |
| AGENT_EMAIL role restrictions | Medium | Service account currently has broader Payload access than strictly needed. Lock down to only the collections the agent writes to. |
| Lexical rich text fields | Low | Hero text and similar fields use a specific JSON node structure — plain string patches won't work. Deferred; agent currently only handles text/title fields. |
| Create new records via agent | Low | Currently not supported. Would require add_faq, add_testimonial etc. actions across all 4 collections (FAQs, Testimonials, Portfolio, Pricing) per Josh's priority call. Not started — was next in line before the conversation-quality bug took priority. |
| Delete records via agent | Low | Out of scope for POC. Would need a separate confirmation UX pattern. |

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

### Known gaps
- **No type safety at the API boundary** — `fetchFromPayload` uses a type assertion. Run `pnpm generate:types` in payload-poc and sync the generated types to apir-tayo for full safety.
- **`PAYLOAD_TENANT_SLUG` in CLAUDE.md is unused** — references a variable the code doesn't use. Should be cleaned up.
- **CI/CD does not inject Payload vars** — the Hostinger VPS pipeline is missing Payload env vars in its build step. Lower priority while Vercel is the active deploy path.
- **Cancellation behavior on `awaiting_value` not explicitly re-verified** — the existing "previous request cancelled" behavior was confirmed for `awaiting_selection`; whether it still triggers cleanly if a client ignores an `awaiting_value` prompt and sends something unrelated was not explicitly tested this session. Worth a quick manual check next session.

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
| Phase 7 — UAT + Smoke Test Fixes | Media upload tenant ID fix, name-as-ID resolution, link_image misfire guard, ID scrub from client messages | ✅ Complete |
| Phase 8 — Conversation Quality + Capability Messaging | Site-aware empty state/header (dynamic, no hardcoded site name), shared capabilities source of truth, ChatWindow structural refactor (1,380 → ~80-line orchestrator + 6 components + 2 hooks), `awaiting_value` guard for missing required fields (fixes raw-error and raw-JSON leaks) | 🔶 Partial — guard confirmed working; FAQ field-selection + wording rewrite specified but not yet run; apir-tayo safety-net catch specified but not yet run |
| Phase 9 — Sir Jeff Escalation | Present full portal flow, get sign-off | ⏳ Next, after Phase 8 wording fix lands |
| Future — Create records via agent | add_faq, add_testimonial, add_portfolio_item, add_pricing_plan actions across all 4 collections | 🔜 Planned, deprioritized behind Phase 8 conversation-quality fix |
| Future — Agent Setup in Payload | Payload admin UI for AI provider, API keys, system prompt, supported actions per tenant | 🔜 Planned |
