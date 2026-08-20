# Payload POC Handoff v34 — SMTP2GO Per-Tenant/Site Configuration Complete

**Date:** 2026-08-12
**Repo:** `/Users/josh/work/payload-poc` (Payload CMS 3.85.1)
**Supersedes:** v33 (Phase 3 SMTP2GO open item resolved)

---

## 1. This Session — SMTP2GO Per-Tenant/Site Configuration (✅ Complete)

Closes out v33 §7's SMTP2GO scoping open item.

### Decision: Data-Model Scoping with Inheritance

A tenant sets a default SMTP2GO config, and any site under that tenant may optionally override it. Additive only — no existing SMTP2GO config/behavior was destructively migrated. The old env-var transport is preserved as a fallback for tenants that haven't created SmtpSettings docs yet.

### What was built

**Collection:** `SmtpSettings` (slug `smtp-settings`, Tenant Management group)
- `tenant` (required) + `site` (optional, null = tenant default)
- SMTP fields: `apiKey`/`_apiKey` (dual-field — apiKey masked in responses, `_apiKey` admin-hidden for internal reads), `apiRegion` (us/eu/au), `senderEmail`, `forceSenderEmail`, `senderName`
- Test tab with live test-send action

**Hooks:** Two hooks in `src/collections/SmtpSettings/hooks/`
- `validateUniquePair` (beforeValidate): (tenant, site) uniqueness + masked-submission guard (prevents the server-masked apiKey value from overwriting `_apiKey` on routine saves)
- `maskApiKey` (afterRead): replaces `apiKey` with masked form from `_apiKey`, deletes `_apiKey` from client responses — raw key never leaves the server

**Resolution:** `src/utilities/resolveSmtpConfig.ts`
- `resolveSmtpConfig(tenantId, siteId?)`: site-override → tenant-default → error
- `resolveTenantFromRecipient(email)`: PortalClients → Users → null (for auth emails)
- Raw `_apiKey` read via direct MongoDB (bypasses afterRead hook)

**Email Adapter:** `src/payload.config.ts`
- Replaced static `nodemailerAdapter` with dynamic per-send transport
- Resolution: site (form emails) → tenant → SmtpSettings; recipient (auth emails) → tenant → SmtpSettings; env-var fallback if no SmtpSettings doc exists
- Env vars (`SMTP2GO_*`) deprecated but kept as safety net

**Access Control:** `tenantEnabledAccess('smtp-settings')` with `publicAccess: authenticated`
- Tenant-admins get full CRUD including site overrides
- Same factory pattern as Categories/Media/Posts/Pages/Forms
- Added to `built-in-collections.ts` toggle registry

**Admin UI:**
- `SmtpApiKeyField`: masked display + Edit/Set Key toggle, raw key never in DOM
- `SmtpTestAction`: email input + Send Test button + inline success/error, gated by normal access control

**Test Endpoint:** `POST /api/smtp-test`
- Session auth via `payload.auth()`
- Explicit `overrideAccess: false` + `user` — gates cross-tenant access

### Files changed/created (11 commits)

| File | Action |
|------|--------|
| `src/collections/SmtpSettings.ts` | Create |
| `src/collections/SmtpSettings/hooks/validateUniquePair.ts` | Create |
| `src/collections/SmtpSettings/hooks/maskApiKey.ts` | Create |
| `src/utilities/resolveSmtpConfig.ts` | Create |
| `src/components/SmtpApiKeyField/index.tsx` | Create |
| `src/components/SmtpTestAction/index.tsx` | Create |
| `src/app/api/smtp-test/route.ts` | Create |
| `src/payload.config.ts` | Modify (email adapter rewrite) |
| `src/collections/built-in-collections.ts` | Modify (+smtp-settings entry) |
| `.env.example` | Modify (deprecation notes) |
| `package.json` + `pnpm-lock.yaml` | Modify (nodemailer + mongodb deps) |

### Key discoveries (reusable for future work)

1. **Payload 3.85.1 local API defaults `overrideAccess` to `true`** — opposite of the documented REST default. Every gated internal read must explicitly pass `overrideAccess: false` + `user`. Same trap as the `+field` prefix and `query.graph()` gotchas — undocumented framework behavior that silently bypasses security.

2. **Payload tab fields nest data under the tab name in hooks.** A field `apiKey` inside a tab named `smtp` arrives as `data.smtp.apiKey` in hooks, not `data.apiKey`. Both `beforeValidate` and `afterRead` hooks need to handle this nesting.

3. **MongoDB collection name for slug `smtp-settings` is `smtp-settings`** — Payload uses the slug as-is, preserving hyphens. The `_`-to-`-` transformation is a Mongoose-ism that doesn't apply here. Verified empirically via `listCollections()` against the production DB.

4. **pnpm strict layout requires `nodemailer` and `mongodb` as direct deps** — transitive imports don't work in pnpm's strict mode. Both packages were already in the store but needed explicit `dependencies`/`devDependencies` entries.

---

## 2. Remaining Phase 3 Scope (not yet started)

- **Header/Footer global connections** — connect the Header and Footer globals to tenant/site scoping
- **Menu Items** — tenant/site-scoped navigation menu collection
- **Loading-state audit follow-up** (from v33 §4) — `SiteSwitcher` and `ImportHistory` inline indicators
- **`getUserTenantIds` test coverage** (from v33 §7)
- **Site-level RBAC** (deferred from Phase 0)

---

## 3. How to Resume — Continuation Prompt Template

```
# Task: Continue Phase 3 (Header/Footer, Menu Items)

## Pre-work
- Read this handoff doc (payload-poc-handoff-v34.md) in full first
- graphify --update: sync current state
- engram: search "SMTP2GO", "tenantScoped", "overrideAccess true default" for context
- Start: cd /Users/josh/work/payload-poc && pnpm dev

## Constraints
- Production database, additive changes only
- SMTP2GO resolution pattern (site-override → tenant-default → recipient → env-var fallback) is the reference for tenant/site scoping conventions
- Payload 3.85.1 local API overrideAccess=true default — always pass overrideAccess: false + user explicitly
- Dual-field API key pattern (apiKey + _apiKey) is the reference for credential storage in future collections
```
