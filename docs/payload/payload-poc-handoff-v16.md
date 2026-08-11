# Payload CMS Integration — Handoff Document

> **Branch:** `feat/payload-cms`
> **Date:** June 2026 (updated post–SiteSettings/editable headings rollout + Sir Jeff demo + Website Team sync)
> **Summary:** Wired the Apirtayo Next.js frontend to an external Payload CMS for dynamic homepage content. Both repos are deployed to Vercel. Production login was broken (CORS) and has been fixed via a proper server-side proxy — see §1.1. The AI Agent client portal is implemented through Phase 10 (create-record support across all 4 collections, both step-by-step and full-prompt flows), confirmed working in production testing this session. Phase 11 (response message quality pass) had two known bugs; the dry-run wrapper bug is now fixed, the `url` field extraction bug remains open and has been **intentionally deprioritized** — see §7.1. The first live demonstration was held with Sir Jeff this session. Coming out of that meeting, **Editable Homepage Headings (formerly §10.1, future phase) was pulled forward and fully implemented this session** — a `site-settings` collection now drives all six homepage section headings/copy, with full fallback-safety, verified in production — see §11. The AI Agent was **deliberately benched** for this feature; SiteSettings is manual-CRUD-only for now, per explicit decision to validate plain Payload CRUD before any future agent integration. A sync was also held with the Website Team — two official documentation deliverables are due this weekend (see §12), and several new feature requests were raised and logged for future scoping (see §10.7–§10.10). Remaining open items: `url` extraction bug (deprioritized), Phase 8 FAQ "which field" step + apir-tayo defensive error catch, the two documentation deliverables (§12), and future phases (§10).

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
- **Phase 11 — Response message quality pass (partially complete, deprioritized)** — See §5.9 for full details. Proposal format, list display, clarifying question phrasing, and cancellation message all rewritten. Dry-run wrapper bug is now **fixed**. The `url` field extraction bug remains open but has been **intentionally deprioritized** — see §7.1.
- **Sir Jeff demo held** — First live demonstration of the AI Agent client portal conducted this session. Production testing for the portal was completed beforehand and confirmed working.
- **Editable Homepage Headings shipped (pulled forward from §10.1 future-phase backlog)** — A `site-settings` Payload collection (one record per Site) now drives heading and paragraph copy for all six in-scope homepage sections (Hero, Why One Page, How It Works, Trust, CTA, Footer), wired into apir-tayo with full fallback-to-hardcoded-copy safety. Verified live in production. AI Agent integration for this feature is **explicitly out of scope / benched** for now — see §11.
- **Website Team sync held** — Walkthrough of Payload conducted with the Website Team. Two official documentation deliverables are due this weekend, addressed to Sir Gio — see §12. Several new feature requests were raised and logged for future scoping — see §10.7–§10.10.

---

## 1.1 Production Login Fix

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

## 2. Collections in Payload

| Collection | Slug | Purpose |
|---|---|---|
| Tenants | `tenants` | Top-level org grouping |
| Sites | `sites` | One per frontend — scopes all content |
| FAQs | `faqs` | Question + answer pairs |
| Testimonials | `testimonials` | Name, quote, position, optional image |
| Portfolio Items | `portfolio-items` | Title, category, optional url, optional image |
| Pricing Plans | `pricing-plans` | Label, price, optional description, optional features (items array) |
| Posts | `posts` | Homepage post sections with slugs |
| Pages | `pages` | Named pages with slugs |
| Media | `media` | Uploaded images, stored in Supabase S3 |
| Portal Clients | `portal-clients` | Auth-enabled collection for client portal users |
| Agent Audit Log | `agent-audit-log` | Immutable log of every confirmed agent mutation |

---

## 3. Homepage Integration

### 3.1 New files: `app/lib/payload/` (3 files)
- `fetchPayload.ts` — generic fetch helper with ISR, error handling, site scoping
- `payload-types.ts` — TypeScript interfaces for PayloadFAQ, PayloadTestimonial, PayloadPortfolioItem, PayloadPricingPlan
- `index.ts` — barrel exports

### 3.2 Modified: `app/page.tsx`
Async server component, fetches all four collections in parallel via `Promise.all`, passes as props to section components.

### 3.3 Modified: section components (4 files)
FAQSection, TestimonialsSection, PortfolioSection, PricingSection — all now accept dynamic data as props with `resolveImageUrl()` helpers for media.

### 3.4 Remaining hardcoded sections
| Section | Notes |
|---|---|
| HeroSection | Would need a Payload Global or collection |
| WhyOnePageSection | Feature list — could be a collection |
| HowItWorksSection | Step-by-step — could be a collection |
| TrustSection | Client logos/stats |
| CTASection | Single CTA block — could be a Global |
| Footer | Links and copyright — could be a Global |

Making these editable is now tracked as a future phase — see §10.1.

---

## 4. Environment Variables

**Convention:** all `*_URL` env vars in this stack are base URLs with **no trailing slash** (confirmed/enforced on `NEXT_PUBLIC_SERVER_URL`). A trailing slash produces double-slash paths (`...//api/...`) when code concatenates `${URL}/path`.

### apir-tayo `.env.local` / Vercel
| Variable | Purpose |
|---|---|
| `PAYLOAD_API_URL` | Payload REST API base URL (server-only). Used by `/api/portal/agent`, `/api/portal/login`, homepage fetches. |
| `NEXT_PUBLIC_PAYLOAD_API_URL` | Public URL — **client-side only, narrow scope.** Used only by `TestimonialsSection.tsx`/`PortfolioSection.tsx` for `resolveImageUrl()` on the homepage. The login page no longer uses this var (it caused the production CORS bug — see §1.1). Treat any new client-side use of this var with suspicion. |
| `PAYLOAD_SITE_ID` | Tenant site ID for `where[site][equals]=` filter |
| `PAYLOAD_TENANT_ID` | Seen in Vercel project env vars — not yet cross-referenced against code in this doc. Confirm usage if touching tenant resolution. |
| `CLEANTALK_API_KEY` | Spam filtering (unrelated to Payload integration) |

### payload-poc `.env.local` / Vercel
| Variable | Purpose |
|---|---|
| `DEEPSEEK_API_KEY` | DeepSeek API key for agent intent parsing |
| `AGENT_EMAIL` | Service account email for Payload auth |
| `AGENT_PASSWORD` | Service account password |
| `NEXT_PUBLIC_SERVER_URL` | Payload's own base URL — self-reference, used internally. Confirmed empty in production previously; fixed by setting to `https://payload-poc-xi.vercel.app` (no trailing slash). **Unrelated to the login CORS bug in §1.1.** |

---

## 5. AI Agent Client Portal

### 5.1 Portal architecture

```
Client browser
  └── /portal/login (apir-tayo)
        ↓ POST /api/portal/login (apir-tayo proxy — new)
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
Agent:  → resolves slug → proposes change
Client: "confirm"
Agent:  → executes PATCH → writes AgentAuditLog → returns success
```

**Create flow (sequential, step-by-step — working fallback):**
```
Client: "Add a new FAQ"
Agent:  → "What would you like the question to say?"
Client: "How do I get started?"
Agent:  → "What should the answer be?"
Client: "Contact us via email and we'll reply within 24 hours."
Agent:  → proposal (plain labeled format)
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
Agent:  → "What would you like the question to say?"
Client: "Update a testimonial"   ← command verb detected
Agent:  → "Got it, I've set that aside. What would you like to do?" → processes as fresh command
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

The create flow uses a multi-turn state machine parallel to the existing `awaiting_value` and `awaiting_selection` states.

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

**FAQ "which field" step (specified, not yet run):** After selecting an FAQ record, the agent always asks for the question field by default. No way to update the answer field or both. See §7 for the prompt.

**Safety net (specified, not yet implemented):** Defensive catch in `apir-tayo`'s `app/api/portal/agent/route.ts` for any raw/unexpected error from payload-poc. See §7 for the prompt.

### 5.9 Phase 11 — Response Message Quality Pass (partially complete)

Pure wording/UX pass. No logic, state machine, schema, or API behavior was changed. All changes are client-facing text only.

**1. Proposal message format**

Replaced raw `key: "value"` YAML-style confirmation messages and internal state labels with natural-language proposals.

Rules added to `SYSTEM_PROMPT` (`prompts.ts`): `PROPOSAL DISPLAY RULES` — opening sentence, plain labeled fields, no internal IDs or state labels, closes with `Type "confirm" or tap Confirm to save this.`

Files touched:
- `prompts.ts` — `PROPOSAL DISPLAY RULES` section added
- `shared.ts` — `buildCreateProposal`: `currentValue` set to `""`, `newValue` builds human-readable block; added `FIELD_DISPLAY_LABELS` and `COLLECTION_OPENERS` lookup tables
- `actions/shared.ts` — `buildUpdateProposal`: formatted `newValue`; `_rawValue` added for actual PATCH execution
- `actions/images.ts` — removed `(no image)` / `(image set)` labels; `currentValue` set to `""`, `newValue` to natural sentence
- `actions/posts.ts` — same pattern as `actions/shared.ts`

✅ **Fixed this session:** The dry-run wrapper function that assembles the final client-facing string (previously producing the `I'll update the [collection] "[label]" from: "" to: "..."` shell) has been bypassed for pre-formatted proposals. `newValue` now contains the full human-readable proposal and is passed through directly — no wrapper, no from/to framing. See §7 for what the fix actually changed.

**2. List display format**

Replaced markdown bold (`**Name**`) with plain text — the client UI does not render markdown. Each collection now shows a collection-appropriate identifying snippet.

Rules added to `SYSTEM_PROMPT` (`prompts.ts`): `LIST DISPLAY RULES` section.

Files touched:
- `resolver.ts` — FAQs: answer wrapped in quotes, question no longer truncated; Testimonials: quote wrapped in quotes, truncation `80 → 60` chars
- `actions/list.ts` — `prompt` field added: e.g. `"Here are your FAQs. Which one would you like to update?"`

**3. Clarifying question phrasing**

Replaced generic `"What should the ${label} be?"` prompts and old-value echoes with 12 field-specific, conversational prompts. Optional fields now include a skip hint `(You can skip this.)`.

Rules added to `SYSTEM_PROMPT` (`prompts.ts`): `PROMPT PHRASING RULES` section.

Files touched:
- `shared.ts` — `buildFieldPrompt`: 12 field-specific prompts, skip hint reworded
- `actions/shared.ts` — `awaiting_value` and `"both"` continuation prompts; removed old-value echo
- `actions/posts.ts` — `"What should the new title be for the post \"slug\"?"` → `"What should the new title be?"`
- `route.ts` — FAQ choice prompts: removed `"instead"` suffix

**4. Cancellation message**

Files touched:
- `apir-tayo`: `app/.../hooks/useChatSession.ts` — `"Previous request cancelled."` → `"Got it, I've set that aside. What would you like to do?"`

🐛 **Open bug:** `url` field extraction does not handle natural-language phrasing. When a client writes `"Add a portfolio item called 'X' in the Y category, url https://..."`, the agent still asks "What's the URL?" even though it was provided. The extraction pattern only matches `url:` with a colon, not `url https://...`, `url is https://...`, `link https://...`, etc. See §7 for the fix prompt.

**Phase 11 files changed:**

| Repo | File | What |
|---|---|---|
| `payload-poc` | `src/app/api/agent/prompts.ts` | 3 new `SYSTEM_PROMPT` sections |
| `payload-poc` | `src/app/api/agent/shared.ts` | `buildCreateProposal` + `buildFieldPrompt` |
| `payload-poc` | `src/app/api/agent/actions/shared.ts` | `handleTextUpdate` prompts + proposal |
| `payload-poc` | `src/app/api/agent/actions/images.ts` | `handleImages` proposal |
| `payload-poc` | `src/app/api/agent/actions/posts.ts` | `handlePosts` prompt + proposal |
| `payload-poc` | `src/app/api/agent/actions/list.ts` | `handleList` prompt field |
| `payload-poc` | `src/app/api/agent/resolver.ts` | `fetchTenantRecords` formatting |
| `payload-poc` | `src/app/api/agent/route.ts` | FAQ choice prompts |
| `apir-tayo` | `app/.../hooks/useChatSession.ts` | Cancellation message |

---

## 6. Key Files Reference

### In apir-tayo (`/Users/josh/work/apir-tayo`)
| File | Role |
|---|---|
| `middleware.ts` | Protects `/portal/chat` — redirects to `/portal/login` if `portal_token` absent |
| `app/(portal)/layout.tsx` | Minimal portal layout, no main site nav |
| `app/(portal)/portal/login/page.tsx` | Login form → proxy → session cookies → redirect |
| `app/(portal)/portal/chat/page.tsx` | Server component — reads cookies, resolves tenant name AND site name/slug, renders ChatWindow with both |
| `app/(portal)/portal/chat/ChatWindow.tsx` | Thin orchestrator (~80 lines) — owns top-level state, composes all child components and hooks |
| `app/api/portal/session/route.ts` | `DELETE` clears cookies (logout, still used). `POST` is dead code — not yet removed. |
| `app/api/portal/login/route.ts` | Server-side login proxy — receives `{ email, password }`, server-side fetches payload-poc's login endpoint, sets httpOnly cookies, returns generic error on failure. |
| `app/api/portal/agent/route.ts` | Proxy — reads cookies, forwards `{ message, tenantId, confirmed, proposal, awaitingFields }` to payload-poc |
| `app/api/portal/upload/route.ts` | Image upload proxy — forwards file + tenantId to payload-poc agent-upload |
| `app/lib/payload/fetchPayload.ts` | Homepage fetch helper |
| `app/lib/payload/payload-types.ts` | TypeScript interfaces for Payload collections |
| `app/lib/portal/agentCapabilities.ts` | Single source of truth — `AGENT_CAPABILITIES`, `HELP_ITEMS`, `CANNOT_ITEMS`, `SUGGESTION_CHIPS` |
| `app/(portal)/portal/chat/types.ts` | Shared `Message`, `ProposalPayload`, `SelectionContext`, `AwaitingFieldsContext` interfaces |
| `app/(portal)/portal/chat/components/ChatHeader.tsx` | Site name (primary) + tenant name (secondary) + header buttons |
| `app/(portal)/portal/chat/components/ChatEmptyState.tsx` | Site-aware "You're managing {siteName}" panel, capability summary, suggestion chips |
| `app/(portal)/portal/chat/components/CapabilitiesModal.tsx` | "What can I do?" modal |
| `app/(portal)/portal/chat/components/MessageList.tsx` | Scrollable message history + loading indicator |
| `app/(portal)/portal/chat/components/MessageInput.tsx` | Text input, attach button, send button; `awaitingFields` prop drives placeholder text |
| `app/(portal)/portal/chat/components/ProposalConfirmation.tsx` | Confirm/cancel bar |
| `app/(portal)/portal/chat/hooks/useChatSession.ts` | All agent API calls — 6 response chains |
| `app/(portal)/portal/chat/hooks/useImageUpload.ts` | File selection, preview, upload to `/api/portal/upload` |

### In payload-poc (`/Users/josh/work/payload-poc`)
| File | Role |
|---|---|
| `src/collections/PortalClients.ts` | Auth-enabled collection — email, password, tenant relationship |
| `src/collections/AgentAuditLog.ts` | Immutable audit log — tenant, action, collection, documentId, slug, previousValue, newValue, confirmedAt |
| `src/collections/PricingPlans.ts` | Added `price` (number, req) and `description` (textarea, opt) in Phase 9 |
| `src/collections/Testimonials.ts` | `image` changed to `required: false` in Phase 9 |
| `src/collections/PortfolioItems.ts` | `image` and `url` changed to `required: false` in Phase 9 |
| `src/app/api/agent/route.ts` | Orchestration shell — parses body, gets token, calls DeepSeek, delegates to action handlers |
| `src/app/api/agent/types.ts` | `ParsedAction`, `ProposalPayload`, `SelectionRecord`, `AwaitingFieldsResponse`, `AwaitingFieldsRequest`, `CreateFieldDef` interfaces |
| `src/app/api/agent/prompts.ts` | `SYSTEM_PROMPT` — includes `PROPOSAL DISPLAY RULES`, `LIST DISPLAY RULES`, `PROMPT PHRASING RULES` sections (Phase 11) |
| `src/app/api/agent/deepseek.ts` | `callDeepSeek()` — calls DeepSeek API, strips fences, parses + validates JSON |
| `src/app/api/agent/resolver.ts` | `resolveSlugToId()`, `resolveRecordTenant()`, `fetchTenantRecords()` |
| `src/app/api/agent/shared.ts` | `awaiting_value` guard + full `awaiting_fields` state machine + `buildCreateProposal` + `buildFieldPrompt` |
| `src/app/api/agent/audit.ts` | `writeAuditLog()` |
| `src/app/api/agent/actions/shared.ts` | `patchRecord()`, `patchWithRetry()`, `postRecord()`, `createWithRetry()`, `getTenantSiteId()` |
| `src/app/api/agent/actions/posts.ts` | `update_post_title`, `update_page_title` |
| `src/app/api/agent/actions/faqs.ts` | `update_faq_question`, `update_faq_answer`, `handleCreateFaq()` |
| `src/app/api/agent/actions/testimonials.ts` | `update_testimonial_*`, `handleCreateTestimonial()` |
| `src/app/api/agent/actions/portfolio.ts` | `update_portfolio_*`, `handleCreatePortfolio()` |
| `src/app/api/agent/actions/pricing.ts` | `handlePricing()` with features→items transform, price string→float coercion |
| `src/app/api/agent/actions/images.ts` | `link_image` handler |
| `src/app/api/agent/actions/list.ts` | `list_faqs`, `list_testimonials`, `list_portfolio_items` |
| `src/app/api-upload/route.ts` | Accepts multipart file + tenantId, uploads to Payload media, returns `{ mediaId, url }` |
| `src/utilities/resolveSite.ts` | Resolves Site slug ↔ ID |
| `src/utilities/payloadAuth.ts` | `getAgentToken()`, `clearAgentToken()` |

---

## 7. Remaining Work

### Phase 11 — Bug status

**Bug 1 — Dry-run wrapper not bypassed — ✅ FIXED this session**

~~The function that assembles the final client-facing string still wraps `newValue` inside the old `I'll update the [collection] "[label]" from: "" to: "..."` shell.~~ Fixed — `newValue` (pre-formatted) is now sent directly to the client, no wrapper, no from/to framing. The prompt below is kept for reference on what the fix entailed; no further action needed on this bug.

```
Prompt used (payload-poc) — kept for reference, already applied:
In `payload-poc`, find the function that assembles the final dry-run confirmation
string sent to the client — the one producing the pattern:

  "I'll update the [collection] "[label]" from: "[currentValue]" to: "[newValue]"
  Type "confirm" or click Confirm to apply this change."

This wrapper must be removed for all create and update proposals. The `newValue`
field now contains a fully pre-formatted human-readable proposal block. It should
be sent to the client directly — no wrapping, no from/to framing, no extra
"Type confirm" line appended (the closing line is already inside newValue).

Option A: Check for a `preformatted` boolean field on the dry-run object.
If `preformatted === true`, return `newValue` as-is.

Option B: Replace the wrapper entirely so it always returns `newValue` directly
for create and update proposals.

Also remove the trailing "Type "confirm" or click Confirm to apply this change."
from the wrapper — already part of newValue, must not be duplicated.

Do not touch the confirmation detection logic, PATCH/POST execution path,
audit log, or _rawValue field.

Verify — expected output (exactly, nothing more):
  Here's what I'll add to your FAQs:

  Question: Do you offer refunds?
  Answer: Yes, within 30 days of purchase with a valid receipt.

  Type "confirm" or tap Confirm to save this.
```

**Bug 2 — `url` field extraction missing natural-language phrasing — 🔶 STILL OPEN, intentionally deprioritized (see §7.1)**

The full-prompt create flow does not extract `url` when written as `url https://...` — only `url: https://...` is matched. Agent asks "What's the URL?" even when it was already provided. **Not fixed.** Deliberately held off this session — the Sir Jeff demo was already conducted without this fix, so it's no longer gating anything. Revisit when prioritized; the prompt below is ready to run whenever that is.

```
Next prompt to run (payload-poc):
Fix the extraction pattern for `url` in the full-prompt field extraction logic
to handle all of these phrasings (case-insensitive):
  - url https://...
  - url: https://...
  - url is https://...
  - link https://...
  - link: https://...
  - website https://...
  - at https://...

The pattern should capture the full URL including the https:// scheme.

Do not change the step-by-step fallback — it should still ask for url
when it genuinely was not provided.

Verify:
Case 1 (should NOT ask): "Add a portfolio item called 'Brightwave Rebrand'
  in the Branding category, url https://brightwave.example.com"
  → goes straight to proposal with url pre-filled.

Case 2 (SHOULD ask): "Add a portfolio item called 'Brightwave Rebrand'
  in the Branding category"
  → agent asks "What's the URL? (You can skip this.)"
```

---

### Phase 8 — Remaining fixes (run after Phase 11 bugs)

| Item | Priority | Status |
|---|---|---|
| FAQ "which field" step (question/answer/both) | High | Specified, not yet run |
| Defensive error-message catch in apir-tayo | Medium | Specified, not yet run |

**FAQ field selection prompt (payload-poc):**
> Add a "which field" step to the FAQ update flow, building on the working `awaiting_value` guard. After a client selects an FAQ record, the agent should ask "Would you like to update the question, the answer, or both?" before asking for the new value (currently it always defaults to asking for the new question text, with no way to choose the answer). If "both," collect the new question first, then the new answer, as two separate turns — not a combined prompt. Also rewrite the clarifying-question wording everywhere it's used: replace the current pattern ("What should the new question be for 'Is this custom?'?" — confirmed confusing in manual testing, reads like a code variable substitution) with natural phrasing like "What would you like the question to say instead?" with no repeated quoted old value. Scope this to FAQs only for now (faqs.ts). Verify by testing the full flow manually and pasting the actual rendered chat messages.

**Safety-net prompt (apir-tayo):**
> Add a defensive guard in `app/api/portal/agent/route.ts` so that any non-2xx or error-shaped response from payload-poc is replaced with a generic friendly fallback ("Something went wrong on my end — could you try rephrasing that?") before reaching the client. Log the real error server-side. This is independent of payload-poc-side fixes; it's a safety net for any future error shape, known or unknown.

---

### Portal — other next steps
| Item | Priority | Notes |
|---|---|---|
| Phase 11 Bug 1 — dry-run wrapper | ✅ Done | Fixed this session. |
| Phase 11 Bug 2 — url extraction | ⏸️ Deprioritized | Held off per explicit decision this session — Sir Jeff demo already conducted without this fix. Revisit when prioritized. |
| Escalate to Sir Jeff | ✅ Done | First demonstration held this session, after production testing confirmed working. |
| FAQ "which field" + wording fix | 🔴 High | Still open. Not a blocker anymore since the demo already happened, but should be closed out soon. |
| Defensive error catch in apir-tayo | 🟡 Medium | Safety net — run after wording fix. |
| Remove dead `POST` handler in `app/api/portal/session/route.ts` | 🟢 Low | Dead code since login proxy fix. `DELETE` handler still live for logout — don't remove the whole file. |
| Audit other `NEXT_PUBLIC_*`-prefixed env vars | 🟡 Medium | Check for any accidental direct-browser-to-payload-poc calls. |
| On-demand revalidation | 🟡 Medium | Clients expect instant content changes, not 60s ISR delay. Use `revalidateTag`/`revalidatePath` webhook from Payload. |
| AGENT_EMAIL role restrictions | 🟡 Medium | Service account has broader Payload access than needed. Lock down to agent-used collections only. |
| Extend "which field" to testimonials/portfolio | 🟢 Low | After FAQ pattern confirmed working. |
| Lexical rich text fields | 🟢 Low | Hero text etc. use Payload Lexical JSON node structure — plain string patches won't work. Deferred. |
| Delete records via agent | 🟢 Low | Out of scope for POC. Needs separate confirmation UX. |
| **Documentation — Payload usage guide** | 🔴 High | Due this weekend, to Sir Gio. See §12. |
| **Documentation — replication/wiring guide** | 🔴 High | Due this weekend, to Sir Gio. See §12. |
| **CTA secondary button field** | 🟢 Low | `SecondaryButton` ("Schedule a Call") in `CTASection.tsx` has no SiteSettings field yet — flagged during §11 implementation, not addressed. Add `ctaSecondaryButtonText` if/when needed. |

#### §7.1 — Why the `url` extraction bug was deprioritized
Decision made this session: Phase 11 Bug 2 (`url` field extraction missing natural-language phrasing in the full-prompt create flow) is being held off rather than fixed immediately. The Sir Jeff escalation/demo had already been conducted separately, so this is no longer gating anything — it's a quality-of-life gap in one create flow, not a functional blocker. Revisit when there's bandwidth or when it's specifically prioritized.


### Known gaps
- **`getTenantSiteId()` assumes one site per tenant** — documented with a comment in `actions/shared.ts`. Will break for multi-site tenants. POC-only assumption.
- **No type safety at the API boundary** — `fetchFromPayload` uses a type assertion. Run `pnpm generate:types` in payload-poc and sync generated types to apir-tayo for full safety.
- **`PAYLOAD_TENANT_SLUG` in CLAUDE.md is unused** — references a variable the code doesn't use. Should be cleaned up.
- **CI/CD does not inject Payload vars** — Hostinger VPS pipeline missing Payload env vars in build step. Lower priority while Vercel is active deploy path.
- **Cancellation behavior on `awaiting_value` not explicitly re-verified** — confirmed for `awaiting_selection`; not re-tested for `awaiting_value` specifically.
- **Diagnostic `console.log` left in `executeCreate()`** — added in Phase 9 for debugging. Should be removed or replaced with structured logging before production.
- **Login route error messages are not differentiated** — `app/api/portal/login/route.ts` returns the same generic message for bad credentials, account lockout, and payload-poc downtime alike. Not a correctness bug, just a UX gap.
- **`app/api/portal/session/route.ts`'s `POST` handler is dead code** — superseded by `app/api/portal/login/route.ts`. The `DELETE` handler is still live for logout — don't remove the whole file.

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
| Phase 8 — Conversation Quality + Capability Messaging | Site-aware empty state/header, shared capabilities source, ChatWindow refactor, `awaiting_value` guard | 🔶 Partial — FAQ field-selection + apir-tayo safety-net catch still pending |
| Phase 9 — Create Records | `add_faq`, `add_testimonial`, `add_portfolio_item`, `add_pricing_plan` — sequential `awaiting_fields` state machine, all 4 flows confirmed working | ✅ Complete |
| Phase 10 — Full-prompt Support | Parse all field values from a single natural-language message; skip field prompts for pre-filled fields | ✅ Confirmed working via manual chat testing |
| Production Fixes | Fixed production login CORS failure via new server-side proxy; confirmed payload-poc `getServerSideURL()` self-reference fix | ✅ Complete — see §1.1 |
| Phase 11 — Response Message Quality Pass | Proposal format rewrite, list display rewrite, clarifying question phrasing, cancellation message rewrite | 🔶 Partial — dry-run wrapper bug ✅ fixed; url extraction bug ⏸️ deprioritized (see §7.1) |
| Phase 12 — Sir Jeff Escalation | Present full portal flow, get sign-off | ✅ Done — production tested, then demonstrated to Sir Jeff this session |
| Phase 13 — Editable Homepage Headings (SiteSettings) | `site-settings` collection (one record per Site) driving Hero/Why One Page/How It Works/Trust/CTA/Footer copy, full fallback-safety, two duplication bugs found and fixed, verified in production | ✅ Done — manual admin CRUD only, see §11. AI Agent integration explicitly benched. |

---

## 10. Future Phases — Supervisor Input (June 2026)

Inputs received from Sir JM. All items below are planned for future sessions, ordered by implementation complexity.

### 10.1 Editable Homepage Headings — ✅ IMPLEMENTED THIS SESSION, see §11

~~Homepage section headings (Hero headline, How It Works title, CTA copy, etc.) are hardcoded in Next.js components. The goal is to make these editable from within Payload so clients can change them without a code deploy.~~

**This was pulled forward and completed this session**, prompted directly by feedback in the Sir Jeff demo. Actual implementation diverged from the original recommendation below — see §11 for why, and for full schema/field details.

~~Approach options:~~
~~- **Payload Globals** (one Global per section, or one `SiteSettings` Global with all headings as fields) — simplest, no collection overhead. Recommended starting point.~~
~~- Extend existing collections with a `richText` or `text` heading field~~
~~- Full block-based layout builder (longer term)~~

~~Recommended: a single `SiteSettings` Global per tenant with named heading fields. Low complexity, immediately useful.~~

**What actually shipped:** investigation confirmed native Payload Globals cannot be scoped per tenant/site (the multi-tenant plugin only operates on collections). Built as a `site-settings` **collection** instead — one record per Site, same relationship pattern as FAQs/Testimonials/Portfolio/Pricing. Full details in §11.

### 10.2 Extended Asset Types

Currently Payload's media collection handles images only. Other website assets — SVGs, fonts, PDFs, brand documents, icons — are not yet supported.

Next steps:
- Audit what asset types the apir-tayo site actually references
- Extend Payload's media collection `mimeTypes` allowlist accordingly
- Determine if a separate `Assets` collection is needed vs. one unified media collection with a `type` filter

### 10.3 Page Templates

Clients should be able to select from pre-built page templates within the portal and have their site adopt that layout.

Scope to be defined — could mean:
- Visual template picker in the portal chat or a dedicated UI
- Stored template definitions in Payload as a `Templates` collection or as Globals with layout config
- Extraction of existing apir-tayo page layouts into reusable template records

This is a larger feature — needs a scoping session before implementation.

### 10.4 Payload Dashboard Cleanup

The default Payload admin dashboard surfaces generic buttons and links not meaningful to non-technical clients. Replace with a purpose-built management dashboard that:
- Removes default dashboard buttons
- Shows tenant-scoped content stats (FAQ count, testimonial count, portfolio count, etc.)
- Surfaces recent activity (last edited records)
- Provides quick-action shortcuts relevant to the client's role

Scope: `payload-poc` only. `apir-tayo` portal is unaffected.

### 10.5 Enhanced Agent Audit Log

Currently `AgentAuditLog` captures: action, collection, record ID, proposed change, status (confirmed/rolled back), and timestamp.

**New fields to add:**
- The full prompt text sent to DeepSeek for that turn
- The raw model output returned before the dry-run layer processes it

This data will be surfaced in the Payload admin Audit Log view, enabling the team to review what the model was asked, what it returned, and where phrasing or logic can be improved — closing the loop between live usage and agent tuning.

Implementation note: both fields should be stored as `textarea` or `json` type in the `AgentAuditLog` collection schema. No PII beyond what is already captured in the action/proposed change fields should be stored.

### 10.6 AI Configuration UI (Scheduled Last)

Payload admin interface for managing AI agent configuration per tenant:
- AI provider selection (DeepSeek, OpenAI, Anthropic, etc.)
- API key storage and rotation
- System prompt editor per tenant
- Enable/disable specific actions per site

**Deliberately scheduled last** — the Enhanced Audit Log (§10.5) needs to be in place first so that real usage data can inform system prompt decisions before a UI is built to manage them. Building the config UI before having audit data would mean tuning blindly.

### 10.7 SMTP2GO Integration

Raised by the Website Team this session. Goal: outbound email sending (form submissions, notifications) configured through Payload rather than a hardcoded mail provider. Not scoped yet — needs investigation into Payload's email adapter config and whether this is per-tenant or instance-wide.

### 10.8 Anti-Spam for Forms

Raised by the Website Team this session. Forms on client sites (contact forms, etc.) currently have no spam protection. Likely candidates: honeypot fields, rate limiting, or a third-party service (reCAPTCHA/hCaptcha/Turnstile). Not scoped yet.

### 10.9 Page/Site Templates

Raised by the Website Team this session — overlaps conceptually with §10.3 (Page Templates), which was already flagged as a larger feature needing a scoping session. Treat as reinforcing the priority of §10.3 rather than a new separate item.

### 10.10 Custom Collections Per Site

Raised by the Website Team this session. Goal: allow a given Site to have collections/fields beyond the standard FAQs/Testimonials/Portfolio/Pricing/SiteSettings set — e.g. a site-specific content type that doesn't exist for other tenants. Not scoped yet; likely relates to how flexible vs. rigid the multi-tenant schema should be going forward. Worth discussing alongside the `customFields` array pattern already introduced in §11 (SiteSettings) — that pattern may generalize to other collections rather than needing fully dynamic schema.

---

## 11. SiteSettings — Editable Homepage Headings (Implemented This Session)

### 11.1 Why this happened now

Originally future-phase item §10.1. Pulled forward directly off feedback in the Sir Jeff demo. Implemented end-to-end and verified in production this session.

### 11.2 Schema decision

Investigation (see §10.1 strikethrough above) confirmed:
- Native Payload Globals **cannot** be scoped per tenant/site — the `@payloadcms/plugin-multi-tenant` only operates on collections registered in its `collections` config. The plugin's `isGlobal: true` flag is a collection-emulating-a-global pattern (one doc per tenant via `unique: true`), not a true Global.
- Built as a `site-settings` **collection** instead, slug `site-settings`, one record per Site, enforced via `unique: true` on the `site` relationship field (no custom `beforeChange` uniqueness hook — Payload's native unique constraint is sufficient for manual admin CRUD).
- **No auto-seeding.** A new Site simply has no `SiteSettings` record until an admin creates one; `fetchSiteSettings()` returns `null` in that case and the frontend falls back to hardcoded defaults. Matches the existing `homeStatic` fallback pattern already used elsewhere in the codebase. No `afterChange` hook, no backfill migration needed.

### 11.3 Fields shipped

Grouped into admin UI tabs by homepage section. All fields optional (no `required`), so an admin can override only the sections they want:

| Section | Fields |
|---|---|
| Hero | `heroHeadline`, `heroSubheadline` |
| Why One Page | `whyOnePageTitle`, `whyOnePageParagraph` |
| How It Works | `howItWorksTitle`, `howItWorksParagraph` |
| Trust | `trustSectionTitle`, `trustSectionParagraph` |
| CTA | `ctaTitle`, `ctaParagraph`, `ctaButtonText`, `ctaCaption` |
| Footer | `footerCopy` |
| Custom | `customFields` — array of `{ key, value }` pairs for content not covered by the fixed fields above |

The `customFields` array exists specifically to answer "what if a future site needs a heading section apir-tayo doesn't have" without requiring a schema change for every new site's quirks. A `getCustomField(settings, key, fallback)` utility was delivered as the single access point for reading it — **not yet wired into any section component.** Any team needing a custom field rendered just needs to call this utility with the section/key in question.

**Known gap, not addressed:** `CTASection.tsx` actually renders two buttons (`PrimaryButton` and a `SecondaryButton` labeled "Schedule a Call"). `ctaButtonText` maps to the primary button only; the secondary button has no field and remains hardcoded. Add `ctaSecondaryButtonText` if/when this needs to be editable.

### 11.4 Frontend wiring pattern

`fetchSiteSettings()` added to `app/lib/payload/fetchPayload.ts`, following the exact same fail-safe pattern as the existing fetch functions (`fetchFromPayload` for FAQs/Testimonials/etc.) — queries `site-settings?where[site][equals]={PAYLOAD_SITE_ID}&limit=1`, returns `null` on any fetch failure, non-2xx, or empty result. Never throws.

**Important implementation detail (bug found and fixed this session):** Payload serializes `tabs` field groups as nested JSON objects in the API response (e.g. `doc.hero.heroHeadline`), not flat at the document root (`doc.heroHeadline`). `fetchSiteSettings()` must destructure each tab group before reading individual fields, or every field will silently evaluate to `null`.

All six section components (`HeroSection`, `WhyOnePageSection`, `HowItWorksSection`, `TrustSection`, `CTASection`, `Footer`) accept an optional `settings` prop and render `settings?.field ?? "<original hardcoded copy>"` — the pre-existing hardcoded strings are the literal fallback, not separate placeholder constants.

### 11.5 Bugs found and fixed during this implementation

Two near-identical bugs, both from the same root cause — treating a field that holds the **full** saved string as if it only fills part of the markup (a partial span/fragment), when several headings had previously been split across two styled `<span>` or `<p>` elements for color/accent purposes:

1. **Footer duplication:** `footerCopy` is saved as the full string `"© 2026 Apir' Tayo"`. An earlier draft of the wiring kept a hardcoded `"© {year} "` prefix in the template and only swapped in the brand-name fragment, which would have rendered `"© 2026 © 2026 Apir' Tayo"`. Fixed — `footerCopy` now replaces the entire line.
2. **How It Works title duplication:** Same pattern — `howItWorksTitle` is the full string `"Our Simple 4-Step Process"`, but an earlier draft only replaced the first of two styled spans, which would have rendered `"Our Simple 4-Step Process4-Step Process"`. Fixed using the same pattern already correct in `HeroSection`'s h1: when CMS text is present, render as a single full-text span; fall back to the original two-span color-split structure only when the field is `null`.

Why One Page's title had the identical risk and was resolved the same way (full single-span replace) after explicit confirmation. Trust Section's two-`<p>`-to-one-`<p>` collapse was re-verified and was already correct.

**Visual tradeoff, accepted as known/acceptable for POC:** the two-tone accent-color split on Hero, Why One Page, and How It Works headings disappears (collapses to a single plain-color span) whenever an admin sets a CMS value for that heading. Not a bug — a deliberate simplification — but worth being aware of if a more polished version is wanted later.

### 11.6 AI Agent — explicitly benched for this feature

Explicit decision this session: SiteSettings is **manual Payload admin CRUD only**. No agent action, no dispatch wiring, no resolver/`shared.ts` changes were made or are planned until manual CRUD is fully validated. If/when agent support for SiteSettings is revisited, note that it cannot reuse `handleTextUpdate` (which assumes list-based record resolution by ID) — it would need a dedicated handler resolving directly to the one record for a given site, closer in shape to `handlePosts` than to the FAQ/Testimonial/Portfolio/Pricing handlers. Not scheduled.

### 11.7 Production verification

Confirmed via live fetch of `https://apir-tayo.vercel.app/` post-deploy: Footer, How It Works, Why One Page, Trust, and CTA all render saved SiteSettings values correctly with no duplicated text. Hero subheadline confirmed to be the "Framer-mention" copy variant (there were two near-duplicate candidate strings on the live page from a marquee/scroll-animation rendering the same block twice — confirmed this is a UI animation pattern, not a data bug).

---

## 12. Next Session — Documentation Deliverables (Due This Weekend, to Sir Gio)

Following the Website Team sync this session, two official documents are needed. Both are for the Website Team's ongoing use, not just this handoff's continuity.

### 12.1 Document 1 — Payload Guidelines & Explanation

Audience: Website Team members who will use Payload admin day-to-day but don't need to know the underlying Next.js/API wiring.

Should likely cover:
- What Payload is and how it fits into the apir-tayo architecture (CMS-as-separate-service, not embedded in the frontend repo)
- The multi-tenant model: Tenant → Site → collections (FAQs, Testimonials, Portfolio Items, Pricing Plans, SiteSettings)
- How to use the admin UI for each collection — creating/editing FAQs, testimonials, etc., and now SiteSettings for homepage headings (§11)
- The SiteSettings "one record per site" constraint and what the `customFields` array is for (and isn't, yet — not wired to frontend)
- Known gaps to be aware of as a content editor: 60s ISR delay (changes aren't instant), CTA secondary button not yet editable, fallback-to-hardcoded behavior if a field is left empty
- Where to flag bugs/requests going forward

### 12.2 Document 2 — Replication Process (Wiring Payload to a New Frontend Repo)

Audience: more technical — for if/when another frontend project needs to be wired to Payload the same way apir-tayo was.

Should likely cover, based on what was actually built:
- The `fetchFromPayload()` pattern and how to add a new fetch function for a new collection (the `fetchSiteSettings()` addition this session is a recent concrete example to walk through)
- Required env vars: which are server-only vs. `NEXT_PUBLIC_`-exposed, and **why** — directly reference the production login CORS bug (§1.1) as a cautionary example of what goes wrong when this distinction is ignored
- The site-scoping query pattern (`?where[site][equals]={PAYLOAD_SITE_ID}`) and the slug-vs-ID gotcha from earlier sessions (filtering by slug silently returns null-tenant content — requires a slug→ID→content two-step fetch)
- The fail-safe/fallback convention: every fetch function returns `null`/empty on failure, never throws; every consuming component has a hardcoded default
- Payload's `tabs` field nesting behavior in API responses (the bug found in §11.4) — a genuinely non-obvious gotcha worth documenting once rather than re-discovering per project
- Deployment notes: both repos on Vercel, the `getServerSideURL()` self-reference fix (§1.1/§4), proxy pattern for any browser-facing call to Payload

Both documents are scoped as drafts for review, not final — confirm with Sir Gio/Website Team on structure and depth before treating either as final.

