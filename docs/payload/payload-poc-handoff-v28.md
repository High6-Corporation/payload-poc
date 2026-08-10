# Payload CMS Integration — Handoff Document

> **Branch:** `master` (production)
> **Date:** July 29, 2026
> **Version:** v28
> **Summary:** Team feature-request bundle implemented across three phases — SEO Focus Keyword, Forms QoL, and Custom Collections QoL (see team comments/meeting notes, researched against official Payload docs before implementation). **7 of 8 planned items complete and verified**; one (email notification row naming) is a confirmed Payload form-builder plugin limitation, not a bug on our side. Code committed in logical per-feature commits, not yet pushed — pushing is being handled directly rather than via this doc's usual flow. **Status: awaiting the other team's testing/comments on the pushed changes before further work.** Two items are parked as open product decisions, not engineering work: the OG image asset (currently 300×76, needs a proper 1200×630) and whether `focusKeyword` should be single-value (Yoast/RankMath convention) vs. the current comma-separated multi-keyword textarea — **Sir Gio confirmed multi-keyword is the wanted behavior** (per Slack, July 29 — "can we make it na madami pwedeng ilagay... yung website yung focus keyword" → confirmed "okay na yonnn" after update). **Next session priority:** surface Vercel server logs inside Payload — the other team has asked for this and it hasn't been scoped yet.

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

Deployment note (relevant to next session's task): **payload-poc runs on Vercel** — this is where the "surface server logs in Payload" request will need to source data from (Vercel's log output isn't currently piped anywhere accessible to Payload itself).

### Multi-tenant model

```
Tenant ("High6 Corporation")
  └── Site ("apir-tayo")          ← PAYLOAD_SITE_ID = 6a352f382054dfd250819c26
        ├── FAQs
        ├── Testimonials
        ├── Portfolio Items
        ├── Pricing Plans
        ├── Site Settings (one record per site — now includes SEO meta tab, this session)
        ├── Forms (contact form — tenant + site scoped)
        ├── Custom Collections (Phase 18 — schema definitions)
        └── Custom Collection Entries (Phase 18 — content rows; category support + title field + gallery field, this session)
  └── Site ("future-project-2")   ← code now supports this (Phase 15); not yet seeded or tested

PortalClients (separate auth collection)
  └── email + password (Payload-managed)
  └── tenant (relationship → Tenants)
```

### Cumulative achievements (Phases 1–18 + Category Support + this session's bundle)
*(Phases 1–18 unchanged from v27 — see v27 §1 for full list. This session added:)*
- **SEO Focus Keyword** — `SiteSettings` gained a manual "SEO" tab (`meta` group: title/description/image/focusKeyword), mirroring the existing `Pages`/`Posts` manual-meta-tab pattern rather than relying on `seoPlugin`'s `collections` auto-injection.
- **Forms QoL** — native "Save and Duplicate" verified on `forms`; `beforeDuplicate` field hook added to `title` (`"X" → "X (Copy)"`); native `upload` field type enabled (`uploadCollections: ['media']`); apir-tayo `ContactForm.tsx`/`submitPayloadForm.ts` updated to support file-field submissions (upload-then-reference-by-ID pattern, since `form-submissions` only accepts JSON).
- **Custom Collections QoL** — `custom-collection-entries` gained a `title` field + `useAsTitle: 'title'`; native Duplicate verified on both `custom-collection-entries` and `posts`; new `gallery` field type (multi-select media, modeled on the existing `CategoryPicker` pattern) added to `FieldBuilder`/`EntryDataField`.
- **Confirmed limitation, not fixed:** `emails` array row labels on `forms` still show the form-builder plugin's own default label, not our custom `RowLabel` override — see §13 for detail. Functional fallback (shows `emailTo` value) works fine; low severity.
- Graphify knowledge graph updated this session (see §14).

### Key design decisions (this session, additive to v27's table)
| Decision | Rationale |
|---|---|
| `seoPlugin` `collections`/`globals` left empty; SEO fields added manually to `SiteSettings` | `SiteSettings`' first field is `site` (a relationship), not `type: 'tabs'`. Auto-injection with `tabbedUI: true` only merges cleanly when the first field is already `tabs` — otherwise it collapses all 7 existing homepage-section tabs into one "Content" tab. Manual placement (matching `Pages`/`Posts`' existing pattern) avoids this entirely. |
| SEO applied to `SiteSettings`, not `Pages`/`Posts` | Investigated live frontend fetch calls — only `/` (homepage, via `site-settings`) and `/contact` (via `forms`) are actually rendered. `pages` and `posts` are unused template scaffolding, have no `site` field, and are not multi-tenant scoped. Adding SEO there would be dead code. |
| `focusKeyword` as multi-value (comma-separated textarea), not single-value | Deviates from the Yoast/RankMath single-keyword convention this request was modeled on — flagged as a product decision, then **confirmed by Sir Gio** (Slack, July 29) as the wanted behavior: multiple keywords, comma-separated (e.g. "website, high6, high6creatives, modernizedsolutions"). |
| `beforeDuplicate` hooks placed on individual fields, not collection-level `hooks` | Payload's collection-level `hooks` object doesn't include `beforeDuplicate` at all — it's a field-level-only hook. Initial plan draft had this wrong; corrected before implementation. |
| Posts' `slug` duplicate collision: no custom hook needed | Payload auto-appends `"-copy"` to `unique: true` text fields on duplicate by default. Verified via Playwright before deciding whether to build a custom hook — default behavior was sufficient, so A3 was skipped as a no-op. |
| `emails` RowLabel override: accepted as unfixable within our control | Tried both a mapped-and-spread `formOverrides.fields` override and an in-place-mutation version (per a documented community pattern, Payload GitHub Discussion #15612, for the exact same plugin/field). Neither renders our custom `RowLabel` — the plugin's `emails` array resolves its own internal component registration, not collection-level overrides. Confirmed genuine plugin limitation, not a config mistake. Would need a plugin PR or patching plugin internals to fix. |
| Gallery field via repeated single-select (`useListDrawer`), not native `hasMany` bulk upload | Same rationale as `CategoryPicker` (v27) — avoids an open Payload bug (#9890) where `hasMany: true` upload fields can drop files during bulk multi-file uploads. |

---

## 2. Collections in Payload

*(Unchanged from v27 except as noted below — see v27 §2 for the full table.)*

| Collection | Slug | Change this session |
|---|---|---|
| Site Settings | `site-settings` | New manual "SEO" tab (`meta` group: `title`, `description`, `image`, `focusKeyword`). See §2a. |
| Custom Collection Entries | `custom-collection-entries` | New `title` field, `admin.useAsTitle: 'title'` (was `'id'`). New `gallery` field type support (stores array of `media` document IDs). |
| Posts | `posts` | No schema change — confirmed native Duplicate works, confirmed default `slug` disambiguation on duplicate is sufficient. |
| Forms | `forms` | `beforeDuplicate` hook added to `title` field (via `formOverrides.fields`). Native `upload` field type enabled (`uploadCollections: ['media']`). `emails` array `RowLabel` override attempted, confirmed non-functional (plugin limitation). |

---

## 2a. This Session — Feature Bundle (Detail)

### SEO Focus Keyword — `SiteSettings.ts`
New tab appended to the existing `tabs` array (Hero, Why One Page, How It Works, Trust, CTA, Footer, Custom → **+ SEO**):
```ts
{
  name: 'meta',
  label: 'SEO',
  fields: [
    OverviewField({ titlePath: 'meta.title', descriptionPath: 'meta.description', imagePath: 'meta.image' }),
    MetaTitleField({ hasGenerateFn: true }),
    MetaImageField({ relationTo: 'media' }),
    MetaDescriptionField({}),
    PreviewField({ hasGenerateFn: true, titlePath: 'meta.title', descriptionPath: 'meta.description' }),
    { name: 'focusKeyword', type: 'textarea', label: 'Focus Keyword', admin: { description: 'Comma-separated primary keywords this page targets for SEO.' } },
  ],
}
```
`seoPlugin({...})` in `src/plugins/index.ts` still needs `generateTitle`/`generateURL`/`generateDescription` defined even though `collections`/`globals` are empty — the manually-imported fields (`MetaTitleField` etc.) depend on those generate functions for their "auto-generate" buttons and preview to work.

**apir-tayo SEO content populated for the live site** (via REST API + admin UI, verified persisting):
- Title: "High-Converting Web Design Agency Philippines | ApirTayo by High6" (60 chars)
- Description: "ApirTayo builds high-converting, modern websites for businesses in the Philippines..." (147 chars)
- Focus Keywords: web design, website design, web design agency, web design philippines, high6, high6creatives, modernized solutions, website development, landing page, ui ux design, custom websites
- OG Image: currently 300×76 — **needs replacement with a 1200×630 asset**, flagged as open item, not a code task.

### Forms QoL — `src/plugins/index.ts`, `src/components/EmailRowLabel/index.tsx` (new)
- Native Duplicate confirmed present on `forms` (⋮ action menu).
- `beforeDuplicate` field hook on `title`: `"Contact Us"` → `"Contact Us (Copy)"` on duplicate. Verified via Playwright.
- `uploadCollections: ['media']` added to `formBuilderPlugin({...})` — "Upload" now available as a field type when building a form. Verified via API (`POST /api/forms` with `blockType: "upload"` → `201 Created`).
- `EmailRowLabel` component built, registered in importMap, wired via `formOverrides.fields` targeting the `emails` array field — **does not render**. Confirmed genuine plugin limitation (see decisions table above). Plugin's default label (shows `emailTo` value) remains in place and is functional.

### apir-tayo — file upload in form submissions
- `ContactForm.tsx`: added a `fileupload` case to `renderField()`, tracks selected files in a `useRef<Map<string, File>>`.
- `submitPayloadForm.ts`: before building `submissionData`, iterates file-type fields, POSTs each to `/api/media` (multipart), gets back a media document ID, includes that ID (not the raw file) in the JSON payload to `form-submissions`. Fail-open on upload failure (empty string + logged warning) so a broken file field doesn't block the rest of the submission.
- TypeScript compiles clean; not yet exercised against a real form with an upload field live (no such form exists yet — `uploadCollections` just landed this session).

### Custom Collections QoL — `CustomCollectionEntries.ts`, `EntryDataField/index.tsx`, `FieldBuilder/index.tsx`, `FieldBuilderDescription/index.tsx`, `EntryDataDescription/index.tsx`
- `title` field added to `custom-collection-entries`, `admin.useAsTitle` changed from `'id'` to `'title'`. List view now shows a `Title` column; existing entries created before this change show blank until edited (no migration needed/run).
- Native Duplicate confirmed present on both `custom-collection-entries` (after the `title` field fix) and `posts`.
- New `gallery` field type: `GalleryPicker` component, modeled directly on `CategoryPicker` (v27) — `useListDrawer` pointed at `media` (not `categories`), **`allowCreate: true`** (unlike `CategoryPicker`, galleries should allow inline upload — same precedent as the existing single `media` field type), one-at-a-time drawer picks building an array of media document IDs, rendered as thumbnail chips (40×40 preview + filename) with remove buttons. Verified end-to-end: select multiple images → chips render → save → reload → all persist.

---

## 3. Homepage Integration

*(Unchanged from v27 — see v27 §3.)*

---

## 4. Environment Variables

*(Unchanged from v27 — no new env vars introduced this session.)*

---

## 5. AI Agent Client Portal

*(Unchanged — see v24 §5 for full detail. Still benched.)*

---

## 6. Medusa Commerce Integration

*(Unchanged from v27 — research complete, direction confirmed by Sir Jeff, not started this session.)*

---

## 7. Key Files Reference

### payload-poc (`/Users/josh/work/payload-poc`) — files touched this session
| File | Change |
|---|---|
| `src/collections/CustomCollectionEntries.ts` | Added `title` field, changed `useAsTitle` |
| `src/collections/SiteSettings.ts` | Added SEO meta tab (manual placement) |
| `src/components/EntryDataField/index.tsx` | Added `GalleryPicker` component, `'gallery'` case in `getInputComponent()` |
| `src/components/FieldBuilder/index.tsx` | Added `gallery` to `SUGGESTED_TYPES` + callout |
| `src/components/FieldBuilderDescription/index.tsx` | Added `gallery` to `FIELD_TYPES` + callout |
| `src/components/EntryDataDescription/index.tsx` | Added `gallery` to `TYPE_MAPPINGS` + example + callout |
| `src/components/EmailRowLabel/index.tsx` | **New** — RowLabel component for `emails` array; registered but non-functional (plugin limitation) |
| `src/plugins/index.ts` | `formOverrides.fields`: `title` `beforeDuplicate` hook + `emails` RowLabel attempt; `uploadCollections: ['media']` on form-builder plugin |
| `graphify-out/GRAPH_REPORT.md`, `graphify-out/graph.json` | Updated this session — 256 files, 1,507 nodes, 2,405 edges |

### apir-tayo (`/Users/josh/work/apir-tayo`) — files touched this session
| File | Change |
|---|---|
| `app/components/sections/contact/ContactForm.tsx` | `fileupload` field render case, per-field file tracking |
| `app/lib/payload/submitPayloadForm.ts` | Upload-then-reference-by-ID pattern for file fields before submission |

*(All other files — see v27 §7 for the full reference table, unchanged this session.)*

---

## 8. Remaining Work — Carry-Over Items

| Item | Priority | Notes |
|---|---|---|
| **Vercel server logs visible in Payload** | 🔴 **Next session** | The other team has asked for this. Not yet scoped — payload-poc runs on Vercel; need to figure out how to surface Vercel's log output inside the Payload admin (options to investigate: Vercel Log Drains → a Payload collection/webhook endpoint, Vercel API polling, or a read-only admin view fetching from Vercel's API directly). No implementation started. |
| Email notification (`emails`) RowLabel | 🟢 Low | Confirmed plugin limitation, not pursuing further without a plugin PR. Functional fallback in place. |
| OG image asset | 🟡 Medium, not engineering | Current 300×76, needs 1200×630. Waiting on team to supply the asset. |
| Wait for other team's testing/comments | 🔴 Blocking further work | This session's push is pending their review before continuing. |
| apir-tayo upload-field submission — untested against a real live form | 🟢 Low | Code compiles and follows the confirmed pattern, but no form with an `upload` field exists yet to exercise it end-to-end. |
| Medusa architecture exploration | 🟡 Medium | Still queued, unchanged from v27. |
| Two-site isolation test (Phase 15) | 🟡 Medium | Unchanged from v27 — code complete, no second site seeded. |
| Roadmap Phase 19 — Page Templates / phase-numbering conflict | 🟡 Medium | Still unresolved from v27 — needs team renumbering discussion. |
| Custom Collections apir-tayo live-page wiring | 🟢 Low | Unchanged from v27 — utilities validated, placement decision still deferred. |
| Custom Collections per-site slug uniqueness / cascade delete | 🟢 Low | Unchanged from v27. |
| Rotate exposed credentials | 🔴 High | Unchanged from v27 — not Josh's task. |

*(Full carry-over list otherwise unchanged from v27 §8 — items not mentioned above remain as previously documented.)*

---

## 9. Useful Commands

*(Unchanged — see v26 §9.)*

---

## 10. Phase Summary

*(Phases 1–18 + Category Support unchanged from v27 §10 — this session adds:)*

| Phase | What was built | Status |
|---|---|---|
| **SEO Focus Keyword** (this session) | Manual "SEO" tab added to `SiteSettings` (`meta` group + `focusKeyword` textarea, multi-keyword confirmed by Sir Gio). `seoPlugin` config kept generate-fn-only, no auto-injected collections. apir-tayo SEO content populated and verified persisting. | ✅ Complete — OG image asset still pending from team |
| **Forms QoL** (this session) | Native Duplicate verified, `title` `beforeDuplicate` hook, `upload` field type enabled, apir-tayo file-upload submission flow built. `emails` RowLabel override attempted and confirmed as a plugin limitation. | ✅ Complete, 1 item confirmed unfixable in our control (low severity) |
| **Custom Collections QoL** (this session) | `title` field + `useAsTitle` on entries, native Duplicate verified on entries + posts, new `gallery` field type (`GalleryPicker`, modeled on `CategoryPicker`). | ✅ Complete |

---

## 11. Payload CMS Configuration (Verified)

*(Unchanged — see v26 §11.)*

---

## 12. Production URLs

*(Unchanged — see v26 §12.)*

---

## 13. Known Architectural Gaps

*(v27's gaps unchanged and still open — see v27 §13. This session adds:)*

| Gap | Impact | When to fix |
|---|---|---|
| **`emails` array `RowLabel` not overridable via `formOverrides`** | Form-builder plugin's `emails` array resolves its own internal `admin.components` registration — collection-level overrides (even in-place mutation of the field object, per the documented working pattern for this exact plugin/field in Payload GitHub Discussion #15612) don't apply. Confirmed via two separate implementation attempts. Functional fallback (`emailTo` shown as label) works fine. | Would need a plugin PR upstream, or patching plugin internals directly — not planned. |
| **No mechanism to view Vercel server logs from within Payload** | The other team has explicitly asked for this. payload-poc is deployed on Vercel; there's currently no log visibility inside the Payload admin at all. | **Next session — see §8, top priority.** |
| **apir-tayo file-upload submission flow unexercised end-to-end** | Code follows the confirmed upload-then-reference pattern and compiles clean, but no live form with an `upload` field exists yet to test the full round trip (file → media → submission ID → email notification, if any). | When the team builds a form that uses the new upload field type. |
| **`focusKeyword` stored as unstructured comma-separated text** | No validation, dedup, or per-keyword length checks. Confirmed as the wanted UX (multi-keyword) by Sir Gio, but the raw-textarea implementation is the simplest version of that, not a structured multi-value field (e.g. an array of short-text items). Worth revisiting if the team wants per-keyword SEO scoring later. | Low priority — functional as-is. |

---

## 14. Graphify Knowledge Graph

| File | Contents |
|---|---|
| `graphify-out/graph.html` | Interactive visualization — open in browser |
| `graphify-out/GRAPH_REPORT.md` | Full audit report with community breakdown |
| `graphify-out/graph.json` | Raw graph data for programmatic use |

### Stats (as of this session)
- **256 files**, **1,507 nodes**, **2,405 edges** (up from 1,504 / 2,401 in v27). Confirmed the new files from this session (`EmailRowLabel`, `GalleryPicker`, etc.) are captured in the regenerated graph before commit.
- Note: the `--update` regeneration template no longer prints a "Built from commit: <hash>" line in the report header (present in older reports) — this is a template change, not a signal the graph is stale. Confirm freshness via the report's date/file-count instead going forward.

### How to use in agentic sessions
```
skill: "graphify"
Load graphify-out/GRAPH_REPORT.md and graphify-out/graph.json before making changes.
Pay special attention to god nodes — cn(), getServerSideURL(), and authenticated()
have wide blast radius.
```

---

## 15. Working Agreements

*(Unchanged from v27 — see v27 §15 for the full list. This session reinforced, worth noting explicitly:)*

- **Verify official docs before accepting an AI Agent's plan as correct** — this session caught two real implementation bugs (field-level vs. collection-level `beforeDuplicate`, `seoPlugin`'s `fields` option being a function not a static array) by checking the agent's plan against official Payload docs before approving it, not after something broke.
- **Investigate live/scoped reality before assuming a target collection** — "should SEO go on `Pages`?" turned out to be the wrong question; the agent investigated actual live frontend routes and `site` field presence first, which changed the target to `SiteSettings` entirely.
- **A "known limitation" claim from the Agent needs one independent verification pass** — before accepting "the plugin doesn't support this," point the Agent at any documented community precedent for the exact same mechanism and have it try that specific approach once before closing the item out.
