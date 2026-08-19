'use client'

import { useDocumentInfo } from '@payloadcms/ui'
import { Button, TextInput } from '@payloadcms/ui'
import { useState } from 'react'
import type { ChangeEvent } from 'react'

/**
 * Test-action UI field rendered on the SmtpSettings "Test" tab.
 *
 * Sends a real test email through POST /api/smtp-test using the current
 * document's SMTP config. The endpoint enforces Payload's normal access
 * control (tenantEnabledAccess) on the config read — a tenant-admin can
 * only test-send configs belonging to their own tenants.
 *
 * NOTE: `type="email"` is intentionally NOT passed to TextInput —
 * Payload's TextInput hardcodes type="text" and accepts no type prop
 * (see SmtpApiKeyField for the same finding). Email format is validated
 * server-side by the endpoint.
 */
export function SmtpTestAction() {
  const { id } = useDocumentInfo()
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

      {/* margin={false} strips Payload's default 24px vertical button margin
          (--margin-block = base * 1.2); center-aligns the 32px button with
          the 40px input. Measured: with the default margin the button floated
          20px above the input's center */}
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <div style={{ flex: 1 }}>
          <TextInput
            path="testEmail"
            value={testEmail}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setTestEmail(e.target.value)}
            placeholder="recipient@example.com"
          />
        </div>
        <Button
          margin={false}
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
