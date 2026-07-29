'use client'

import React, { useState, useEffect } from 'react'
import { useField, useDocumentInfo } from '@payloadcms/ui'

interface MediaDoc {
  id?: string | number
  filename?: string
  url?: string
  title?: string
  mimeType?: string
  width?: number
  height?: number
  thumbnailURL?: string
  sizes?: Record<string, { url?: string; width?: number; height?: number }>
}

interface UploadItem {
  relationTo?: string
  value?: MediaDoc | string | number
}

interface SubmissionUpload {
  field?: string
  value?: UploadItem[]
  id?: string | number
}

/**
 * Custom Field component for the `submissionUploads` array on form submissions.
 *
 * Replaces the default collapsed-array-with-tiny-thumbnails with a flat list
 * of upload cards.  Fetches media details from the API for each referenced
 * file so the preview, dimensions, and title are always shown, even when
 * the server response didn't populate the relationship.
 */
export const SubmissionUploadField: React.FC<{ path: string }> = ({ path }) => {
  const { value } = useField<SubmissionUpload[]>({ path })
  const { initialData } = useDocumentInfo()
  const [mediaCache, setMediaCache] = useState<Record<string, MediaDoc>>({})
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  // Prefer populated data from initialData, fall back to form state
  const uploads: SubmissionUpload[] =
    (Array.isArray(value) && value.length > 0
      ? value
      : ((initialData as Record<string, unknown>)?.submissionUploads as SubmissionUpload[])) ?? []

  // Collect all media IDs that need fetching
  const mediaIds: string[] = []
  for (const upload of uploads) {
    const items = Array.isArray(upload.value) ? upload.value : []
    for (const item of items) {
      const raw = item?.value
      const id =
        typeof raw === 'string' || typeof raw === 'number'
          ? String(raw)
          : raw && typeof raw === 'object'
            ? String((raw as MediaDoc).id ?? '')
            : ''
      if (id && !mediaCache[id] && !mediaIds.includes(id)) {
        mediaIds.push(id)
      }
    }
  }

  // Fetch missing media docs in one batch
  useEffect(() => {
    if (mediaIds.length === 0) return

    let cancelled = false

    const fetchAll = async () => {
      const newDocs: Record<string, MediaDoc> = {}
      for (const id of mediaIds) {
        try {
          const res = await fetch(`/api/media/${id}?depth=0`)
          if (res.ok) {
            const doc = await res.json()
            newDocs[id] = doc as MediaDoc
          }
        } catch {
          // Skip failed fetches — show filename fallback
        }
      }
      if (!cancelled) {
        setMediaCache((prev) => ({ ...prev, ...newDocs }))
      }
    }

    fetchAll()
    return () => {
      cancelled = true
    }
  }, [mediaIds.join(',')])

  if (uploads.length === 0) {
    return (
      <p
        style={{
          color: 'var(--theme-elevation-400)',
          fontSize: '0.875rem',
          padding: '1rem 0',
        }}
      >
        No files uploaded with this submission.
      </p>
    )
  }

  const isImage = (doc: MediaDoc) => doc.mimeType?.startsWith('image/') ?? false

  const getPreviewUrl = (doc: MediaDoc) =>
    doc.sizes?.medium?.url || doc.sizes?.small?.url || doc.thumbnailURL || doc.url

  const getFullUrl = (doc: MediaDoc) => doc.url

  const getLabel = (doc: MediaDoc) => doc.title || doc.filename || 'Unknown file'

  const getDimensions = (doc: MediaDoc) => {
    const size = doc.sizes?.medium || doc.sizes?.small
    if (size?.width && size?.height) return `${size.width}×${size.height}`
    if (doc.width && doc.height) return `${doc.width}×${doc.height}`
    return null
  }

  const getDoc = (item: UploadItem, index: number): MediaDoc => {
    if (!item || item.value === undefined || item.value === null) {
      return { filename: `File ${index + 1}` }
    }

    // Already a populated media object
    if (typeof item.value === 'object') return item.value as MediaDoc

    // Raw ID string → look up in cache
    const id = String(item.value)
    if (mediaCache[id]) return mediaCache[id]

    // Loading fallback
    return { id, filename: `File ${index + 1}` }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        padding: '0.5rem 0',
      }}
    >
      {uploads.map((upload) => {
        const fieldName = upload.field || 'Upload'
        const items = Array.isArray(upload.value) ? upload.value : []
        const key = String(upload.id ?? upload.field ?? '')
        const isOpen = expanded[key] ?? true

        return (
          <div
            key={key}
            style={{
              border: '1px solid var(--theme-elevation-200)',
              borderRadius: '8px',
              overflow: 'hidden',
            }}
          >
            {/* Field name header */}
            <button
              type="button"
              onClick={() => setExpanded((prev) => ({ ...prev, [key]: !isOpen }))}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.625rem 0.75rem',
                background: 'var(--theme-elevation-100)',
                border: 'none',
                borderBottom: isOpen ? '1px solid var(--theme-elevation-200)' : 'none',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: 600,
                color: 'var(--theme-elevation-800)',
              }}
            >
              <span>{fieldName}</span>
              <span
                style={{
                  fontSize: '0.75rem',
                  color: 'var(--theme-elevation-500)',
                }}
              >
                {items.length} file{items.length !== 1 ? 's' : ''} {isOpen ? '▾' : '▸'}
              </span>
            </button>

            {/* File cards */}
            {isOpen && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                  padding: '0.75rem',
                }}
              >
                {items.map((item, i) => {
                  const doc = getDoc(item, i)
                  const previewUrl = getPreviewUrl(doc)
                  const fullUrl = getFullUrl(doc)
                  const label = getLabel(doc)
                  const dimensions = getDimensions(doc)
                  const img = isImage(doc)
                  const itemKey = `${key}-${doc.id ?? i}`
                  const expanded_ = expanded[itemKey] ?? false

                  return (
                    <div
                      key={itemKey}
                      style={{
                        border: '1px solid var(--theme-elevation-150)',
                        borderRadius: '6px',
                        padding: '0.625rem',
                        background: 'var(--theme-elevation-0)',
                      }}
                    >
                      {/* Preview */}
                      {img && previewUrl ? (
                        <div style={{ marginBottom: '0.5rem' }}>
                          <img
                            src={previewUrl}
                            alt={label}
                            onClick={() => window.open(fullUrl, '_blank')}
                            title="Click to view full size"
                            style={{
                              maxWidth: expanded_ ? '100%' : '320px',
                              maxHeight: expanded_ ? 'none' : '220px',
                              width: 'auto',
                              height: 'auto',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              border: '1px solid var(--theme-elevation-300)',
                              objectFit: 'contain',
                              display: 'block',
                              background:
                                'repeating-conic-gradient(var(--theme-elevation-200) 0% 25%, transparent 0% 50%) 50% / 20px 20px',
                            }}
                          />
                        </div>
                      ) : (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            marginBottom: '0.5rem',
                            padding: '1rem',
                            background: 'var(--theme-elevation-100)',
                            borderRadius: '4px',
                          }}
                        >
                          <svg
                            width="32"
                            height="32"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="var(--theme-elevation-600)"
                            strokeWidth="2"
                          >
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                          </svg>
                          <span
                            style={{
                              fontWeight: 500,
                              color: 'var(--theme-elevation-700)',
                            }}
                          >
                            PDF / Document — {label}
                          </span>
                        </div>
                      )}

                      {/* Info & actions */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          flexWrap: 'wrap',
                          gap: '0.5rem',
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              fontWeight: 600,
                              fontSize: '0.8125rem',
                              color: 'var(--theme-elevation-800)',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                            title={label}
                          >
                            {label}
                          </div>
                          {dimensions && (
                            <div
                              style={{
                                fontSize: '0.75rem',
                                color: 'var(--theme-elevation-500)',
                              }}
                            >
                              {dimensions}
                            </div>
                          )}
                        </div>

                        <div style={{ display: 'flex', gap: '0.375rem', flexShrink: 0 }}>
                          {img && (
                            <button
                              type="button"
                              onClick={() =>
                                setExpanded((prev) => ({
                                  ...prev,
                                  [itemKey]: !prev[itemKey],
                                }))
                              }
                              style={{
                                padding: '0.25rem 0.5rem',
                                fontSize: '0.75rem',
                                fontWeight: 500,
                                border: '1px solid var(--theme-elevation-300)',
                                borderRadius: '4px',
                                background: 'var(--theme-elevation-0)',
                                color: 'var(--theme-elevation-700)',
                                cursor: 'pointer',
                              }}
                            >
                              {expanded_ ? 'Collapse' : 'Expand'}
                            </button>
                          )}
                          <a
                            href={fullUrl || `/api/media/file/${doc.filename}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              padding: '0.25rem 0.5rem',
                              fontSize: '0.75rem',
                              fontWeight: 500,
                              border: '1px solid var(--theme-elevation-300)',
                              borderRadius: '4px',
                              background: 'var(--theme-elevation-0)',
                              color: 'var(--theme-elevation-700)',
                              textDecoration: 'none',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                            }}
                          >
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                              <polyline points="15 3 21 3 21 9" />
                              <line x1="10" y1="14" x2="21" y2="3" />
                            </svg>
                            View full size
                          </a>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
