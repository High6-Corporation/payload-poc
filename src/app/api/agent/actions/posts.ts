// ---------------------------------------------------------------------------
// Agent API — Post / Page title actions
// ---------------------------------------------------------------------------

import { type ParsedAction, type ProposalPayload } from '../types'
import { resolveSlugToId, getDocumentTitle, patchTitle } from '../resolver'
import { writeAuditLog } from '../audit'
import { clearAgentToken, getAgentToken } from '@/utilities/payloadAuth'

/**
 * Handle update_post_title / update_page_title (dry-run + execute).
 */
export async function handlePosts(
  parsed: ParsedAction,
  tenantId: string,
  token: string,
  confirmed: boolean,
  proposal?: ProposalPayload,
): Promise<Response> {
  const collection = parsed.action === 'update_post_title' ? 'posts' : 'pages'

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

    const rawValue =
      ((proposal as unknown as Record<string, unknown>)._rawValue as string) ?? proposal.newValue

    let currentToken = token
    let patchResult = await patchTitle(collection, proposal.documentId, rawValue, currentToken)

    if (patchResult.status === 401) {
      clearAgentToken()
      try {
        currentToken = await getAgentToken()
      } catch {
        return Response.json({ error: 'Token refresh failed after 401 response' }, { status: 500 })
      }
      patchResult = await patchTitle(collection, proposal.documentId, rawValue, currentToken)
      if (patchResult.status === 401) {
        return Response.json(
          { error: 'Authentication failed after token refresh' },
          { status: 500 },
        )
      }
    }

    if (!patchResult.ok || !patchResult.data) {
      return Response.json(
        { error: `PATCH ${collection}/${proposal.documentId} failed (HTTP ${patchResult.status})` },
        { status: 500 },
      )
    }

    await writeAuditLog({
      tenantId,
      action: proposal.action,
      collection: proposal.collection,
      documentId: proposal.documentId,
      slug: proposal.slug ?? proposal.id ?? proposal.documentId,
      previousValue: proposal.currentValue,
      newValue: proposal.newValue,
      token: currentToken,
    })

    return Response.json(
      { success: true, updated: { id: patchResult.data.id, title: patchResult.data.title } },
      { status: 200 },
    )
  }

  // =========================================================================
  // DRY-RUN PATH
  // =========================================================================
  if (!parsed.slug || !parsed.value) {
    // Guard: missing slug is still a hard error
    if (!parsed.slug) {
      return Response.json({ error: `Missing "slug" for action ${parsed.action}` }, { status: 400 })
    }

    // Missing value — friendly prompt (same pattern as handleTextUpdate)
    const collection = parsed.action === 'update_post_title' ? 'posts' : 'pages'
    const kind = collection === 'posts' ? 'post' : 'page'
    return Response.json(
      {
        status: 'awaiting_value',
        action: parsed.action,
        slug: parsed.slug,
        collection,
        field: 'title',
        prompt: `What should the new title be?`,
      },
      { status: 200 },
    )
  }

  const docId = await resolveSlugToId(collection, parsed.slug, tenantId, token)
  if (!docId) {
    return Response.json(
      { error: `${collection === 'posts' ? 'Post' : 'Page'} not found` },
      { status: 404 },
    )
  }

  const currentValue = await getDocumentTitle(collection, docId, token)
  if (currentValue === null) {
    return Response.json(
      { error: `Failed to fetch current title for ${collection}/${docId}` },
      { status: 500 },
    )
  }

  return Response.json(
    {
      status: 'pending_confirmation',
      proposal: {
        action: parsed.action,
        slug: parsed.slug,
        currentValue,
        newValue: `Here's what I'll update in the "${parsed.slug}" ${collection === 'posts' ? 'post' : 'page'}:\n\nTitle: ${parsed.value}\n\nType "confirm" or tap Confirm to save this.`,
        _rawValue: parsed.value,
        collection,
        documentId: docId,
      },
    },
    { status: 200 },
  )
}
