// ---------------------------------------------------------------------------
// Agent API — Portfolio item update + create actions
// ---------------------------------------------------------------------------

import { type ParsedAction, type ProposalPayload } from '../types'
import { handleTextUpdate } from './shared'
import { initCreateFlow, executeCreate, advanceFieldCollection } from '../shared'

/**
 * Handle update_portfolio_title / update_portfolio_category / update_portfolio_url
 * (dry-run + execute).
 */
export async function handlePortfolio(
  parsed: ParsedAction,
  tenantId: string,
  token: string,
  confirmed: boolean,
  proposal?: ProposalPayload,
): Promise<Response> {
  return handleTextUpdate(parsed, tenantId, token, confirmed, proposal)
}

/**
 * Handle add_portfolio_item (dry-run + execute).
 */
export async function handleCreatePortfolio(
  parsed: ParsedAction,
  tenantId: string,
  token: string,
  confirmed: boolean,
  proposal?: Record<string, unknown>,
): Promise<Response> {
  if (confirmed) {
    if (!proposal) {
      return Response.json(
        { error: 'Missing "proposal" field — required when confirmed is true' },
        { status: 400 },
      )
    }
    return executeCreate('add_portfolio_item', proposal, tenantId, token)
  }

  const resp = initCreateFlow('add_portfolio_item', parsed.fields)
  if (resp.field === '_complete') {
    const result = advanceFieldCollection(
      { action: 'add_portfolio_item', field: '_complete', collected: resp.collected },
      '',
    )
    if (result.status === 'pending_confirmation') {
      return Response.json(result, { status: 200 })
    }
  }
  return Response.json(resp, { status: 200 })
}
