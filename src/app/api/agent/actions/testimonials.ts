// ---------------------------------------------------------------------------
// Agent API — Testimonial update + create actions
// ---------------------------------------------------------------------------

import { type ParsedAction, type ProposalPayload } from '../types'
import { handleTextUpdate } from './shared'
import { initCreateFlow, executeCreate, advanceFieldCollection } from '../shared'

/**
 * Handle update_testimonial_quote / update_testimonial_name / update_testimonial_position
 * (dry-run + execute).
 */
export async function handleTestimonials(
  parsed: ParsedAction,
  tenantId: string,
  token: string,
  confirmed: boolean,
  proposal?: ProposalPayload,
  siteId?: string,
): Promise<Response> {
  return handleTextUpdate(parsed, tenantId, token, confirmed, proposal, siteId)
}

/**
 * Handle add_testimonial (dry-run + execute).
 */
export async function handleCreateTestimonial(
  parsed: ParsedAction,
  tenantId: string,
  token: string,
  confirmed: boolean,
  proposal?: Record<string, unknown>,
  siteId?: string,
): Promise<Response> {
  if (confirmed) {
    if (!proposal) {
      return Response.json(
        { error: 'Missing "proposal" field — required when confirmed is true' },
        { status: 400 },
      )
    }
    return executeCreate('add_testimonial', proposal, tenantId, token, siteId)
  }

  const resp = initCreateFlow('add_testimonial', parsed.fields)
  if (resp.field === '_complete') {
    const result = advanceFieldCollection(
      { action: 'add_testimonial', field: '_complete', collected: resp.collected },
      '',
    )
    if (result.status === 'pending_confirmation') {
      return Response.json(result, { status: 200 })
    }
  }
  return Response.json(resp, { status: 200 })
}
