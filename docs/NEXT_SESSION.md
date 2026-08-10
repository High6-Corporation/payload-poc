# Next Session — Bulk Import Custom Collection Entries

**Date**: 2026-08-06  
**Status**: Code complete, runtime verification blocked

## What was built

Bulk import/export for Custom Collection Entries via `@payloadcms/plugin-import-export`.

### Files changed/new

| File                                                     | What                                                      |
| -------------------------------------------------------- | --------------------------------------------------------- |
| `src/plugins/custom-collection-entries-import-export.ts` | **New** — `entryExportHook` + `entryImportHook`           |
| `src/plugins/index.ts`                                   | Plugin config: import/export on custom-collection-entries |
| `src/collections/CustomCollectionEntries.ts`             | Added `afterList: ImportHistory`                          |
| `src/components/ImportHistory/index.tsx`                 | **New** — import/export history UI                        |
| `docs/payload/payload-poc-handoff-v29.md`                | Fixed schema description                                  |

### Key design decisions

- **Export**: Flattens `data` JSON → `data_*` columns, resolves IDs to human-readable names (media→filenames, categories→titles, sites/collections→slugs)
- **Import**: Accepts slugs or IDs, auto-resolves tenant from site, defaults data to `{}`, validates media IDs, rejects duplicates (same title+parentCollection+site)
- **Import form**: `targetCollection` dropdown (tenant-filtered via `parseCookies`), Import Mode locked to Create only
- **History**: "Imports" and "Exports" card-based tables at bottom of Entries page, each with "See All →" link

### Critical gotchas discovered

1. Plugin does NOT flatten `json` type fields — must be done manually in export hook
2. Multi-tenant plugin does NOT auto-resolve tenant from site — set explicitly via site doc fetch
3. `parseCookies` from `'payload'` is the correct way to read tenant cookie
4. `ExportBeforeHook`/`ImportBeforeHook` types are NOT publicly exported from the plugin

## Verification checklist (do these first)

- [ ] Install Playwright: `npx @playwright/mcp install-browser chrome-for-testing`
- [ ] Restart dev server: `pnpm dev`
- [ ] Go to Imports → Create New, select "Entries", pick "Test Section" from dropdown
- [ ] Upload test CSV (create: title,site,parentCollection columns, apir-tayo site, test-section collection)
- [ ] Verify entries created in Entries list
- [ ] Import same file again → verify all rows rejected as duplicates
- [ ] Test with non-superadmin role → verify tenant/site scoping
- [ ] Check Import History tables at bottom of Entries page → verify spacing

## Open decisions

- Duplicate handling (reject-only) needs sign-off from Sir Jeff — product decision
- `disableJobsQueue: true` fine for low hundreds; revisit if >500 rows

## Admin credentials

`payload.admin@high6.com` / `H1gh6Adm!nP@ass`

## Test data

- Test Section: slug `test-section`, site `apir-tayo` (ID: `6a352f382054dfd250819c26`)
- Equator site: slug `equator`, ID: `6a43670ccbc982f9ddc2386f`
- Projects collection: slug `projects`, site: equator, ID: `6a4f157584cbf505b38bc4f8`
