# Remove apiRegion from SmtpSettings — Hardcode US — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the speculative `apiRegion` select field from SmtpSettings and hardcode the US SMTP2GO endpoint everywhere it was consumed.

**Architecture:** SMTP2GO's account is confirmed US-hosted (api.smtp2go.com) with no region toggle on their side, so `apiRegion` was speculative. The field, the `ResolvedSmtpConfig.apiRegion` member, and the two region→host maps (`regionHosts` in `payload.config.ts` and `smtp-test/route.ts`) are removed; transports use `mail.smtp2go.com` unconditionally. Existing Mongo docs keep the stored `smtp.apiRegion` value — unused data, no migration (additive/non-destructive per project convention).

**Tech Stack:** Payload 3.85.1, TypeScript strict, pnpm. No new dependencies.

**Spec:** Task brief (this session) + `docs/payload/payload-poc-handoff-v33.md` §1/§7 (SMTP2GO CRUD context — v33 §6 confirms the SMTP2GO client-server subaccount migration completed in production; region was never a real knob).

## Global Constraints

- Production database — additive/non-destructive only. No migrations; stored `smtp.apiRegion` values are left in place.
- **Never run `pnpm build` while the dev server is running** (shared `.next` corruption — v36 incident). The build step checks port 3000 first; if a dev server is up, stop-and-ask before proceeding.
- `pnpm generate:types` regenerates `src/payload-types.ts` (never hand-edit).
- `pnpm lint` is broken repo-wide (pre-existing) — not a gate.
- No new tests are required (no existing tests reference apiRegion — verified by grep). Gates: zero remaining `apiRegion` references, `tsc --noEmit`, `pnpm test:int`, `pnpm build`.

## Call-site map (verified by grep, 8 hits total)

| File                                 | Lines                   | What                                                             |
| ------------------------------------ | ----------------------- | ---------------------------------------------------------------- |
| `src/collections/SmtpSettings.ts`    | 102–113 (in `smtp` tab) | the `apiRegion` select field — REMOVE                            |
| `src/utilities/resolveSmtpConfig.ts` | 7, 97, 146              | interface member, comment, `docToConfig` read — REMOVE           |
| `src/payload.config.ts`              | 119, 150–156            | env-fallback config member + `regionHosts` map — REMOVE/COLLAPSE |
| `src/app/api/smtp-test/route.ts`     | 96–100, 124             | local `regionHosts` map + test-email "Region" table row — REMOVE |
| `src/payload-types.ts`               | 1328, 2405              | auto-generated — fixed by `generate:types`                       |

No other consumers exist (`src/components/SmtpTestAction` and hooks reference nothing region-related — verified).

---

### Task 1: Remove the field from SmtpSettings.ts

**Files:**

- Modify: `src/collections/SmtpSettings.ts` (delete the `apiRegion` select field)

- [ ] **Step 1: Delete the field block**

Remove exactly this block from the `smtp` tab's `fields` array (between `apiKey` and `senderEmail`):

```ts
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
```

- [ ] **Step 2: Confirm the file compiles in isolation**

Run: `pnpm exec tsc --noEmit`
Expected: type errors may appear at the OTHER call sites (they still read `config.apiRegion` / construct it) — that's fine at this step; SmtpSettings.ts itself has no remaining references.

---

### Task 2: resolveSmtpConfig.ts — drop the member and the read

**Files:**

- Modify: `src/utilities/resolveSmtpConfig.ts` (interface at line 7, comment at line 97, `docToConfig` return at line 146)

- [ ] **Step 1: Remove the interface member**

```ts
export interface ResolvedSmtpConfig {
  id: string
  apiKey: string
  apiRegion: 'us' | 'eu' | 'au'
  senderEmail: string
```

→

```ts
export interface ResolvedSmtpConfig {
  id: string
  apiKey: string
  senderEmail: string
```

- [ ] **Step 2: Fix the comment**

Line 97 currently reads:

```ts
// All SMTP fields live inside the named "smtp" tab, so both storage and
// response docs carry them nested (`doc.smtp.apiKey`, `doc.smtp.apiRegion`,
// ...).  Read nested-first with a flat fallback for robustness.
```

→

```ts
// All SMTP fields live inside the named "smtp" tab, so both storage and
// response docs carry them nested (e.g. `doc.smtp.apiKey`).
// Read nested-first with a flat fallback for robustness.
```

- [ ] **Step 3: Remove the docToConfig read**

```ts
    id: doc.id as string,
    apiKey,
    apiRegion: (get('apiRegion') as 'us' | 'eu' | 'au') || 'us',
    senderEmail: get('senderEmail') as string,
```

→

```ts
    id: doc.id as string,
    apiKey,
    senderEmail: get('senderEmail') as string,
```

---

### Task 3: payload.config.ts — env fallback + US-only transport

**Files:**

- Modify: `src/payload.config.ts` (loggingEmailAdapter: env-fallback object at ~line 119, transport host block at ~lines 150–158)

- [ ] **Step 1: Remove `apiRegion: 'us'` from the env-fallback config**

```ts
        config = {
          id: 'env-fallback',
          apiKey: envUser,
          apiRegion: 'us',
          senderEmail: envFrom || 'no-reply@h6app.site',
```

→

```ts
        config = {
          id: 'env-fallback',
          apiKey: envUser,
          senderEmail: envFrom || 'no-reply@h6app.site',
```

- [ ] **Step 2: Collapse the region host map to the US endpoint**

```ts
    } else {
      const regionHosts: Record<string, string> = {
        us: 'mail.smtp2go.com',
        eu: 'mail-eu.smtp2go.com',
        au: 'mail-au.smtp2go.com',
      }
      host = regionHosts[config.apiRegion] || regionHosts.us
      port = 2525
      authUser = config.apiKey
      authPass = config.apiKey // SMTP2GO uses API key as both user and pass
    }
```

→

```ts
    } else {
      // SMTP2GO account is US-hosted (api.smtp2go.com) — no region switching.
      host = 'mail.smtp2go.com'
      port = 2525
      authUser = config.apiKey
      authPass = config.apiKey // SMTP2GO uses API key as both user and pass
    }
```

---

### Task 4: smtp-test route — US-only transport + drop the Region row

**Files:**

- Modify: `src/app/api/smtp-test/route.ts` (transport block ~lines 96–106, test-email HTML "Region" row at line 124)

- [ ] **Step 1: Collapse the host map**

```ts
// Build transport — same pattern as the smtp2go-dynamic email adapter in
// payload.config.ts: region host + port 2525 + API key as both user and pass.
const regionHosts: Record<string, string> = {
  us: 'mail.smtp2go.com',
  eu: 'mail-eu.smtp2go.com',
  au: 'mail-au.smtp2go.com',
}
const host = regionHosts[smtpConfig.apiRegion] || regionHosts.us
```

→

```ts
// Build transport — same pattern as the smtp2go-dynamic email adapter in
// payload.config.ts: US host + port 2525 + API key as both user and pass.
const host = 'mail.smtp2go.com'
```

- [ ] **Step 2: Remove the Region row from the test-email HTML**

```ts
            <tr><td style="padding: 0.4rem 0; color: #666;">Config</td><td>${smtpDoc.label || 'N/A'}</td></tr>
            <tr><td style="padding: 0.4rem 0; color: #666;">Region</td><td>${smtpConfig.apiRegion}</td></tr>
            <tr><td style="padding: 0.4rem 0; color: #666;">Sender</td><td>${smtpConfig.senderEmail}</td></tr>
```

→

```ts
            <tr><td style="padding: 0.4rem 0; color: #666;">Config</td><td>${smtpDoc.label || 'N/A'}</td></tr>
            <tr><td style="padding: 0.4rem 0; color: #666;">Sender</td><td>${smtpConfig.senderEmail}</td></tr>
```

---

### Task 5: Regenerate types + verify

**Files:**

- Regenerate: `src/payload-types.ts` (`pnpm generate:types`)

- [ ] **Step 1: Regenerate types**

Run: `pnpm generate:types`
Expected: `SmtpSetting` interface no longer contains `apiRegion` (lines ~1328/2405 gone).

- [ ] **Step 2: Zero-reference check**

Run: `grep -rn "apiRegion" src/ tests/ scripts/ || echo "no references"`
Expected: `no references` (payload-types.ts included — it's under src/).

- [ ] **Step 3: Type gate**

Run: `pnpm exec tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Test gate**

Run: `pnpm test:int`
Expected: all pass (58 current tests; no test touches SMTP config).

- [ ] **Step 5: Build gate — with the dev-server guard**

First: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/admin/login` (or `lsof -i :3000`).

- If **nothing is listening**: run `pnpm build` → expect clean (and remember: no dev server was left running by this).
- If a **dev server IS running**: STOP and ask the user before proceeding — do NOT build against a live `.next` (v36 lesson). Fallback gate in that case: `tsc --noEmit` (already green) + `test:int`, and note the build is deferred until the dev server is stopped.

---

## Self-review

**Spec coverage:** field removed (Task 1); ResolvedSmtpConfig + docToConfig cleaned (Task 2); adapter host switching collapsed to US (Task 3); smtp-test route collapsed + Region row removed (Task 4); types regenerated; build + test:int verified (Task 5); Mongo data untouched (no migration — matches "additive/non-destructive").

**Placeholder scan:** all code blocks are exact current-file content and exact replacements — no TODOs.

**Type consistency:** `ResolvedSmtpConfig` is the single type shared by `resolveSmtpConfig`, the adapter in `payload.config.ts`, and `smtp-test/route.ts`; all three edits land in the same pass, so no intermediate state is ever type-valid without the others — final `tsc` is the gate. `regionHosts` removal in both files is symmetric.

**Risks:** (1) The dev-server/build conflict — handled by the Step 5 guard with an explicit stop-and-ask path. (2) Re-saving an existing SmtpSettings doc later may drop the stored `smtp.apiRegion` subfield (Payload replaces the group object on update) — harmless either way, noted in the handoff.
