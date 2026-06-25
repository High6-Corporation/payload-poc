// ---------------------------------------------------------------------------
// Agent API — Shared types and type guards
// ---------------------------------------------------------------------------

export interface ParsedAction {
  action: string
  slug?: string
  id?: string
  value?: string
  fields?: Record<string, string>
  reason?: string
  collection?: string
  mediaId?: string
  /** When set, the execute handler returns awaiting_value for this next action
   *  instead of { success: true }.  Used for "both" (question → answer). */
  nextAction?: string
}

/** DeepSeek-parsed field choice for the "which field?" FAQ step. */
export interface ParsedFieldChoice {
  field: 'question' | 'answer' | 'both' | 'unknown'
  reason?: string
}

export interface ProposalPayload {
  action: string
  /** Slug for post/page actions (backward compatible) */
  slug?: string
  /** ID for FAQ/testimonial/portfolio actions */
  id?: string
  currentValue: string
  newValue: string
  collection: string
  documentId: string
  /** For link_image: the actual media ID for the PATCH. Stored separately so
   *  newValue can hold a human-readable label for the client. */
  imageMediaId?: string
  /** When set, the execute handler chains into awaiting_value for this next
   *  action instead of returning { success: true }.  Used for FAQ "both". */
  nextAction?: string
}

export interface ActionMeta {
  collection: string
  /** The Payload field name to patch */
  field: string
  /** Human-readable label for the record */
  label: string
}

/** Display shape for list views — internal ID never shown to client */
export interface SelectionRecord {
  id: string
  label: string
  preview: string
}

export function isParsedAction(v: unknown): v is ParsedAction {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return typeof o.action === 'string'
}

// ---------------------------------------------------------------------------
// Create-record types (multi-field collection)
// ---------------------------------------------------------------------------

/** Shape returned to the client when the agent needs the next field value.
 *  The client stores this and sends it back as `awaitingFields` on the next
 *  request alongside the user's message (which is the value for `field`). */
export interface AwaitingFieldsResponse {
  status: 'awaiting_fields'
  action: string
  /** The field the agent is asking for next. */
  field: string
  /** Human-readable prompt shown to the client (e.g. "What should the question be?"). */
  prompt: string
  /** All field values collected so far (including the value for `field` if
   *  the client already provided it in the original message). */
  collected: Record<string, string>
  /** Collection slug — carried through for the client (informational). */
  collection: string
}

/** Shape the client sends back on the next request when continuing a
 *  field-collection sequence. */
export interface AwaitingFieldsRequest {
  /** The action name (e.g. "add_faq"). */
  action: string
  /** The field the agent asked about in the previous turn. */
  field: string
  /** All values collected so far (before the new value is merged in). */
  collected: Record<string, string>
}

/** Field definitions for a create action. */
export interface CreateFieldDef {
  /** Ordered list of required field names. */
  required: string[]
  /** Optional field names — asked after required fields are collected. */
  optional: string[]
  /** Human-readable labels keyed by field name (e.g. { question: "question", answer: "answer" }). */
  labels: Record<string, string>
  /** Payload collection slug. */
  collection: string
}

/** Validate that a value is a non-empty ProposalPayload with all required fields. */
export function isProposalPayload(v: unknown): v is ProposalPayload {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return (
    typeof o.action === 'string' &&
    o.action.length > 0 &&
    typeof o.currentValue === 'string' &&
    typeof o.newValue === 'string' &&
    o.newValue.length > 0 &&
    typeof o.collection === 'string' &&
    o.collection.length > 0 &&
    typeof o.documentId === 'string' &&
    o.documentId.length > 0
  )
}
