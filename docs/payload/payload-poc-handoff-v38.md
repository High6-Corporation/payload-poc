# Payload POC Handoff v38 — SMTP2GO Relay → HTTP API Switch

**Date:** 2026-08-20
**Repo:** `/Users/josh/work/payload-poc` (Payload CMS 3.85.1)
**Supersedes:** v37 (apiRegion removed from SmtpSettings — hardcoded US)

---

## 1. This Session — SMTP2GO Send Fix: Relay Auth → HTTP API (✅ Complete, Inbox-Verified)

**Trigger:** live test send via SmtpSettings' Test tab → `POST /api/smtp-test` failed with `535 Incorrect authentication data` (502 in 2.3s).

### Root cause

SMTP2GO has two distinct, non-interchangeable auth mechanisms:

1. **HTTP API** (`api.smtp2go.com`) — authenticates via API Key (what SmtpSettings `apiKey`/`_apiKey` stores).
2. **SMTP relay** (`mail.smtp2go.com`, port 2525) — authenticates via a separate **SMTP User** username/password pair created under Sending > SMTP Users.

The code in `payload.config.ts`'s email adapter and `src/app/api/smtp-test/route.ts` connected over the SMTP relay but authenticated with `apiKey` as BOTH username and password ("SMTP2GO uses API key as both user and pass" — wrong, untested until now). Every send 535'd regardless of key. NOT related to the v37 apiRegion removal — that work was correct.

**Corroboration from the email-logs collection:** rows from 2026-08-05/13 show `550 From header sender domain not verified` errors — those went through the env-fallback relay path where SMTP AUTH SUCCEEDED (the `SMTP2GO_USERNAME`/`SMTP2GO_PASSWORD` env pair is relay-valid) and only sender verification failed. Auth succeeding on one path and 535-ing on the other is the same root cause seen from both sides.

### Why Option B (HTTP API) over adding SMTP User fields

Rather than adding SMTP User username/password fields to SmtpSettings (two credential types to maintain, schema change, migration), the transport now POSTs to `https://api.smtp2go.com/v3/email/send` using the existing `apiKey`. Zero schema changes, no migration, no SmtpSettings UI changes, no `generate:types`.

### Field mapping (verified against SMTP2GO endpoint reference, 2026-08-19)

| Payload `SendEmailOptions`                              | SMTP2GO `/v3/email/send` field                                                           |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `from` (after `forceSenderEmail`/missing-from override) | `sender` — required `"Name <email>"` string                                              |
| `to`                                                    | `to` — required array of `"Name <email>"` strings                                        |
| `cc` / `bcc`                                            | `cc` / `bcc` arrays                                                                      |
| `subject`                                               | `subject`                                                                                |
| `text`                                                  | `text_body`                                                                              |
| `html`                                                  | `html_body`                                                                              |
| `replyTo`                                               | `custom_headers: [{ header: 'Reply-To', value }]` (no top-level `reply_to` field exists) |
| `headers` (string values)                               | `custom_headers` entries                                                                 |
| `attachments`                                           | `attachments: [{ filename, mimetype, fileblob(base64) }]` (path-only → throw)            |

Auth: `X-Smtp2go-Api-Key` header. 10s `AbortSignal.timeout` (bare fetch has no default timeout). Errors surface SMTP2GO's `data.error` instead of an opaque 535.

### Files changed (5 commits + handoff)

| File                             | Change                                                                                                                                                                                                                         |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/email/smtp2go.ts`           | NEW — shared helper: `buildSmtp2goPayload` / `sendViaSmtp2goApi` / `formatAddress` / `Smtp2goApiResponse`. Also throws on 200-with-`data.failed` recipient rejections (final-review fix — the seam's last silent-failure path) |
| `tests/int/smtp2go.int.spec.ts`  | NEW — 15 unit tests locking the field mapping + error/timeout/recipient-failure paths                                                                                                                                          |
| `src/payload.config.ts`          | Adapter SmtpSettings branch → HTTP API helper; env-fallback branch keeps the relay (SMTP2GO_USERNAME/PASSWORD are SMTP-User creds — relay-valid); logging wrapper unchanged                                                    |
| `src/app/api/smtp-test/route.ts` | Test-tab send → HTTP API helper; auth/access-control region byte-for-byte unchanged                                                                                                                                            |

Untouched by design: `resolveSmtpConfig.ts`, SmtpSettings schema, apiKey masking hooks.

### Verification

| Check                    | Result                                                                                                                                                                                                                                            |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm exec tsc --noEmit` | ✅ exit 0                                                                                                                                                                                                                                         |
| `pnpm test:int`          | ✅ 73/73 (58 existing + 15 new)                                                                                                                                                                                                                   |
| `pnpm build`             | ✅ clean (dev server stopped first — v36 guard followed)                                                                                                                                                                                          |
| Live test send           | ✅ `POST /api/smtp-test 200 in 3.8s` → **email received in joshsosme@gmail.com inbox (user-confirmed)**. Sender: no-reply@matchpoint.com.ph (Matchpoint SMTP config, enabled during the session)                                                  |
| EmailLogs                | ℹ️ Test-tab sends bypass the logging adapter (route sends directly) — no email-logs row for the test send, confirmed empirically (37 rows, none from 2026-08-20). `enableLogging` only covers adapter-path sends (form submissions, auth emails). |

### Key discoveries

1. **Payload `EmailAdapter` has a generic response type** (`sendEmail: Promise<TSendEmailResponse = unknown>`) — no nodemailer-shaped return required, so a plain `fetch()` adapter satisfies the contract; no custom-transport wrapper needed. All core consumers (forgotPassword, sendVerificationEmail, form-builder plugin) ignore the return value.
2. **Test-tab sends bypass the logging adapter** — `POST /api/smtp-test` sends directly, so `enableLogging` is NOT exercised by the Test tab. To verify EmailLogs end-to-end: trigger a form submission or forgot-password flow and check for a `success` row.
3. **The smtp-test route does not check the `enabled` flag** — a disabled SmtpSettings doc still test-sends (that's how the 535 surfaced on a disabled config). The production adapter DOES honor `enabled: false`. Quirk documented, left as-is (out of scope).
4. **`AbortSignal.timeout` uses native timers** that Vitest 4 fake timers cannot intercept — the timeout test drives the abort via a `vi.spyOn(AbortSignal, 'timeout')` + faked `setTimeout` instead.
5. **Historical 550s in EmailLogs prove the env-fallback relay path was auth-valid** — sender-domain verification was its failure mode, not auth. Unverified senders fail loudly with a descriptive message on both paths now.

### Open items (unchanged from v37/v36/v35)

Header/Footer global connections; loading-state audit; `getUserTenantIds` test coverage; site-level RBAC; dead `SidebarOrderFix` component; Playwright headless-shell build missing; `pnpm lint` pre-existing break.
