// ---------------------------------------------------------------------------
// Agent API — Shared action utilities
// ---------------------------------------------------------------------------

import { type ParsedAction, type ProposalPayload, type ActionMeta } from '../types'
import {
  fetchRecordById,
  getFieldValue,
  resolveRecordTenant,
  patchRecord,
  fetchTenantRecords,
} from '../resolver'
import { writeAuditLog } from '../audit'
import { getServerSideURL } from '@/utilities/getURL'
import { clearAgentToken, getAgentToken } from '@/utilities/payloadAuth'

/** Field map: action → { collection, field, label } */
export const ACTION_META: Record<string, ActionMeta> = {
  update_faq_question: {
    collection: 'faqs',
    field: 'question',
    label: 'FAQ',
  },
  update_faq_answer: {
    collection: 'faqs',
    field: 'answer',
    label: 'FAQ',
  },
  /** Sentinel: FAQ identified but field not yet chosen.  Triggers awaiting_field. */
  update_faq: {
    collection: 'faqs',
    field: '_field',
    label: 'FAQ',
  },
  update_testimonial_quote: {
    collection: 'testimonials',
    field: 'quote',
    label: 'Testimonial',
  },
  update_testimonial_name: {
    collection: 'testimonials',
    field: 'name',
    label: 'Testimonial',
  },
  update_testimonial_position: {
    collection: 'testimonials',
    field: 'position',
    label: 'Testimonial',
  },
  update_portfolio_title: {
    collection: 'portfolio-items',
    field: 'title',
    label: 'Portfolio item',
  },
  update_portfolio_category: {
    collection: 'portfolio-items',
    field: 'category',
    label: 'Portfolio item',
  },
  update_portfolio_url: {
    collection: 'portfolio-items',
    field: 'url',
    label: 'Portfolio item',
  },
}

/** Extract a human-readable display label from a record based on its collection. */
export function getRecordDisplayLabel(collection: string, record: Record<string, unknown>): string {
  if (collection === 'faqs') {
    const q = typeof record.question === 'string' ? record.question : ''
    return q.length > 60 ? q.slice(0, 57) + '...' : q || '(no question)'
  }
  if (collection === 'testimonials') {
    return typeof record.name === 'string' ? record.name : '(no name)'
  }
  if (collection === 'portfolio-items') {
    return typeof record.title === 'string' ? record.title : '(no title)'
  }
  return String(record.id ?? 'record')
}

/**
 * Patch a record with automatic 401 token refresh.
 * Returns the current token (which may have been refreshed).
 */
export async function patchWithRetry(
  collection: string,
  documentId: string,
  data: Record<string, unknown>,
  token: string,
): Promise<
  | { ok: true; data: Record<string, unknown> | null; token: string }
  | { ok: false; status: number; token: string }
> {
  let currentToken = token
  let result = await patchRecord(collection, documentId, data, currentToken)

  if (result.status === 401) {
    clearAgentToken()
    try {
      currentToken = await getAgentToken()
    } catch {
      return { ok: false, status: 401, token: currentToken }
    }
    result = await patchRecord(collection, documentId, data, currentToken)
  }

  if (!result.ok) {
    return { ok: false, status: result.status, token: currentToken }
  }

  return { ok: true, data: result.data, token: currentToken }
}

/**
 * Generic handler for all text-update actions (FAQ, testimonial, portfolio).
 * Looks up the action in ACTION_META and handles both dry-run and execute paths.
 */
export async function handleTextUpdate(
  parsed: ParsedAction,
  tenantId: string,
  token: string,
  confirmed: boolean,
  proposal?: ProposalPayload,
  siteId?: string,
): Promise<Response> {
  const meta = ACTION_META[parsed.action]

  // =========================================================================
  // EXECUTE PATH
  // =========================================================================
  if (confirmed) {
    if (!proposal) {
      return Response.json(
        { error: 'Missing "proposal" field — required when confirmed is true' },
        { status: 400 },
      )
    }

    // Safety: update_faq should never reach execute — it's resolved to a
    // specific field before confirmation.
    if (meta.field === '_field') {
      return Response.json(
        { error: `Cannot execute "${parsed.action}" — field not resolved` },
        { status: 400 },
      )
    }

    const rawValue = (proposal as unknown as Record<string, unknown>)._rawValue ?? proposal.newValue
    const patchResult = await patchWithRetry(
      meta.collection,
      proposal.documentId,
      { [meta.field]: rawValue },
      token,
    )

    if (!patchResult.ok) {
      if (patchResult.status === 401) {
        return Response.json(
          { error: 'Authentication failed after token refresh' },
          { status: 500 },
        )
      }
      return Response.json(
        {
          error: `PATCH ${meta.collection}/${proposal.documentId} failed (HTTP ${patchResult.status})`,
        },
        { status: 500 },
      )
    }

    // Tenant scoping verification
    const scopedRecord = await fetchRecordById(
      meta.collection,
      proposal.documentId,
      patchResult.token,
    )
    if (scopedRecord) {
      const recordTenant = await resolveRecordTenant(
        meta.collection,
        scopedRecord,
        patchResult.token,
      )
      if (recordTenant && recordTenant !== tenantId) {
        return Response.json(
          { error: 'Access denied: this record belongs to a different tenant' },
          { status: 403 },
        )
      }
    }

    await writeAuditLog({
      tenantId,
      action: proposal.action,
      collection: meta.collection,
      documentId: proposal.documentId,
      slug: proposal.id ?? proposal.slug ?? proposal.documentId,
      previousValue: proposal.currentValue,
      newValue: proposal.newValue,
      token: patchResult.token,
    })

    // "Both" continuation — after the first field is patched, return
    // awaiting_value for the next field instead of a plain success.
    if (proposal.nextAction) {
      const nextMeta = ACTION_META[proposal.nextAction]
      if (nextMeta) {
        const nextFieldLabel = nextMeta.field.replace(/_/g, ' ')
        const nextFieldPrompts: Record<string, string> = {
          question: 'And what would you like the question to say?',
          answer: 'And what should the answer be?',
        }
        const nextPrompt =
          nextFieldPrompts[nextMeta.field] ?? `And what should the ${nextFieldLabel} be?`
        return Response.json(
          {
            status: 'awaiting_value',
            action: proposal.nextAction,
            id: proposal.documentId,
            collection: nextMeta.collection,
            field: nextMeta.field,
            prompt: nextPrompt,
          },
          { status: 200 },
        )
      }
    }

    return Response.json(
      {
        success: true,
        updated: { id: proposal.documentId, [meta.field]: proposal.newValue },
      },
      { status: 200 },
    )
  }

  // =========================================================================
  // DRY-RUN PATH
  // =========================================================================

  // --- awaiting_field guard (FAQ only) ---------------------------------------
  // When meta.field is the '_field' sentinel, the FAQ was identified but the
  // user didn't specify question vs answer.  Ask "which field?" first.
  if (meta.field === '_field') {
    if (!parsed.id) {
      return Response.json({ error: `Missing "id" for action ${parsed.action}` }, { status: 400 })
    }

    return Response.json(
      {
        status: 'awaiting_field',
        action: parsed.action,
        id: parsed.id,
        collection: meta.collection,
        prompt: `Would you like to update the question, the answer, or both?`,
      },
      { status: 200 },
    )
  }

  // --- awaiting_value guard --------------------------------------------------
  if (!parsed.id || !parsed.value) {
    // Guard: missing id is still a hard error (shouldn't happen post-selection)
    if (!parsed.id) {
      return Response.json({ error: `Missing "id" for action ${parsed.action}` }, { status: 400 })
    }

    // Missing value — this is the expected path when a client picks a record
    // but never specified what to change.  Ask them for the new value instead
    // of throwing a raw error string.

    // Per-field conversational prompts — never echo the old value or record name
    const fieldPrompts: Record<string, string> = {
      question: 'What would you like the question to say?',
      answer: 'What should the answer be?',
      name: "What's the name?",
      quote: "What's the testimonial quote?",
      position: "What's their position or title?",
      title: "What's the title?",
      category: 'What category should this be?',
      url: "What's the URL?",
    }
    const prompt =
      fieldPrompts[meta.field] ?? `What should the ${meta.field.replace(/_/g, ' ')} be?`

    const awaitingValueBody: Record<string, unknown> = {
      status: 'awaiting_value',
      action: parsed.action,
      id: parsed.id,
      collection: meta.collection,
      field: meta.field,
      prompt,
    }

    // Carry nextAction through so "both" flows survive the round-trip
    if (parsed.nextAction) {
      awaitingValueBody.nextAction = parsed.nextAction
    }

    console.log('[agent shared] returning awaiting_value:', JSON.stringify(awaitingValueBody))
    return Response.json(awaitingValueBody, { status: 200 })
  }

  let record = await fetchRecordById(meta.collection, parsed.id, token)
  if (!record) {
    // ID lookup failed — try resolving by name via tenant records list
    const listCollection = meta.collection as 'faqs' | 'testimonials' | 'portfolio-items'
    const records = await fetchTenantRecords(listCollection, tenantId, token, siteId)
    if (records && records.length > 0) {
      const search = parsed.id!.toLowerCase()
      const exact = records.filter((r) => r.label.toLowerCase() === search)
      if (exact.length === 1) {
        record = await fetchRecordById(meta.collection, exact[0].id, token)
      } else if (exact.length > 1) {
        return Response.json(
          { status: 'needs_selection', collection: meta.collection, records: exact },
          { status: 200 },
        )
      } else {
        const fuzzy = records.filter((r) => r.label.toLowerCase().includes(search))
        if (fuzzy.length > 0) {
          return Response.json(
            { status: 'needs_selection', collection: meta.collection, records: fuzzy },
            { status: 200 },
          )
        }
      }
    }
    if (!record) {
      return Response.json(
        { error: `${meta.label} "${parsed.id}" not found in your site's records` },
        { status: 404 },
      )
    }

    // After a successful fuzzy-match, replace the user-provided text in
    // parsed.id with the real MongoDB ID.  Otherwise documentId in the
    // proposal (and the subsequent PATCH) will carry the raw user text
    // instead of the database ID.
    parsed.id = (record as Record<string, unknown>).id as string
  }

  const recordTenant = await resolveRecordTenant(meta.collection, record, token)
  if (recordTenant && recordTenant !== tenantId) {
    return Response.json(
      { error: 'Access denied: this record belongs to a different tenant' },
      { status: 403 },
    )
  }

  const currentValue = getFieldValue(record, meta.field)
  if (currentValue === null) {
    const label = getRecordDisplayLabel(meta.collection, record)
    return Response.json(
      { error: `Failed to read ${meta.field} field for ${meta.label.toLowerCase()} "${label}"` },
      { status: 500 },
    )
  }

  const displayLabel = getRecordDisplayLabel(meta.collection, record)

  // Field display labels for proposal messages
  const fieldDisplayLabels: Record<string, string> = {
    question: 'Question',
    answer: 'Answer',
    name: 'Name',
    quote: 'Quote',
    position: 'Position',
    title: 'Title',
    category: 'Category',
    url: 'URL',
  }

  const fLabel = fieldDisplayLabels[meta.field] ?? meta.field.replace(/_/g, ' ')
  const message = `Here's what I'll update in the ${displayLabel} ${meta.label.toLowerCase()}:\n\n${fLabel}: ${parsed.value}\n\nType "confirm" or tap Confirm to save this.`

  const proposalBody: Record<string, unknown> = {
    action: parsed.action,
    id: displayLabel,
    currentValue,
    newValue: message,
    collection: meta.collection,
    documentId: parsed.id,
    _rawValue: parsed.value,
  }

  // Carry nextAction through so "both" survives the confirmation round-trip
  if (parsed.nextAction) {
    proposalBody.nextAction = parsed.nextAction
  }

  return Response.json(
    {
      status: 'pending_confirmation',
      proposal: proposalBody,
    },
    { status: 200 },
  )
}

// ---------------------------------------------------------------------------
// Create-record helpers (POST)
// ---------------------------------------------------------------------------

function getServerURL(): string {
  return getServerSideURL()
}

/** POST a new document to a collection. Returns the response for inspection. */
export async function postRecord(
  collection: string,
  data: Record<string, unknown>,
  token: string,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> | null }> {
  const baseUrl = getServerURL()
  const res = await fetch(`${baseUrl}/api/${collection}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  })

  const resData = await res.json().catch(() => null)
  return { ok: res.ok, status: res.status, data: resData }
}

/**
 * POST a new document with automatic 401 token refresh.
 * Returns the current token (which may have been refreshed).
 */
export async function createWithRetry(
  collection: string,
  data: Record<string, unknown>,
  token: string,
): Promise<
  | { ok: true; data: Record<string, unknown> | null; token: string }
  | { ok: false; status: number; token: string }
> {
  let currentToken = token
  let result = await postRecord(collection, data, currentToken)

  if (result.status === 401) {
    clearAgentToken()
    try {
      currentToken = await getAgentToken()
    } catch {
      return { ok: false, status: 401, token: currentToken }
    }
    result = await postRecord(collection, data, currentToken)
  }

  if (!result.ok) {
    return { ok: false, status: result.status, token: currentToken }
  }

  return { ok: true, data: result.data, token: currentToken }
}

/**
 * Resolve a site ID for a tenant, deterministically.
 *
 * When `siteId` is provided, validates that the site belongs to the tenant and
 * returns it.  When omitted, queries all sites for the tenant:
 * - 1 site  → returns it (backward-compatible single-site path)
 * - 0 sites → throws
 * - 2+ sites → throws with a clear message (no silent "first site" guess)
 */
export async function getTenantSiteId(
  tenantId: string,
  token: string,
  siteId?: string,
): Promise<string> {
  const baseUrl = getServerURL()

  // --- Explicit siteId: validate ownership --------------------------------
  if (siteId) {
    const siteRes = await fetch(`${baseUrl}/api/sites/${siteId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!siteRes.ok) {
      throw new Error(`Site "${siteId}" not found (HTTP ${siteRes.status})`)
    }

    const siteData = await siteRes.json()
    const siteTenant =
      typeof siteData?.tenant === 'string'
        ? siteData.tenant
        : (siteData?.tenant as Record<string, unknown>)?.id

    if (siteTenant !== tenantId) {
      throw new Error(
        `Site "${siteId}" does not belong to tenant ${tenantId}`,
      )
    }

    return siteId
  }

  // --- Implicit: auto-detect with multi-site guard -----------------------
  const res = await fetch(
    `${baseUrl}/api/sites?where[tenant][equals]=${tenantId}&limit=100`,
    { headers: { Authorization: `Bearer ${token}` } },
  )

  if (!res.ok) {
    throw new Error(`Failed to fetch sites (HTTP ${res.status})`)
  }

  const data = await res.json()
  const docs: Array<{ id: string }> = data?.docs ?? []

  if (docs.length === 0) {
    throw new Error(
      `No site found for tenant ${tenantId}. Create a site in the admin panel first.`,
    )
  }

  if (docs.length > 1) {
    throw new Error(
      `Multiple sites exist for tenant ${tenantId} — a siteId must be specified`,
    )
  }

  return docs[0].id
}
