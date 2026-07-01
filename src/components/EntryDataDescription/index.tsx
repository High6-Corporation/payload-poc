'use client'

import React from 'react'

const TYPE_MAPPINGS = [
  { type: 'text', mapsTo: 'a string', example: '"Jane Doe"' },
  { type: 'richtext', mapsTo: 'a Lexical rich text JSON object', example: null },
  { type: 'number', mapsTo: 'a number', example: '42' },
  {
    type: 'media',
    mapsTo: 'a Payload media document ID (string)',
    example: '"661f8b5d5d8a123456789abc"',
  },
  { type: 'url', mapsTo: 'a URL string', example: '"https://example.com"' },
  { type: 'toggle', mapsTo: 'true or false', example: null },
] as const

const EXAMPLE_JSON = `{
  "full-name": "Jane Doe",
  "bio": { "root": { "type": "root", "children": [...] } },
  "headshot": "661f8b5d5d8a123456789abc",
  "is-active": true
}`

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
  section: {
    display: 'block',
    marginBottom: '16px',
  } as React.CSSProperties,
  mappingRow: {
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

export const EntryDataDescription: React.FC = () => {
  return (
    <div style={{ display: 'block', marginTop: '4px' }}>
      {/* Intro */}
      <p style={S.para}>
        The content for this entry. Keys should match the field names defined in the parent Custom
        Collection.
      </p>

      {/* Type mappings */}
      <div style={S.section}>
        <span style={S.heading}>How Values Map to Field Types</span>
        {TYPE_MAPPINGS.map((tm) => (
          <div key={tm.type} style={S.mappingRow}>
            <code style={S.code}>{tm.type}</code>
            {' → '}
            {tm.mapsTo}
            {tm.example && (
              <>
                {', e.g. '}
                <code style={S.code}>{tm.example}</code>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Example */}
      <div style={S.section}>
        <span style={S.heading}>Example — for a &ldquo;Team Members&rdquo; Collection</span>
        <span
          style={{
            display: 'block',
            marginBottom: '6px',
            fontSize: '12px',
            color: 'var(--theme-elevation-400)',
            lineHeight: '1.4',
          }}
        >
          With fields <code style={S.code}>full-name</code>, <code style={S.code}>bio</code>,{' '}
          <code style={S.code}>headshot</code>, <code style={S.code}>is-active</code>:
        </span>
        <pre style={S.preBlock}>{EXAMPLE_JSON}</pre>
      </div>

      {/* Media note */}
      <div style={S.callout}>
        <strong style={{ color: 'var(--theme-elevation-800)' }}>Important — media fields:</strong> Store the Payload
        media document ID, not a raw URL. The media collection is already connected to Supabase S3 —
        the ID resolves to the correct URL automatically.
      </div>
    </div>
  )
}
