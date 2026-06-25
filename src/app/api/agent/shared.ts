// ---------------------------------------------------------------------------
// Agent API — Create-record shared logic (awaiting_fields state machine)
// ---------------------------------------------------------------------------
//
// Multi-field collection works like this:
//   1. DeepSeek detects an add intent → returns { action: "add_*", fields: { … } }
//   2. initCreateFlow() pre-fills any fields DeepSeek already extracted, then
//      returns awaiting_fields for the first missing required field.
//   3. The client stores { action, field, collected } and sends the value back
//      as { message, awaitingFields: { action, field, collected } }.
//   4. handleAwaitingFields() merges the value, advances the cursor to the next
//      missing field, and either returns the next awaiting_fields or (once all
//      required + optional fields are collected) a proposal.
//   5. On confirmation, executeCreate() POSTs to the collection and writes an
//      audit log entry.
//
// Cancellation: if the client sends something unrelated while awaiting_fields
// is active, the useChatSession hook cancels it client-side (same cancel block
// as all other pending states).  No server-side cancel guard is needed.
// ---------------------------------------------------------------------------

import { type CreateFieldDef, type AwaitingFieldsResponse } from './types'
import { fetchTenantRecords, getFieldValue, resolveRecordTenant } from './resolver'
import { writeAuditLog } from './audit'
import { createWithRetry, getTenantSiteId } from './actions/shared'

// ---------------------------------------------------------------------------
// Field definitions per create action
// ---------------------------------------------------------------------------

export const CREATE_FIELD_DEFS: Record<string, CreateFieldDef> = {
  add_faq: {
    required: ['question', 'answer'],
    optional: [],
    labels: { question: 'question', answer: 'answer' },
    collection: 'faqs',
  },
  add_testimonial: {
    required: ['name', 'quote', 'position'],
    optional: ['image'],
    labels: { name: 'name', quote: 'quote', position: 'position', image: 'image' },
    collection: 'testimonials',
  },
  add_portfolio_item: {
    required: ['title', 'category'],
    optional: ['url', 'image'],
    labels: { title: 'title', category: 'category', url: 'URL', image: 'image' },
    collection: 'portfolio-items',
  },
  add_pricing_plan: {
    required: ['label', 'price'],
    optional: ['description', 'features'],
    labels: {
      label: 'plan name',
      price: 'price (e.g. 99.99)',
      description: 'description',
      features: 'features (comma-separated list)',
    },
    collection: 'pricing-plans',
  },
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Find the first missing required field, or first optional field, or null. */
function nextMissingField(
  action: string,
  collected: Record<string, string>,
  optionalAsked: Set<string>,
): string | null {
  const def = CREATE_FIELD_DEFS[action]
  if (!def) return null

  for (const f of def.required) {
    if (!collected[f] || collected[f].trim() === '') return f
  }
  for (const f of def.optional) {
    // "image" is system-injected via mediaId upload — never prompt the
    // client for it.  When present it is pre-filled silently; when absent
    // it is skipped without asking.
    if (f === 'image') continue
    if (!optionalAsked.has(f)) return f
  }
  return null
}

// ---------------------------------------------------------------------------
// initCreateFlow — called on first detection of a create action (dry-run path)
// ---------------------------------------------------------------------------

/**
 * Kick off the field-collection sequence for a create action.
 * Pre-fills any fields DeepSeek extracted via the structured "fields" object,
 * then returns awaiting_fields for the first missing required field.
 */
export function initCreateFlow(
  action: string,
  parsedFields: Record<string, string> | undefined,
): AwaitingFieldsResponse {
  const def = CREATE_FIELD_DEFS[action]

  // Merge pre-filled values from DeepSeek's structured fields object
  const collected: Record<string, string> = {}

  if (parsedFields && typeof parsedFields === 'object') {
    for (const f of [...def.required, ...def.optional]) {
      const val = parsedFields[f]
      if (typeof val === 'string' && val.trim() !== '') {
        collected[f] = val.trim()
      }
    }
  }

  // Find the next field to ask for
  const next = nextMissingField(action, collected, new Set())
  if (!next) {
    // All required fields pre-filled — skip to proposal.
    return {
      status: 'awaiting_fields',
      action,
      field: '_complete',
      prompt: '',
      collected,
      collection: def.collection,
    }
  }

  const label = def.labels[next] ?? next
  return {
    status: 'awaiting_fields',
    action,
    field: next,
    prompt: buildFieldPrompt(next, label, false),
    collected,
    collection: def.collection,
  }
}

/** Build a human-readable prompt for a field. */
function buildFieldPrompt(field: string, label: string, isOptional: boolean): string {
  const skip = isOptional ? ' (type "skip" to leave empty)' : ''
  const prefix =
    field === 'features'
      ? 'Enter the features as a comma-separated list'
      : `What should the ${label} be`
  return `${prefix}?${skip}`
}

// ---------------------------------------------------------------------------
// handleAwaitingFields — round-trip handler (client sent back a field value)
// ---------------------------------------------------------------------------

/**
 * Process an awaiting_fields round-trip.
 *
 * 1. Merges the new value (from `message`) into `collected[body.field]`.
 * 2. Advances the cursor to the next missing field.
 * 3. If more fields remain → returns awaiting_fields for the next one.
 * 4. If all fields collected → returns pending_confirmation with a proposal.
 *
 * "skip" handling: if the client types "skip" for an optional field, the
 * field is marked as asked but left empty (omitted from the POST payload).
 */
export function advanceFieldCollection(
  body: { action: string; field: string; collected: Record<string, string> },
  message: string,
): AwaitingFieldsResponse | { status: 'pending_confirmation'; proposal: Record<string, unknown> } {
  const def = CREATE_FIELD_DEFS[body.action]
  if (!def) {
    // Shouldn't happen — validated in route.ts
    throw new Error(`Unknown create action: ${body.action}`)
  }

  const collected = { ...body.collected }

  // Reconstruct previously-skipped optional fields from the sentinel so they
  // persist across round-trips.  Without this, a skipped optional field
  // would be re-asked on the next round-trip because it's absent from
  // collected (Bug 2).
  const skippedOptional = new Set<string>(
    typeof body.collected._skippedOptional === 'string'
      ? body.collected._skippedOptional.split(',').filter(Boolean)
      : [],
  )

  // Merge the new value
  const isOptional = def.optional.includes(body.field)
  const isSkip = message.trim().toLowerCase() === 'skip'

  if (isOptional && isSkip) {
    // Mark as asked, don't store a value
    skippedOptional.add(body.field)
    collected._skippedOptional = [...skippedOptional].join(',')
  } else {
    collected[body.field] = message.trim()
  }

  // Build optionalAsked AFTER the merge so the current field's disposition
  // is always reflected.  If constructed before, a just-skipped field
  // would be absent from the set and nextMissingField would return it again.
  const optionalAsked = new Set<string>([
    ...Object.keys(collected).filter((k) => def.optional.includes(k)),
    ...skippedOptional,
  ])

  // Advance to next field
  const next = nextMissingField(body.action, collected, optionalAsked)
  if (next) {
    const nextOptional = def.optional.includes(next)
    const label = def.labels[next] ?? next
    return {
      status: 'awaiting_fields',
      action: body.action,
      field: next,
      prompt: buildFieldPrompt(next, label, nextOptional),
      collected,
      collection: def.collection,
    }
  }

  // All fields collected — build proposal
  return buildCreateProposal(body.action, collected)
}

// ---------------------------------------------------------------------------
// Proposal builder
// ---------------------------------------------------------------------------

function buildCreateProposal(
  action: string,
  collected: Record<string, string>,
): { status: 'pending_confirmation'; proposal: Record<string, unknown> } {
  const def = CREATE_FIELD_DEFS[action]
  const actionLabels: Record<string, string> = {
    add_faq: 'FAQ',
    add_testimonial: 'testimonial',
    add_portfolio_item: 'portfolio item',
    add_pricing_plan: 'pricing plan',
  }

  // Build a human-readable summary — never expose raw media IDs to the client.
  // The image field (when present) is shown as a fixed placeholder line.
  const fieldsSummary = Object.entries(collected)
    .filter(([k, v]) => k !== '_skippedOptional' && k !== 'image' && v && v.trim() !== '')
    .map(([k, v]) => `  ${k}: "${v}"`)
    .join('\n')

  const imageLine =
    collected.image && collected.image.trim() !== '' ? '\n  image: (uploaded image attached)' : ''

  const fullSummary = fieldsSummary + imageLine

  return {
    status: 'pending_confirmation',
    proposal: {
      action,
      // Human-readable label for the confirmation display
      id: actionLabels[action] ?? action,
      currentValue: '(new record)',
      newValue: fullSummary,
      collection: def.collection,
      // Store the actual field data for execute
      _collected: collected,
    },
  }
}

// ---------------------------------------------------------------------------
// executeCreate — confirmed POST
// ---------------------------------------------------------------------------

/**
 * Execute a confirmed create action.
 * POSTs the collected fields to the Payload API and writes an audit log entry.
 */
export async function executeCreate(
  action: string,
  proposal: Record<string, unknown>,
  tenantId: string,
  token: string,
): Promise<Response> {
  const def = CREATE_FIELD_DEFS[action]
  if (!def) {
    return Response.json({ error: `Unknown create action: ${action}` }, { status: 400 })
  }

  const collected = (proposal._collected as Record<string, string>) ?? {}
  if (!collected || Object.keys(collected).length === 0) {
    return Response.json({ error: 'No field values found in proposal' }, { status: 400 })
  }

  // Resolve the site ID for this tenant
  let siteId: string
  try {
    siteId = await getTenantSiteId(tenantId, token)
  } catch (e) {
    return Response.json(
      { error: `Failed to resolve site: ${(e as Error).message}` },
      { status: 500 },
    )
  }

  // Build the POST payload — exclude the _skippedOptional sentinel so
  // skipped optional fields are omitted from the Payload document.
  const payload: Record<string, unknown> = {
    ...collected,
    site: siteId,
  }
  delete payload._skippedOptional

  // Transform features string → items array for pricing plans
  if (
    action === 'add_pricing_plan' &&
    typeof collected.features === 'string' &&
    collected.features.trim() !== ''
  ) {
    payload.items = collected.features
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
      .map((item) => ({ item }))
    delete payload.features
  }

  // Transform price string → number for pricing plans
  if (action === 'add_pricing_plan' && typeof collected.price === 'string') {
    const num = parseFloat(collected.price)
    if (isNaN(num)) {
      return Response.json(
        { error: `Invalid price "${collected.price}" — must be a number` },
        { status: 400 },
      )
    }
    payload.price = num
  }

  console.log(
    '[executeCreate] POST payload:',
    JSON.stringify({ collection: def.collection, payload }),
  )

  const result = await createWithRetry(def.collection, payload, token)

  console.log(
    '[executeCreate] Payload response:',
    JSON.stringify({
      ok: result.ok,
      status: result.ok ? 200 : (result as { status: number }).status,
      data: result.ok ? result.data : null,
    }),
  )

  if (!result.ok) {
    if (result.status === 401) {
      return Response.json({ error: 'Authentication failed after token refresh' }, { status: 500 })
    }
    return Response.json(
      {
        error: `POST ${def.collection} failed (HTTP ${result.status})`,
      },
      { status: 500 },
    )
  }

  // Audit log — for creates, previousValue is null (no prior record)
  const newValueSummary = JSON.stringify(collected)
  await writeAuditLog({
    tenantId,
    action,
    collection: def.collection,
    documentId: ((result.data as Record<string, unknown>)?.id as string) ?? 'unknown',
    slug: ((result.data as Record<string, unknown>)?.id as string) ?? 'unknown',
    previousValue: null as unknown as string,
    newValue: newValueSummary,
    token: result.token,
  })

  const actionLabels: Record<string, string> = {
    add_faq: 'FAQ',
    add_testimonial: 'testimonial',
    add_portfolio_item: 'portfolio item',
    add_pricing_plan: 'pricing plan',
  }

  return Response.json(
    {
      success: true,
      created: { id: (result.data as Record<string, unknown>)?.id, ...collected },
      message: `✅ ${actionLabels[action] ?? 'Record'} created successfully!`,
    },
    { status: 200 },
  )
}

/**
 * Entry point for the awaiting_fields round-trip in route.ts.
 * Parses the client's awaitingFields body, merges the new value,
 * and returns either the next awaiting_fields prompt or a proposal.
 */
export function handleAwaitingFieldsRoundTrip(body: {
  awaitingFields: { action: string; field: string; collected: Record<string, string> }
  message: string
}): AwaitingFieldsResponse | { status: 'pending_confirmation'; proposal: Record<string, unknown> } {
  const { awaitingFields } = body
  return advanceFieldCollection(
    {
      action: awaitingFields.action,
      field: awaitingFields.field,
      collected: awaitingFields.collected,
    },
    body.message,
  )
}
