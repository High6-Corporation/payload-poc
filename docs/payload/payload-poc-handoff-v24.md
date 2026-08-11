# Payload CMS Integration — Handoff Document

> **Branch:** `master` (production)
> **Date:** June 30, 2026
> **Version:** v24
> **Summary:** Contact page form fields and submissions are now fully wired to Payload CMS in production. This session resolved a long-standing chain of infrastructure issues: (1) `.next/` ownership conflict between the `deploy` rsync user and the `appuserwebsite` PM2 user — permanently fixed by adding `sudo rm -rf .next` before rsync in `deploy.yml`; (2) WP Gravity Forms env vars missing from the PM2 process — fixed by adding them to `ecosystem.config.cjs`; (3) the per-fetch `next: { revalidate: 60 }` cache in `getContactFormDefinition()` was caching a `null` response from build time, replaced with `cache: 'no-store'`; (4) contact page migrated to fetch fields from Payload (`fetchPayloadContactForm()`) with Gravity Forms as fallback; (5) form submissions wired to Payload's `form-submissions` collection via new `submitPayloadFormAction()` — required fetching the parent form's `tenant` ID and including it in the POST body to satisfy the multi-tenant plugin's required `tenant` field. Both field rendering and submission are confirmed working in production. **Working agreement added this session:** when the AI Agent presents an implementation plan, Claude will respond with a ready-to-send message for the Agent rather than a direct answer. **Next session:** verify form submissions appear correctly in Payload admin, then resume roadmap (Phase 18 scoping or Phase 20 dashboard refactor).

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
        └── Forms (contact form — tenant + site scoped)
  └── Site ("future-project-2")   ← code now supports this (Phase 15); not yet seeded or tested

PortalClients (separate auth collection)
  └── email + password (Payload-managed)
  └── tenant (relationship → Tenants)
```

### Cumulative achievements (Phases 1–17 + Production Promotion + Contact Form Migration)
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
- SMTP2GO email integration via `nodemailerAdapter` — forgot-password email confirmed working in production (Phase 17)
- **Contact page `/contact` fully migrated to Payload** — fields fetched from Payload `forms` collection, submissions POSTed to Payload `form-submissions` collection. Gravity Forms kept as fallback for field fetching only. ✅ Confirmed working in production (this session)
- Graphify knowledge graph built: 948 nodes, 1797 edges, 73 communities — graph artifacts at `graphify-out/` in payload-poc

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
| Form Submissions | `form-submissions` | Submitted form data. ✅ Tenant-scoped (Phase 16). `site` auto-populated from parent form via `beforeChange` hook. `tenant` must be explicitly passed in the POST body (multi-tenant plugin requirement). CleanTalk spam check active. Public create access. |

> ℹ️ `forms` and `form-submissions` are plugin-generated by `@payloadcms/plugin-form-builder`. Their `site` fields, hook ordering, and multi-tenant registration are injected via `formOverrides` / `formSubmissionOverrides` in `src/plugins/index.ts`. Do not hand-author separate collection files for these.

> ⚠️ **`form-submissions` POST body must include `tenant`** — the multi-tenant plugin adds a required `tenant` field to `form-submissions`. The `site` field is auto-populated by the `beforeChange` hook from the parent form, but `tenant` is NOT — it must be explicitly included. See `submitPayloadFormAction()` in `app/lib/payload/submitPayloadForm.ts` for the pattern: fetch the parent form first, extract `formDoc.tenant`, include it in the POST body.

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

**Payload form field shape (blockType → DynamicFormField mapping):**
| Payload `blockType` | `GravityFieldType` | Notes |
|---|---|---|
| `text` | `text` | — |
| `email` | `email` | — |
| `number` | `phone` | Seed data convention — phone stored as number block |
| `textarea` | `textarea` | — |
| `select` | `select` | — |

`payloadName` field added to `DynamicFormField` interface — stores the original Payload block name (e.g. `"full-name"`, `"email"`, `"message"`) for use in `submissionData`. The `name` field (`input_N`) is kept for Gravity Forms compatibility.

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

### deploy.yml — Build step env vars
```yaml
NEXT_PUBLIC_GA_ID: ${{ secrets.NEXT_PUBLIC_GA_ID }}
NEXT_PUBLIC_GTM_ID: ${{ secrets.NEXT_PUBLIC_GTM_ID }}
NEXT_PUBLIC_META_PIXEL_ID: ${{ secrets.NEXT_PUBLIC_META_PIXEL_ID }}
PAYLOAD_API_URL: ${{ secrets.PAYLOAD_API_URL }}
NEXT_PUBLIC_PAYLOAD_API_URL: ${{ secrets.NEXT_PUBLIC_PAYLOAD_API_URL }}
PAYLOAD_SITE_ID: ${{ secrets.PAYLOAD_SITE_ID }}
```

### deploy.yml — Step order (current, after this session's fixes)
1. **Checkout + Setup Node + Install + Build** — standard
2. **Fix .next ownership before rsync** — SSHes in as `deploy`, runs `sudo rm -rf /home/projects/apirtayo/.next` (full delete, not chown). Requires passwordless sudo rule in `/etc/sudoers` for this exact command.
3. **Transfer build artifact to VPS** — rsync `.next/` as `deploy` user. Directory was just deleted so no ownership conflict.
4. **Sync source & Reload PM2** — SSHes in, `sudo chown -R appuserwebsite:appuserwebsite /home/projects/apirtayo/.next`, git pull, npm ci, pm2 reload.

> ⚠️ **`SSH_USER` secret is `deploy`**, not `appuserwebsite`. Rsync runs as `deploy`. The `sudo rm -rf` before rsync and `sudo chown` after rsync are what prevent the recurring `EACCES` ownership conflict. The `/etc/sudoers` file on the VPS has passwordless rules for both commands scoped to the exact paths.

### VPS sudoers rules (in `/etc/sudoers`)
```
deploy ALL=(ALL) NOPASSWD: /usr/bin/rm -rf /home/projects/apirtayo/.next
deploy ALL=(ALL) NOPASSWD: /usr/bin/chown -R appuserwebsite\:appuserwebsite /home/projects/apirtayo/.next
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
| `AGENT_EMAIL` | Yes | Service account for AI Agent |
| `AGENT_PASSWORD` | Yes | Service account password |
| `DEEPSEEK_API_KEY` | Yes | DeepSeek API key for agent intent parsing |
| `CRON_SECRET` | Optional | Auth for cron endpoints |
| `PREVIEW_SECRET` | Optional | Draft preview validation |
| `CLEANTALK_API_KEY` | Yes | Anti-spam key. Server-only. Added (Phase 16). |
| `SMTP2GO_HOST` | Yes | `mail.smtp2go.com` (Phase 17) |
| `SMTP2GO_PORT` | Yes | `2525` (Phase 17) |
| `SMTP2GO_FROM_EMAIL` | Yes | `no-reply@h6app.site` (Phase 17) |
| `SMTP2GO_USERNAME` | Yes | Reused from `email-app-backend/.env` (Phase 17) |
| `SMTP2GO_PASSWORD` | Yes | Reused from `email-app-backend/.env` (Phase 17) |

---

## 5. AI Agent Client Portal

*(Unchanged from v23 — see §5.1–5.8 of prior handoff for full detail)*

---

## 6. Key Files Reference

### apir-tayo (`/Users/josh/work/apir-tayo`)
| File | Role |
|---|---|
| `middleware.ts` | Protects `/portal/chat` — redirects to `/portal/login` if `portal_token` absent |
| `app/(pages)/contact/page.tsx` | Contact page — fetches fields from Payload via `fetchPayloadContactForm()`, falls back to `WP_GRAVITY_FORM_CONTACT_ID`. `revalidate = 3600`. |
| `app/components/sections/contact/ContactFormSection.tsx` | Now accepts `fields` and `formId` as props (was fetching internally). No longer imports from `contactform.ts` at runtime. |
| `app/components/sections/contact/ContactForm.tsx` | Renders dynamic fields, calls `submitPayloadFormAction()` on submit. CleanTalk token extracted from FormData internally by the action. |
| `app/lib/payload/fetchPayloadForm.ts` | `fetchPayloadContactForm()` — queries Payload forms by site ID. `fetchPayloadFormFields(formId)` — fetches single form. Transforms `blockType` → `GravityFieldType`, populates `payloadName` on each field. |
| `app/lib/payload/submitPayloadForm.ts` | `submitPayloadFormAction()` server action — honeypot check, CleanTalk validation (via imported `validateCleanTalkToken`), fetches parent form to get `tenant` ID, POSTs `{ form, submissionData, tenant }` to `/api/form-submissions`. |
| `app/lib/gravity-forms/contactform.ts` | Gravity Forms fetch + submission logic. Kept intact as fallback. `validateCleanTalkToken` now exported for reuse by `submitPayloadForm.ts`. `DynamicFormField` interface now has optional `payloadName?: string` field. |
| `ecosystem.config.cjs` | PM2 process config. **Must include all VPS-only runtime env vars** in the `env` block — currently includes WP_* vars. After any change: `pm2 delete apirtayo && pm2 start ecosystem.config.cjs`. |
| `.github/workflows/deploy.yml` | CD pipeline — step order: chown/rm → rsync → git pull + npm ci + pm2 reload. |
| `app/lib/payload/fetchPayload.ts` | `fetchFromPayload<T>()`, `fetchSiteSettings()`, `getCustomField()` |
| `app/lib/payload/payload-types.ts` | TypeScript interfaces for Payload collections |

### payload-poc (`/Users/josh/work/payload-poc`)
| File | Role |
|---|---|
| `src/plugins/index.ts` | Plugin registrations. `formSubmissionOverrides` hooks: (1) auto-populates `site` from parent form, (2) CleanTalk spam check. **Plugin ordering critical:** `multiTenantPlugin` must be last. |
| `src/collections/PortalClients.ts` | Auth-enabled collection |
| `src/collections/AgentAuditLog.ts` | Immutable audit log |
| `src/collections/SiteSettings.ts` | Tabs-grouped heading/copy fields per site |
| `graphify-out/GRAPH_REPORT.md` | Dependency graph audit report — load before any cross-cutting changes |
| `graphify-out/graph.json` | Raw graph data |

---

## 7. Remaining Work — Carry-Over Items

### Open items table
| Item | Priority | Notes |
|---|---|---|
| Verify form submissions appear in Payload admin | 🔴 Critical | Submission confirmed working locally and in production (200 response), but not yet visually verified in Payload admin → Form Submissions. Do this first next session. |
| Verify clean GHA deploy end-to-end | 🟡 Medium | `--exclude` flags + rm-before-rsync pattern confirmed working this session. Worth a clean re-run to confirm stability. |
| Two-site isolation test (Phase 15) | 🟡 Medium | Code complete, no second site seeded. |
| `apir-tayo` portal proxy missing `siteId` | 🟡 Medium | One-line fix identified, not yet applied. See §10 Phase 15. |
| Defensive error catch in apir-tayo agent proxy | 🟡 Medium | `app/api/portal/agent/route.ts` — non-2xx responses should return friendly fallback. |
| Remove `CLEANTALK_API_KEY` from apir-tayo VPS `.env` | 🟡 Medium | `contactform.ts` GF submission path still references it. Remove when GF submission is fully retired. |
| SPF/DKIM verification for payload-poc Vercel domain | 🟢 Low | May already be covered by `h6app.site` verified-domain status. |
| On-demand ISR revalidation | 🟡 Medium | `revalidateTag`/`revalidatePath` webhook. 60s/1h delays are confusing for clients. |
| AGENT_EMAIL role restrictions | 🟡 Medium | Lock service account to only agent-used collections. Agentic tasks benched. |
| Rotate exposed credentials | 🔴 High | `.env` was committed to `master` before repo went public. Not Josh's task. |
| FAQ "which field" step | 🔴 High | Prompt ready in prior handoff §7. Agentic tasks benched. |
| `url` field extraction | ⏸️ Low | Deprioritized. Agentic tasks benched. |
| MongoDB Atlas migration | 🟡 Medium | Migrate to new Atlas account. Keep same document IDs — Supabase media prefixes depend on them. |
| No `.env.example` in apir-tayo | 🟢 Low | Add alongside next env var change. |

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
# SSH into VPS as deploy user
ssh deploy@72.60.195.99

# Fix .next ownership (run as deploy)
sudo chown -R appuserwebsite:appuserwebsite /home/projects/apirtayo/.next

# Switch to appuserwebsite
sudo su - appuserwebsite -s /bin/bash
cd /home/projects/apirtayo

# Check PM2 process list and env vars
pm2 list
pm2 env <id> | grep -E "WP_|NODE_ENV|PAYLOAD"

# IMPORTANT: After editing ecosystem.config.cjs, do NOT use pm2 reload --update-env
# It does not reliably pick up new vars. Use delete + start instead:
pm2 delete apirtayo
pm2 start ecosystem.config.cjs

# Check PM2 logs
pm2 logs <id> --lines 50

# Clear Next.js fetch cache
rm -rf .next/cache/fetch-cache/*
```

### Testing contact form submission locally
```bash
# 1. Start both servers
cd /Users/josh/work/payload-poc && pnpm dev
cd /Users/josh/work/apir-tayo && npm run dev

# 2. Open contact page
open http://localhost:3002/contact

# 3. Fill out and submit the form

# 4. Verify in Payload admin
open http://localhost:3000/admin  # → Form Submissions collection
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
| Phase 17 — SMTP2GO Email Integration | `nodemailerAdapter` configured with SMTP2GO credentials reused from `email-app-backend`. Forgot-password email tested and confirmed in production. | ✅ Complete |
| Contact Form Migration (this session) | Fields fetched from Payload (`fetchPayloadContactForm()`). Submissions wired to Payload `form-submissions` (`submitPayloadFormAction()`). `tenant` ID fetched from parent form and included in POST body. Gravity Forms kept as field-fetch fallback. ✅ Confirmed working in production. | ✅ Complete |
| Infrastructure Fixes (this session) | `.next/` ownership permanently fixed (rm before rsync in deploy.yml). WP vars added to `ecosystem.config.cjs`. Per-fetch GF cache changed to `cache: 'no-store'`. VPS sudoers rules added for passwordless deploy operations. | ✅ Complete |

---

## 10. Roadmap — Future Phases

*(See `Payload-CMS-Future-Roadmap.docx` for full detail)*

### Phase 15 — `getTenantSiteId()` Multi-Site Fix ← 🔶 CODE COMPLETE, VERIFICATION PENDING
Required before closing: seed a second site, run 5-step isolation test, apply one-liner `siteId` fix in apir-tayo portal proxy.

### Phase 18 — Custom Collections per Site
Needs scoping session. Evaluate `customFields` in SiteSettings first. **Effort:** 3–5 days.

### Phase 19 — Page Templates
Template-key approach decided. Add `template` select to `Sites`, render matching component in `app/page.tsx`. **Effort:** 3–5 days (first two templates).

### Phase 20 — Dashboard Refactor
Replace `BeforeDashboard` with real management dashboard (3 stat cards + quick actions). In progress — `PAYLOAD_SITE_ID` env var dependency bug being fixed. **Effort:** 3–4 days.

### Phase 21 — Enhanced Agent Audit Log
Add `promptSent` + `rawModelOutput` to `AgentAuditLog`. **Effort:** 1 day.

### Phase 22 — AI Agent Configuration Interface
`AgentConfig` collection, provider abstraction, encrypted API keys, `enabledActions` enforcement. Blocked by Phase 21. **Effort:** 1–2 weeks.

---

## 11. Payload CMS Configuration (Verified)

### Plugins (registered in `src/plugins/index.ts`, in order)
1. `@payloadcms/storage-s3` — Collection: `media`.
2. `@payloadcms/plugin-redirects` — Collections: `pages`, `posts`.
3. `@payloadcms/plugin-nested-docs` — Collections: `categories`.
4. `@payloadcms/plugin-seo`
5. `@payloadcms/plugin-form-builder` — `formOverrides`: site field + lexical editor. `formSubmissionOverrides`: site auto-population hook + CleanTalk spam check hook.
6. `@payloadcms/plugin-search` — Collections: `posts`.
7. `@payloadcms/plugin-multi-tenant` — Collections: `pages`, `posts`, `media`, `categories`, `forms`, `form-submissions`. **Must be last** — adds `tenant` fields to all listed collections including plugin-generated ones.

> ⚠️ Plugin ordering is critical. `multiTenantPlugin` must be registered last so it can add `tenant` fields to collections added by earlier plugins (`forms`, `form-submissions`).

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
| Form submissions not yet visually verified in Payload admin | Submission returns 200 and confirmed working, but admin check not done. | First thing next session |
| `CLEANTALK_API_KEY` still in apir-tayo VPS `.env` | `contactform.ts` GF submission path still references it. Safe to leave until GF submission fully retired. | When retiring GF submission path |
| Exposed credentials not yet rotated | `.env` was committed to `master` before repo went public. | ASAP — not Josh's task |
| MongoDB Atlas migration pending | Migrate to new Atlas account. Keep same document IDs. | Before Atlas account handoff |
| No `.env.example` in apir-tayo | No documented list of required vars for new devs. | Low priority |
| SPF/DKIM not verified for payload-poc Vercel domain | May already be covered by `h6app.site` verified-domain status. | Low priority follow-up |

---

## 14. Graphify Knowledge Graph

A full dependency graph of the `payload-poc` codebase was built during Phase 16. Use it in future agentic coding sessions.

### Graph artifacts (`graphify-out/` in payload-poc)
| File | Contents |
|---|---|
| `graph.html` | Interactive visualization — open in browser |
| `GRAPH_REPORT.md` | Full audit report with community breakdown |
| `graph.json` | Raw graph data for programmatic use |

### Stats
- **948 nodes**, **1797 edges**, **73 communities** (as of Phase 16)

### God nodes (touch with care)
| Node | Edges | Role |
|---|---|---|
| `cn()` | 57 | Tailwind class utility — bridges 8 communities |
| `getServerSideURL()` | 19 | URL resolution utility used across plugins, collections, and config |
| `authenticated()` | 15 | Core access control function |
| `POST()` | 15 | Route handler pattern used across all API routes |

### Contact form cluster (Community 8)
```
ContactPage [page.tsx]
  └─→ fetchPayloadContactForm()     [fetchPayloadForm.ts]   ← NEW
  └─→ ContactFormSection [ContactFormSection.tsx]           ← now prop-driven
        └─→ ContactForm [ContactForm.tsx]
              ├─→ DynamicFormField (type)      } from contactform.ts
              ├─→ submitPayloadFormAction()    } from submitPayloadForm.ts  ← NEW
              └─→ useCleanTalkBotDetector()    } from cleantalkscript.ts
```

### How to use in agentic sessions
Before starting any session that touches cross-cutting concerns:
```
skill: "graphify"
Use graphify-out/GRAPH_REPORT.md and graphify-out/graph.json to understand the dependency 
graph before making changes. Pay special attention to god nodes — changes to cn(), 
getServerSideURL(), and authenticated() have wide blast radius.
```

---

## 15. Working Agreements

- **Step-by-step with confirmation** — one step at a time, wait for output before next step.
- **Understand the why** — explanations accompany recommendations.
- **Stakeholder messages** — short and direct, not comprehensive.
- **Agent plan responses** — when the AI Agent presents an implementation plan in this chat, Claude responds with a ready-to-send message for the Agent (not a direct answer to Josh). This keeps the Agent loop clean and avoids context switching.
- **Test locally before pushing** — verify changes on local dev servers before deploying to production.
- **Graphify before touching cross-cutting files** — always load the graph report before modifying plugins, access control, hooks, or URL utilities.
