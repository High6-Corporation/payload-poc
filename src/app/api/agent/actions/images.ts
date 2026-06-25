// ---------------------------------------------------------------------------
// Agent API — link_image action
// ---------------------------------------------------------------------------

import { type ParsedAction, type ProposalPayload } from '../types'
import {
  fetchRecordById,
  getFieldValue,
  resolveRecordTenant,
  fetchTenantRecords,
} from '../resolver'
import { writeAuditLog } from '../audit'
import { patchWithRetry } from './shared'

/**
 * Handle link_image (dry-run + execute).
 */
export async function handleImages(
  parsed: ParsedAction,
  tenantId: string,
  token: string,
  confirmed: boolean,
  proposal?: ProposalPayload,
): Promise<Response> {
  // =========================================================================
  // EXECUTE PATH
  // =========================================================================
  if (confirmed) {
    if (!proposal || proposal.action !== 'link_image') {
      return Response.json(
        { error: 'Missing or invalid "proposal" field — required when confirmed is true' },
        { status: 400 },
      )
    }

    const mediaId = proposal.imageMediaId ?? proposal.newValue
    const patchResult = await patchWithRetry(
      proposal.collection,
      proposal.documentId,
      { image: mediaId },
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
          error: `PATCH ${proposal.collection}/${proposal.documentId} failed (HTTP ${patchResult.status})`,
        },
        { status: 500 },
      )
    }

    await writeAuditLog({
      tenantId,
      action: proposal.action,
      collection: proposal.collection,
      documentId: proposal.documentId,
      slug: proposal.id ?? proposal.slug ?? proposal.documentId,
      previousValue: proposal.currentValue,
      newValue: proposal.newValue,
      token: patchResult.token,
    })

    return Response.json(
      {
        success: true,
        updated: { id: proposal.documentId, image: proposal.newValue },
      },
      { status: 200 },
    )
  }

  // =========================================================================
  // DRY-RUN PATH
  // =========================================================================
  console.log('[images] received parsed:', JSON.stringify(parsed))
  if (!parsed.collection || !parsed.id || !parsed.mediaId) {
    return Response.json(
      {
        error: "I couldn't process that request. Please try rephrasing what you'd like to change.",
      },
      { status: 400 },
    )
  }

  if (parsed.collection !== 'testimonials' && parsed.collection !== 'portfolio-items') {
    return Response.json(
      {
        error: `Collection "${parsed.collection}" is not supported for image linking. Use "testimonials" or "portfolio-items".`,
      },
      { status: 400 },
    )
  }

  // Fetch the record to verify tenant scoping
  let record = await fetchRecordById(parsed.collection, parsed.id, token)
  if (!record) {
    // ID lookup failed — try resolving by name via tenant records list
    const listCollection = parsed.collection as 'testimonials' | 'portfolio-items'
    const records = await fetchTenantRecords(listCollection, tenantId, token)
    if (records && records.length > 0) {
      const search = parsed.id!.toLowerCase()
      const exact = records.filter((r) => r.label.toLowerCase() === search)
      if (exact.length === 1) {
        record = await fetchRecordById(parsed.collection, exact[0].id, token)
      } else if (exact.length > 1) {
        return Response.json(
          { status: 'needs_selection', collection: parsed.collection, records: exact },
          { status: 200 },
        )
      } else {
        const fuzzy = records.filter((r) => r.label.toLowerCase().includes(search))
        if (fuzzy.length > 0) {
          return Response.json(
            { status: 'needs_selection', collection: parsed.collection, records: fuzzy },
            { status: 200 },
          )
        }
      }
    }
    if (!record) {
      const label = parsed.collection === 'testimonials' ? 'Testimonial' : 'Portfolio item'
      return Response.json(
        { error: `${label} "${parsed.id}" not found in your site's records` },
        { status: 404 },
      )
    }
  }

  // Tenant scoping check
  const recordTenant = await resolveRecordTenant(parsed.collection, record, token)
  if (recordTenant && recordTenant !== tenantId) {
    return Response.json(
      { error: 'Access denied: this record belongs to a different tenant' },
      { status: 403 },
    )
  }

  // Verify the media exists
  const mediaRecord = await fetchRecordById('media', parsed.mediaId, token)
  if (!mediaRecord) {
    return Response.json(
      { error: 'The uploaded image could not be found — please re-upload it' },
      { status: 404 },
    )
  }

  // Get the current image value and record label for the proposal preview
  const currentImage = getFieldValue(record, 'image')
  const currentDisplay = currentImage ? '(image set)' : '(no image)'

  // Extract display label from the record — same logic as shared.ts getRecordDisplayLabel
  const displayLabel =
    parsed.collection === 'testimonials'
      ? typeof record.name === 'string'
        ? record.name
        : '(no name)'
      : typeof record.title === 'string'
        ? record.title
        : '(no title)'

  return Response.json(
    {
      status: 'pending_confirmation',
      proposal: {
        action: parsed.action,
        id: displayLabel,
        currentValue: currentDisplay,
        newValue: '[uploaded image]',
        collection: parsed.collection,
        documentId: parsed.id,
        imageMediaId: parsed.mediaId,
      },
    },
    { status: 200 },
  )
}
