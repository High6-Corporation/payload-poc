'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useField, useListDrawer } from '@payloadcms/ui'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FieldDef {
  name: string
  type: string
  required: boolean
  label?: string
}

interface EntryDataFieldProps {
  field: {
    name: string
    label?: string | Record<string, unknown>
    required?: boolean
    admin?: {
      description?: string | Record<string, unknown>
      width?: string
    }
  }
  path: string
  readOnly?: boolean
}

// ---------------------------------------------------------------------------
// Palette (shared with FieldBuilder for visual consistency)
// ---------------------------------------------------------------------------

// All colors reference Payload admin CSS custom properties so the data-entry
// form blends visually with native Payload fields.  Tokens sourced from
// @payloadcms/ui/dist/styles.css — see the formInput mixin and button styles
// for the canonical definitions.
const C = {
  elevation0: 'var(--theme-elevation-0)',
  elevation100: 'var(--theme-elevation-100)',
  elevation150: 'var(--theme-elevation-150)',
  elevation200: 'var(--theme-elevation-200)',
  elevation400: 'var(--theme-elevation-400)',
  elevation500: 'var(--theme-elevation-500)',
  elevation800: 'var(--theme-elevation-800)',
  text: 'var(--theme-text)',
  inputBg: 'var(--theme-input-bg)',
  borderColor: 'var(--theme-border-color)',
  error50: 'var(--theme-error-50)',
  error200: 'var(--theme-error-200)',
  error500: 'var(--theme-error-500)',
  success500: 'var(--theme-success-500)',
  success100: 'var(--theme-success-100)',
  warning100: 'var(--theme-warning-100)',
  warning600: 'var(--theme-warning-600)',
}

// ---------------------------------------------------------------------------
// Inline Styles (no Tailwind — Payload admin CSS conflicts)
// ---------------------------------------------------------------------------

const S = {
  wrapper: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '16px',
  },

  // Loading / empty / error states
  stateBox: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 24px',
    backgroundColor: 'var(--theme-bg)',
    borderWidth: '1px',
    borderStyle: 'dashed',
    borderColor: C.elevation150,
    borderRadius: '8px',
    textAlign: 'center' as const,
  },
  stateIcon: {
    marginBottom: '12px',
    color: C.elevation400,
  },
  stateHeading: {
    fontSize: '14px',
    fontWeight: 600,
    color: C.elevation800,
    marginBottom: '4px',
  },
  stateText: {
    fontSize: '13px',
    color: C.elevation500,
    maxWidth: '360px',
    lineHeight: '1.5',
  },
  stateError: {
    fontSize: '13px',
    color: C.error500,
    maxWidth: '360px',
    lineHeight: '1.5',
  },

  // Schema info bar
  schemaBar: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 10px',
    backgroundColor: C.elevation100,
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: C.elevation200,
    borderRadius: '6px',
    fontSize: '12px',
    color: C.elevation800,
    fontWeight: 500,
    lineHeight: '18px',
  },

  // Field group
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
  },
  fieldLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '12px',
    fontWeight: 500,
    color: C.elevation500,
    marginBottom: '2px',
  },
  fieldRequired: {
    color: C.error500,
    fontSize: '12px',
    fontWeight: 600,
  },
  fieldOptional: {
    color: C.elevation400,
    fontSize: '11px',
    fontWeight: 400,
  },
  fieldHint: {
    fontSize: '11px',
    color: C.elevation400,
    lineHeight: '16px',
    marginTop: '2px',
  },

  // Inputs — match Payload's formInput() mixin
  inputText: {
    width: '100%',
    padding: '6px 10px',
    fontSize: '13px',
    lineHeight: '20px',
    color: C.elevation800,
    backgroundColor: C.inputBg,
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: C.elevation150,
    borderRadius: 'var(--style-radius-s, 3px)',
    outline: 'none' as const,
    boxSizing: 'border-box' as const,
  },
  inputNumber: {
    width: '100%',
    padding: '6px 10px',
    fontSize: '13px',
    lineHeight: '20px',
    color: C.elevation800,
    backgroundColor: C.inputBg,
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: C.elevation150,
    borderRadius: 'var(--style-radius-s, 3px)',
    outline: 'none' as const,
    boxSizing: 'border-box' as const,
  },
  inputUrl: {
    width: '100%',
    padding: '6px 10px',
    fontSize: '13px',
    lineHeight: '20px',
    color: C.elevation800,
    backgroundColor: C.inputBg,
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: C.elevation150,
    borderRadius: 'var(--style-radius-s, 3px)',
    outline: 'none' as const,
    boxSizing: 'border-box' as const,
  },
  textarea: {
    width: '100%',
    minHeight: '100px',
    padding: '8px 10px',
    fontSize: '13px',
    lineHeight: '20px',
    color: C.elevation800,
    backgroundColor: C.inputBg,
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: C.elevation150,
    borderRadius: 'var(--style-radius-s, 3px)',
    outline: 'none' as const,
    boxSizing: 'border-box' as const,
    resize: 'vertical' as const,
    fontFamily: 'inherit',
  },
  checkboxWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '4px 0',
  },
  checkbox: {
    width: '16px',
    height: '16px',
    accentColor: C.elevation800,
    cursor: 'pointer',
  },
  checkboxLabel: {
    fontSize: '13px',
    color: C.elevation800,
    cursor: 'pointer',
    userSelect: 'none' as const,
  },

  // Type badge — elevation-200 matches Payload's subtle badge style
  typeBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '0px 6px',
    fontSize: '10px',
    fontWeight: 600,
    lineHeight: '18px',
    borderRadius: '3px',
    backgroundColor: C.elevation200,
    color: C.elevation800,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.3px',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: C.elevation150,
    flexShrink: 0,
  },

  // Media note callout — blends with Payload info banner style
  callout: {
    display: 'block',
    borderLeftWidth: '2px',
    borderLeftStyle: 'solid',
    borderLeftColor: C.elevation400,
    backgroundColor: C.elevation100,
    borderRadius: '4px',
    padding: '8px 10px',
    marginTop: '12px',
    fontSize: '12px',
    color: C.elevation500,
    lineHeight: '1.5',
  },

  // ---- Buttons (matching FieldBuilder's button styles) ----

  btnPrimary: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '7px 14px',
    fontSize: '13px',
    fontWeight: 500,
    lineHeight: '20px',
    color: C.elevation0,
    backgroundColor: C.elevation800,
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: C.elevation800,
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'background-color 150ms, box-shadow 150ms',
  },
  btnSecondary: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '7px 14px',
    fontSize: '13px',
    fontWeight: 500,
    lineHeight: '20px',
    color: C.text,
    backgroundColor: 'transparent',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: C.elevation150,
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'background-color 150ms, box-shadow 150ms',
  },
  btnDanger: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '7px 14px',
    fontSize: '13px',
    fontWeight: 500,
    lineHeight: '20px',
    color: C.error500,
    backgroundColor: 'transparent',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: C.elevation150,
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'background-color 150ms, box-shadow 150ms',
  },

  // ---- Dropzone ----

  dropzone: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    padding: '24px 16px',
    borderWidth: '2px',
    borderStyle: 'dashed',
    borderColor: C.elevation200,
    borderRadius: '8px',
    backgroundColor: C.elevation100,
    cursor: 'pointer',
    transition: 'border-color 150ms, background-color 150ms',
    textAlign: 'center' as const,
  },
  dropzoneIcon: {
    color: C.elevation400,
    marginBottom: '2px',
  },
  dropzoneText: {
    fontSize: '13px',
    color: C.elevation500,
    lineHeight: '20px',
  },
  dropzoneHint: {
    fontSize: '11px',
    color: C.elevation400,
    lineHeight: '16px',
  },

  // ---- Upload spinner ----

  uploadOverlay: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '24px 16px',
  },

  // ---- Media preview card ----

  mediaPreview: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px',
    backgroundColor: C.elevation0,
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: C.elevation150,
    borderRadius: '8px',
  },
  thumbnail: {
    width: '80px',
    height: '80px',
    objectFit: 'cover' as const,
    borderRadius: '6px',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: C.elevation100,
    flexShrink: 0,
  },
  thumbnailPlaceholder: {
    width: '80px',
    height: '80px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '6px',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: C.elevation100,
    backgroundColor: C.elevation100,
    flexShrink: 0,
    color: C.elevation400,
  },
  mediaInfo: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
  },
  mediaFilename: {
    fontSize: '13px',
    fontWeight: 600,
    color: C.elevation800,
    lineHeight: '20px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  mediaMeta: {
    fontSize: '11px',
    color: C.elevation500,
    lineHeight: '16px',
  },
  mediaActions: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
    flexShrink: 0,
  },

  // ---- "or" separator ----

  separator: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    margin: '8px 0',
  },
  separatorLine: {
    flex: 1,
    height: '1px',
    backgroundColor: C.elevation150,
  },
  separatorText: {
    fontSize: '11px',
    color: C.elevation400,
    fontWeight: 500,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    flexShrink: 0,
  },

  // ---- Error ----

  uploadError: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    marginTop: '6px',
    padding: '6px 10px',
    backgroundColor: C.error50,
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: C.error200,
    borderRadius: '4px',
    fontSize: '12px',
    color: C.error500,
    lineHeight: '18px',
  },
}

// ---------------------------------------------------------------------------
// Inline SVG Icons
// ---------------------------------------------------------------------------

const AlertCircleIcon: React.FC<{ size?: number }> = ({ size = 40 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={C.elevation400}
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
)

const FileIcon: React.FC<{ size?: number }> = ({ size = 40 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={C.elevation400}
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
    <polyline points="14 2 14 8 20 8" />
  </svg>
)

const LinkIcon: React.FC<{ size?: number }> = ({ size = 40 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={C.elevation400}
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
)

const LoaderIcon: React.FC<{ size?: number }> = ({ size = 20 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={C.elevation800}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ animation: 'spin 1s linear infinite' }}
  >
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
)

const CheckIcon: React.FC<{ size?: number }> = ({ size = 14 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
)

const UploadCloudIcon: React.FC<{ size?: number }> = ({ size = 24 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M16 16l-4-4-4 4" />
    <path d="M12 12v9" />
    <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
    <polyline points="16 16 12 12 8 16" />
  </svg>
)

const ImageIcon: React.FC<{ size?: number }> = ({ size = 24 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <polyline points="21 15 16 10 5 21" />
  </svg>
)

const XCircleIcon: React.FC<{ size?: number }> = ({ size = 14 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="12" cy="12" r="10" />
    <line x1="15" y1="9" x2="9" y2="15" />
    <line x1="9" y1="9" x2="15" y2="15" />
  </svg>
)

// ---------------------------------------------------------------------------
// Field Type → Input Component Map
// ---------------------------------------------------------------------------

interface FieldInputProps {
  field: FieldDef
  value: unknown
  onChange: (value: unknown) => void
  readOnly?: boolean
}

const TextInput: React.FC<FieldInputProps> = ({ field, value, onChange, readOnly }) => (
  <div style={S.fieldGroup}>
    <input
      type="text"
      style={S.inputText}
      value={typeof value === 'string' ? value : ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={`Enter ${field.label || field.name}...`}
      disabled={readOnly}
    />
  </div>
)

const NumberInput: React.FC<FieldInputProps> = ({ field, value, onChange, readOnly }) => (
  <div style={S.fieldGroup}>
    <input
      type="number"
      style={S.inputNumber}
      value={typeof value === 'number' ? value : ''}
      onChange={(e) => {
        const v = e.target.value
        onChange(v === '' ? '' : Number(v))
      }}
      placeholder={`Enter ${field.label || field.name}...`}
      disabled={readOnly}
    />
  </div>
)

const UrlInput: React.FC<FieldInputProps> = ({ field, value, onChange, readOnly }) => (
  <div style={S.fieldGroup}>
    <input
      type="url"
      style={S.inputUrl}
      value={typeof value === 'string' ? value : ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder="https://example.com"
      disabled={readOnly}
    />
  </div>
)

const ToggleInput: React.FC<FieldInputProps> = ({ field, value, onChange, readOnly }) => (
  <div style={S.checkboxWrap}>
    <input
      type="checkbox"
      style={S.checkbox}
      checked={!!value}
      onChange={(e) => onChange(e.target.checked)}
      disabled={readOnly}
      id={`field-${field.name}`}
    />
    <label style={S.checkboxLabel} htmlFor={`field-${field.name}`}>
      {field.label || field.name}
    </label>
  </div>
)

const RichtextInput: React.FC<FieldInputProps> = ({ field, value, onChange, readOnly }) => (
  <div style={S.fieldGroup}>
    <textarea
      style={S.textarea}
      value={typeof value === 'string' ? value : ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={`Enter ${field.label || field.name}...`}
      disabled={readOnly}
      rows={4}
    />
  </div>
)

const MediaPicker: React.FC<FieldInputProps> = ({ field, value, onChange, readOnly }) => {
  const mediaId = typeof value === 'string' && value.length > 0 ? value : null

  // ---- ListDrawer for browsing / creating media docs ----

  const [ListDrawer, , drawerCtx] = useListDrawer({
    collectionSlugs: ['media'],
  })

  // ---- Media doc fetch for thumbnail preview ----

  const [mediaDoc, setMediaDoc] = useState<Record<string, unknown> | null>(null)
  const [mediaLoading, setMediaLoading] = useState(false)

  useEffect(() => {
    if (!mediaId) {
      setMediaDoc(null)
      return
    }

    let cancelled = false
    setMediaLoading(true)

    fetch(`/api/media/${mediaId}?depth=0`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : null))
      .then((doc) => {
        if (!cancelled) {
          setMediaDoc(doc)
          setMediaLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) setMediaLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [mediaId])

  // ---- Direct file upload state ----

  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ---- Handlers ----

  const handleSelect = useCallback(
    ({ doc }: { doc: Record<string, unknown>; docID: string }) => {
      const id = (doc?.id as string) ?? ''
      if (id) onChange(id)
      drawerCtx.closeDrawer()
    },
    [onChange, drawerCtx],
  )

  const handleRemove = useCallback(() => {
    onChange(null)
    setMediaDoc(null)
  }, [onChange])

  const handleBrowse = useCallback(() => {
    drawerCtx.openDrawer()
  }, [drawerCtx])

  const handleFileUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return

      setUploading(true)
      setUploadError(null)

      try {
        const formData = new FormData()
        formData.append('file', file)

        const res = await fetch('/api/media', {
          method: 'POST',
          credentials: 'include',
          body: formData,
        })

        if (!res.ok) {
          let message = 'Upload failed'
          try {
            const errBody = await res.json()
            message = errBody?.errors?.[0]?.message || `Upload failed (HTTP ${res.status})`
          } catch {
            message = `Upload failed (HTTP ${res.status})`
          }
          throw new Error(message)
        }

        const created = await res.json()
        const newId: string = created?.doc?.id ?? created?.id ?? ''
        if (!newId) throw new Error('Upload succeeded but no media ID was returned')

        onChange(newId)
      } catch (err) {
        setUploadError(err instanceof Error ? err.message : 'Upload failed')
      } finally {
        setUploading(false)
        // Reset the file input so the same file can be re-selected after removal
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    },
    [onChange],
  )

  // ---- Derived display values ----

  const sizes = mediaDoc?.sizes as Record<string, { url?: string }> | undefined
  const thumbnailUrl: string | null =
    (mediaDoc?.thumbnailURL as string) || (mediaDoc?.url as string) || sizes?.thumbnail?.url || null

  const mediaFilename: string = (mediaDoc?.filename as string) || 'Unknown file'
  const mediaFilesize: number | undefined = mediaDoc?.filesize as number | undefined
  const mediaMimeType: string = (mediaDoc?.mimeType as string) || ''

  const formatSize = (bytes?: number): string => {
    if (bytes === undefined || bytes === null) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  // ---- JSX helpers ----

  const isImage = mediaMimeType.startsWith('image/')

  // ---- Render ----

  return (
    <div style={S.fieldGroup}>
      {/* ListDrawer — rendered here so its context is within the component tree */}
      <ListDrawer allowCreate onSelect={handleSelect} />

      {/* Hidden file input for direct uploads */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={handleFileUpload}
        style={{ display: 'none' }}
        disabled={readOnly}
      />

      {mediaId ? (
        /* ---- Selected state: thumbnail preview + actions ---- */
        <div style={S.mediaPreview}>
          {/* Thumbnail */}
          {thumbnailUrl && isImage ? (
            <img src={thumbnailUrl} alt={mediaFilename} style={S.thumbnail} />
          ) : (
            <div style={S.thumbnailPlaceholder}>
              {mediaLoading ? (
                <LoaderIcon size={20} />
              ) : mediaMimeType === 'application/pdf' ? (
                <FileIcon size={28} />
              ) : (
                <ImageIcon size={28} />
              )}
            </div>
          )}

          {/* Info */}
          <div style={S.mediaInfo}>
            <span style={S.mediaFilename} title={mediaFilename}>
              {mediaFilename}
            </span>
            <span style={S.mediaMeta}>
              {formatSize(mediaFilesize)}
              {mediaFilesize ? ' • ' : ''}
              ID: {mediaId}
            </span>
          </div>

          {/* Actions */}
          {!readOnly && (
            <div style={S.mediaActions}>
              <button
                type="button"
                style={{ ...S.btnSecondary, padding: '5px 10px', fontSize: '12px' }}
                onClick={() => fileInputRef.current?.click()}
              >
                Replace
              </button>
              <button
                type="button"
                style={{ ...S.btnDanger, padding: '5px 10px', fontSize: '12px' }}
                onClick={handleRemove}
              >
                Remove
              </button>
            </div>
          )}
        </div>
      ) : uploading ? (
        /* ---- Uploading state ---- */
        <div style={S.uploadOverlay}>
          <LoaderIcon size={24} />
          <span style={S.dropzoneText}>Uploading…</span>
        </div>
      ) : (
        /* ---- Empty state: dropzone + browse ---- */
        <div>
          {/* Dropzone */}
          <div
            style={S.dropzone}
            onClick={() => !readOnly && fileInputRef.current?.click()}
            role="button"
            tabIndex={readOnly ? -1 : 0}
            onKeyDown={(e) => {
              if (!readOnly && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault()
                fileInputRef.current?.click()
              }
            }}
          >
            <div style={S.dropzoneIcon}>
              <UploadCloudIcon size={28} />
            </div>
            <span style={S.dropzoneText}>Drop an image here or click to upload</span>
            <span style={S.dropzoneHint}>JPEG, PNG, WebP, GIF — max 5MB</span>
          </div>

          {/* Upload error */}
          {uploadError && (
            <div style={S.uploadError}>
              <XCircleIcon size={14} />
              {uploadError}
            </div>
          )}

          {/* "or" separator */}
          <div style={S.separator}>
            <div style={S.separatorLine} />
            <span style={S.separatorText}>or</span>
            <div style={S.separatorLine} />
          </div>

          {/* Browse button */}
          <button type="button" style={S.btnSecondary} onClick={handleBrowse} disabled={readOnly}>
            Browse Media Library
          </button>
        </div>
      )}
    </div>
  )
}

const FallbackInput: React.FC<FieldInputProps> = ({ field, value, onChange, readOnly }) => (
  <div style={S.fieldGroup}>
    <input
      type="text"
      style={S.inputText}
      value={typeof value === 'string' ? value : ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={`Enter ${field.label || field.name}...`}
      disabled={readOnly}
    />
    <span style={S.fieldHint}>Custom type: {field.type}</span>
  </div>
)

/** Map a field type string to its input component */
function getInputComponent(type: string): React.FC<FieldInputProps> {
  switch (type) {
    case 'text':
      return TextInput
    case 'number':
      return NumberInput
    case 'url':
      return UrlInput
    case 'toggle':
      return ToggleInput
    case 'richtext':
      return RichtextInput
    case 'media':
      return MediaPicker
    default:
      return FallbackInput
  }
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export const EntryDataField: React.FC<EntryDataFieldProps> = (props) => {
  const { path, readOnly } = props

  // Derive the parentCollection field path from this component's data path.
  // Both are top-level siblings in CustomCollectionEntries, so we replace
  // the trailing segment ("data") with "parentCollection".
  const parentCollectionPath = useMemo(() => {
    const segments = path.split('.')
    segments[segments.length - 1] = 'parentCollection'
    return segments.join('.')
  }, [path])

  // Watch the parentCollection relationship field (the selected Custom Collection ID)
  const { value: parentCollectionId } = useField<string | null>({
    path: parentCollectionPath,
  })

  // Read/write the data JSON field
  const { value: dataValue, setValue: setDataValue } = useField<Record<string, unknown>>({
    path,
  })

  const currentData: Record<string, unknown> =
    dataValue && typeof dataValue === 'object' && !Array.isArray(dataValue) ? dataValue : {}

  // Schema fetch state
  const [schemaFields, setSchemaFields] = useState<FieldDef[] | null>(null) // null = no fetch yet
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [lastFetchedId, setLastFetchedId] = useState<string | null>(null)

  // Fetch collection schema when parentCollection changes
  useEffect(() => {
    if (!parentCollectionId) {
      setSchemaFields(null)
      setFetchError(null)
      setLastFetchedId(null)
      return
    }

    // Avoid refetching the same collection
    if (lastFetchedId === parentCollectionId && schemaFields !== null) {
      return
    }

    let cancelled = false

    const fetchSchema = async () => {
      setIsLoading(true)
      setFetchError(null)

      try {
        const baseUrl = window.location.origin
        const res = await fetch(`${baseUrl}/api/custom-collections/${parentCollectionId}?depth=0`, {
          credentials: 'include',
        })

        if (!res.ok) {
          throw new Error(`API returned ${res.status}`)
        }

        const doc = await res.json()

        if (cancelled) return

        const fields: FieldDef[] = Array.isArray(doc.fields) ? doc.fields : []
        setSchemaFields(fields)
        setLastFetchedId(parentCollectionId)
      } catch (err) {
        if (cancelled) return
        setFetchError(err instanceof Error ? err.message : 'Failed to load collection fields')
        setSchemaFields(null)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    fetchSchema()

    return () => {
      cancelled = true
    }
  }, [parentCollectionId, lastFetchedId, schemaFields])

  // Update a single field's value in the data object.
  // IMPORTANT: Payload's useField setValue does NOT support functional updaters
  // (unlike React's useState). It accepts only a direct value. We must read
  // currentData from the closure and compute the new object ourselves.
  const updateFieldValue = useCallback(
    (fieldName: string, value: unknown) => {
      const base: Record<string, unknown> =
        currentData && typeof currentData === 'object' && !Array.isArray(currentData)
          ? { ...currentData }
          : {}
      if (value === '' || value === null || value === undefined) {
        delete base[fieldName]
      } else {
        base[fieldName] = value
      }
      setDataValue(base)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setDataValue, currentData],
  )

  // ---- Derived state ----
  const hasParentCollection = !!parentCollectionId
  const hasFields = schemaFields !== null && schemaFields.length > 0
  const isReady = hasParentCollection && !isLoading && !fetchError && schemaFields !== null

  // ---- Render ----

  return (
    <div style={S.wrapper}>
      {/* Keyframes for spinner animation */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* State: No parent collection selected */}
      {!hasParentCollection && (
        <div style={S.stateBox}>
          <LinkIcon size={40} />
          <div style={S.stateHeading}>Select a Parent Collection first</div>
          <div style={S.stateText}>
            Choose a Custom Collection from the sidebar to load its field schema. The fields defined
            in that collection will appear here automatically.
          </div>
        </div>
      )}

      {/* State: Loading */}
      {isLoading && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            padding: '24px',
            color: C.elevation500,
            fontSize: '13px',
          }}
        >
          <LoaderIcon size={18} />
          Loading field schema...
        </div>
      )}

      {/* State: Fetch error */}
      {fetchError && (
        <div style={S.stateBox}>
          <AlertCircleIcon size={40} />
          <div style={S.stateHeading}>Failed to load fields</div>
          <div style={{ ...S.stateText, ...S.stateError }}>{fetchError}</div>
        </div>
      )}

      {/* State: No fields in schema */}
      {isReady && !hasFields && (
        <div style={S.stateBox}>
          <FileIcon size={40} />
          <div style={S.stateHeading}>No fields defined in this collection yet</div>
          <div style={S.stateText}>
            Edit the parent Custom Collection to add field definitions first. Once fields are
            defined, they will appear here for data entry.
          </div>
        </div>
      )}

      {/* State: Schema loaded — render dynamic form */}
      {isReady && hasFields && (
        <>
          {/* Schema info bar */}
          <div style={S.schemaBar}>
            <CheckIcon size={14} />
            {schemaFields.length} field{schemaFields.length !== 1 ? 's' : ''} loaded from collection
            schema
          </div>

          {/* Dynamic fields */}
          {schemaFields.map((fieldDef) => {
            const InputComponent = getInputComponent(fieldDef.type)
            const fieldValue = currentData[fieldDef.name]

            return (
              <div key={fieldDef.name}>
                {/* Field label */}
                {fieldDef.type !== 'toggle' && (
                  <div style={S.fieldLabel}>
                    {fieldDef.label || fieldDef.name}
                    {fieldDef.required ? (
                      <span style={S.fieldRequired}>*</span>
                    ) : (
                      <span style={S.fieldOptional}>(optional)</span>
                    )}
                    <span style={S.typeBadge}>{fieldDef.type}</span>
                  </div>
                )}

                {/* Field input */}
                <InputComponent
                  field={fieldDef}
                  value={fieldValue}
                  onChange={(val) => updateFieldValue(fieldDef.name, val)}
                  readOnly={readOnly}
                />

                {/* Toggle fields show their label next to the checkbox, so we skip
                    the label above but still show the required/optional hint */}
                {fieldDef.type === 'toggle' && (
                  <div style={{ marginTop: '-4px', marginBottom: '2px', paddingLeft: '24px' }}>
                    {fieldDef.required ? (
                      <span style={S.fieldRequired}>* Required</span>
                    ) : (
                      <span style={S.fieldOptional}>optional</span>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}
