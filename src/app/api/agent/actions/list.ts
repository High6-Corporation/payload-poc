// ---------------------------------------------------------------------------
// Agent API — List actions (Phase 6 — Smart Record Resolution)
// ---------------------------------------------------------------------------

import { type ParsedAction } from '../types'
import { fetchTenantRecords } from '../resolver'

/** Map list actions to Payload collection slugs. */
const LIST_COLLECTION: Record<string, 'faqs' | 'testimonials' | 'portfolio-items'> = {
  list_faqs: 'faqs',
  list_testimonials: 'testimonials',
  list_portfolio_items: 'portfolio-items',
}

/**
 * Handle list_faqs / list_testimonials / list_portfolio_items (dry-run only).
 * These actions have no execute path — selection happens in the ChatWindow.
 */
export async function handleList(
  parsed: ParsedAction,
  tenantId: string,
  token: string,
): Promise<Response> {
  const listCollection = LIST_COLLECTION[parsed.action]
  if (!listCollection) {
    return Response.json(
      { error: `Unknown list action: ${parsed.action}` },
      { status: 400 },
    )
  }

  const records = await fetchTenantRecords(listCollection, tenantId, token)

  if (records === null) {
    return Response.json({ error: 'Failed to fetch records' }, { status: 500 })
  }

  if (records.length === 0) {
    const labels: Record<string, string> = {
      faqs: 'FAQ',
      testimonials: 'testimonial',
      'portfolio-items': 'portfolio item',
    }
    return Response.json(
      {
        status: 'empty_collection',
        message: `No ${labels[listCollection]} records found for your site. Please add some in the admin panel first.`,
      },
      { status: 200 },
    )
  }

  const collectionLabels: Record<string, string> = {
    faqs: 'FAQs',
    testimonials: 'testimonials',
    'portfolio-items': 'portfolio items',
  }

  return Response.json(
    {
      status: 'needs_selection',
      collection: collectionLabels[listCollection],
      records,
    },
    { status: 200 },
  )
}
