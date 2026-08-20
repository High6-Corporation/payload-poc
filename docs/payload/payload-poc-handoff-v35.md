# Payload POC Handoff v35 — Project Gallery Multi-Select + Focus Keyword Multi-Keyword Parsing

**Date:** 2026-08-16
**Repo:** `/Users/josh/work/payload-poc` (Payload CMS 3.85.1)
**Supersedes:** v34 (SMTP2GO per-tenant/site config)

---

## 1. This Session — Two Teammate-Reported Fixes

Two issues filed by teammates as "fix + enhancement". Both root causes were confirmed by direct reproduction before fixing — not assumed.

### Issue 1 — Project Gallery: multi-image select in one action (✅ Fixed)

**Field:** the `gallery` field type of the Phase 18 Custom Collection system — rendered by `GalleryPicker` inside `EntryDataField`, storing `string[]` of Payload media IDs in the entry's `data` JSON.

**Root cause:** the field could already hold multiple IDs, but the picker couldn't add them. `handleSelect` appended a single ID from the ListDrawer's single-select `onSelect` callback and closed the drawer — one image per session.

**Fix:** wired Payload's native multi-value pattern into the existing drawer — `enableRowSelections` + `onBulkSelect`. New `handleBulkSelect` iterates the drawer's Selection Map, collects truthy entries, dedupes against existing selections (preserving order), and closes the drawer. `onSelect` stays wired: row-click quick-add still works in selection mode, and the `allowCreate` save path routes through it.

### Issue 2 — SEO Focus Keyword Guidance Panel: comma-separated keywords miscounted (✅ Fixed)

**Component:** `SeoChecklistPanel` (Pages/Posts SEO tab), driven by the pure `evaluateSeoChecklist()` in `src/utilities/seoChecklist.ts`.

**Root cause:** no comma parsing existed anywhere in the evaluation path. The entire string — e.g. `Equator Energy, Solar Energy, Water Machine` — was treated as one keyword, so every checklist item failed (confirmed by direct repro). The field is labeled "Focus Keywords" with an admin description promising comma-separated input — the evaluator never matched the field's own contract.

**Fix:** `parseFocusKeywords()` (split → trim → drop empty → lowercase, mirroring `generateMeta.ts`'s existing convention), pass-if-any per criterion, and a `keywordDetail()` helper that:

- keeps single-keyword detail strings **byte-identical** to before (regression-pinned by tests),
- lists matched keywords for multi-keyword passes (`Matched in the SEO title: "a", "b".`),
- notes none matched for multi-keyword fails,
- treats comma/whitespace-only input as `na` with dedicated copy (`No valid focus keywords found — …`) instead of a nonsense fail.

`hasBasicSeo` / `SeoStatusCell` untouched.

**Follow-up refinement 1 (user-reported):** multi-word keyphrases like `Careers at Equator Energy` still failed the title check when the phrase wasn't verbatim (e.g. title "Careers & Job Opportunities | Equator Energy Philippines"). Added Yoast-style word-order matching: exact phrase first, then strip function words (`FUNCTION_WORDS` set, ~70 English connectors) and require the remaining content words in order. Single-word keywords unchanged (fallback needs ≥2 content words).

**Follow-up refinement 2 (user-reported):** the description check still failed when only pluralisation differed ("careers" keyphrase vs "career" in the description). Added `normaliseToken` plural folding in the word-order fallback only (ies→y, s/es stripping): "careers"→"career", "opportunities"→"opportunity". Live-verified on the Careers page — meta description now shows `"careers at equator energy" found in the meta description.` Exact-phrase and single-word paths untouched. Remaining known limitation: no verb-form morphology (no stemming beyond simple plurals).

### Issue 4 — SEO checklist missed Page hero text (user-reported, same session)

User followed the "put your keyword in the first paragraph" recommendation by typing into the page **Hero**, but the Body Content item never triggered. Root cause: the panel only read `content`/`layout`; Page body copy often lives in the top-level `hero` group (`hero.richText`). Fix: panel now extracts hero richText too, with two Payload-admin gotchas solved on the way: (1) tab fields are **lazy-mounted** — values are invisible until their tab is visited; (2) Payload's form never registers **group** paths (`useField('hero')` is always undefined) — so the panel watches the leaf `hero.richText` and falls back to the loaded document via `useDocumentInfo().initialData` (Form context has no `initialData` in 3.85.1). `extractPlainText` also learned to walk group objects for nested lexical `richText`. Live-verified: fresh load → straight to SEO tab → `"equator energy" found in the body content.` (3/4). Commit `3b111e6`.

The admin preview showed the Payload deployment domain while the real frontend lives in apir-tayo with a different URL. Added a `canonicalUrl` text field to the Pages/Posts SEO tab (after Focus Keywords). The checklist's "Focus Keyword in URL Slug" item evaluates the canonical URL's **pathname** when set (e.g. `https://example.com/renewable-energy-solutions`), falling back to the Payload slug when absent or invalid. Live-verified both directions on the Solar Infrastructure Solutions page. The preview itself still uses `NEXT_PUBLIC_SERVER_URL` (config-controlled, not overridden). Requires `pnpm generate:types` (done — schema change).

### Files changed

| File                                      | Action                                                                                           |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `src/components/EntryDataField/index.tsx` | Modify (+30: `handleBulkSelect` + drawer props in `GalleryPicker` only)                          |
| `src/collections/Pages/index.ts` / `Posts/index.ts` | Modify (canonicalUrl field in SEO tab)                                  |
| `src/components/SeoChecklistPanel/index.tsx` | Modify (watch `meta.canonicalUrl`)                                   |
| `src/payload-types.ts` | Regenerated (canonicalUrl field)                                    |
| `src/utilities/seoChecklist.ts`           | Modify (+240: `parseFocusKeywords`, `formatKeywords`, `keywordDetail`, multi-keyword evaluation, `FUNCTION_WORDS` + word-order keyphrase matching) |
| `tests/int/seo-utilities.int.spec.ts`     | Extend (+218: 8 multi-keyword + 6 keyphrase tests; all 23 existing tests untouched)           |

No schema/plugin changes → `generate:types` / `generate:importmap` not needed. No DB writes. Production data untouched.

### Verification

| Check                    | Result                           |
| ------------------------ | -------------------------------- |
| `pnpm test:int`          | ✅ 46/46 (45 SEO + 1 API)        |
| `pnpm lint`              | ⚠️ pre-existing break — ESLint 9.39.4 + eslint-config-next 16.2.6 crash on every file (FlatCompat circular-structure); unrelated to these changes, see §2.4 |
| `pnpm build`             | ✅ clean                         |
| Browser (drawer + panel) | ✅ via Playwright MCP — see §2.3 |

### Key discoveries (reusable for future work)

1. **ListDrawer bulk-select contract** (verified against `@payloadcms/ui` 3.85.1 dist, reference impl `fields/Upload/Input.js`):
   - `enableRowSelections` + `onBulkSelect(selected: Map<number|string, boolean>)` — the Map is pre-seeded with `false` for **every page row**; the truthy filter is mandatory.
   - Iteration order = page row order, not checkbox-click order.
   - No auto-close on bulk select — the consumer must close the drawer.
   - Row clicks **still fire `onSelect`** in selection mode (the checkbox column is separate) — keep `onSelect` wired for quick-add and because `allowCreate`'s save path routes through it. Removing it breaks create-from-drawer silently.
2. **Field-contract vs. implementation mismatch class** — a field whose label/description promises one behavior ("Focus Keywords", comma-separated) while the consumer implements another (single keyword). Same risk family as the `+field` prefix and `overrideAccess: true` default gotchas: always cross-check the field's admin description against the consuming logic.
3. **`seedTestUser` e2e helper deletes then recreates `dev@payloadcms.com`** — dangerous against the shared DB if that account is shared; prefer throwaway unique users or existing admin accounts + no-save flows.
4. **graphify `--update` shrink guard (#479)** — after doc re-extraction, the incremental build was 132 nodes smaller than the existing graph. Audited per-file: losses were doc-extraction variance + pruned deleted files, no code structure lost → `force=True` was legitimate. Audit before forcing, always.
5. **Local Playwright browsers not installed** — `pnpm exec playwright install chromium` stalls on this network; use the session's Playwright MCP browser for verification instead (see §2.3).
6. **Keyphrase matching needs word-order, not just substring** — exact-phrase matching made multi-word keyphrases almost never tick; Yoast-style function-word stripping + in-order content words fixed it. No stemming yet.
7. **`pnpm lint` is broken repo-wide (pre-existing)** — ESLint 9.39.4 + eslint-config-next 16.2.6 through FlatCompat throw a circular-structure error on ANY file; needs a version pin or config upgrade. Also: `pnpm lint | tail` masks the exit code — always check `; echo exit=$?`.
8. **Payload admin gotchas for custom field components** — (a) tab fields are lazy-mounted: values invisible until their tab is visited; (b) group paths never register in the form fields map (`useField('hero')` is always undefined — watch leaf paths like `hero.richText`); (c) the loaded document lives in `useDocumentInfo().initialData` (Form context has no `initialData`); (d) Lexical editors ignore Playwright `.fill()` — use real key events for live typing; (e) drafts autosave form changes — browser verification on real pages mutates drafts, restore afterwards.

---

## 2. Open Items / Follow-ups

### 2.1 Remaining Phase 3 scope (carried from v34)

- Header/Footer global connections; Menu Items; loading-state audit (SiteSwitcher, ImportHistory); `getUserTenantIds` test coverage; site-level RBAC.

### 2.2 This session's follow-ups

- **`gallery.e2e.spec.ts`** — no automated e2e guard exists for the gallery drawer (no media-seeding helper). The throwaway verification spec pattern from this session can seed one if automation is requested.

### 2.3 Browser verification status — ✅ COMPLETE (2026-08-17, via Playwright MCP)

Local `playwright install` proved unnecessary — the session's Playwright MCP browser was used against the live dev server (logged in as `payload.admin@high6.com`, no saves, no seeding). Results:

- **Gallery multi-select:** opened the Project Gallery picker on a Projects entry ("LGU of Barangay Semirara…", id `6a7ee3db587c324df5e3e9c5`) → checkbox column rendered → checked 2 rows (200-1.jpg, 197-1.jpg) → `Select 2` pill → both added as chips, drawer closed. **Quick-add regression:** row click on img_8279-1.jpg → single chip added, drawer closed. All 3 test chips removed afterwards; API re-check confirmed `data['project-gallery']` still holds the original 4 IDs with unchanged `updatedAt`.
- **SEO panel:** on the "Organizers" page (id `6a682a7c8e4476f813c23a0d`), live checks confirmed: legacy single-keyword detail intact (`"basketball referees" found in the SEO title.`), multi-keyword both-match detail (`Matched in the SEO title: "book", "verified".`), the reported repro string evaluating all 4 criteria with correct multi-keyword fail copy, and `,,` → `na` with `No valid focus keywords found — …`. Navigated away without saving; API re-check confirmed `meta.focusKeyword` still `basketball referees`, `updatedAt` unchanged.
- **Keyphrase word-order (follow-up fix):** on the Careers page (`careers`, id `6a7af73e26c334a7c88d972a`) with saved focus keywords `Careers at Equator Energy, Career`, the title item shows `Matched in the SEO title: "careers at equator energy", "career".` — the first keyphrase matches via word-order (function words stripped). Body correctly fails (no content words present).
- **Plural folding (follow-up fix 2):** same page with keyphrase `Careers at Equator Energy` — meta description now shows `"careers at equator energy" found in the meta description.` (plural "careers" vs singular "career"). Slug still correctly fails (slug `careers` lacks the equator/energy content words).
- **Canonical URL (Issue 3):** on the Solar Infrastructure Solutions page (id `6a7af35610b89315da8b8766`), entering canonical URL `https://example.com/renewable-energy-solutions` + focus keyword `renewable energy solutions` flipped the URL item to `"renewable energy solutions" appears in the URL slug.`; clearing the URL flipped it back to evaluating the Payload slug (fail). API re-check after: `canonicalUrl` still null, `updatedAt` unchanged — nothing saved.
- **Evidence:** screenshots in `.playwright/verify-*.png` (8 files).

### 2.4 Pre-existing lint break (not caused by this session)

`pnpm lint` crashes on every file — ESLint 9.39.4 (from `^9.16.0`) + `eslint-config-next` 16.2.6 through the FlatCompat shim throw `TypeError: Converting circular structure to JSON` in the eslintrc config validator. Reproduced on an untouched file (`src/access/anyone.ts`). Recommended fix (not applied — shared tooling, needs owner decision): pin `eslint` to `~9.16.x` or upgrade `eslint-config-next`. Note: `pnpm lint | tail` masks the exit code — verify with `; echo exit=$?`.

---

## 3. How to Resume — Continuation Prompt Template

```
# Task: Continue Phase 3 (Header/Footer, Menu Items) or v35 browser verification

## Pre-work
- Read this handoff doc (payload-poc-handoff-v35.md) in full first
- graphify --update: sync current state
- engram: search "ListDrawer bulk select", "focus keyword parsing" for context
- Start: cd /Users/josh/work/payload-poc && pnpm dev

## Constraints
- Production database, additive changes only
- Payload 3.85.1 local API overrideAccess=true default — always pass overrideAccess: false + user explicitly
- ListDrawer multi-select: keep both onSelect (quick-add + allowCreate routing) and onBulkSelect wired
- Single-keyword SEO output is byte-identical — the regression test in seo-utilities.int.spec.ts pins it
```
