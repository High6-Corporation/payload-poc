// ---------------------------------------------------------------------------
// Agent API — FAQ update + create actions
// ---------------------------------------------------------------------------

import { type ParsedAction, type ProposalPayload } from '../types'
import { handleTextUpdate } from './shared'
import { initCreateFlow, executeCreate, advanceFieldCollection } from '../shared'

/**
 * Handle update_faq_question / update_faq_answer (dry-run + execute).
 */
export async function handleFaqs(
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
 * Handle add_faq (dry-run + execute).
 */
export async function handleCreateFaq(
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
    return executeCreate('add_faq', proposal, tenantId, token, siteId)
  }

  // Dry-run: initiate multi-field collection
  const resp = initCreateFlow('add_faq', parsed.fields)
  if (resp.field === '_complete') {
    // All fields pre-filled — go straight to proposal
    const result = advanceFieldCollection(
      { action: 'add_faq', field: '_complete', collected: resp.collected },
      '',
    )
    if (result.status === 'pending_confirmation') {
      return Response.json(result, { status: 200 })
    }
  }
  return Response.json(resp, { status: 200 })
}
