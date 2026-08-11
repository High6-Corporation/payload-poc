# Payload CMS Integration — Handoff Document

> **Branch:** `master` (production) — **note:** this session's commit (`c048fa8`) was made on `main`, not `master`. Flagging this discrepancy for confirmation next session rather than assuming which is correct; verify branch naming before continuing work.
> **Date:** August 3, 2026
> **Version:** v29
> **Summary:** This session shipped Form Submissions export + admin readability (three-part: CSV/JSON export via the official import-export plugin, a readable list-view summary, and a readable edit-view table), plus a UX follow-up (clickable rows opening a Document Drawer) — **confirmed complete.** Also in progress: an SMTP2GO credential rotation to a subaccount (`client-server`) — sender verification is being handled by the other team, **expected to be verified tomorrow (August 4, 2026)**; do not swap production credentials until that confirmation comes back. **Next session priority, explicitly requested: implement caching** — scope not yet defined, needs discovery at the start of next session (see §8).

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

Deployment note (carried over from v28, still relevant): **payload-poc runs on Vercel** — the "surface server logs in Payload" request is still unscoped (see §8).

### Multi-tenant model

```
Tenant ("High6 Corporation")
  └── Site ("apir-tayo")          ← PAYLOAD_SITE_ID = 6a352f382054dfd250819c26
        ├── FAQs
        ├── Testimonials
        ├── Portfolio Items
        ├── Pricing Plans
        ├── Site Settings (one record per site — SEO meta tab, v28)
        ├── Forms (contact form — tenant + site scoped)
        ├── Form Submissions — this session: export + readability added, still tenant-scoped
        ├── Custom Collections (Phase 18 — schema definitions)
        └── Custom Collection Entries (Phase 18 — content rows; title (text), site (relationship), parentCollection (relationship), data (json — dynamic keys per parent collection's fields[] schema); "category" and "gallery" are not real fields — they are dynamic keys inside `data` whose presence and type depend on the parent Custom Collection definition, v28 / corrected v29+bulk-import session)
  └── Site ("future-project-2")   ← code supports this (Phase 15); not yet seeded or tested

PortalClients (separate auth collection)
  └── email + password (Payload-managed)
  └── tenant (relationship → Tenants)
```

### Cumulative achievements (Phases 1–18 + Category Support + v28 bundle + this session)

_(Phases 1–18 and v28's SEO/Forms QoL/Custom Collections QoL bundle unchanged — see v28 §1 for full list. This session added:)_

- **Form Submissions Export** — `@payloadcms/plugin-import-export` (`^3.87.0`) installed and enabled for `form-submissions` only (`import: false`, `disableJobsQueue: true` — synchronous, no jobs runner required). A collection-level `before` hook (`cleanupExportRow`) pairs the flattened `submissionData_N_field`/`submissionData_N_value` array columns into real `field: value` columns (e.g. `firstName: "Gio"`) and strips internal noise (`id`, raw `submissionData_N_*`, `submissionUploads_*`, `tenant`, `site`, `form`, `updatedAt`).
- **List View Readability** — `SubmissionDataCell` (new component) replaces the default array-count display ("6 Submission Data") with an extracted email → name summary, read directly off `submissionData` with no async lookups, no stored/virtual field.
- **Edit View Readability** — `SubmissionDataField` (new component) replaces the default array field editor with a read-only two-column label→value table, styled with Payload's admin CSS custom properties to match the existing `SubmissionUploadField` pattern.
- **Design correction mid-session:** an initial plan included a stored `submissionSummary` virtual field (for `useAsTitle`), a field-level `beforeExport` hook, and form-aware CSV column labels (looking up each form's field labels). All were deliberately cut — flagged as complexity not earning its value at current form/submission volume. See Known Architectural Gaps (§13) for what this trade-off costs.
- **UX follow-up — Document Drawer row-click, confirmed complete:** clicking a submission row now opens its details without a full page navigation. Implemented via Payload's built-in `useDocumentDrawer` hook (`@payloadcms/ui`) inside `SubmissionDataCell` — clicking the summary opens a `DocumentDrawer` showing the same `SubmissionDataField` table as an overlay, with list scroll/filter/pagination state preserved underneath.
- **SMTP2GO credential rotation (in progress):** see §4a. Sender verification is being handled by the other team, expected tomorrow (Aug 4).

### Key design decisions (this session, additive to v28's table)

| Decision                                                                                              | Rationale                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@payloadcms/plugin-import-export`, not a custom export endpoint                                      | Official Payload plugin, actively maintained, handles CSV/JSON, batching, and per-collection access scoping out of the box — avoids hand-rolling a streaming export endpoint.                                                                                                                                                                                                                                                                         |
| `disableJobsQueue: true` (synchronous export)                                                         | Submission volume at this stage is expected to be low (hundreds, not tens of thousands) — a jobs queue + runner is unneeded operational overhead right now. Flagged for revisit if exports regularly exceed roughly 2,000 rows.                                                                                                                                                                                                                       |
| Tenant scoping enforced via existing multi-tenant plugin access rules, not a bespoke export-only rule | The export reads through Payload's local API, which already applies the same access control as normal reads on `form-submissions` — no separate scoping logic needed for the collection data itself. The `exports` upload collection (where saved exports land) only requires login (`!!user`), since the export **file itself** doesn't carry tenant metadata — flagged as a real limitation, not a design choice worth calling airtight (see §13).  |
| No `useAsTitle` / no stored virtual field for the identifying column                                  | Originally planned as a stored `submissionSummary` field with an `afterRead` hook. Cut: `useAsTitle` needs a real field value it can resolve everywhere (breadcrumbs, relationship pickers), which reintroduces the complexity being avoided. The `SubmissionDataCell` Cell component covers the _list-view_ readability need on its own, at the cost of `useAsTitle`-dependent UI (e.g. the search placeholder still says "Search by ID" — see §13). |
| No form-aware CSV column labels                                                                       | Raw field names (`firstName`, `workEmail`) used directly as CSV headers instead of building a per-form field-label lookup. Considered sufficiently readable for current forms; would need revisiting only if a specific form's raw field names turn out to be illegible.                                                                                                                                                                              |
| Simplification pass mid-plan (explicit)                                                               | An initial "Approach 1" draft included the virtual field + hooks above. It was deliberately cut down before implementation — explicit working agreement reinforced this session: prefer the simplest solution that meets stated acceptance criteria over building for hypothetical future needs. See §15.                                                                                                                                             |

---

## 2. Collections in Payload

_(Unchanged from v28 except as noted below — see v28 §2 for the full table.)_

| Collection       | Slug               | Change this session                                                                                                                                                                                                                                                                                                                     |
| ---------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Form Submissions | `form-submissions` | Export enabled (CSV/JSON) via `@payloadcms/plugin-import-export`. `defaultColumns` set to `['submissionData', 'createdAt', 'tenant']`. `submissionData` array field given custom `Cell` (`SubmissionDataCell`) and `Field` (`SubmissionDataField`) components for list/edit readability. No schema/field changes — no migration needed. |

---

## 2a. This Session — Feature Bundle (Detail)

### Export — `src/plugins/index.ts`

- Plugin: `@payloadcms/plugin-import-export@^3.87.0` (peer dependency listed as `3.85.1` — works despite the version mismatch warning; flagged, not blocking).
- Config: enabled for `form-submissions` only, `import: false`, `disableJobsQueue: true`.
- `submissionData` is included in `defaultColumns`, which the export plugin picks up automatically for column selection.
- Raw export shape before cleanup: flattened array keys like `submissionData_0_field`, `submissionData_0_value`, `submissionData_1_field`, etc. (standard Payload CSV flattening for array fields).
- `cleanupExportRow` (collection-level `export.hooks.before`) pairs each `_field`/`_value` pair into a real `field: value` column (e.g. `firstName: "Gio"`) and strips: document `id`, all raw `submissionData_N_*` keys, `submissionUploads_*`, `tenant`, `site`, `form`, `updatedAt`.
- Access: no export-specific access rule was added on top of the collection's own tenant-scoped read access — the export runs through the local API and inherits it. The generated `exports` upload collection (where "Save" exports are stored, as opposed to direct "Download") currently only requires `!!user` — **this does not itself carry tenant scoping on the stored file**, see §13.

### List View Readability — `src/components/SubmissionDataCell/index.tsx` (new)

- Custom `Cell` component registered on the `submissionData` array field.
- Extracts an email field first, falling back to a name field, from the submission's `submissionData` array, and renders that in place of the default "N Submission Data" item-count display.
- No stored field, no virtual field, no async/network calls — pure client-side extraction from data already loaded for the row.

### Edit View Readability — `src/components/SubmissionDataField/index.tsx` (new)

- Custom `Field` component registered on the `submissionData` array field, replacing the default array editor.
- Renders a read-only, two-column label → value table.
- Styled using Payload's admin CSS custom properties (not Tailwind — this codebase avoids Tailwind in admin components because it conflicts with Payload's own admin CSS), consistent with the existing `SubmissionUploadField` component's approach.

### UX Follow-up — Row-click Document Drawer (confirmed complete)

- Approach: `useDocumentDrawer({ collectionSlug: 'form-submissions', id })` from `@payloadcms/ui`, called inside `SubmissionDataCell`.
- Existing summary text wrapped in the returned `DocumentDrawerToggler`; the returned `DocumentDrawer` rendered alongside it.
- Clicking the summary opens the document's normal edit view (i.e. the `SubmissionDataField` table) as a slide-out overlay — no page navigation, list scroll/filter/pagination state preserved.
- Scoped at the **cell** level rather than the list/table level, sidestepping a known Payload complication where custom List views don't cleanly propagate row-select handlers from a table-level implementation.
- **Status: confirmed done.**

### SMTP2GO Credential Rotation — see §4a below (separate from the Payload/form-submissions work, tracked here because it happened in the same session)

---

## 3. Homepage Integration

_(Unchanged from v28 — see v28 §3.)_

---

## 4. Environment Variables

_(No new environment variables were added to payload-poc this session. See §4a for a possibly-related, unconfirmed change to SMTP2GO credentials — repo/location of that `.env` was not confirmed during this session and should not be assumed to be payload-poc.)_

## 4a. SMTP2GO Credential Rotation (in progress — sender verification pending, expected Aug 4)

Discovered mid-session via a support-dashboard screenshot, not from a repo — **which project's `.env` this applies to was not explicitly confirmed in this session.** The values shown referenced `SMTP2GO_FROM_EMAIL=no-reply@h6app.site`, which does not appear in previously-documented payload-poc or apir-tayo env var lists — confirm target repo before making the change, don't assume.

**Situation:**

- SMTP2GO account has multiple subaccounts (`citiglobal`, `Claude Code`, `client-server`, `ffob`, `h-s01`, others). A new SMTP user, also named `client-server`, exists inside the `client-server` subaccount.
- Old credentials in use: `SMTP2GO_USERNAME=investph-smtp` (appears to be a master-account-level SMTP user).
- New credentials to move to: `SMTP2GO_USERNAME=client-server` (new password provided, not repeated here).
- **Blocker identified, verification in progress:** SMTP2GO subaccounts maintain their own Verified Senders list, separate from the master account by default. The dashboard showed an active "you need to verify one or more of your Verified Senders" warning while viewing the `client-server` subaccount. If credentials are swapped before the sending domain/email is verified (or explicitly granted "Subaccount Access" from the master account's already-verified domain), **sending will be rejected outright**, not just degraded. **The other team is handling this verification, expected to complete tomorrow, August 4, 2026.**

**Correct sequence (steps 2–4 still need to happen next session, after verification lands):**

1. ~~In the `client-server` subaccount → Sending → Verified Senders: confirm the FROM domain/email is verified there (or granted via Sender Domains → "Subaccount Access" from the master account's already-verified domain).~~ **In progress with the other team — do not start step 2 until they confirm this is green.**
2. Once verified: update `SMTP2GO_USERNAME`/`SMTP2GO_PASSWORD` in the relevant repo's `.env` **and** in whatever secret store the deployed environment uses (do not update only one).
3. Send a real test email through the actual application code path (a live form submission, not just a dashboard test).
4. Deactivate or delete the old `investph-smtp` SMTP user on the master account once the new one is confirmed working, so this doesn't remain a half-finished rotation.

**Possible connection to prior work:** apir-tayo's v28-era carry-over list includes an outstanding "Rotate exposed credentials" item (unrelated root cause documented at the time — committed `.env` in git history). Whether this SMTP2GO rotation is that same outstanding item or a separate, newer request was not confirmed this session — clarify at the start of next session before marking either as resolved.

---

## 5. AI Agent Client Portal

_(Unchanged — see v24 §5 for full detail. Still benched.)_

---

## 6. Medusa Commerce Integration

_(Unchanged from v28 — research complete, direction confirmed by Sir Jeff, not started this session.)_

---

## 7. Key Files Reference

### payload-poc (`/Users/josh/work/payload-poc`) — files touched this session

| File                                           | Change                                                                                                                                                                                              |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/plugins/index.ts`                         | `defaultColumns` on `form-submissions`; `SubmissionDataCell`/`SubmissionDataField` wired onto the `submissionData` field; `@payloadcms/plugin-import-export` config; `cleanupExportRow` export hook |
| `src/components/SubmissionDataCell/index.tsx`  | **New** — list-view Cell: email/name extraction, no async lookups                                                                                                                                   |
| `src/components/SubmissionDataField/index.tsx` | **New** — edit-view read-only label→value table                                                                                                                                                     |
| `src/payload-types.ts`                         | Regenerated                                                                                                                                                                                         |
| `src/app/(payload)/admin/importMap.js`         | Regenerated                                                                                                                                                                                         |
| `package.json`                                 | Added `@payloadcms/plugin-import-export`                                                                                                                                                            |
| `src/scripts/backfill-submission-summary.ts`   | **Deleted** — was part of the cut `submissionSummary` virtual-field approach, no longer needed                                                                                                      |

Removed from the original plan (not shipped, intentionally): `submissionSummary` stored field, its `beforeChange` hook, `useAsTitle` on `form-submissions`, the field-level `beforeExport` hook, and the `afterRead` fallback logic.

**Commit:** `c048fa8` on branch `main` (see branch-naming discrepancy flagged at the top of this doc) — `feat: form-submissions export + admin readability` — 8 files changed, 2 new components.

_(All other files — see v28 §7 for the full reference table, unchanged this session.)_

---

## 8. Remaining Work — Carry-Over Items

| Item                                                                  | Priority                                                                                     | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Implement caching**                                                 | 🔴 **Next session — explicitly requested**                                                   | Scope not yet defined. Needs discovery at the start of next session: what's being cached (Payload queries, REST API responses consumed by apir-tayo, admin list views, form data, something else), where (in-memory, Redis, Next.js cache primitives, CDN/edge), and why (specific pain point, e.g. repeated `form-submissions` list/export load, or general). Do not assume scope — clarify with Yanyan before proposing an approach. |
| **SMTP2GO credential rotation to `client-server` subaccount**         | 🔴 High                                                                                      | See §4a in full. Sender verification being handled by the other team, expected Aug 4 — do not swap credentials until confirmed. Once verified: swap `.env` + deployed secrets, test via a live form submission, deactivate old `investph-smtp` user. Also unconfirmed: which repo/`.env` this belongs to, and whether it's the same item as apir-tayo's previously-documented "Rotate exposed credentials."                            |
| Full production build (form-submissions export/readability work)      | 🟡 Medium                                                                                    | Listed as pending by the implementing agent — not run/confirmed this session.                                                                                                                                                                                                                                                                                                                                                          |
| Scoped-role export verification                                       | 🟡 Medium                                                                                    | Tenant-scoping for export was implemented by inheriting existing access control, but **not independently tested as a scoped (non-superadmin) role** — do this before treating export access as verified.                                                                                                                                                                                                                               |
| `useAsTitle` / "Search by ID" placeholder follow-up                   | 🟢 Low                                                                                       | Deliberately not implemented this session (see design decisions, §1). Revisit only if the current placeholder text is confirmed as actually confusing in practice, not preemptively.                                                                                                                                                                                                                                                   |
| No form-aware CSV column labels                                       | 🟢 Low                                                                                       | Raw field names used as-is. Revisit only if a specific form's field names prove unreadable in exported files.                                                                                                                                                                                                                                                                                                                          |
| **Vercel server logs visible in Payload**                             | 🟡 Medium (downgraded from v28's 🔴 — displaced by caching as the explicit next-session ask) | Still not scoped. The other team asked for this in v28; unclear if still their top ask relative to caching — confirm priority ordering with stakeholders next session.                                                                                                                                                                                                                                                                 |
| Email notification (`emails`) RowLabel                                | 🟢 Low                                                                                       | Unchanged from v28 — confirmed plugin limitation, not pursuing further without a plugin PR.                                                                                                                                                                                                                                                                                                                                            |
| OG image asset                                                        | 🟡 Medium, not engineering                                                                   | Unchanged from v28 — still waiting on the team to supply a 1200×630 asset.                                                                                                                                                                                                                                                                                                                                                             |
| apir-tayo upload-field submission — untested against a real live form | 🟢 Low                                                                                       | Unchanged from v28.                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Medusa architecture exploration                                       | 🟡 Medium                                                                                    | Still queued, unchanged from v28.                                                                                                                                                                                                                                                                                                                                                                                                      |
| Two-site isolation test (Phase 15)                                    | 🟡 Medium                                                                                    | Unchanged from v28 — code complete, no second site seeded.                                                                                                                                                                                                                                                                                                                                                                             |
| Roadmap Phase 19 — Page Templates / phase-numbering conflict          | 🟡 Medium                                                                                    | Still unresolved from v28 — needs team renumbering discussion.                                                                                                                                                                                                                                                                                                                                                                         |
| Custom Collections apir-tayo live-page wiring                         | 🟢 Low                                                                                       | Unchanged from v28.                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Custom Collections per-site slug uniqueness / cascade delete          | 🟢 Low                                                                                       | Unchanged from v28.                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Rotate exposed credentials (apir-tayo, original item)                 | 🔴 High                                                                                      | Unchanged from v28 — not Josh's task. Possibly related to §4a — confirm.                                                                                                                                                                                                                                                                                                                                                               |

_(Full carry-over list otherwise unchanged from v28 §8 — items not mentioned above remain as previously documented.)_

---

## 9. Useful Commands

_(Unchanged — see v26 §9.)_

---

## 10. Phase Summary

_(Phases 1–18 + Category Support + v28 bundle unchanged from v28 §10 — this session adds:)_

| Phase                                                 | What was built                                                                                                                                                                                                                        | Status                                                                    |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **Form Submissions Export** (this session)            | `@payloadcms/plugin-import-export` enabled for `form-submissions`, synchronous CSV/JSON export, `cleanupExportRow` hook flattens `submissionData` into readable columns and strips internal fields.                                   | ✅ Complete — production build and scoped-role verification still pending |
| **Form Submissions Admin Readability** (this session) | `SubmissionDataCell` (list view) and `SubmissionDataField` (edit view) replace default array rendering with readable summary/table views. Simplified mid-plan: no stored virtual field, no `useAsTitle`, no form-aware label lookups. | ✅ Complete                                                               |
| **Document Drawer row-click** (this session)          | `useDocumentDrawer` wired into `SubmissionDataCell` for click-to-view without navigation.                                                                                                                                             | ✅ Complete                                                               |
| **SMTP2GO credential rotation** (this session)        | Plan given for migrating to `client-server` subaccount, contingent on sender verification.                                                                                                                                            | 🟡 In progress — verification with other team, expected Aug 4             |

---

## 11. Payload CMS Configuration (Verified)

_(Unchanged — see v26 §11.)_

---

## 12. Production URLs

_(Unchanged — see v26 §12.)_

---

## 13. Known Architectural Gaps

_(v28's gaps unchanged and still open — see v28 §13. This session adds:)_

| Gap                                                                                       | Impact                                                                                                                                                                                                                                                                                                                    | When to fix                                                                                                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Exported `exports` upload collection doesn't carry tenant metadata on the stored file** | Export data-in-transit (the query) is correctly tenant-scoped via existing access control, but a _saved_ export document (as opposed to a direct download) is only gated by `!!user` login — any logged-in user with read access to the `exports` collection could potentially access another tenant's saved export file. | Should be addressed before relying on the "Save" export option in a scenario with multiple untrusted tenant admins. Direct "Download" is safer in the meantime since nothing persists. Flag for next session if this collection sees real multi-tenant admin use. |
| **No `useAsTitle` on `form-submissions`**                                                 | List-view search placeholder still reads generically (e.g. "Search by ID") rather than reflecting the readable summary shown in the Cell. Cosmetic, not functional — the summary itself displays correctly per row.                                                                                                       | Low priority — only revisit if confirmed confusing in practice, per the explicit simplification decision this session.                                                                                                                                            |
| **No form-aware CSV export labels**                                                       | Exported CSV columns use raw Payload field names (`firstName`, `workEmail`), not the form's configured display labels.                                                                                                                                                                                                    | Low priority — revisit only for a specific form where this proves unreadable.                                                                                                                                                                                     |
| **`emails` array `RowLabel` not overridable via `formOverrides`**                         | Unchanged from v28 — confirmed plugin limitation.                                                                                                                                                                                                                                                                         | Not planned — would need a plugin PR upstream.                                                                                                                                                                                                                    |
| **No mechanism to view Vercel server logs from within Payload**                           | Unchanged from v28 — still unscoped.                                                                                                                                                                                                                                                                                      | Deprioritized behind caching for next session; confirm with the other team whether this is still urgent.                                                                                                                                                          |
| **apir-tayo file-upload submission flow unexercised end-to-end**                          | Unchanged from v28.                                                                                                                                                                                                                                                                                                       | When the team builds a form that uses the upload field type.                                                                                                                                                                                                      |
| **`focusKeyword` stored as unstructured comma-separated text**                            | Unchanged from v28.                                                                                                                                                                                                                                                                                                       | Low priority — functional as-is.                                                                                                                                                                                                                                  |

---

## 14. Graphify Knowledge Graph

| File                           | Contents                                    |
| ------------------------------ | ------------------------------------------- |
| `graphify-out/graph.html`      | Interactive visualization — open in browser |
| `graphify-out/GRAPH_REPORT.md` | Full audit report with community breakdown  |
| `graphify-out/graph.json`      | Raw graph data for programmatic use         |

### Stats (as of this session)

- **197,132 nodes**, **329,075 edges**, **16,333 communities** — a large jump from v28's 1,507 nodes / 2,405 edges. **This scale of increase is unusual and worth sanity-checking at the start of next session** — v28 explicitly documented and recovered from a prior Graphify scope incident (accidentally indexing the entire work root, producing a 176k-node graph, restored from backup). Confirm this session's regeneration is correctly scoped to payload-poc alone before trusting it, rather than assuming it's fine because the tool ran without error.
- Commit range reflected: `29f316fb → c048fa8`.
- Key query used this session: `graphify query "form-submissions submissionData export"`.

### How to use in agentic sessions

```
skill: "graphify"
Load graphify-out/GRAPH_REPORT.md and graphify-out/graph.json before making changes.
Pay special attention to god nodes — cn(), getServerSideURL(), and authenticated()
have wide blast radius.
CAUTION: verify the graph is scoped to payload-poc only before relying on it —
see v29 §14 note on node-count discrepancy.
```

---

## 15. Working Agreements

_(Unchanged from v28 — see v28 §15 for the full list. This session reinforced, worth noting explicitly:)_

- **Prefer the simplest solution that meets stated acceptance criteria over building for hypothetical future needs.** This session's first-draft plan (Approach 1, full version) included a stored virtual field, extra hooks, and form-aware CSV labels — all cut after explicit pushback, without lowering the acceptance bar. The cut items are documented as follow-ups (§8, §13), not silently dropped.
- **`useAsTitle` requires a real, resolvable field value — a `Cell` component alone is not equivalent.** A `Cell` only changes rendering in the list table; it does not feed `useAsTitle`, which is also used in breadcrumbs and relationship pickers elsewhere in the admin. Don't conflate the two when scoping "readability" work — decide explicitly whether `useAsTitle` is actually needed, since it changes the cost of the solution significantly (this is why it was cut this session).
- **Verify official docs before accepting an AI Agent's plan as correct** — reinforced again this session: `@payloadcms/plugin-import-export` and `@payloadcms/plugin-form-builder`'s `formSubmissionOverrides` (as distinct from `formOverrides`) were checked against official documentation before implementation, avoiding a repeat of v28's caught-early bugs.
- **A completion report (or explicit confirmation) should be treated as the source of truth for "done," not the conversation's tone.** The Document Drawer follow-up is now marked complete on explicit confirmation. The SMTP2GO rotation remains marked in-progress rather than done, since verification is external (with the other team) and not yet confirmed — don't let a session's forward momentum imply completion that wasn't verified.
