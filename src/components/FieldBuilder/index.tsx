'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useField } from '@payloadcms/ui'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FieldDef {
  name: string
  type: string
  required: boolean
  label?: string
}

interface FieldBuilderProps {
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
// Constants
// ---------------------------------------------------------------------------

const SUGGESTED_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'richtext', label: 'Rich Text' },
  { value: 'number', label: 'Number' },
  { value: 'media', label: 'Media', tooltip: 'Stores a Payload media document ID' },
  { value: 'url', label: 'URL' },
  { value: 'toggle', label: 'Toggle' },
] as const

const INITIAL_FIELD: FieldDef = {
  name: '',
  type: 'text',
  required: false,
  label: '',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Converts any string to lowercase-kebab-case.
 * "Full Name" → "full-name", "Already-Kebab" → "already-kebab"
 */
function toKebabCase(input: string): string {
  return input
    .trim()
    .replace(/[^\w\s-]/g, '') // strip punctuation
    .replace(/([a-z])([A-Z])/g, '$1-$2') // camelCase boundary
    .replace(/[\s_]+/g, '-') // spaces/underscores → hyphens
    .replace(/-+/g, '-') // collapse runs
    .replace(/^-+|-+$/g, '') // trim leading/trailing hyphens
    .toLowerCase()
}

// ---------------------------------------------------------------------------
// Inline Styles (no Tailwind — Payload admin CSS conflicts)
//
// NOTE: All CSS shorthand properties (border, background) use longhand
// equivalents to avoid React warnings when conditionally overriding
// individual sub-properties (e.g. borderColor, backgroundColor).
// ---------------------------------------------------------------------------

// All colors reference Payload admin CSS custom properties so the FieldBuilder
// blends visually with native Payload fields.  Tokens sourced from
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
  warning150: 'var(--theme-warning-150)',
  warning600: 'var(--theme-warning-600)',
}

const S = {
  // Root
  wrapper: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
    padding: '4px 0',
  },

  // Empty state
  emptyState: {
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
  emptyIcon: {
    width: '40px',
    height: '40px',
    color: C.elevation400,
    marginBottom: '12px',
  },
  emptyHeading: {
    fontSize: '14px',
    fontWeight: 600,
    color: C.elevation800,
    marginBottom: '4px',
  },
  emptyText: {
    fontSize: '13px',
    color: C.elevation500,
    marginBottom: '16px',
    maxWidth: '360px',
    lineHeight: '1.5',
  },

  // Buttons
  // Payload primary button style: dark bg, light text
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
  // Payload secondary button style: transparent bg, theme-text color
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
  btnIcon: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    padding: '0',
    backgroundColor: 'transparent',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'transparent',
    borderRadius: '5px',
    cursor: 'pointer',
    color: C.elevation500,
    fontSize: '14px',
    lineHeight: '1',
    transition: 'color 150ms, background-color 150ms, border-color 150ms',
  },
  btnDanger: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    padding: '0',
    backgroundColor: 'transparent',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'transparent',
    borderRadius: '5px',
    cursor: 'pointer',
    color: C.elevation400,
    fontSize: '14px',
    lineHeight: '1',
    transition: 'color 150ms, background-color 150ms, border-color 150ms',
  },

  // Field list
  fieldList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
  },

  // Field card
  card: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px 12px',
    backgroundColor: C.elevation0,
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: C.elevation100,
    borderRadius: '6px',
    boxShadow: 'none',
    transition: 'box-shadow 150ms, border-color 150ms',
  },
  cardDragHandle: {
    display: 'flex',
    alignItems: 'center',
    color: C.elevation400,
    fontSize: '14px',
    cursor: 'grab',
    userSelect: 'none' as const,
    padding: '0 2px',
  },
  cardBody: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
  },
  cardTitleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  cardLabel: {
    fontSize: '13px',
    fontWeight: 600,
    color: C.elevation800,
    lineHeight: '20px',
  },
  cardName: {
    fontSize: '12px',
    color: C.elevation400,
    fontFamily: 'monospace',
    lineHeight: '18px',
  },
  cardMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  cardActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    flexShrink: 0,
  },

  // Badges
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '1px 7px',
    fontSize: '11px',
    fontWeight: 500,
    lineHeight: '18px',
    borderRadius: '4px',
    backgroundColor: C.elevation100,
    color: C.elevation800,
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: C.elevation200,
  },
  badgeRequired: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '1px 5px',
    fontSize: '10px',
    fontWeight: 600,
    lineHeight: '16px',
    borderRadius: '3px',
    backgroundColor: C.warning100,
    color: C.warning600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.3px',
  },
  badgeOptional: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '1px 5px',
    fontSize: '10px',
    fontWeight: 500,
    lineHeight: '16px',
    borderRadius: '3px',
    backgroundColor: 'transparent',
    color: C.elevation400,
  },

  // Inline form
  formOverlay: {
    backgroundColor: 'var(--theme-bg)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: C.elevation150,
    borderRadius: '8px',
    padding: '16px',
    marginBottom: '4px',
  },
  formTitle: {
    fontSize: '13px',
    fontWeight: 600,
    color: C.elevation800,
    marginBottom: '12px',
  },
  formRow: {
    display: 'flex',
    gap: '12px',
    marginBottom: '10px',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
    flex: 1,
    minWidth: 0,
  },
  formLabel: {
    fontSize: '12px',
    fontWeight: 500,
    color: C.elevation500,
  },
  // Matches Payload's formInput() mixin: @payloadcms/ui/dist/scss/vars.scss
  formInput: {
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
  formSelect: {
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
    cursor: 'pointer',
  },
  formToggle: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    paddingTop: '20px',
  },
  toggleTrack: {
    width: '36px',
    height: '20px',
    borderRadius: '10px',
    backgroundColor: C.elevation150,
    cursor: 'pointer',
    position: 'relative' as const,
    transition: 'background-color 150ms',
    flexShrink: 0,
  },
  toggleTrackActive: {
    width: '36px',
    height: '20px',
    borderRadius: '10px',
    backgroundColor: C.success500,
    cursor: 'pointer',
    position: 'relative' as const,
    transition: 'background-color 150ms',
    flexShrink: 0,
  },
  toggleThumb: {
    width: '16px',
    height: '16px',
    borderRadius: '50%',
    backgroundColor: C.elevation0,
    position: 'absolute' as const,
    top: '2px',
    left: '2px',
    transition: 'left 150ms',
    boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
  },
  toggleThumbActive: {
    width: '16px',
    height: '16px',
    borderRadius: '50%',
    backgroundColor: C.elevation0,
    position: 'absolute' as const,
    top: '2px',
    left: '18px',
    transition: 'left 150ms',
    boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
  },
  formActions: {
    display: 'flex',
    gap: '8px',
    marginTop: '4px',
  },

  // Tooltip
  tooltipWrap: {
    position: 'relative' as const,
    display: 'inline-flex',
  },
  tooltip: {
    position: 'absolute' as const,
    bottom: 'calc(100% + 6px)',
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '4px 8px',
    fontSize: '11px',
    lineHeight: '16px',
    color: C.elevation0,
    backgroundColor: C.elevation800,
    borderRadius: '4px',
    whiteSpace: 'nowrap' as const,
    pointerEvents: 'none' as const,
    zIndex: 10,
  },

  // Section label
  sectionLabel: {
    fontSize: '11px',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    color: C.elevation400,
    padding: '4px 0',
  },

  // Media note callout — blends with Payload info banners
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
  } as React.CSSProperties,
}

// ---------------------------------------------------------------------------
// Inline SVG Icons (no external icon library dependency)
// ---------------------------------------------------------------------------

const PlusIcon: React.FC<{ size?: number }> = ({ size = 14 }) => (
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
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
)

const PencilIcon: React.FC<{ size?: number }> = ({ size = 13 }) => (
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
    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
  </svg>
)

const TrashIcon: React.FC<{ size?: number }> = ({ size = 13 }) => (
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
    <path d="M3 6h18" />
    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
  </svg>
)

const ChevronUpIcon: React.FC<{ size?: number }> = ({ size = 13 }) => (
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
    <polyline points="18 15 12 9 6 15" />
  </svg>
)

const ChevronDownIcon: React.FC<{ size?: number }> = ({ size = 13 }) => (
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
    <polyline points="6 9 12 15 18 9" />
  </svg>
)

const GripIcon: React.FC<{ size?: number }> = ({ size = 14 }) => (
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
    <circle cx="9" cy="5" r="1" fill="currentColor" stroke="none" />
    <circle cx="15" cy="5" r="1" fill="currentColor" stroke="none" />
    <circle cx="9" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="15" cy="12" r="1" fill="currentColor" stroke="none" />
    <circle cx="9" cy="19" r="1" fill="currentColor" stroke="none" />
    <circle cx="15" cy="19" r="1" fill="currentColor" stroke="none" />
  </svg>
)

const LayersIcon: React.FC<{ size?: number }> = ({ size = 40 }) => (
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
    <polygon points="12 2 22 8.5 12 15 2 8.5 12 2" />
    <polyline points="2 15.5 12 22 22 15.5" />
  </svg>
)

const HelpIcon: React.FC<{ size?: number }> = ({ size = 12 }) => (
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
    <line x1="12" y1="18" x2="12.01" y2="18" />
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
  </svg>
)

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Brief tooltip shown on hover over media type */
const MediaTooltip: React.FC = () => {
  const [visible, setVisible] = useState(false)

  return (
    <span
      style={{ ...S.tooltipWrap, marginLeft: '4px' }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      <span style={{ display: 'inline-flex', color: C.elevation400, cursor: 'help' }}>
        <HelpIcon size={12} />
      </span>
      {visible && (
        <span style={S.tooltip}>
          Stores a Payload media document ID — resolves through Supabase S3 automatically
        </span>
      )}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export const FieldBuilder: React.FC<FieldBuilderProps> = (props) => {
  const { path, readOnly } = props

  // Read/write the underlying JSON array via Payload's form system
  const { value, setValue } = useField<FieldDef[]>({ path })
  const fields: FieldDef[] = Array.isArray(value) ? value : []

  // Local UI state
  const [editingIndex, setEditingIndex] = useState<number | null>(null) // null = not editing, >= 0 = edit existing, -1 = add new
  const [draft, setDraft] = useState<FieldDef>(INITIAL_FIELD)
  const [nameManuallyEdited, setNameManuallyEdited] = useState(false)

  // ---- Handlers ----

  const openAddForm = useCallback(() => {
    setDraft({ ...INITIAL_FIELD })
    setNameManuallyEdited(false)
    setEditingIndex(-1)
  }, [])

  const openEditForm = useCallback(
    (index: number) => {
      setDraft({ ...fields[index] })
      setNameManuallyEdited(true)
      setEditingIndex(index)
    },
    [fields],
  )

  const closeForm = useCallback(() => {
    setEditingIndex(null)
    setDraft(INITIAL_FIELD)
    setNameManuallyEdited(false)
  }, [])

  const updateDraft = useCallback(
    (patch: Partial<FieldDef>) => {
      setDraft((prev) => {
        const next = { ...prev, ...patch }

        // Auto-generate kebab-case name from label (unless user has manually edited name)
        if (!nameManuallyEdited && patch.label !== undefined) {
          next.name = toKebabCase(patch.label)
        }

        return next
      })
    },
    [nameManuallyEdited],
  )

  const markNameEdited = useCallback(() => {
    setNameManuallyEdited(true)
  }, [])

  const saveField = useCallback(() => {
    // Validate name is not empty
    const name = draft.name.trim()
    if (!name) return

    const sanitized: FieldDef = {
      name: toKebabCase(name),
      type: draft.type || 'text',
      required: draft.required ?? false,
      label: draft.label?.trim() || undefined,
    }

    let updated: FieldDef[]
    if (editingIndex !== null && editingIndex >= 0) {
      // Edit existing
      updated = [...fields]
      updated[editingIndex] = sanitized
    } else {
      // Add new
      updated = [...fields, sanitized]
    }

    setValue(updated)
    closeForm()
  }, [draft, editingIndex, fields, setValue, closeForm])

  const deleteField = useCallback(
    (index: number) => {
      const updated = fields.filter((_, i) => i !== index)
      setValue(updated)
      if (editingIndex === index) closeForm()
    },
    [fields, setValue, editingIndex, closeForm],
  )

  const moveField = useCallback(
    (index: number, direction: -1 | 1) => {
      const target = index + direction
      if (target < 0 || target >= fields.length) return
      const updated = [...fields]
      ;[updated[index], updated[target]] = [updated[target], updated[index]]
      setValue(updated)
    },
    [fields, setValue],
  )

  // Auto-save on Enter in name or label inputs
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && draft.name.trim()) {
        e.preventDefault()
        saveField()
      }
      if (e.key === 'Escape') {
        closeForm()
      }
    },
    [draft.name, saveField, closeForm],
  )

  // ---- Derived ----
  const isFormOpen = editingIndex !== null
  const isEditing = editingIndex !== null && editingIndex >= 0
  const canSave = draft.name.trim().length > 0

  const typeLabel = useMemo(() => {
    const found = SUGGESTED_TYPES.find((t) => t.value === draft.type)
    return found ? found.label : 'Custom'
  }, [draft.type])

  // ---- Render ----

  return (
    <div style={S.wrapper}>
      {/* Section label */}
      <div style={S.sectionLabel}>
        Field Definitions
        {fields.length > 0 && (
          <span style={{ fontWeight: 400, textTransform: 'none', marginLeft: '4px' }}>
            ({fields.length})
          </span>
        )}
      </div>

      {/* Field cards */}
      {fields.length > 0 && (
        <div style={S.fieldList}>
          {fields.map((field, index) => (
            <div
              key={`${field.name}-${index}`}
              style={{
                ...S.card,
                ...(editingIndex === index
                  ? { borderColor: C.elevation800, boxShadow: `0 0 0 1px ${C.elevation800}` }
                  : {}),
              }}
              onMouseEnter={(e) => {
                if (editingIndex !== index) {
                  ;(e.currentTarget as HTMLDivElement).style.boxShadow = 'none'
                }
              }}
              onMouseLeave={(e) => {
                if (editingIndex !== index) {
                  ;(e.currentTarget as HTMLDivElement).style.boxShadow = 'none'
                }
              }}
            >
              {/* Drag handle */}
              <div style={S.cardDragHandle} title="Drag to reorder">
                <GripIcon size={14} />
              </div>

              {/* Card body */}
              <div style={S.cardBody}>
                <div style={S.cardTitleRow}>
                  <span style={S.cardLabel}>{field.label || field.name}</span>
                  {field.required ? (
                    <span style={S.badgeRequired}>Required</span>
                  ) : (
                    <span style={S.badgeOptional}>optional</span>
                  )}
                </div>
                <div style={S.cardMeta}>
                  <span style={S.cardName}>{field.name}</span>
                  <span style={S.badge}>{field.type}</span>
                </div>
              </div>

              {/* Actions */}
              {!readOnly && (
                <div style={S.cardActions}>
                  {/* Move up */}
                  <button
                    type="button"
                    style={S.btnIcon}
                    title="Move up"
                    disabled={index === 0}
                    onClick={() => moveField(index, -1)}
                    onMouseEnter={(e) => {
                      if (index > 0) {
                        e.currentTarget.style.color = C.elevation800
                        e.currentTarget.style.backgroundColor = C.elevation100
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = C.elevation500
                      e.currentTarget.style.backgroundColor = 'transparent'
                    }}
                  >
                    <ChevronUpIcon size={13} />
                  </button>

                  {/* Move down */}
                  <button
                    type="button"
                    style={S.btnIcon}
                    title="Move down"
                    disabled={index === fields.length - 1}
                    onClick={() => moveField(index, 1)}
                    onMouseEnter={(e) => {
                      if (index < fields.length - 1) {
                        e.currentTarget.style.color = C.elevation800
                        e.currentTarget.style.backgroundColor = C.elevation100
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = C.elevation500
                      e.currentTarget.style.backgroundColor = 'transparent'
                    }}
                  >
                    <ChevronDownIcon size={13} />
                  </button>

                  {/* Edit */}
                  <button
                    type="button"
                    style={S.btnIcon}
                    title="Edit field"
                    onClick={() => openEditForm(index)}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = C.elevation800
                      e.currentTarget.style.backgroundColor = C.elevation100
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = C.elevation500
                      e.currentTarget.style.backgroundColor = 'transparent'
                    }}
                  >
                    <PencilIcon size={13} />
                  </button>

                  {/* Delete */}
                  <button
                    type="button"
                    style={S.btnDanger}
                    title="Delete field"
                    onClick={() => deleteField(index)}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = C.error500
                      e.currentTarget.style.backgroundColor = C.error50
                      e.currentTarget.style.borderColor = C.error200
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = C.elevation400
                      e.currentTarget.style.backgroundColor = 'transparent'
                      e.currentTarget.style.borderColor = 'transparent'
                    }}
                  >
                    <TrashIcon size={13} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {fields.length === 0 && !isFormOpen && (
        <div style={S.emptyState}>
          <LayersIcon size={40} />
          <div style={S.emptyHeading}>No fields defined yet</div>
          <div style={S.emptyText}>
            Define the fields for this custom collection. Each field determines what content editors
            can enter — like text, rich text, images, or toggles.
          </div>
          {!readOnly && (
            <button type="button" style={S.btnPrimary} onClick={openAddForm}>
              <PlusIcon size={14} />
              Add Field
            </button>
          )}
        </div>
      )}

      {/* Add/Edit form */}
      {isFormOpen && (
        <div style={S.formOverlay}>
          <div style={S.formTitle}>{isEditing ? 'Edit Field' : 'Add Field'}</div>

          {/* Row 1: Label + Name */}
          <div style={S.formRow}>
            <div style={S.formGroup}>
              <label style={S.formLabel}>
                Label <span style={{ color: C.elevation400, fontWeight: 400 }}>(optional)</span>
              </label>
              <input
                type="text"
                style={S.formInput}
                placeholder="e.g. Full Name"
                value={draft.label ?? ''}
                onChange={(e) => updateDraft({ label: e.target.value })}
                onKeyDown={handleKeyDown}
                autoFocus
              />
            </div>
            <div style={S.formGroup}>
              <label style={S.formLabel}>
                Field Name <span style={{ color: C.error500 }}>*</span>
              </label>
              <input
                type="text"
                style={{
                  ...S.formInput,
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  ...(draft.name.trim() ? {} : { borderColor: C.error200 }),
                }}
                placeholder="field-name"
                value={draft.name}
                onChange={(e) => {
                  markNameEdited()
                  setDraft((prev) => ({ ...prev, name: e.target.value }))
                }}
                onKeyDown={handleKeyDown}
              />
            </div>
          </div>

          {/* Row 2: Type + Required */}
          <div style={S.formRow}>
            <div style={S.formGroup}>
              <label style={S.formLabel}>Type</label>
              <select
                style={S.formSelect}
                value={draft.type}
                onChange={(e) => updateDraft({ type: e.target.value })}
                onKeyDown={handleKeyDown}
              >
                {SUGGESTED_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label} ({t.value})
                  </option>
                ))}
                <option value="__custom__" disabled>
                  ──────────────
                </option>
                <option value={draft.type}>✎ Custom: {draft.type}</option>
              </select>
              {draft.type === 'media' && (
                <span
                  style={{
                    fontSize: '11px',
                    color: C.elevation500,
                    lineHeight: '1.4',
                    marginTop: '2px',
                  }}
                >
                  Stores a Payload media document ID — resolves through Supabase S3 automatically.
                </span>
              )}
            </div>
            <div style={S.formGroup}>
              <div style={{ ...S.formToggle, paddingTop: '22px' }}>
                <div
                  style={draft.required ? S.toggleTrackActive : S.toggleTrack}
                  onClick={() => updateDraft({ required: !draft.required })}
                  role="switch"
                  aria-checked={draft.required}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === ' ' || e.key === 'Enter') {
                      e.preventDefault()
                      updateDraft({ required: !draft.required })
                    }
                  }}
                >
                  <div style={draft.required ? S.toggleThumbActive : S.toggleThumb} />
                </div>
                <label
                  style={{ ...S.formLabel, cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => updateDraft({ required: !draft.required })}
                >
                  Required
                </label>
              </div>
            </div>
          </div>

          {/* Form actions */}
          <div style={S.formActions}>
            <button
              type="button"
              style={{
                ...S.btnPrimary,
                ...(canSave ? {} : { opacity: 0.5, cursor: 'not-allowed' }),
              }}
              onClick={saveField}
              disabled={!canSave}
            >
              {isEditing ? 'Save Changes' : 'Add Field'}
            </button>
            <button type="button" style={S.btnSecondary} onClick={closeForm}>
              Cancel
            </button>
          </div>

          {/* Media note for form context */}
          <div style={S.callout}>
            <strong style={{ color: C.elevation800 }}>Media fields:</strong> When type is{' '}
            <code
              style={{
                fontFamily: 'monospace',
                backgroundColor: C.elevation100,
                padding: '1px 5px',
                borderRadius: '3px',
                fontSize: '12px',
                color: C.elevation800,
                fontWeight: 600,
              }}
            >
              media
            </code>
            , the stored value should be a Payload media document ID — not a raw URL.
          </div>
        </div>
      )}

      {/* Add Field button (visible when fields exist and not currently editing) */}
      {fields.length > 0 && !isFormOpen && !readOnly && (
        <button
          type="button"
          style={{ ...S.btnSecondary, alignSelf: 'flex-start' }}
          onClick={openAddForm}
        >
          <PlusIcon size={14} />
          Add Field
        </button>
      )}
    </div>
  )
}
