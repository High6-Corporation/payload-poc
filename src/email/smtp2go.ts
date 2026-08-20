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
