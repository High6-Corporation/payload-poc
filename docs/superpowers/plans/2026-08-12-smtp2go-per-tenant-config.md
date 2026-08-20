# SMTP2GO Per-Tenant/Site Configuration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single hardcoded SMTP2GO transport with per-tenant SmtpSettings documents that support optional site-level overrides, with dynamic transport resolution at send time.

**Architecture:** One collection (`SmtpSettings`) with `tenant` (required) + `site` (optional, null = tenant default). Resolution flows site-override → tenant-default → recipient lookup (auth emails) → error. The `sendEmail` wrapper in `loggingEmailAdapter` creates a nodemailer transport per send from the resolved config. Access control uses the existing `tenantEnabledAccess` factory pattern. Admin UI has masked API key display (server-side masking via `afterRead` hook + hidden `_apiKey` field — the raw key is never returned in client-facing API responses) and a live Test action.

**Tech Stack:** Payload CMS 3.85.1, Next.js 16, MongoDB, nodemailer (transitive via `@payloadcms/email-nodemailer`), TypeScript strict

## Global Constraints

- Production database, additive changes only — no destructive migrations without explicit sign-off
- API Key must be treated as a secret: masked display, never rendered in full after initial entry
- Resolution logic fails loud, not silent: no SmtpSettings doc → error, never fall back to env vars or hardcoded defaults
- Access control follows the existing `tenantScoped.ts` factory pattern — reuse `tenantEnabledAccess`, don't build a parallel access system
- Runtime verification required for every acceptance criterion — real API test-sends, real admin UI checks
- All git pushes remain mine to run personally — do not push
- Plan-first gate applies; review gate between tasks given this touches the security/credential boundary
- `pnpm generate:types && pnpm generate:importmap` after any schema or plugin change

---

### Task 1: Create SmtpSettings Collection

**Files:**

- Create: `src/collections/SmtpSettings.ts`
- Modify: `src/payload.config.ts` (import + register collection)
- Modify: `src/payload-types.ts` (auto-generated — run `pnpm generate:types`)

**Interfaces:**

- Produces: `SmtpSettings` collection with slug `smtp-settings`, fields listed below
- Produces: Collection registered in `payload.config.ts` `collections` array

- [ ] **Step 1: Write the collection definition**

Create `src/collections/SmtpSettings.ts`:

```typescript
import type { CollectionConfig } from 'payload'

export const SmtpSettings: CollectionConfig = {
  slug: 'smtp-settings',
  labels: { singular: 'SMTP Setting', plural: 'SMTP Settings' },
  admin: {
    useAsTitle: 'label',
    defaultColumns: ['label', 'tenant', 'site', 'enabled', 'senderEmail'],
    group: 'Tenant Management',
    description:
      'Per-tenant SMTP2GO configuration. One default per tenant, optional per-site overrides.',
  },
  fields: [
    {
      name: 'label',
      type: 'text',
      required: true,
      admin: {
        description: 'Human-readable label (e.g. "Default", "Marketing Site Override")',
      },
    },
    {
      name: 'tenant',
      type: 'relationship',
      relationTo: 'tenants',
      required: true,
      admin: { position: 'sidebar' },
    },
    {
      name: 'site',
      type: 'relationship',
      relationTo: 'sites',
      // null = tenant default; non-null = site override
      admin: {
        position: 'sidebar',
        description:
          'Leave empty for a tenant-wide default. Set to scope this config to a specific site.',
      },
    },
    {
      name: 'enabled',
      type: 'checkbox',
      defaultValue: true,
      label: 'Enable this SMTP config',
    },
    {
      name: 'enableLogging',
      type: 'checkbox',
      defaultValue: true,
      label: 'Log emails sent with this config',
    },
    {
      type: 'tabs',
      tabs: [
        {
          name: 'smtp',
          label: 'SMTP Settings',
          fields: [
            {
              name: '_apiKey',
              type: 'text',
              admin: {
                hidden: true,
                description:
                  'INTERNAL: Raw SMTP2GO API key. Never exposed in client-facing API responses. ' +
                  'The afterRead hook masks apiKey from this value. Internal reads (resolveSmtpConfig, ' +
                  'smtp-test endpoint) bypass Payload hooks and read this field directly from MongoDB.',
              },
            },
            {
              name: 'apiKey',
              type: 'text',
              required: true,
              admin: {
                description:
                  'SMTP2GO API key. Masked in the admin UI and API responses — ' +
                  'the raw key is never returned after initial save.',
                components: {
                  Field: '@/components/SmtpApiKeyField#SmtpApiKeyField',
                },
              },
            },
            {
              name: 'apiRegion',
              type: 'select',
              defaultValue: 'us',
              options: [
                { label: 'US (api.smtp2go.com)', value: 'us' },
                { label: 'EU (api-eu.smtp2go.com)', value: 'eu' },
                { label: 'AU (api-au.smtp2go.com)', value: 'au' },
              ],
              required: true,
            },
            {
              name: 'senderEmail',
              type: 'email',
              required: true,
              admin: { description: 'From address for emails sent with this config' },
            },
            {
              name: 'forceSenderEmail',
              type: 'checkbox',
              defaultValue: false,
              label: 'Force Sender Email',
              admin: {
                description:
                  'When enabled, all emails sent with this config use the sender email above, ' +
                  'overriding any from address set by the calling code.',
              },
            },
            {
              name: 'senderName',
              type: 'text',
              required: true,
              defaultValue: 'High6',
              admin: { description: 'From name for emails sent with this config' },
            },
          ],
        },
        {
          name: 'test',
          label: 'Test',
          fields: [
            {
              name: 'testAction',
              type: 'ui',
              admin: {
                components: {
                  Field: '@/components/SmtpTestAction#SmtpTestAction',
                },
              },
            },
          ],
        },
      ],
    },
  ],
}
```

- [ ] **Step 2: Register the collection in payload.config.ts**

In `src/payload.config.ts`:

- Add import: `import { SmtpSettings } from './collections/SmtpSettings'`
- Add `SmtpSettings` to the `collections` array in `buildConfig({...})` (alphabetically after `SiteSettings`)

- [ ] **Step 3: Regenerate types**

```bash
cd /Users/josh/work/payload-poc && pnpm generate:types
```

Expected: `src/payload-types.ts` updated with `SmtpSetting` type. Build should succeed.

- [ ] **Step 4: Verify the collection appears in admin**

Start dev server, log in as super-admin, confirm `SmtpSettings` appears in the sidebar under "Tenant Management". Create a test document with basic fields to confirm the schema works.

- [ ] **Step 5: Commit**

```bash
git add src/collections/SmtpSettings.ts src/payload.config.ts src/payload-types.ts
git commit -m "feat: add SmtpSettings collection with tenant/site scoping"
```

---

### Task 2: Add Uniqueness Enforcement + Server-Side API Key Masking via Hooks

**Files:**

- Create: `src/collections/SmtpSettings/hooks/validateUniquePair.ts`
- Create: `src/collections/SmtpSettings/hooks/maskApiKey.ts`
- Modify: `src/collections/SmtpSettings.ts` (add `hooks.beforeValidate` + `hooks.afterRead`)

**Interfaces:**

- Consumes: `SmtpSettings` collection from Task 1
- Produces: `validateUniquePair` — `beforeValidate` hook that (a) prevents duplicate `(tenant, site)` pairs, AND (b) copies the user-entered `apiKey` value to the hidden `_apiKey` field so the raw key is preserved before the `afterRead` hook masks it
- Produces: `maskApiKey` — `afterRead` hook that replaces `apiKey` with a masked form derived from `_apiKey`. Client-facing API responses NEVER contain the raw key. Internal reads (resolution utility, test endpoint) bypass Payload hooks via direct MongoDB reads, pulling `_apiKey` from the raw document.

- [ ] **Step 1: Write the beforeValidate hook (uniqueness + key copy)**

Create `src/collections/SmtpSettings/hooks/validateUniquePair.ts`:

```typescript
import type { BeforeValidateHook } from 'payload'

/**
 * Enforce (tenant, site) uniqueness AND copy apiKey → _apiKey.
 *
 * - A tenant may have at most one default (site = null/undefined).
 * - A site may appear in at most one SmtpSettings document.
 * - The user-entered `apiKey` value is persisted to `_apiKey` (admin-hidden)
 *   so the raw key survives the afterRead mask.
 */
export const validateUniquePair: BeforeValidateHook = async ({
  data,
  originalDoc,
  req,
  collection,
}) => {
  // Copy apiKey to _apiKey for raw key storage (before afterRead masks it)
  if (data?.apiKey !== undefined) {
    data._apiKey = data.apiKey
  }

  if (!data?.tenant) return // let required-field validation handle it

  const tenantId = typeof data.tenant === 'string' ? data.tenant : data.tenant?.id || data.tenant
  const siteId = data.site
    ? typeof data.site === 'string'
      ? data.site
      : data.site?.id || data.site
    : undefined

  const docId = originalDoc?.id as string | undefined

  const where: Record<string, unknown> = {
    tenant: { equals: tenantId },
    ...(siteId ? { site: { equals: siteId } } : { site: { exists: false } }),
  }

  if (docId) {
    where.id = { not_equals: docId }
  }

  try {
    const { totalDocs } = await req.payload.count({
      collection: collection!.slug!,
      where,
      overrideAccess: true,
      req,
    })

    if (totalDocs > 0) {
      const conflictType = siteId
        ? 'A site-level override already exists for this site'
        : 'A tenant default already exists for this tenant'
      throw new Error(
        `${conflictType}. Each tenant may have one default config, ` +
          'and each site may have at most one override.',
      )
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('already exists')) throw err
    throw err // fail closed
  }
}
```

- [ ] **Step 2: Write the afterRead hook (server-side API key masking)**

Create `src/collections/SmtpSettings/hooks/maskApiKey.ts`:

```typescript
import type { AfterReadHook } from 'payload'

/**
 * Replace `apiKey` with a masked form derived from `_apiKey`.
 *
 * After this hook runs, client-facing API responses contain only the
 * masked version.  Internal reads that need the raw key MUST bypass
 * Payload hooks entirely — read the raw MongoDB document directly
 * and use the `_apiKey` field.
 *
 * Mask pattern:  first 7 chars + bullets (capped at 20) + last 4 chars
 * Example:       "api-9A8••••••3F2a"
 */
export const maskApiKey: AfterReadHook = ({ doc }) => {
  if (doc?._apiKey && typeof doc._apiKey === 'string' && doc._apiKey.length >= 12) {
    const raw = doc._apiKey
    const bulletCount = Math.min(raw.length - 11, 20)
    doc.apiKey = raw.slice(0, 7) + '•'.repeat(bulletCount) + raw.slice(-4)
  } else if (doc?._apiKey) {
    // Key too short to mask meaningfully — show a generic placeholder
    doc.apiKey = '(key saved)'
  }
  // _apiKey is admin-hidden so it never reaches client responses anyway,
  // but strip it here as a defense-in-depth measure.
  delete doc._apiKey
  return doc
}
```

- [ ] **Step 3: Wire both hooks into the collection**

In `src/collections/SmtpSettings.ts`, add:

```typescript
import { validateUniquePair } from './SmtpSettings/hooks/validateUniquePair'
import { maskApiKey } from './SmtpSettings/hooks/maskApiKey'
```

And add to the collection config:

```typescript
hooks: {
  beforeValidate: [validateUniquePair],
  afterRead: [maskApiKey],
},
```

- [ ] **Step 4: Verify both hooks**

Start dev server, test via admin UI:

1. Create a tenant-default SmtpSettings for Tenant A with an API key → succeeds
2. After save, reload the doc → API key shows as masked (e.g. `api-9A8••••••3F2a`)
3. Open DevTools Network tab, inspect the GET response for the SmtpSettings doc → `apiKey` field is the masked string, `_apiKey` field is absent from the JSON
4. Try to create a second tenant-default for Tenant A → rejected with clean error, not 500
5. Create a site-override for Site X under Tenant A → succeeds
6. Try to create a second override for Site X → rejected with clean error

- [ ] **Step 5: Commit**

```bash
git add src/collections/SmtpSettings/hooks/ src/collections/SmtpSettings.ts
git commit -m "feat: add beforeValidate (uniqueness+key-copy) and afterRead (key-masking) hooks"
```

---

### Task 3: Wire Access Control via tenantEnabledAccess

**Files:**

- Modify: `src/collections/SmtpSettings.ts` (add access control)

**Interfaces:**

- Consumes: `tenantEnabledAccess` from `src/access/tenantScoped.ts`, `authenticated` from `src/access/authenticated.ts`
- Produces: SmtpSettings collection with access control matching the tenant-scoped family

- [ ] **Step 1: Apply access control**

`SmtpSettings` has a `tenant` field directly (tenant-scoped family, not site-scoped). Use `tenantEnabledAccess('smtp-settings')` for all operations, plus `authenticated` as a baseline gate:

In `src/collections/SmtpSettings.ts`, add imports:

```typescript
import { tenantEnabledAccess } from '@/access/tenantScoped'
import { authenticated } from '@/access/authenticated'
```

Add access control:

```typescript
const access = tenantEnabledAccess('smtp-settings')

export const SmtpSettings: CollectionConfig = {
  // ...
  access: {
    create: access,
    delete: access,
    read: access,
    update: access,
  },
  // ...
}
```

**Rationale:** `tenantEnabledAccess` checks `disabledCollections` on the tenant AND filters row-level access by the user's assigned tenants. Tenant-admins get full CRUD on their own tenant's configs (including site overrides). Super-admins bypass all checks. This is the same pattern used by Categories, Media, Posts, Pages, Forms, and FormSubmissions.

- [ ] **Step 2: Verify access control via REST calls**

With dev server running (and at least two tenants + a tenant-admin assigned to Tenant A only):

```bash
# 1. Super-admin: can create, read, update, delete SmtpSettings for any tenant
# 2. Tenant-admin (Tenant A, smtp-settings NOT disabled):
#    - Create SmtpSettings for Tenant A → 200
#    - Create SmtpSettings for Tenant B → 403 (hard deny)
#    - Read SmtpSettings → only sees Tenant A's configs
# 3. Tenant-admin (Tenant A, smtp-settings DISABLED in disabledCollections):
#    - Any operation → 403
#    - Re-enable, verify 200 again
```

Use `curl` with the auth cookie from a browser login session.

- [ ] **Step 3: Commit**

```bash
git add src/collections/SmtpSettings.ts
git commit -m "feat: wire SmtpSettings access control via tenantEnabledAccess"
```

---

### Task 4: Build Resolution Utility and Wire into sendEmail

**Files:**

- Create: `src/utilities/resolveSmtpConfig.ts`
- Modify: `src/payload.config.ts` (replace static `nodemailerAdapter` with dynamic transport resolution)

**Interfaces:**

- Consumes: `SmtpSettings` collection from Task 1
- Consumes: `normalizeTo` from `src/email/loggingAdapter.ts`
- Produces: `resolveSmtpConfig(tenantId: string, siteId?: string)` → resolved SmtpSettings doc or throws
- Produces: `ResolvedSmtpConfig` type with `apiKey`, `apiRegion`, `senderEmail`, `forceSenderEmail`, `senderName`, `enabled`, `enableLogging`

- [ ] **Step 1: Write the resolution utility**

Create `src/utilities/resolveSmtpConfig.ts`:

```typescript
import type { Payload } from 'payload'

// Subset of SmtpSetting fields needed for sending — avoids importing payload-types
export interface ResolvedSmtpConfig {
  id: string
  apiKey: string
  apiRegion: 'us' | 'eu' | 'au'
  senderEmail: string
  forceSenderEmail: boolean
  senderName: string
  enabled: boolean
  enableLogging: boolean
  /** The site this config was resolved for, if any (for logging context) */
  resolvedForSite?: string
}

/**
 * Resolve the active SMTP config for a given tenant + optional site.
 *
 * Lookup order:
 *   1. Site-override: SmtpSettings where tenant = tenantId AND site = siteId
 *   2. Tenant-default:  SmtpSettings where tenant = tenantId AND site is null
 *   3. Error — no config exists for this tenant
 *
 * Disabled configs are still returned — the caller decides whether to
 * honour `enabled: false` (typically: skip sending, log a warning).
 */
export async function resolveSmtpConfig(
  payload: Payload,
  tenantId: string,
  siteId?: string,
): Promise<ResolvedSmtpConfig> {
  // 1. Try site-override first (via Payload API — handles relationship queries correctly)
  if (siteId) {
    const siteResult = await payload.find({
      collection: 'smtp-settings',
      where: {
        and: [{ tenant: { equals: tenantId } }, { site: { equals: siteId } }],
      },
      depth: 0,
      limit: 1,
      overrideAccess: true,
    })

    if (siteResult.docs.length > 0) {
      return docToConfig(payload, siteResult.docs[0])
    }
  }

  // 2. Tenant-default fallback
  const tenantResult = await payload.find({
    collection: 'smtp-settings',
    where: {
      and: [{ tenant: { equals: tenantId } }, { site: { exists: false } }],
    },
    depth: 0,
    limit: 1,
    overrideAccess: true,
  })

  if (tenantResult.docs.length > 0) {
    return docToConfig(payload, tenantResult.docs[0])
  }

  // 3. Fail loud
  throw new Error(
    `No SMTP config found for tenant "${tenantId}"` +
      (siteId ? ` (site "${siteId}")` : '') +
      '. Create a SmtpSettings document for this tenant before sending emails.',
  )
}

/**
 * Build a ResolvedSmtpConfig from a Payload doc, reading the raw `_apiKey`
 * from MongoDB directly to bypass the afterRead masking hook.
 *
 * Fallback: if the raw read fails, apiKey from the Payload doc is the
 * masked value — sending will fail with an SMTP auth error, which is
 * acceptable as a fail-safe.
 */
async function docToConfig(
  payload: Payload,
  doc: Record<string, unknown>,
): Promise<ResolvedSmtpConfig> {
  let apiKey = doc._apiKey as string | undefined

  // If _apiKey wasn't populated (e.g. depth=0), read it raw from MongoDB
  if (!apiKey && doc.id) {
    try {
      const conn = (payload.db as any)?.connection
      if (conn?.db) {
        const { ObjectId } = await import('mongodb')
        const rawDoc = await conn.db
          .collection('smtp_settings')
          .findOne({ _id: new ObjectId(doc.id as string) }, { projection: { _apiKey: 1 } })
        if (rawDoc?._apiKey) {
          apiKey = rawDoc._apiKey
        }
      }
    } catch {
      // Fall through — apiKey stays undefined, caller will error downstream
    }
  }

  if (!apiKey) {
    throw new Error(
      `SmtpSettings "${doc.id}" has no API key. Re-save the document to store the key.`,
    )
  }

  return {
    id: doc.id as string,
    apiKey,
    apiRegion: (doc.apiRegion as 'us' | 'eu' | 'au') || 'us',
    senderEmail: doc.senderEmail as string,
    forceSenderEmail: (doc.forceSenderEmail as boolean) || false,
    senderName: (doc.senderName as string) || 'High6',
    enabled: doc.enabled !== false,
    enableLogging: doc.enableLogging !== false,
    resolvedForSite: (doc.site as string) || undefined,
  }
}

/**
 * Resolve a tenant ID from a recipient email address by looking up
 * Users and PortalClients. Used for auth emails (password reset, etc.)
 * that lack site/tenant context.
 */
export async function resolveTenantFromRecipient(
  payload: Payload,
  email: string,
): Promise<string | null> {
  // Try PortalClients first (they have a direct `tenant` field)
  const portalResult = await payload.find({
    collection: 'portal-clients',
    where: { email: { equals: email.toLowerCase() } },
    depth: 0,
    limit: 1,
    overrideAccess: true,
  })

  if (portalResult.docs.length > 0) {
    const doc = portalResult.docs[0] as Record<string, unknown>
    const tenant = doc.tenant
    return typeof tenant === 'string' ? tenant : (tenant as { id: string })?.id || null
  }

  // Try Users (multi-tenant — take first assigned tenant)
  const userResult = await payload.find({
    collection: 'users',
    where: { email: { equals: email.toLowerCase() } },
    depth: 0,
    limit: 1,
    overrideAccess: true,
  })

  if (userResult.docs.length > 0) {
    const doc = userResult.docs[0] as Record<string, unknown>
    const tenants = (doc.tenants || []) as Array<{ tenant?: string | { id: string } }>
    const first = tenants[0]
    if (first?.tenant) {
      return typeof first.tenant === 'string' ? first.tenant : first.tenant.id || null
    }
  }

  return null
}
```

- [ ] **Step 2: Rewrite the loggingEmailAdapter for dynamic transport**

In `src/payload.config.ts`, replace the entire `loggingEmailAdapter` IIFE (lines 52–119) with:

```typescript
import nodemailer from 'nodemailer'
import { resolveSmtpConfig, resolveTenantFromRecipient } from '@/utilities/resolveSmtpConfig'

const loggingEmailAdapter: EmailAdapter = ({ payload }) => ({
  name: 'smtp2go-dynamic',
  defaultFromAddress: 'no-reply@h6app.site',
  defaultFromName: 'High6',

  sendEmail: async (message) => {
    // site is injected by the form-builder plugin's beforeEmail hook;
    // auth/system emails won't have it — those resolve via recipient lookup.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const siteId = (message as any).site as string | undefined
    const recipient = normalizeTo(message.to)
    const subject = message.subject ?? ''

    let config: ResolvedSmtpConfig | null = null

    // ---- Resolve SMTP config ----
    if (siteId) {
      // Form emails: resolve tenant from the site
      try {
        const site = await payload.findByID({
          collection: 'sites',
          id: siteId,
          depth: 0,
          overrideAccess: true,
        })
        const siteDoc = site as Record<string, unknown>
        const tenantId =
          typeof siteDoc.tenant === 'string'
            ? siteDoc.tenant
            : (siteDoc.tenant as { id: string })?.id

        if (tenantId) {
          config = await resolveSmtpConfig(payload, tenantId, siteId)
        }
      } catch {
        // Fall through to recipient lookup
      }
    }

    if (!config && recipient) {
      // Auth/system emails: resolve tenant from recipient
      const tenantId = await resolveTenantFromRecipient(payload, recipient)
      if (tenantId) {
        config = await resolveSmtpConfig(payload, tenantId)
      }
    }

    if (!config || !config.enabled) {
      throw new Error(
        config
          ? `SMTP config "${config.id}" is disabled. Enable it before sending emails.`
          : `No SMTP config found for recipient "${recipient}". ` +
              `Ensure a SmtpSettings tenant-default exists for at least one tenant.`,
      )
    }

    // ---- Create transport from resolved config ----
    const regionHosts: Record<string, string> = {
      us: 'mail.smtp2go.com',
      eu: 'mail-eu.smtp2go.com',
      au: 'mail-au.smtp2go.com',
    }
    const host = regionHosts[config.apiRegion] || regionHosts.us

    const transport = nodemailer.createTransport({
      host,
      port: 2525,
      auth: {
        user: config.apiKey,
        pass: config.apiKey, // SMTP2GO uses API key as both user and pass
      },
    })

    // Apply sender overrides
    const sendMessage = { ...message }
    if (config.forceSenderEmail || !sendMessage.from) {
      sendMessage.from = {
        address: config.senderEmail,
        name: config.senderName,
      }
    }

    // ---- Send + Log ----
    const logBase = {
      to: recipient,
      subject,
      site: config.resolvedForSite || siteId || undefined,
      sentAt: new Date().toISOString(),
    }

    try {
      const result = await transport.sendMail(sendMessage)

      if (config.enableLogging) {
        try {
          await payload.create({
            collection: 'email-logs',
            data: { ...logBase, status: 'success' },
            overrideAccess: true,
          })
        } catch {
          /* Swallow logging failures */
        }
      }

      return result
    } catch (err) {
      if (config.enableLogging) {
        try {
          await payload.create({
            collection: 'email-logs',
            data: {
              ...logBase,
              status: 'error',
              errorMessage: err instanceof Error ? err.message : String(err),
            },
            overrideAccess: true,
          })
        } catch {
          /* Swallow logging failures */
        }
      }

      throw err
    }
  },
})
```

Also remove the `import { nodemailerAdapter } from '@payloadcms/email-nodemailer'` line and the `import { APIError }` if no longer needed. Add `import nodemailer from 'nodemailer'` and `import { resolveSmtpConfig, resolveTenantFromRecipient } from '@/utilities/resolveSmtpConfig'`.

**Note:** The `ResolvedSmtpConfig` type is already defined in `resolveSmtpConfig.ts` and imported above. The `nodemailer` import comes from the `@payloadcms/email-nodemailer` transitive dependency — it's already in `node_modules`.

- [ ] **Step 3: Update .env.example**

In `.env.example`, add a deprecation note to the SMTP2GO env vars:

```
# SMTP2GO email delivery (server-only)
# ⚠️ DEPRECATED — replaced by per-tenant SmtpSettings collection.
# These env vars are kept for initial bootstrap only.
# Once SmtpSettings documents exist in the database for all active tenants,
# these are no longer read and can be removed.
SMTP2GO_HOST=mail.smtp2go.com
SMTP2GO_PORT=2525
SMTP2GO_USERNAME=YOUR_SMTP2GO_USERNAME
SMTP2GO_PASSWORD=YOUR_SMTP2GO_PASSWORD
SMTP2GO_FROM_EMAIL=no-reply@h6app.site
```

- [ ] **Step 4: Verify types and build**

```bash
cd /Users/josh/work/payload-poc && pnpm generate:types && pnpm build
```

Expected: build passes with no TypeScript errors.

- [ ] **Step 5: Verify resolution logic end-to-end**

Create SmtpSettings docs in the database (via admin UI):

- Tenant A default config (with real or sandbox SMTP2GO credentials)
- Tenant A site-override for Site X

Test via form submission (or trigger an email):

- Form on Site X → should use the site-override config
- Form on Site Y (same tenant, no override) → should use tenant default
- Password reset for a PortalClient assigned to Tenant A → should resolve via recipient lookup

- [ ] **Step 6: Commit**

```bash
git add src/utilities/resolveSmtpConfig.ts src/payload.config.ts .env.example
git commit -m "feat: dynamic SMTP transport resolution from SmtpSettings collection"
```

---

### Task 5: Build Admin UI — Masked API Key Field

**Files:**

- Create: `src/components/SmtpApiKeyField/index.tsx`

**Interfaces:**

- Consumes: Payload custom field component (`useField` from `@payloadcms/ui`)
- Produces: `SmtpApiKeyField` — renders the server-masked API key with Edit/Set Key toggle

**Note:** Masking is handled server-side by the `maskApiKey` afterRead hook (Task 2). The `value` from `useField({ path: 'apiKey' })` is already the masked string (e.g. `api-9A8••••••3F2a`) or `'(key saved)'` for short keys. This component only needs to display the masked value and provide an edit UI — no client-side masking logic needed.

- [ ] **Step 1: Write the masked API key field component**

Create `src/components/SmtpApiKeyField/index.tsx`:

```typescript
'use client'

import { useField } from '@payloadcms/ui'
import { TextInput, Button } from '@payloadcms/ui'
import { useState } from 'react'

/**
 * Renders the server-masked apiKey value and provides an Edit / Set Key
 * toggle.  The raw key is never in the DOM after the initial save —
 * the afterRead hook (maskApiKey) replaces it server-side.
 */
export function SmtpApiKeyField() {
  const { value, setValue, showError, errorMessage } = useField<string>({ path: 'apiKey' })
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  // value is the server-masked string (e.g. "api-9A8••••••3F2a")
  // or "(key saved)" / "(no API key set)" / undefined
  const hasExistingKey =
    typeof value === 'string' && value.length > 0 && value !== '(no API key set)'

  const startEditing = () => {
    setDraft('')
    setEditing(true)
  }

  const cancelEditing = () => {
    setDraft('')
    setEditing(false)
  }

  if (!editing) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <div
          style={{
            flex: 1,
            padding: '0.5rem 0.75rem',
            background: 'var(--theme-elevation-100)',
            borderRadius: 'var(--style-radius-m)',
            fontFamily: 'monospace',
            fontSize: '0.875rem',
            color: hasExistingKey ? 'var(--theme-text)' : 'var(--theme-elevation-500)',
          }}
        >
          {hasExistingKey ? value : '(no API key set)'}
        </div>
        <Button buttonStyle="secondary" onClick={startEditing} size="small">
          {hasExistingKey ? 'Edit' : 'Set Key'}
        </Button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <TextInput
        path="apiKey"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Enter SMTP2GO API key"
        type="password"
        autoComplete="off"
      />
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <Button
          size="small"
          onClick={() => {
            if (draft.trim()) {
              setValue(draft.trim())
              setEditing(false)
            }
          }}
          disabled={!draft.trim()}
        >
          Save Key
        </Button>
        <Button buttonStyle="secondary" size="small" onClick={cancelEditing}>
          Cancel
        </Button>
      </div>
      {showError && (
        <div style={{ color: 'var(--theme-error-500)', fontSize: '0.75rem' }}>{errorMessage}</div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify the component renders + key is masked server-side**

Start dev server, navigate to SmtpSettings → create new. Confirm:

- Initial state: "(no API key set)" with "Set Key" button
- Click "Set Key" → input appears (type="password", characters hidden)
- Enter a key, click "Save Key" → form submits, page reloads
- After reload: masked display shows server-rendered mask (e.g. `api-9A8••••••3F2a`)
- Open DevTools Network tab, inspect the GET response → `apiKey` field is the masked string, `_apiKey` is absent
- Click "Edit" → input reappears (empty, ready for new key), existing key never shown
- Refresh the page → key stays masked

- [ ] **Step 3: Commit**

```bash
git add src/components/SmtpApiKeyField/
git commit -m "feat: add masked API key field component for SmtpSettings"
```

---

### Task 6: Build Test Action — Custom Endpoint + UI

**Files:**

- Create: `src/app/api/smtp-test/route.ts`
- Create: `src/components/SmtpTestAction/index.tsx`

**Interfaces:**

- Consumes: `SmtpSettings` collection, `resolveSmtpConfig` utility
- Produces: `POST /api/smtp-test` — accepts `{ smtpSettingsId, testEmail }`, sends a test email, returns `{ success: true }` or `{ success: false, error }`
- Produces: `SmtpTestAction` — custom field component with email input + "Send Test" button + inline result

**Authorization:** The endpoint reads the target SmtpSettings doc WITHOUT `overrideAccess: true` — Payload's normal access control (`tenantEnabledAccess`) gates the read. A tenant-admin for Tenant A trying to test-send with a Tenant B config gets 403 (or 404 if the doc is invisible to them). Super-admins pass through normally. The raw `_apiKey` is then read via direct MongoDB access (same pattern as `resolveSmtpConfig`) to construct the transport.

- [ ] **Step 1: Write the test-send API endpoint**

Create `src/app/api/smtp-test/route.ts`:

```typescript
import { getPayload } from 'payload'
import config from '@payload-config'
import { headers } from 'next/headers'
import nodemailer from 'nodemailer'
import { resolveSmtpConfig } from '@/utilities/resolveSmtpConfig'

export const maxDuration = 30 // seconds

export async function POST(request: Request): Promise<Response> {
  const payload = await getPayload({ config })
  const requestHeaders = await headers()

  // Authenticate via Payload admin session
  const { user } = await payload.auth({ headers: requestHeaders })
  if (!user) {
    return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  let body: { smtpSettingsId: string; testEmail: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const { smtpSettingsId, testEmail } = body
  if (!smtpSettingsId || !testEmail) {
    return Response.json(
      { success: false, error: 'smtpSettingsId and testEmail are required' },
      { status: 400 },
    )
  }

  // Validate email format
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testEmail)) {
    return Response.json({ success: false, error: 'Invalid email address' }, { status: 400 })
  }

  // Fetch the SmtpSettings doc WITHOUT overrideAccess — normal access control
  // (tenantEnabledAccess) gates this read.  A tenant-admin for Tenant A who
  // tries to test-send using a Tenant B config gets 403/404 here.
  let smtpDoc: Record<string, unknown>
  try {
    smtpDoc = (await payload.findByID({
      collection: 'smtp-settings',
      id: smtpSettingsId,
      depth: 0,
      // NO overrideAccess — let tenantEnabledAccess enforce the gate
    })) as unknown as Record<string, unknown>
  } catch (err) {
    const status = (err as any)?.status || 500
    return Response.json(
      {
        success: false,
        error: status === 403 ? 'Access denied' : `SmtpSettings "${smtpSettingsId}" not found`,
      },
      { status: status === 403 ? 403 : 404 },
    )
  }

  // Resolve the tenant ID from the doc
  const tenantId =
    typeof smtpDoc.tenant === 'string' ? smtpDoc.tenant : (smtpDoc.tenant as { id: string })?.id

  if (!tenantId) {
    return Response.json(
      { success: false, error: 'SmtpSettings document has no tenant' },
      { status: 400 },
    )
  }

  // Resolve config (site-override or tenant-default).
  // resolveSmtpConfig reads the raw _apiKey via direct MongoDB access,
  // bypassing the afterRead masking hook.
  const siteId = smtpDoc.site
    ? typeof smtpDoc.site === 'string'
      ? smtpDoc.site
      : (smtpDoc.site as { id: string })?.id
    : undefined

  const config = await resolveSmtpConfig(payload, tenantId, siteId)

  // Build transport
  const regionHosts: Record<string, string> = {
    us: 'mail.smtp2go.com',
    eu: 'mail-eu.smtp2go.com',
    au: 'mail-au.smtp2go.com',
  }
  const host = regionHosts[config.apiRegion] || regionHosts.us

  const transport = nodemailer.createTransport({
    host,
    port: 2525,
    auth: {
      user: config.apiKey,
      pass: config.apiKey,
    },
  })

  try {
    await transport.sendMail({
      from: {
        address: config.senderEmail,
        name: config.senderName,
      },
      to: testEmail,
      subject: 'SMTP2GO Test Email — High6 CMS',
      html: `
        <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto;">
          <h2>SMTP2GO Test Email</h2>
          <p>This email confirms that your SMTP2GO configuration is working correctly.</p>
          <table style="border-collapse: collapse; width: 100%; margin: 1rem 0;">
            <tr><td style="padding: 0.4rem 0; color: #666;">Config</td><td>${smtpDoc.label || 'N/A'}</td></tr>
            <tr><td style="padding: 0.4rem 0; color: #666;">Region</td><td>${config.apiRegion}</td></tr>
            <tr><td style="padding: 0.4rem 0; color: #666;">Sender</td><td>${config.senderEmail}</td></tr>
          </table>
          <p style="color: #999; font-size: 0.8rem;">
            Sent at ${new Date().toISOString()} from High6 CMS
          </p>
        </div>
      `,
    })

    return Response.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ success: false, error: message }, { status: 502 })
  }
}
```

- [ ] **Step 2: Write the Test Action UI component**

Create `src/components/SmtpTestAction/index.tsx`:

```typescript
'use client'

import { useDocumentInfo, useLocale } from '@payloadcms/ui'
import { Button, TextInput } from '@payloadcms/ui'
import { useState } from 'react'

export function SmtpTestAction() {
  const { id } = useDocumentInfo()
  const locale = useLocale()
  const [testEmail, setTestEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle')
  const [message, setMessage] = useState('')

  const handleTest = async () => {
    if (!id || !testEmail) return
    setStatus('sending')
    setMessage('')

    try {
      const res = await fetch('/api/smtp-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ smtpSettingsId: id, testEmail }),
      })
      const data = await res.json()

      if (data.success) {
        setStatus('success')
        setMessage(`Test email sent to ${testEmail}. Check the inbox.`)
      } else {
        setStatus('error')
        setMessage(data.error || 'Test send failed')
      }
    } catch (err) {
      setStatus('error')
      setMessage(err instanceof Error ? err.message : 'Network error')
    }
  }

  return (
    <div
      style={{
        padding: '1.25rem',
        border: '1px solid var(--theme-elevation-200)',
        borderRadius: 'var(--style-radius-m)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
      }}
    >
      <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>Send Test Email</h3>
      <p style={{ margin: 0, color: 'var(--theme-elevation-500)', fontSize: '0.8125rem' }}>
        Send a test email using the current SMTP config to verify it works.
      </p>

      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <TextInput
            path="testEmail"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            placeholder="recipient@example.com"
            type="email"
          />
        </div>
        <Button
          onClick={handleTest}
          disabled={status === 'sending' || !id || !testEmail.trim()}
          size="medium"
        >
          {status === 'sending' ? 'Sending…' : 'Send Test'}
        </Button>
      </div>

      {status === 'success' && (
        <div
          style={{
            padding: '0.625rem 0.75rem',
            background: 'var(--theme-success-100)',
            border: '1px solid var(--theme-success-400)',
            borderRadius: 'var(--style-radius-s)',
            color: 'var(--theme-success-900)',
            fontSize: '0.8125rem',
          }}
        >
          {message}
        </div>
      )}

      {status === 'error' && (
        <div
          style={{
            padding: '0.625rem 0.75rem',
            background: 'var(--theme-error-100)',
            border: '1px solid var(--theme-error-400)',
            borderRadius: 'var(--style-radius-s)',
            color: 'var(--theme-error-900)',
            fontSize: '0.8125rem',
          }}
        >
          {message}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Verify the test action end-to-end**

Start dev server, navigate to a SmtpSettings doc with valid SMTP2GO credentials. Go to the "Test" tab:

1. Enter a valid email address
2. Click "Send Test" → "Sending…" → green success message
3. Check the recipient inbox for the test email
4. Enter an invalid email (e.g., "not-an-email") → API returns error
5. Use a SmtpSettings with bad credentials → red error message with SMTP2GO error details

- [ ] **Step 4: Commit**

```bash
git add src/app/api/smtp-test/ src/components/SmtpTestAction/
git commit -m "feat: add SMTP test-send endpoint and admin UI action"
```

---

### Task 7: Full Verification Pass

**Files:**

- No new files — verification only

**Interfaces:**

- Consumes: All prior tasks

- [ ] **Step 1: Production build**

```bash
cd /Users/josh/work/payload-poc && pnpm build
```

Expected: build passes with no errors.

- [ ] **Step 2: Acceptance criteria — test sends**

1. **Tenant-default test send:** Create a SmtpSettings doc for Tenant A (no site). Use the Test tab to send to a real email. Confirm receipt.
2. **Site-override test send:** Create a SmtpSettings doc for Tenant A + Site X. Use the Test tab. Confirm receipt.
3. **Resolution verification:** Tenant A has only a default config. Submit a form on Site Y (under Tenant A). Confirm the email is sent using the tenant default (check EmailLogs for the site field).

- [ ] **Step 3: Acceptance criteria — resolution**

1. **Correct fallback:** Tenant A has a default + Site X override. Trigger email for Site X → uses override. Trigger email for Site Y → uses default.
2. **No config → error:** Remove all SmtpSettings for Tenant B. Trigger an email for Tenant B → error, not silent fallback.

- [ ] **Step 4: Acceptance criteria — uniqueness**

1. Create tenant-default for Tenant A → success.
2. Create second tenant-default for Tenant A → rejected with clean error.
3. Create site-override for Site X → success.
4. Create second override for Site X → rejected with clean error.

- [ ] **Step 5: Acceptance criteria — API key masking**

1. Load a SmtpSettings doc with an API key → masked display (`api-9A8••••3F2a`).
2. Click Edit → input appears, existing key NOT visible.
3. Never see the full key in the admin UI after initial save.

- [ ] **Step 6: Acceptance criteria — access control**

Using REST calls with auth cookies from real browser logins:

1. Super-admin: CRUD on any tenant's SmtpSettings → 200.
2. Tenant-admin (assigned to Tenant A): CRUD on Tenant A's configs → 200.
3. Tenant-admin: attempt CRUD on Tenant B's config → 403.
4. Tenant-admin with smtp-settings disabledCollections → 403 even for own tenant.

- [ ] **Step 7: 3+ consecutive restart confirmations**

```bash
# Restart 1
pnpm build && pnpm start  # verify, then stop
# Restart 2
pnpm build && pnpm start  # verify, then stop
# Restart 3
pnpm build && pnpm start  # verify
```

Each restart: confirm admin panel loads, SmtpSettings collection is accessible, test send works. No startup errors, no schema drift, no missing collection.

- [ ] **Step 8: Commit (if any fixes)**

Only if fixes were needed during verification.

---

### Post-work

- **engram:** Log (a) the SmtpSettings `(tenant, site)` inheritance resolution pattern (site-override → tenant-default → recipient lookup → error), (b) the dual-field API key approach (`apiKey` for masked display + `_apiKey` admin-hidden for internal transport reads, gated by `afterRead` hook), (c) the `tenantEnabledAccess` access-control decision (tenant-admins get full CRUD including site overrides), and (d) the direct-MongoDB-read pattern for bypassing Payload `afterRead` hooks when internal code needs raw field values. These conventions are reusable for Menu Items, Header/Footer, and any future tenant/site-scoped config collections.
- **Update handoff doc:** Create v34 closing §7's SMTP2GO open item, noting Menu Items and Header/Footer as the remaining Phase 3 scope.
