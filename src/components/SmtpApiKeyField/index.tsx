'use client'

import { useField } from '@payloadcms/ui'
import { Button } from '@payloadcms/ui'
import { useState } from 'react'

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.5rem 0.75rem',
  background: 'var(--theme-elevation-50)',
  border: '1px solid var(--theme-elevation-150)',
  borderRadius: 'var(--style-radius-m)',
  fontFamily: 'monospace',
  fontSize: '0.875rem',
  color: 'var(--theme-text)',
  outline: 'none',
}

/**
 * Renders the server-masked apiKey value and provides an Edit / Set Key
 * toggle.  The raw key is never in the DOM after the initial save —
 * the afterRead hook (maskApiKey) replaces it server-side.
 *
 * The field's form value is only ever changed via `setValue` when the
 * user clicks "Save Key".  The editing input is a local `draft` state —
 * NOT bound to the form — so typing never mutates the field, and a
 * routine save of an unrelated field carries whatever the form already
 * had (see validateUniquePair's masked-submission guard for the
 * server-side half of this protection).
 *
 * A native <input type="password"> is used instead of @payloadcms/ui's
 * TextInput because TextInput hardcodes type="text" and accepts no type
 * prop (htmlAttributes is restricted to autoComplete).
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
      <input
        type="password"
        autoComplete="off"
        spellCheck={false}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Enter SMTP2GO API key"
        style={inputStyle}
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
