'use client'

import React from 'react'

const FIELD_TYPES = [
  { type: 'text', desc: 'Plain text input' },
  { type: 'richtext', desc: 'Rich text content' },
  { type: 'number', desc: 'Numeric value' },
  { type: 'media', desc: 'Reference to a Media document (store the document ID)' },
  { type: 'url', desc: 'Web address' },
  { type: 'toggle', desc: 'True/false switch' },
] as const

const REQUIRED_FIELDS = [
  {
    label: 'name',
    meta: 'string, required',
    desc: 'Lowercase-kebab-case identifier used as the data key',
  },
  { label: 'type', meta: 'string, required', desc: 'One of the types above, or your own' },
  { label: 'required', meta: 'boolean, required', desc: 'Whether this field must be filled' },
  { label: 'label', meta: 'string, optional', desc: 'Human-readable label shown when editing' },
] as const

const EXAMPLE_JSON = `[
  { "name": "full-name",  "type": "text",     "required": true,  "label": "Full Name" },
  { "name": "bio",        "type": "richtext",  "required": false, "label": "Biography" },
  { "name": "headshot",   "type": "media",     "required": false, "label": "Headshot" },
  { "name": "is-active",  "type": "toggle",    "required": false, "label": "Currently Active" }
]`

const S = {
  code: {
    fontFamily: 'monospace',
    background: 'var(--theme-elevation-100)',
    padding: '1px 5px',
    borderRadius: '3px',
    fontSize: '12px',
    color: 'var(--theme-elevation-800)',
    fontWeight: 600,
  } as React.CSSProperties,
  heading: {
    display: 'block',
    marginBottom: '6px',
    fontSize: '11px',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: 'var(--theme-elevation-500)',
  } as React.CSSProperties,
  para: {
    display: 'block',
    marginBottom: '6px',
    fontSize: '13px',
    color: 'var(--theme-elevation-500)',
    lineHeight: '1.5',
  } as React.CSSProperties,
  subtle: {
    display: 'block',
    marginBottom: '8px',
    fontSize: '12px',
    color: 'var(--theme-elevation-400)',
    lineHeight: '1.4',
  } as React.CSSProperties,
  section: {
    display: 'block',
    marginBottom: '16px',
  } as React.CSSProperties,
  chip: {
    display: 'block',
    marginBottom: '4px',
    fontSize: '12px',
    color: 'var(--theme-elevation-500)',
    lineHeight: '1.5',
  } as React.CSSProperties,
  preBlock: {
    display: 'block',
    overflowX: 'auto',
    background: 'var(--theme-bg)',
    border: '1px solid var(--theme-elevation-150)',
    borderRadius: '6px',
    padding: '10px 12px',
    fontSize: '12px',
    lineHeight: '1.6',
    color: 'var(--theme-elevation-800)',
    fontFamily: 'monospace',
    whiteSpace: 'pre',
    marginBottom: '16px',
  } as React.CSSProperties,
  callout: {
    display: 'block',
    borderLeft: '2px solid var(--theme-elevation-400)',
    background: 'var(--theme-elevation-100)',
    borderRadius: '4px',
    padding: '8px 10px',
    marginBottom: '8px',
    fontSize: '12px',
    color: 'var(--theme-elevation-500)',
    lineHeight: '1.5',
  } as React.CSSProperties,
}

export const FieldBuilderDescription: React.FC = () => {
  return (
    <div style={{ display: 'block', marginTop: '4px' }}>
      {/* Intro */}
      <p style={S.para}>
        Define the fields for this custom collection. Each entry in the array describes one field —
        add as many as you need.
      </p>

      {/* Available field types */}
      <div style={S.section}>
        <span style={S.heading}>Available Field Types</span>
        <span style={S.subtle}>
          Suggestions only — you&rsquo;re free to use any type value you need.
        </span>
        {FIELD_TYPES.map((ft) => (
          <div key={ft.type} style={S.chip}>
            <code style={S.code}>{ft.type}</code>
            {' — '}
            {ft.desc}
          </div>
        ))}
      </div>

      {/* Required field structure */}
      <div style={S.section}>
        <span style={S.heading}>Each Field Object Needs</span>
        {REQUIRED_FIELDS.map((rf) => (
          <div
            key={rf.label}
            style={{ display: 'block', marginBottom: '4px', fontSize: '12px', lineHeight: '1.5' }}
          >
            <code style={S.code}>{rf.label}</code>{' '}
            <span style={{ color: 'var(--theme-elevation-400)' }}>({rf.meta})</span>
            {' — '}
            <span style={{ color: 'var(--theme-elevation-500)' }}>{rf.desc}</span>
          </div>
        ))}
      </div>

      {/* Example */}
      <div style={S.section}>
        <span style={S.heading}>Example — a &ldquo;Team Members&rdquo; Collection</span>
        <pre style={S.preBlock}>{EXAMPLE_JSON}</pre>
      </div>

      {/* Media note */}
      <div style={S.callout}>
        <strong style={{ color: 'var(--theme-elevation-800)' }}>Media fields:</strong> When a field type is{' '}
        <code style={S.code}>media</code>
        {', '}
        the stored value should be a Payload media document ID — not a raw URL. This ensures images
        resolve correctly through the existing Supabase S3 setup.
      </div>
    </div>
  )
}
