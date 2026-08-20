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
  vi.restoreAllMocks()
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
