# SMTP2GO Send Failure — Switch Relay Auth to HTTP API — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the confirmed 535 `Invalid login` send failure by replacing the SMTP-relay transport (which wrongly authenticates with an API key) with SMTP2GO's HTTP API (`/v3/email/send`), which authenticates with the API key directly — no schema changes, no new fields.

**Architecture:** SMTP2GO has two non-interchangeable auth mechanisms: the SMTP relay (`mail.smtp2go.com`, ports 2525 etc.) authenticates with a separate **SMTP User** username/password pair, while the **HTTP API** (`api.smtp2go.com`) authenticates with the **API key** that `SmtpSettings.apiKey`/`_apiKey` already stores. Current code sends via the relay using `apiKey` as both username and password — never valid, so every send 535s. A new shared helper `src/email/smtp2go.ts` builds the API JSON payload from Payload's nodemailer-shaped `SendEmailOptions` and POSTs it; both the email adapter (`payload.config.ts`) and the Test-tab route (`src/app/api/smtp-test/route.ts`) call it. The env-var fallback branch keeps the relay transport unchanged (its `SMTP2GO_USERNAME`/`SMTP2GO_PASSWORD` pair is an SMTP-User credential, valid for relay auth). `resolveSmtpConfig.ts` and the SmtpSettings schema/hooks are untouched.

**Tech Stack:** Payload 3.85.1, TypeScript strict, pnpm, Vitest 4. No new dependencies (`fetch` is global in the Node runtime; `nodemailer` stays for the env-fallback branch).

**Spec:** Task brief (this session, bug confirmed via live test send `POST /api/smtp-test` → 535) + SMTP2GO API reference (https://developers.smtp2go.com/reference/send-standard-email.md and /docs/getting-started.md, verified 2026-08-19) + `docs/payload/payload-poc-handoff-v34.md` (original build) + `docs/payload/payload-poc-handoff-v37.md` (most recent change; the apiRegion removal is NOT related to this bug and is unaffected).

## Global Constraints

- Production database — additive/non-destructive only. **This plan makes zero schema changes** (confirmed by investigation: Option B reuses the existing `apiKey` field). If a field turns out to be needed mid-implementation, stop and flag — do not expand scope.
- `pnpm generate:types` NOT needed (no field changes). Do not run it.
- **Never run `pnpm build` while the dev server is running** (shared `.next` corruption — v36 incident). The build step checks port 3000 first; if a dev server is up, stop and ask before building.
- `pnpm lint` is broken repo-wide (pre-existing) — not a gate.
- Payload 3.85.1 local API defaults `overrideAccess` to `true` — pass explicitly where relevant (existing code in `smtp-test/route.ts` and `resolveSmtpConfig.ts` already does; this plan does not change those access-control paths).
- Do NOT touch: the SmtpSettings collection schema, `resolveSmtpConfig`'s resolution order (site→tenant→error), or the apiKey masking hooks — they are correct and this bug is not in that layer.

## Root cause (do not re-litigate — confirmed against SMTP2GO's own docs)

- SMTP relay AUTH requires SMTP User credentials created under Sending > SMTP Users. API keys are NOT valid relay credentials.
- `payload.config.ts` lines 149–157 and `smtp-test/route.ts` lines 95–104 both build a relay transport (`mail.smtp2go.com:2525`) with `auth.user = apiKey`, `auth.pass = apiKey` ("SMTP2GO uses API key as both user and pass" — wrong, and untested until now).
- The HTTP API authenticates via `X-Smtp2go-Api-Key` header (or `api_key` JSON body field) — exactly what `apiKey`/`_apiKey` stores. Option B uses this.

## Contract + field-mapping verification (already done, recorded here)

**Payload `EmailAdapter` contract** (verified from `node_modules/payload/dist/email/types.d.ts`):

```ts
export type EmailAdapter<TSendEmailResponse = unknown> = ({ payload }: { payload: Payload }) => {
  defaultFromAddress: string
  defaultFromName: string
  name: string
  sendEmail: (message: SendEmailOptions) => Promise<TSendEmailResponse>
}
```

The response generic defaults to `unknown` — **Payload does NOT require a nodemailer-shaped return**. A plain `fetch()` adapter satisfies the contract; no nodemailer custom-transport wrapper needed. All consumers (Payload core `forgotPassword.js`, `sendVerificationEmail.js`, form-builder plugin `FormSubmissions/hooks/sendEmail.js`) ignore the return value — verified by reading their source. No caller sends `attachments` today (form emails are `{bcc, cc, from, html, replyTo, subject, to}` strings only; auth emails are `{to, subject, html}`) — but the mapping below covers them for correctness.

**SMTP2GO `/v3/email/send` schema** (verified from the endpoint reference, 2026-08-19):

| Payload `SendEmailOptions` (nodemailer shape) | SMTP2GO JSON field                                     | Notes                                                                             |
| --------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------- |
| `from` (after sender overrides)               | `sender` — **required**, string `"Name <email>"`       | Address object → name+address pair format                                         |
| `to`                                          | `to` — **required**, array of `"Name <email>"` strings | max 100 entries                                                                   |
| `cc`                                          | `cc` — array of strings                                | max 100                                                                           |
| `bcc`                                         | `bcc` — array of strings                               | max 100                                                                           |
| `subject`                                     | `subject`                                              |                                                                                   |
| `text`                                        | `text_body`                                            | one of `html_body`/`text_body` required                                           |
| `html`                                        | `html_body`                                            |                                                                                   |
| `replyTo`                                     | `custom_headers: [{ header: 'Reply-To', value }]`      | no top-level `reply_to` field exists                                              |
| `headers` (string values only)                | `custom_headers` entries `{ header, value }`           | array entries/undefined skipped                                                   |
| `attachments`                                 | `attachments: [{ filename, mimetype, fileblob }]`      | `content` (string\|Buffer) → base64 `fileblob`; `path`-only → throw (unsupported) |

- **Endpoint:** `POST https://api.smtp2go.com/v3/email/send`
- **Auth:** `X-Smtp2go-Api-Key: <apiKey>` header
- **Success (200):** `{ request_id: string, data: { email_id: string, succeeded?: number, failed?: number, failures?: string[] } }`
- **Error (400/401):** `{ request_id, data: { error_code, error } }` — throw with `data.error` surfaced

---

### Task 1: Create the SMTP2GO HTTP-API send helper (test-first)

**Files:**

- Create: `src/email/smtp2go.ts`
- Test: `tests/int/smtp2go.int.spec.ts`

**Interfaces:**

- Consumes: `ResolvedSmtpConfig` from `@/utilities/resolveSmtpConfig` (existing, unchanged), `SendEmailOptions` type from `payload` (existing).
- Produces:
  - `export interface Smtp2goApiResponse { request_id: string; data: { email_id: string; succeeded?: number; failed?: number; failures?: string[] } }`
  - `export function buildSmtp2goPayload(config: Pick<ResolvedSmtpConfig, 'senderEmail' | 'senderName'>, message: SendEmailOptions): Record<string, unknown>`
  - `export function sendViaSmtp2goApi(config: Pick<ResolvedSmtpConfig, 'apiKey' | 'senderEmail' | 'senderName'>, message: SendEmailOptions): Promise<Smtp2goApiResponse>`
  - `export function formatAddress(value: string | { name?: string; address: string }): string`

- [ ] **Step 1: Write the failing tests**

Create `tests/int/smtp2go.int.spec.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import type { SendEmailOptions } from 'payload'

import { buildSmtp2goPayload, formatAddress, sendViaSmtp2goApi } from '@/email/smtp2go'

const config = {
  apiKey: 'api-TESTKEY123',
  senderEmail: 'no-reply@h6app.site',
  senderName: 'High6',
}

const baseMessage: SendEmailOptions = {
  from: { address: 'no-reply@h6app.site', name: 'High6' },
  to: 'user@example.com',
  subject: 'Hello',
  html: '<p>Hi</p>',
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('formatAddress', () => {
  it('formats a named address pair', () => {
    expect(formatAddress({ name: 'High6', address: 'no-reply@h6app.site' })).toBe(
      'High6 <no-reply@h6app.site>',
    )
  })

  it('passes a bare string through unchanged', () => {
    expect(formatAddress('plain@example.com')).toBe('plain@example.com')
  })

  it('omits the name part when absent', () => {
    expect(formatAddress({ address: 'anon@example.com' })).toBe('anon@example.com')
  })
})

describe('buildSmtp2goPayload', () => {
  it('maps from/subject/html to sender/subject/html_body', () => {
    const body = buildSmtp2goPayload(config, baseMessage)
    expect(body.sender).toBe('High6 <no-reply@h6app.site>')
    expect(body.to).toEqual(['user@example.com'])
    expect(body.subject).toBe('Hello')
    expect(body.html_body).toBe('<p>Hi</p>')
    expect(body).not.toHaveProperty('text_body')
  })

  it('maps text to text_body', () => {
    const body = buildSmtp2goPayload(config, { ...baseMessage, html: undefined, text: 'Plain' })
    expect(body.text_body).toBe('Plain')
    expect(body).not.toHaveProperty('html_body')
  })

  it('normalizes to/cc/bcc arrays from mixed string and Address values', () => {
    const body = buildSmtp2goPayload(config, {
      ...baseMessage,
      to: ['a@example.com', { name: 'Bee', address: 'b@example.com' }],
      cc: 'c@example.com',
      bcc: [{ address: 'd@example.com' }],
    })
    expect(body.to).toEqual(['a@example.com', 'Bee <b@example.com>'])
    expect(body.cc).toEqual(['c@example.com'])
    expect(body.bcc).toEqual(['d@example.com'])
  })

  it('maps replyTo into a Reply-To custom_headers entry', () => {
    const body = buildSmtp2goPayload(config, { ...baseMessage, replyTo: 'support@example.com' })
    expect(body.custom_headers).toEqual([{ header: 'Reply-To', value: 'support@example.com' }])
  })

  it('maps attachments to base64 fileblob entries', () => {
    const body = buildSmtp2goPayload(config, {
      ...baseMessage,
      attachments: [
        { filename: 'a.txt', contentType: 'text/plain', content: 'hello' },
        { filename: 'b.bin', content: Buffer.from([0, 1, 2]) },
      ],
    })
    expect(body.attachments).toEqual([
      {
        filename: 'a.txt',
        mimetype: 'text/plain',
        fileblob: Buffer.from('hello', 'utf8').toString('base64'),
      },
      {
        filename: 'b.bin',
        mimetype: 'application/octet-stream',
        fileblob: Buffer.from([0, 1, 2]).toString('base64'),
      },
    ])
  })

  it('throws on path-only attachments (no content to base64)', () => {
    expect(() =>
      buildSmtp2goPayload(config, {
        ...baseMessage,
        attachments: [{ filename: 'x.pdf', path: '/tmp/x.pdf' }],
      }),
    ).toThrow(/Unsupported attachment/)
  })

  it('omits empty optional fields entirely', () => {
    const body = buildSmtp2goPayload(config, baseMessage)
    expect(body).not.toHaveProperty('cc')
    expect(body).not.toHaveProperty('bcc')
    expect(body).not.toHaveProperty('custom_headers')
    expect(body).not.toHaveProperty('attachments')
  })
})

describe('sendViaSmtp2goApi', () => {
  it('POSTs to the API endpoint with the X-Smtp2go-Api-Key header and returns the parsed response', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ request_id: 'req-1', data: { email_id: 'eml-1' } }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await sendViaSmtp2goApi(config, baseMessage)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.smtp2go.com/v3/email/send')
    expect(init.method).toBe('POST')
    expect(init.headers['X-Smtp2go-Api-Key']).toBe('api-TESTKEY123')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(init.body).sender).toBe('High6 <no-reply@h6app.site>')
    expect(result).toEqual({ request_id: 'req-1', data: { email_id: 'eml-1' } })
  })

  it('throws the API error message on non-OK responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          request_id: 'req-2',
          data: { error_code: 'E_BAD', error: 'Senders must be verified' },
        }),
      }),
    )

    await expect(sendViaSmtp2goApi(config, baseMessage)).rejects.toThrow(
      'SMTP2GO API error: Senders must be verified',
    )
  })

  it('throws an HTTP-status error when the body has no data.error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ request_id: 'req-3' }),
      }),
    )

    await expect(sendViaSmtp2goApi(config, baseMessage)).rejects.toThrow(
      'SMTP2GO API returned HTTP 401',
    )
  })

  it('times out after 10s and surfaces a clean error', async () => {
    vi.useFakeTimers()
    // AbortSignal.timeout uses native timers that Vitest fake timers cannot
    // intercept, so drive its abort via a faked setTimeout instead.
    vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => {
      const controller = new AbortController()
      setTimeout(() => controller.abort(), ms)
      return controller.signal
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: unknown, init: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () => {
              const err = new Error('The operation was aborted due to timeout')
              err.name = 'TimeoutError'
              reject(err)
            })
          }),
      ),
    )

    const promise = sendViaSmtp2goApi(config, baseMessage)
    const assertion = expect(promise).rejects.toThrow('SMTP2GO API timed out after 10s')
    await vi.advanceTimersByTimeAsync(10_000)
    await assertion
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run --config ./vitest.config.mts tests/int/smtp2go.int.spec.ts`
Expected: FAIL — module `@/email/smtp2go` not found.

- [ ] **Step 3: Write the implementation**

Create `src/email/smtp2go.ts`:

```ts
import type { SendEmailOptions } from 'payload'

import type { ResolvedSmtpConfig } from '@/utilities/resolveSmtpConfig'

/**
 * SMTP2GO HTTP API client — replaces the SMTP relay transport.
 *
 * Why: the SMTP relay (mail.smtp2go.com, port 2525 etc.) authenticates with a
 * separate "SMTP User" username/password pair — API keys are NOT valid SMTP
 * AUTH credentials there (every send 535s). The HTTP API
 * (api.smtp2go.com/v3/email/send) authenticates with the API key directly,
 * which is what SmtpSettings stores. mail.smtp2go.com ≠ api.smtp2go.com —
 * do not "fix" one into the other.
 *
 * Field names verified against
 * https://developers.smtp2go.com/reference/send-standard-email.md (2026-08-19).
 */

const SMTP2GO_API_ENDPOINT = 'https://api.smtp2go.com/v3/email/send'

export interface Smtp2goApiResponse {
  request_id: string
  data: {
    email_id: string
    succeeded?: number
    failed?: number
    failures?: string[]
  }
}

/** Format a nodemailer address value as SMTP2GO's "Name <email>" string. */
export function formatAddress(value: string | { name?: string; address: string }): string {
  if (typeof value === 'string') {
    return value
  }
  return value.name ? `${value.name} <${value.address}>` : value.address
}

function toAddressArray(value: SendEmailOptions['to']): string[] {
  if (!value) {
    return []
  }
  if (Array.isArray(value)) {
    return value.map((entry) => formatAddress(entry))
  }
  return [formatAddress(value)]
}

/** Build the /v3/email/send JSON body from a nodemailer-shaped message. */
export function buildSmtp2goPayload(
  config: Pick<ResolvedSmtpConfig, 'senderEmail' | 'senderName'>,
  message: SendEmailOptions,
): Record<string, unknown> {
  const sender =
    typeof message.from === 'string'
      ? message.from
      : formatAddress(message.from ?? { address: config.senderEmail, name: config.senderName })

  const body: Record<string, unknown> = {
    sender,
    to: toAddressArray(message.to),
  }

  if (message.cc) {
    body.cc = toAddressArray(message.cc)
  }
  if (message.bcc) {
    body.bcc = toAddressArray(message.bcc)
  }
  if (message.subject) {
    body.subject = message.subject
  }
  if (message.text) {
    body.text_body = message.text
  }
  if (message.html) {
    body.html_body = message.html
  }

  const customHeaders: Array<{ header: string; value: string }> = []
  if (message.replyTo) {
    customHeaders.push({
      header: 'Reply-To',
      value: Array.isArray(message.replyTo)
        ? message.replyTo.map((entry) => formatAddress(entry)).join(', ')
        : formatAddress(message.replyTo),
    })
  }
  if (message.headers) {
    for (const [header, value] of Object.entries(message.headers)) {
      if (typeof value === 'string') {
        customHeaders.push({ header, value })
      }
    }
  }
  if (customHeaders.length) {
    body.custom_headers = customHeaders
  }

  if (message.attachments?.length) {
    body.attachments = message.attachments.map((att) => {
      if (!att.content || (typeof att.content !== 'string' && !Buffer.isBuffer(att.content))) {
        throw new Error(
          `Unsupported attachment "${att.filename ?? '(unnamed)'}": only string/Buffer content is supported.`,
        )
      }
      return {
        filename: att.filename ?? 'attachment',
        mimetype: att.contentType ?? 'application/octet-stream',
        fileblob: Buffer.isBuffer(att.content)
          ? att.content.toString('base64')
          : Buffer.from(att.content, 'utf8').toString('base64'),
      }
    })
  }

  return body
}

/** Send a message via SMTP2GO's HTTP API. Throws with the API's error message on failure. */
export async function sendViaSmtp2goApi(
  config: Pick<ResolvedSmtpConfig, 'apiKey' | 'senderEmail' | 'senderName'>,
  message: SendEmailOptions,
): Promise<Smtp2goApiResponse> {
  let res: Response
  try {
    res = await fetch(SMTP2GO_API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Smtp2go-Api-Key': config.apiKey,
      },
      body: JSON.stringify(buildSmtp2goPayload(config, message)),
      // Bare fetch() has no default timeout — a stalled SMTP2GO API would
      // hang the request path (e.g. form submissions) forever. 10s is
      // generous for an API call; the old SMTP transport had its own
      // connection timeouts.
      signal: AbortSignal.timeout(10_000),
    })
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') {
      throw new Error('SMTP2GO API timed out after 10s')
    }
    throw err
  }

  const parsed = (await res.json().catch(() => null)) as {
    request_id?: string
    data?: { email_id?: string; error?: string; error_code?: string }
  } | null

  if (!res.ok) {
    const apiError = parsed?.data?.error
    throw new Error(
      apiError ? `SMTP2GO API error: ${apiError}` : `SMTP2GO API returned HTTP ${res.status}`,
    )
  }

  return parsed as Smtp2goApiResponse
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run --config ./vitest.config.mts tests/int/smtp2go.int.spec.ts`
Expected: PASS — all tests in the three describes.

- [ ] **Step 5: Commit**

```bash
git add src/email/smtp2go.ts tests/int/smtp2go.int.spec.ts
git commit -m "feat: add SMTP2GO HTTP API send helper with field mapping"
```

---

### Task 2: Switch the email adapter in payload.config.ts to the HTTP API

**Files:**

- Modify: `src/payload.config.ts` (the `loggingEmailAdapter` `sendEmail` transport section, lines 136–200)

**Interfaces:**

- Consumes: `sendViaSmtp2goApi` from `@/email/smtp2go` (Task 1). The adapter keeps returning whatever the send produces (`Promise<unknown>` — Payload's `EmailAdapter` response generic allows this; verified in `node_modules/payload/dist/email/types.d.ts`).
- Produces: unchanged adapter surface (`name`, `defaultFromAddress`, `defaultFromName`, `sendEmail`).

- [ ] **Step 1: Add the import**

In `src/payload.config.ts`, add next to the existing `normalizeTo` import (line 32):

```ts
import { sendViaSmtp2goApi } from '@/email/smtp2go'
```

- [ ] **Step 2: Replace the transport block**

Replace lines 136–200 (from `// ---- Create transport from resolved config ----` through the end of the `try { ... } catch (err) { ... }` block, inclusive) with:

```ts
// ---- Send: HTTP API for SmtpSettings configs, relay for the env fallback ----
// SmtpSettings configs carry an API key — valid ONLY on the HTTP API
// (api.smtp2go.com). The SMTP relay (mail.smtp2go.com) authenticates with a
// separate "SMTP User" username/password pair, so an API key there always
// 535s. The env-var fallback uses SMTP2GO_USERNAME/PASSWORD, which IS an
// SMTP-User credential pair — that branch keeps the relay transport.
const sendMessage = { ...message }
if (config.forceSenderEmail || !sendMessage.from) {
  sendMessage.from = {
    address: config.senderEmail,
    name: config.senderName,
  }
}

let send: () => Promise<unknown>
if (config.id === 'env-fallback') {
  const transport = nodemailer.createTransport({
    host: process.env.SMTP2GO_HOST!,
    port: Number(process.env.SMTP2GO_PORT) || 2525,
    auth: {
      user: process.env.SMTP2GO_USERNAME!,
      pass: process.env.SMTP2GO_PASSWORD!,
    },
  })
  send = () => transport.sendMail(sendMessage)
} else {
  send = () => sendViaSmtp2goApi(config, sendMessage)
}

// ---- Send + Log ----
const logBase = {
  to: recipient,
  subject,
  site: config.resolvedForSite || siteId || undefined,
  sentAt: new Date().toISOString(),
}

try {
  const result = await send()

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
```

Notes on what this does:

- The env-fallback branch behavior is byte-for-byte the same transport it had before (its credentials are relay-valid; `apiKey` on that pseudo-config held the username and is no longer misused).
- The SmtpSettings branch now POSTs to the HTTP API with `config.apiKey` in the `X-Smtp2go-Api-Key` header. The wrong comment "SMTP2GO uses API key as both user and pass" is deleted with the old block.
- Logging structure is unchanged: success = the send promise resolved; error = it threw. `EmailLogs` stores only `status/to/subject/site/sentAt/errorMessage` — no nodemailer response fields — so the response-shape change does not affect logging (verified against `src/collections/EmailLogs.ts`).
- Also update the adapter's doc comment above (lines 42–58): replace the sentence "A nodemailer transport is created per send from the resolved config's raw API key…" with "SmtpSettings sends go through SMTP2GO's HTTP API (`sendViaSmtp2goApi`) using the config's raw API key (read directly from MongoDB, bypassing the afterRead mask). The env-var fallback keeps the legacy SMTP relay transport."

- [ ] **Step 3: Typecheck the changed file**

Run: `pnpm exec tsc --noEmit`
Expected: exit 0. (If `config` narrows poorly inside the `send` closures, hoist `const resolvedConfig = config` before the branch and close over that — `config` is already narrowed non-null by the guard above.)

- [ ] **Step 4: Commit**

```bash
git add src/payload.config.ts
git commit -m "fix: email adapter sends via SMTP2GO HTTP API (API-key auth)"
```

---

### Task 3: Switch the Test-tab route to the HTTP API

**Files:**

- Modify: `src/app/api/smtp-test/route.ts` (imports + the transport/send block, lines 93–127)

**Interfaces:**

- Consumes: `sendViaSmtp2goApi` from `@/email/smtp2go` (Task 1), `resolveSmtpConfig` (unchanged).
- Produces: unchanged route contract — `POST /api/smtp-test` returns `{ success: true }` or `{ success: false, error }` with 502 on send failure.

- [ ] **Step 1: Swap the import**

In `src/app/api/smtp-test/route.ts`, replace line 4:

```ts
import nodemailer from 'nodemailer'
```

with:

```ts
import { sendViaSmtp2goApi } from '@/email/smtp2go'
```

- [ ] **Step 2: Replace the transport/send block**

Replace lines 93–127 (the `// Build transport — same pattern as…` comment through the `await transport.sendMail({…})` call, inclusive) with:

```ts
// Send via SMTP2GO's HTTP API — the API key is only valid there.
// The SMTP relay (mail.smtp2go.com) authenticates with a separate SMTP
// User username/password pair, so relay sends always 535 with an API key.
await sendViaSmtp2goApi(smtpConfig, {
  from: {
    address: smtpConfig.senderEmail,
    name: smtpConfig.senderName,
  },
  to: testEmail,
  subject: 'SMTP2GO Test Email — High6 CMS',
  html: `
        <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto;">
          <h2>SMTP2GO Test Email</h2>
          <p>This email confirms that your SMTP2GO configuration is working correctly.</p>
          <table style="border-collapse: collapse; width: 100%; margin: 1rem 0;">
            <tr><td style="padding: 0.4rem 0; color: #666;">Config</td><td>${smtpDoc.label || 'N/A'}</td></tr>
            <tr><td style="padding: 0.4rem 0; color: #666;">Sender</td><td>${smtpConfig.senderEmail}</td></tr>
          </table>
          <p style="color: #999; font-size: 0.8rem;">
            Sent at ${new Date().toISOString()} from High6 CMS
          </p>
        </div>
      `,
})

return Response.json({ success: true })
```

Everything from the auth check through `resolveSmtpConfig` (lines 1–91) is untouched — the access-control behavior (explicit `overrideAccess: false` + `user`) stays exactly as-is.

- [ ] **Step 3: Typecheck + run the full int suite**

Run: `pnpm exec tsc --noEmit && pnpm test:int`
Expected: tsc exit 0; test:int passes 58 existing + the ~12 new smtp2go tests from Task 1.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/smtp-test/route.ts
git commit -m "fix: smtp-test route sends via SMTP2GO HTTP API (API-key auth)"
```

---

### Task 4: Full verification gates + live send

**Files:**

- Modify: none (verification + handoff doc only)
- Create: `docs/payload/payload-poc-handoff-v38.md`

- [ ] **Step 1: Dev-server guard before building**

Run: `lsof -nP -iTCP:3000 -sTCP:LISTEN`
If anything is listening: STOP, tell the user a dev server is running, and ask before proceeding. Only continue when port 3000 is free (v36 `.next` corruption guard).

- [ ] **Step 2: Full verification**

Run in order:

```bash
pnpm exec tsc --noEmit
pnpm test:int
pnpm build
```

Expected: tsc exit 0; test:int all pass (58 existing + new smtp2go tests); `pnpm build` clean.

- [ ] **Step 3: Live test send (the real gate)**

Pre-check first: confirm in the SMTP2GO dashboard that the SmtpSettings doc's `senderEmail` appears in **Sending > Verified Senders** (the dashboard already warns "You need to verify one or more of your Verified Senders"). If it is not verified, fix that in the SMTP2GO account (or use a verified sender for the test) BEFORE the test send — an unverified sender would return a 400 config error and mask whether the code fix works.

Then: start the dev server (`pnpm dev`), open the SmtpSettings **Test tab**, send a test email, and confirm **actual delivery in the inbox** — not just "no error returned". The bug was only ever visible on a real send; the API-path equivalent of 535 would be a 400 with `data.error` (e.g. an unverified sender), so check the response message carefully if it fails.

Note for the handoff: the Test tab sends directly through the route (not the `loggingEmailAdapter`), so it does NOT write an `email-logs` entry — `enableLogging` is only exercised by adapter-path sends (form submissions, auth emails). If an EmailLogs check is wanted, trigger a form submission or forgot-password flow and confirm a `success` row appears in EmailLogs.

- [ ] **Step 4: Write the handoff**

Create `docs/payload/payload-poc-handoff-v38.md` following the v36/v37 structure. Required sections:

1. Root cause: SMTP relay vs HTTP API — two distinct auth mechanisms; API keys are not SMTP AUTH credentials (535 on every send).
2. Why Option B: reuse the existing `apiKey`/`_apiKey` schema instead of adding SMTP User username/password fields (two credential types to maintain). Zero schema changes, no migration, no UI changes.
3. Exact field-mapping table (SmtpSettings → SMTP2GO API payload) — copy the table from this plan's verification section.
4. Confirmation of a real successful test send with delivery verified (inbox receipt), plus the EmailLogs note from Step 3.
5. Files changed (3 + 1 test + handoff), verification results (tsc/test:int/build), and any open items carried forward.

- [ ] **Step 5: Sync graphify and save memory**

Run: `graphify update .` (AST-only, no API cost — per project CLAUDE.md), then save an engram memory (decision/bugfix: SMTP relay 535 root cause + HTTP API switch, Option B rationale).

- [ ] **Step 6: Commit the handoff**

```bash
git add docs/payload/payload-poc-handoff-v38.md
git commit -m "docs: handoff v38 — SMTP relay → HTTP API switch"
```

---

## Self-Review

**1. Spec coverage:**

- Switch adapter to HTTP API → Task 2 ✅
- Switch smtp-test route → Task 3 ✅
- resolveSmtpConfig untouched (no relay assumptions found in it — verified: it only resolves `apiKey`/sender fields and does raw Mongo reads) ✅
- loggingEmailAdapter response-shape compatibility → verified (EmailLogs stores no transport-response fields; success/error from promise resolution/rejection, unchanged) + Task 2 note ✅
- senderEmail/forceSenderEmail/senderName mapping → `sender` field, doc-verified, Task 1 tests ✅
- No schema changes / no generate:types → confirmed, Global Constraints ✅
- Verification gates (tsc, test:int, build with guard, live send) → Task 4 ✅
- Handoff v38 with required sections → Task 4 Step 4 ✅

**2. Placeholder scan:** no TBDs; every code step contains full code; test code is complete and runnable.

**3. Type consistency:** `sendViaSmtp2goApi` / `buildSmtp2goPayload` / `formatAddress` / `Smtp2goApiResponse` signatures defined in Task 1 are used verbatim in Tasks 2–3. `ResolvedSmtpConfig` comes from the existing `@/utilities/resolveSmtpConfig`. `SendEmailOptions` is Payload's type (nodemailer-shaped — `to`, `cc`, `bcc`, `subject`, `text`, `html`, `replyTo`, `headers`, `attachments` all exist on it, verified against `node_modules/payload/dist/email/types.d.ts` which extends `NodemailerSendMailOptions`).

**Known residual risk (flag, don't fix silently):** SMTP2GO requires **sender verification** (domain or single-sender). If a SmtpSettings `senderEmail` is unverified, the API returns 400 with a descriptive `data.error` (surfaced in the route's 502 message and logged to EmailLogs) — a strictly better failure mode than 535, but still a per-account config issue that may need a follow-up if it appears in the live test.
