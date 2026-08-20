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
| `to`                                                     | `to` — required array of `"Name <email>"` strings                                        |
| `cc` / `bcc`                                             | `cc` / `bcc` arrays                                                                      |
| `subject`                                                | `subject`                                                                                |
| `text`                                                   | `text_body`                                                                              |
| `html`                                                   | `html_body`                                                                              |
| `replyTo`                                                | `custom_headers: [{ header: 'Reply-To', value }]` (no top-level `reply_to` field exists) |
| `headers` (string values)                                | `custom_headers` entries                                                                 |
| `attachments`                                            | `attachments: [{ filename, mimetype, fileblob(base64) }]` (path-only → throw)            |

Auth: `X-Smtp2go-Api-Key` header. 10s `AbortSignal.timeout` (bare fetch has no default timeout). Errors surface SMTP2GO's `data.error` instead of an opaque 535.

### Files changed (5 commits + handoff)

| File                              | Change                                                                                                                                                                                                                          |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/email/smtp2go.ts`            | NEW — shared helper: `buildSmtp2goPayload` / `sendViaSmtp2goApi` / `formatAddress` / `Smtp2goApiResponse`. Also throws on 200-with-`data.failed` recipient rejections (final-review fix — the seam's last silent-failure path)  |
| `tests/int/smtp2go.int.spec.ts`   | NEW — 15 unit tests locking the field mapping + error/timeout/recipient-failure paths                                                                                                                                          |
| `src/payload.config.ts`           | Adapter SmtpSettings branch → HTTP API helper; env-fallback branch keeps the relay (SMTP2GO_USERNAME/PASSWORD are SMTP-User creds — relay-valid); logging wrapper unchanged                                                    |
| `src/app/api/smtp-test/route.ts`  | Test-tab send → HTTP API helper; auth/access-control region byte-for-byte unchanged                                                                                                                                            |

Untouched by design: `resolveSmtpConfig.ts`, SmtpSettings schema, apiKey masking hooks.

### Verification

| Check                     | Result                                                                                                                                                                                                                                              |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm exec tsc --noEmit`  | ✅ exit 0                                                                                                                                                                                                                                            |
| `pnpm test:int`           | ✅ 73/73 (58 existing + 15 new)                                                                                                                                                                                                                      |
| `pnpm build`              | ✅ clean (dev server stopped first — v36 guard followed)                                                                                                                                                                                             |
| Live test send            | ✅ `POST /api/smtp-test 200 in 3.8s` → **email received in joshsosme@gmail.com inbox (user-confirmed)**. Sender: no-reply@matchpoint.com.ph (Matchpoint SMTP config, enabled during the session)                                                    |
| EmailLogs (adapter path)  | ⚠️ **NOT YET VERIFIED** — Test-tab sends bypass the logging adapter entirely (route sends directly, no `email-logs` write). Confirmed empirically: 37 rows exist, none from 2026-08-20. The new HTTP-API code path has never actually written a real EmailLogs row — `enableLogging` is unproven end-to-end on the fixed transport. **This is the first item for the next session (see §2).** |

### Key discoveries

1. **Payload `EmailAdapter` has a generic response type** (`sendEmail: Promise<TSendEmailResponse = unknown>`) — no nodemailer-shaped return required, so a plain `fetch()` adapter satisfies the contract; no custom-transport wrapper needed. All core consumers (forgotPassword, sendVerificationEmail, form-builder plugin) ignore the return value.
2. **Test-tab sends bypass the logging adapter** — `POST /api/smtp-test` sends directly, so `enableLogging` is NOT exercised by the Test tab. To verify EmailLogs end-to-end: trigger a form submission or forgot-password flow and check for a `success` row. **Not done yet — see §2.1.**
3. **The smtp-test route does not check the `enabled` flag** — a disabled SmtpSettings doc still test-sends (that's how the 535 surfaced on a disabled config). The production adapter DOES honor `enabled: false`. Quirk documented, left as-is (out of scope).
4. **`AbortSignal.timeout` uses native timers** that Vitest 4 fake timers cannot intercept — the timeout test drives the abort via a `vi.spyOn(AbortSignal, 'timeout')` + faked `setTimeout` instead.
5. **Historical 550s in EmailLogs prove the env-fallback relay path was auth-valid** — sender-domain verification was its failure mode, not auth. Unverified senders fail loudly with a descriptive message on both paths now.

---

## 2. Open Items — Carried Forward + New for Next Session

### 2.1 EmailLogs end-to-end verification (NEW — do this first)

The live test in §1 only proved the HTTP-API transport works; it did **not** prove the `loggingEmailAdapter` writes a correct row through the new code path, because the Test tab bypasses it. Before this fix is considered fully closed:

- Trigger a real adapter-path send — a Matchpoint (or any enabled tenant) contact-form submission is the more representative check than forgot-password, since it exercises the site-resolution branch, not just tenant-resolution.
- Confirm a `success` row appears in EmailLogs with correct `to` / `subject` / `site` / `sentAt`.
- Also worth deliberately triggering one **failure** case (e.g. temporarily point a config at an unverified sender) to confirm the `error` / `errorMessage` write path still works with the new HTTP-API error shape (`SMTP2GO API error: {message}` vs the old SMTP error strings) — the logging code was verified by code-reading, not by an actual error write, in this session.

### 2.2 History/audit log retention policy (NEW — research + design task)

Multiple collections in this system now function as append-only history/audit logs with no retention story:

- `EmailLogs` (this session's focus) — 37+ rows and growing, one per send attempt, unbounded.
- `AgentAuditLog` (moved into the Logs nav group in v36) — likely similar unbounded growth.
- Any other collection that logs changes to entities (check for a generic "history"/"revisions" pattern if one exists — Payload's own drafts/versions system may also be relevant here and worth comparing against, since Payload already has built-in version retention config).

**Task for next session:** research and propose a retention/archival policy — options to compare:
- Fixed TTL delete (e.g. 90/180 days) via a scheduled job or MongoDB TTL index.
- Archive-then-delete: move rows older than N days to a cold collection or export (e.g. to cloud storage) before deleting from the primary collection, so data isn't lost, just moved out of the hot path.
- Payload's native `versions.max` / `versions.drafts` retention config, if applicable to any of these collections, vs. a fully custom collection needing its own solution.
- Compliance/business considerations: does anyone (Sir JM, Sir Jeff, Sir Gio, or a client) actually need EmailLogs older than X days for debugging or audit purposes? Worth a quick question before designing rather than assuming.

This should land as a **design doc + plan**, not a same-session implementation — retention policy touches production data deletion, which needs explicit sign-off before any code runs.

### 2.3 Package/plugin inventory audit (NEW)

No current single source of truth exists for: what Payload plugins are installed (form-builder plugin is referenced in v38 §1 discoveries, but there may be others), their versions, and why each was added. Task for next session:

- Enumerate `package.json` dependencies that are Payload plugins vs. general npm packages, with version + one-line purpose for each.
- Cross-reference against the payload.config.ts `plugins` array to confirm every configured plugin is actually documented somewhere.
- Output as a living doc (e.g. `docs/payload/dependencies.md`) rather than a one-time handoff note, since this drifts every time a package is added — worth deciding whether to make this a checked-in doc that PRs are expected to update, or a generated artifact (script that reads package.json + payload.config.ts and emits the table).

### 2.4 Header/Footer global connections + Menu Items — still pending (carried from v34/v35/v36/v37)

Consolidating this long-open item explicitly for next session:

- **Menu Items** collection exists (built in v36) and is fully functional/tested, but **nothing consumes it yet**.
- **Header/Footer globals** are still unscoped — public `read: () => true`, single `navItems` array, no tenant/site fields.
- The actual next step: Header/Footer need to become tenant/site-scoped (or be replaced by something that queries Menu Items directly) before the two can be wired together. This needs its own design session — it's not a small follow-up, it's the last real piece of Phase 3.
- `resolveMenuItems` currently uses **replace** semantics (site items fully hide tenant defaults). If Header/Footer wiring reveals a need for **merge** semantics instead (e.g. site items append to tenant defaults rather than replacing them), that's a design decision to make during this work, not before.

### 2.5 New Payload usage guide doc (NEW)

Requested: a fresh, current guide doc on how to use the Payload admin — written for whoever needs to actually operate it day-to-day (tenant-admins, or teammates like Sir JM/Sir Jeff/Sir Gio, depending on intended audience — worth clarifying who this is for before writing, since a technical-implementation guide and an end-user admin guide are very different documents). Candidate scope:

- How multi-tenancy works from an operator's point of view (tenant vs. site, what `disabledCollections` toggles do).
- SmtpSettings: how to set up email for a new tenant/site (this session's fix makes this finally reliable — good time to document it while fresh).
- Menu Items / SEO panel / Menu Items+Header-Footer once §2.4 lands (may be worth sequencing this doc *after* §2.4 rather than before, so it doesn't need a rewrite).
- Should live somewhere discoverable — `docs/payload/` alongside the handoffs, but written as a standalone reference doc, not a dated session handoff (different audience, different lifespan).

**Sequencing note:** §2.5 probably makes most sense written *last* of the four new items, once §2.1 (EmailLogs) and §2.4 (Menu Items/Header-Footer) reach a settled state — otherwise the guide risks going stale within the same week.

### 2.6 Other open items (unchanged from v37/v36/v35)

Loading-state audit (SiteSwitcher, ImportHistory); `getUserTenantIds` test coverage; site-level RBAC; dead `SidebarOrderFix` component; Playwright headless-shell build missing; `pnpm lint` pre-existing break.

---

## 3. How to Resume — Continuation Prompt Template

```
# Task: EmailLogs verification (§2.1) + pick one of: retention policy design (§2.2),
# package/plugin inventory (§2.3), Header/Footer + Menu Items wiring (§2.4),
# or Payload usage guide (§2.5)

## Pre-work
- Read this handoff doc (payload-poc-handoff-v38.md) in full first
- graphify --update: sync current state (payload-poc scoped skill: payload-poc:graphify)
- engram: search "SMTP2GO HTTP API", "EmailLogs", "Menu Items", "SmtpSettings convention" for context
- Dev server: cd /Users/josh/work/payload-poc && pnpm dev (if port 3000 is taken, a stale server may be running — check PID before killing)

## Constraints
- Production database, additive changes only; browser checks never save documents unless the task explicitly requires a real send/write (e.g. §2.1's form submission test)
- NEVER run `pnpm build` while the dev server is running (corrupts .next — see v36 discoveries #3)
- Payload 3.85.1 local API overrideAccess=true default — pass explicitly
- §2.2 (retention policy) is design/plan-first only — no deletion code without explicit user sign-off on the policy
- Regression checks: `pnpm test:int` (73 baseline) and `pnpm exec tsc --noEmit`

## Priority order (suggested, not mandatory)
1. §2.1 EmailLogs verification — closes out this session's fix completely, ~15-30 min
2. §2.3 package/plugin inventory — cheap, high-value reference doc, no code risk
3. §2.2 retention policy — needs a design doc + your sign-off before any implementation
4. §2.4 Header/Footer + Menu Items — the biggest remaining piece of Phase 3, needs its own session
5. §2.5 usage guide — best written after §2.4 settles
```