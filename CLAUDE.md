# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Identity

This is a **Payload CMS v3** proof-of-concept for multi-tenant content management. It started as the official Payload Website Template (Next.js App Router + MongoDB + TailwindCSS + shadcn/ui) and has been extended with `@payloadcms/plugin-multi-tenant`.

- **Stack:** Payload 3.85.1, Next.js 16, MongoDB (via `@payloadcms/db-mongodb`), pnpm, TypeScript strict mode
- **Package manager:** pnpm (enforced by `.npmrc`)
- **Environment:** `.env` at project root (see `.env.example` for required vars)

## Project Context

This POC was assigned by Sir Jeff to evaluate a multi-tenant CMS architecture
where clients eventually manage their own content through an AI agent
(voice/text commands) rather than touching the backend directly. The agent
would operate under guardrails defining what fields/collections it's allowed
to modify.

Sir Gio is running a parallel, independent POC evaluating WordPress
Multisite (IWP) for the same use case. The two are not yet confirmed to be
connected — findings will be compared once both POCs have results.

If Payload is selected, the long-term integration path is with `apir-tayo`:
replacing its hardcoded frontend content and WordPress/Gravity Forms backend
with Payload's API and form builder, run as a separate service (not inside
the apir-tayo repo).

**Current POC progress:** Multi-tenancy validated, Agent API Phases 1–10.1 complete (chat UI, confirmation flow, audit log, record resolution, create-record flows with image upload support).

### Agent API (Workstream A)

The agent route at `POST /api/agent` accepts `{ message: string, tenantId: string, confirmed?: boolean, proposal?: ProposalPayload }` and
parses natural-language commands via DeepSeek to execute CMS actions. The `tenantId` is
resolved upstream by the portal session (`portal_tenant_id` cookie) and forwarded by the
`/api/portal/agent` proxy in apir-tayo.

- **Phase 1:** PortalClients collection + login endpoint (complete)
- **Phase 2:** Chat UI in apir-tayo portal (complete)
- **Phase 3:** Agent route wired to portal — accepts `{ message, tenantId }`, tenantId
  flows through from portal session directly (complete)
- **Phase 4:** Confirmation flow + audit log (complete)
  - **Dry-run (confirmed: false / absent):** Parses command via DeepSeek, resolves the
    document, fetches current value, returns `{ status: "pending_confirmation", proposal: {...} }`.
    No mutation occurs.
  - **Execute (confirmed: true):** Uses the `proposal` object from the dry-run response
    directly — skips DeepSeek. Applies the change via PATCH and writes an audit log entry
    to the AgentAuditLog collection.
  - **AgentAuditLog collection:** Immutable audit trail (`update: false`, `delete: false`).
    Records `tenant`, `action`, `collection`, `documentId`, `slug`, `previousValue`,
    `newValue`, and `confirmedAt` for every confirmed change.
- **Phase 5:** Agent capability expansion + portal UX (complete)
  - **New actions (use record ID, not slug — these collections have no slugs):**
    - FAQ: `update_faq_question`, `update_faq_answer` → PATCH `/api/faqs/{id}`
    - Testimonials: `update_testimonial_quote`, `update_testimonial_name`, `update_testimonial_position` → PATCH `/api/testimonials/{id}`
    - Portfolio items: `update_portfolio_title`, `update_portfolio_category`, `update_portfolio_url` → PATCH `/api/portfolio-items/{id}`
    - Image linking: `link_image` (links uploaded media to testimonials/portfolio-items) → PATCH `/api/{collection}/{id}` with `{ image: mediaId }`
  - **Tenant scoping:** All new actions enforce tenant ownership. For FAQs/testimonials/portfolio-items, scoping is resolved via `record.site.tenant` (Sites collection). For posts/pages, scoping uses the direct `tenant` field from the multi-tenant plugin. Mismatched tenants return 403.
  - **Image upload endpoint:** `POST /api/agent-upload` — accepts multipart/form-data (`file` + `tenantId`), forwards to Payload's `/api/media` with JWT auth, verifies tenant on the created media, returns `{ mediaId, url }`.
  - **ProposalPayload** now includes optional `id` field alongside `slug` (for backward compatibility with post/page actions).
  - **Capabilities panel** in apir-tayo portal: "What can I do?" modal listing supported and unsupported actions.
  - **Image attach in chat:** Paperclip icon, file preview, upload-then-send flow.
- **Phase 6:** Smart Record Resolution (complete)
  - **List actions:** Three new DeepSeek actions — `list_faqs`, `list_testimonials`, `list_portfolio_items`. Emitted as a fallback when the user mentions a collection but the record cannot be identified by name. Replaces the old `RESOLVE_NEEDED` dead end.
  - **`fetchTenantRecords` helper:** Resolves tenant-scoped records for site-scoped collections (FAQs, testimonials, portfolio items). Queries sites → site IDs → collection with `where[site][in]`. Returns `{ id, label, preview }` shaped per collection, or null on fetch failure.
  - **`needs_selection` / `empty_collection` responses:** The agent route returns list results to the client without exposing internal IDs. Empty collections return a friendly message (HTTP 200, `status: "empty_collection"`).
  - **`[resolved id: <id>]` convention:** The ChatWindow resolves human-readable selections to internal IDs and appends them to the message invisibly. DeepSeek extracts the ID and uses it in the action. IDs are never shown to the client.
  - **RESOLVE_NEEDED fully removed** from SYSTEM_PROMPT, ACTION_META, and all dispatch handlers.

- **Phase 10.1:** Image support in create flow + upload error handling (complete)
  - **Image field on create actions:** `add_testimonial` and `add_portfolio_item` now support
    an optional `image` field. The field is system-injected from a file upload — DeepSeek must
    never extract or guess it (enforced by IMAGE FIELD RULE in `SYSTEM_PROMPT`). The `mediaId`
    flows: upload → request body → `route.ts` injects into `parsed.fields.image` →
    `initCreateFlow` pre-fills `collected.image` → `nextMissingField` silently skips it (never
    prompted) → `buildCreateProposal` shows `image: (uploaded image attached)` instead of raw
    ID → `executeCreate` includes it in the POST payload as a Payload relationship ID.
  - **Image preview fix (apir-tayo):** `useImageUpload` uses a `useRef` for object URL tracking
    instead of a `useEffect` dependency on `imagePreviewUrl`, preventing premature revocation
    before the browser paints the preview `<img>`. Original filename is captured in
    `originalFileName` state at selection time (before server-side sanitization).
  - **Broken image in history fix (apir-tayo):** `Message` type replaced `imageUrl`/`imageName`
    with `attachedImageName` — object URLs are never stored in message history (they are revoked
    after upload). `MessageList` renders a static attachment pill (paperclip icon + filename)
    instead of a broken `<img>`. Pre-send thumbnail in `MessageInput` is unaffected.
  - **Create flow image merge (apir-tayo):** `useChatSession` awaiting-fields chain handles
    `hasFile` during step-by-step collection — uploads the image, merges `{ image: mediaId }`
    into `collected` before sending, and captures the filename for the attachment indicator.
  - **Upload error messaging:** `agent-upload/route.ts` parses Payload APIError JSON
    (e.g. `{"errors":[{"message":"File too large..."}]}`) to extract clean user-facing
    messages. Client-side `formatUploadError()` bypasses the agent-error sanitizer for
    upload errors (which are user-actionable, not internal agent mishaps).
  - **Fuzzy-match ID fix:** `handleTextUpdate` fuzzy-match path now updates `parsed.id`
    to the real MongoDB ID after resolving a record by display name. Previously
    `documentId` in the proposal carried the raw user text (e.g. the FAQ question
    string "No you aren't really"), causing `PATCH /api/faqs/No%20you%20aren't%20really` → 404.

### Agent API Module Structure

The agent route has been factored into focused modules under `src/app/api/agent/`:

| File                      | Purpose                                                                                                                                              |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `route.ts`                | Orchestration shell — parses request, gets auth, delegates to handlers, injects `mediaId` into create-action fields                                  |
| `types.ts`                | `ParsedAction`, `ProposalPayload`, `AwaitingFieldsResponse`, `CreateFieldDef`, type guards                                                           |
| `prompts.ts`              | `SYSTEM_PROMPT` (includes IMAGE FIELD RULE), `DEEPSEEK_BASE_URL`, `DEEPSEEK_MODEL`                                                                   |
| `deepseek.ts`             | `callDeepSeek(message)` — calls DeepSeek API, strips fences, validates JSON                                                                          |
| `shared.ts`               | `CREATE_FIELD_DEFS`, `initCreateFlow`, `buildCreateProposal`, `executeCreate` — create-record state machine with image field support                 |
| `resolver.ts`             | `resolveSlugToId`, `resolveRecordTenant`, `fetchTenantRecords`, `patchRecord`, `patchTitle`, `fetchRecordById`, `getFieldValue`, `getDocumentTitle`  |
| `audit.ts`                | `writeAuditLog(params)` — writes immutable audit entries to AgentAuditLog                                                                            |
| `actions/shared.ts`       | `ACTION_META` map, `patchWithRetry`, `createWithRetry`, `getTenantSiteId`, `handleTextUpdate` (text-update handler with fuzzy-match + ID correction) |
| `actions/posts.ts`        | `handlePosts` — post/page title updates (slug-based)                                                                                                 |
| `actions/faqs.ts`         | `handleFaqs` + `handleCreateFaq` — FAQ question/answer updates + create                                                                              |
| `actions/testimonials.ts` | `handleTestimonials` + `handleCreateTestimonial` — testimonial text updates + create                                                                 |
| `actions/portfolio.ts`    | `handlePortfolio` + `handleCreatePortfolio` — portfolio text updates + create                                                                        |
| `actions/images.ts`       | `handleImages` — link_image (dry-run + execute)                                                                                                      |
| `actions/list.ts`         | `handleList` — list_faqs / list_testimonials / list_portfolio_items                                                                                  |
| `actions/pricing.ts`      | `handlePricing` — add_pricing_plan (dry-run + execute)                                                                                               |

Additional agent routes:
| Route | Purpose |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/api/agent-upload/route.ts` | `POST /api/agent-upload` — multipart file upload, forwards to Payload `/api/media`, verifies tenant scoping, parses APIError JSON for clean errors |

All handlers follow the same signature: `(parsed, tenantId, token, confirmed, proposal?) => Promise<Response>`.

## Commands

```bash
pnpm dev                      # Start dev server (Next.js + Payload admin on localhost:3000)
pnpm build                    # Production build
pnpm start                    # Serve production build
pnpm generate:types           # Regenerate payload-types.ts after schema changes
pnpm generate:importmap       # Regenerate admin import map after adding/removing plugins
pnpm lint                     # ESLint
pnpm lint:fix                 # ESLint auto-fix
pnpm test:int                 # Vitest integration tests (tests/int/)
pnpm test:e2e                 # Playwright E2E tests (tests/e2e/)
pnpm test                     # Both test:int and test:e2e
pnpm payload                  # Payload CLI (e.g. pnpm payload migrate:create)
```

**After any schema or plugin change, always run both:**

```bash
pnpm generate:types && pnpm generate:importmap
```

## Architecture

### Route Groups (Next.js App Router)

The app uses two route groups under `src/app/`:

| Group        | Path             | Purpose                                         |
| ------------ | ---------------- | ----------------------------------------------- |
| `(frontend)` | `/`              | Public-facing website, SSR pages, seed endpoint |
| `(payload)`  | `/admin`, `/api` | Payload admin panel, REST API, GraphQL          |

The `(payload)/layout.tsx` is auto-generated by Payload — do not edit directly.

### Collections

All collections live under `src/collections/`. The core content collections are:

| Collection    | Slug              | Slug Field           | Notes                                                                                                                                                                               |
| ------------- | ----------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pages         | `pages`           | auto (title)         | Drafts enabled, layout builder, SEO, hero blocks                                                                                                                                    |
| Posts         | `posts`           | auto (title)         | Drafts enabled, lexical editor, related posts, authors                                                                                                                              |
| Media         | `media`           | N/A                  | Uploads with image sizes (thumbnail→xlarge + og), folders enabled                                                                                                                   |
| Categories    | `categories`      | auto (title)         | Taxonomy for posts, nested via plugin                                                                                                                                               |
| Users         | `users`           | N/A                  | Auth-enabled, admin access                                                                                                                                                          |
| Tenants       | `tenants`         | `fieldToUse: 'name'` | Added for multi-tenancy POC                                                                                                                                                         |
| PortalClients | `portal-clients`  | N/A                  | **Phase 1:** Auth-enabled (email + password), tenant relationship, admin-only access. Used by apir-tayo portal login.                                                               |
| AgentAuditLog | `agent-audit-log` | N/A                  | **Phase 4:** Immutable audit trail for agent actions. `update: false`, `delete: false`. Records tenant, action, collection, documentId, slug, previousValue, newValue, confirmedAt. |

### Multi-Tenancy Plugin

Configured in [src/plugins/index.ts](src/plugins/index.ts). Key settings:

- **Content collections:** `pages`, `posts`, `media`, `categories` get auto-added `tenant` relationship field
- **Users collection:** auto-gets `tenants` array field for tenant assignment
- `cleanupAfterTenantDelete: false` — no cascade deletes (POC safety)
- `userHasAccessToAllTenants: () => true` — super-admin for all logged-in users (POC; replace with role check for production)
- `useTenantsListFilter: false` — Tenants list shows all tenants regardless of nav selector selection

### Plugins ([src/plugins/index.ts](src/plugins/index.ts))

Registered plugins in order: multi-tenant, redirects, nested-docs, SEO, form-builder, search. Some plugins add their own collections (redirects, forms, form-submissions, search). See the file for full config of each.

### Globals

- **Header** — nav links, rendered in `src/Header/`
- **Footer** — footer content, rendered in `src/Footer/`

Both have `revalidate` hooks for on-demand ISR.

### Access Control

Reusable access functions in `src/access/`:

- `anyone` — public, no restrictions
- `authenticated` — logged-in users only
- `authenticatedOrPublished` — logged-in users see all; public sees only `_status: 'published'`

The multi-tenant plugin layers its own access control on top (tenant-scoped queries).

### Layout Builder (Blocks)

Pages and Posts use a block-based layout builder. Blocks live in `src/blocks/`:

- Hero (HighImpact, MediumImpact, LowImpact, PostHero variants in `src/heros/`)
- Content, MediaBlock, CallToAction, Archive, Banner, Code, Form
- Render pipeline: `src/blocks/RenderBlocks.tsx` → each block's `Component.tsx`

### Frontend

- SSG/SSR pages at `src/app/(frontend)/[slug]/` and `/posts/[slug]/`
- Layout uses Geist fonts, TailwindCSS v4, dark mode via Theme provider
- `AdminBar` component for preview mode
- On-demand revalidation via `afterChange` hooks on collections and globals
- Seed endpoint at `/next/seed` (POST, authenticated) — drops and recreates sample data from `src/endpoints/seed/`

## Key Conventions

### Path Aliases

```ts
@/*           → src/*
@payload-config → src/payload.config.ts
```

### Type Generation

The file `src/payload-types.ts` is auto-generated. Never edit it. After changing collections, globals, fields, or plugins, run:

```bash
pnpm generate:types
```

The `Config` type from `payload-types.ts` is used as the generic parameter for type-safe plugin configuration (see multi-tenant plugin in `plugins/index.ts`).

### Import Map

The file `src/app/(payload)/admin/importMap.js` is auto-generated. If the admin panel shows a "PayloadComponent not found in importMap" error after adding a plugin, run:

```bash
pnpm generate:importmap
```

### Environment Variables

- `DATABASE_URL` — MongoDB connection string (currently Atlas)
- `PAYLOAD_SECRET` — encrypts JWTs
- `NEXT_PUBLIC_SERVER_URL` — used for CORS and URL generation (default: `http://localhost:3000`)
- `CRON_SECRET` — authenticates scheduled jobs
- `PREVIEW_SECRET` — validates draft preview requests

### Testing

- **Integration tests:** `tests/int/` — Vitest + jsdom, uses `@/payload.config` directly
- **E2E tests:** `tests/e2e/` — Playwright, helpers in `tests/helpers/` for login and user seeding
- Test env file: `test.env`

## Payload Skill

This project includes a Payload CMS reference skill in `.claude/skills/payload/`. The `SKILL.md` provides quick reference for common patterns. Detailed reference docs for fields, collections, hooks, access control, queries, adapters, and plugin development are in `.claude/skills/payload/reference/`.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:

- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

## Context7 MCP

- Always use Context7 when I need library/API documentation, code generation, setup or configuration steps without me having to explicitly ask.

## UI-UX Pro Max Skill

- UI/UX design intelligence — 67 styles, 96 palettes, 57 font pairings, shadcn/ui integration. Triggered via `/ui-ux-pro-max` (see top of file).
  Usage rules:
- **Always** invoke `skill: "ui-ux-pro-max"` before any UI task
- Trigger on: plan, build, create, design, implement, review, fix, improve, optimize, enhance, refactor, check — when applied to UI/UX work
- Covers: components, layouts, dashboards, mobile views, forms, cards, modals
