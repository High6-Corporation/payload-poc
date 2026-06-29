// ---------------------------------------------------------------------------
// Agent API — Pricing Plan create action
// ---------------------------------------------------------------------------

import { type ParsedAction, type ProposalPayload } from '../types'
import { initCreateFlow, executeCreate, advanceFieldCollection } from '../shared'

/**
 * Handle add_pricing_plan (dry-run + execute).
 */
export async function handlePricing(
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
    return executeCreate('add_pricing_plan', proposal, tenantId, token, siteId)
  }

  // Dry-run: initiate multi-field collection
  const resp = initCreateFlow('add_pricing_plan', parsed.fields)
  if (resp.field === '_complete') {
    const result = advanceFieldCollection(
      { action: 'add_pricing_plan', field: '_complete', collected: resp.collected },
      '',
    )
    if (result.status === 'pending_confirmation') {
      return Response.json(result, { status: 200 })
    }
  }
  return Response.json(resp, { status: 200 })
}
