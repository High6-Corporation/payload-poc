/**
 * Agent API Route — POST /api/agent
 *
 * Orchestration shell: parses request, delegates to action handlers.
 * Phase 4: confirmation flow  |  Phase 5: expanded actions  |  Phase 6: smart record resolution
 */

import { getAgentToken } from '@/utilities/payloadAuth'
import { type ParsedAction, type ProposalPayload, isProposalPayload } from './types'
import { callDeepSeek, parseFieldChoice } from './deepseek'
import { handlePosts } from './actions/posts'
import { handleFaqs, handleCreateFaq } from './actions/faqs'
import { handleTestimonials, handleCreateTestimonial } from './actions/testimonials'
import { handlePortfolio, handleCreatePortfolio } from './actions/portfolio'
import { handleImages } from './actions/images'
import { handleList } from './actions/list'
import { handlePricing } from './actions/pricing'
import { fetchTenantRecords } from './resolver'
import { ACTION_META } from './actions/shared'
import { handleAwaitingFieldsRoundTrip, CREATE_FIELD_DEFS } from './shared'

// ---------------------------------------------------------------------------
// Dry-run dispatch — maps action → handler(dryRun)
// ---------------------------------------------------------------------------

type DryRunHandler = (p: ParsedAction, tid: string, tok: string) => Promise<Response>

const DRY_RUN: Record<string, DryRunHandler> = {
  update_faq_question: (p, tid, tok) => handleFaqs(p, tid, tok, false),
  update_faq_answer: (p, tid, tok) => handleFaqs(p, tid, tok, false),
  update_faq: (p, tid, tok) => handleFaqs(p, tid, tok, false),
  update_testimonial_quote: (p, tid, tok) => handleTestimonials(p, tid, tok, false),
  update_testimonial_name: (p, tid, tok) => handleTestimonials(p, tid, tok, false),
  update_testimonial_position: (p, tid, tok) => handleTestimonials(p, tid, tok, false),
  update_portfolio_title: (p, tid, tok) => handlePortfolio(p, tid, tok, false),
  update_portfolio_category: (p, tid, tok) => handlePortfolio(p, tid, tok, false),
  update_portfolio_url: (p, tid, tok) => handlePortfolio(p, tid, tok, false),
  link_image: (p, tid, tok) => handleImages(p, tid, tok, false),
  list_faqs: (p, tid, tok) => handleList(p, tid, tok),
  list_testimonials: (p, tid, tok) => handleList(p, tid, tok),
  list_portfolio_items: (p, tid, tok) => handleList(p, tid, tok),
  add_faq: (p, tid, tok) => handleCreateFaq(p, tid, tok, false),
  add_testimonial: (p, tid, tok) => handleCreateTestimonial(p, tid, tok, false),
  add_portfolio_item: (p, tid, tok) => handleCreatePortfolio(p, tid, tok, false),
  add_pricing_plan: (p, tid, tok) => handlePricing(p, tid, tok, false),
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: Request): Promise<Response> {
  try {
    // --- Parse & validate request -------------------------------------------
    let body: {
      message?: string
      tenantId?: string
      confirmed?: boolean
      proposal?: Record<string, unknown>
      mediaId?: string
      awaitingValue?: {
        action: string
        id?: string
        slug?: string
        collection: string
        field: string
        nextAction?: string
      }
      awaitingField?: {
        action: string
        id?: string
        collection: string
        nextAction?: string
      }
      awaitingFields?: {
        action: string
        field: string
        collected: Record<string, string>
      }
    }
    try {
      body = await request.json()
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const {
      message,
      tenantId,
      confirmed = false,
      proposal,
      mediaId,
      awaitingValue,
      awaitingField,
      awaitingFields,
    } = body
    console.log(
      '[agent] request body:',
      JSON.stringify({ message, tenantId, confirmed, proposal, mediaId }),
    )
    if (!message || typeof message !== 'string')
      return Response.json({ error: 'Missing or invalid "message" field' }, { status: 400 })
    if (!tenantId || typeof tenantId !== 'string')
      return Response.json({ error: 'Missing or invalid "tenantId" field' }, { status: 400 })

    // --- Auth ---------------------------------------------------------------
    let token: string
    try {
      token = await getAgentToken()
    } catch (e) {
      return Response.json(
        { error: `Authentication failed: ${(e as Error).message}` },
        { status: 500 },
      )
    }

    // =========================================================================
    // EXECUTE PATH
    // =========================================================================
    if (confirmed) {
      const isCreate = typeof proposal?.action === 'string' && proposal.action.startsWith('add_')
      if (!proposal || (!isCreate && !isProposalPayload(proposal)))
        return Response.json(
          { error: 'Missing or invalid "proposal" field — required when confirmed is true' },
          { status: 400 },
        )

      const pAction = proposal.action as string
      const synthetic: ParsedAction = {
        action: pAction,
        slug: proposal.slug as string | undefined,
        id: proposal.id as string | undefined,
        value: proposal.newValue as string | undefined,
        collection: proposal.collection as string | undefined,
        nextAction: (proposal as Record<string, unknown>).nextAction as string | undefined,
      }

      const pp = proposal as unknown as ProposalPayload
      if (pAction === 'update_post_title' || pAction === 'update_page_title')
        return handlePosts(synthetic, tenantId, token, true, pp)
      if (ACTION_META[pAction]) return handleFaqs(synthetic, tenantId, token, true, pp)
      if (pAction === 'link_image') return handleImages(synthetic, tenantId, token, true, pp)
      if (pAction === 'add_faq') return handleCreateFaq(synthetic, tenantId, token, true, proposal)
      if (pAction === 'add_testimonial')
        return handleCreateTestimonial(synthetic, tenantId, token, true, proposal)
      if (pAction === 'add_portfolio_item')
        return handleCreatePortfolio(synthetic, tenantId, token, true, proposal)
      if (pAction === 'add_pricing_plan')
        return handlePricing(synthetic, tenantId, token, true, proposal)
      return Response.json(
        { error: `Action "${proposal.action}" is not supported for execution` },
        { status: 400 },
      )
    }

    // =========================================================================
    // AWAITING-VALUE PATH — client provided the value after we asked for it
    // =========================================================================
    if (awaitingValue) {
      const av = awaitingValue
      if (
        typeof av.action !== 'string' ||
        typeof av.collection !== 'string' ||
        typeof av.field !== 'string' ||
        (typeof av.id !== 'string' && typeof av.slug !== 'string')
      ) {
        return Response.json(
          { error: 'Invalid "awaitingValue" — expected { action, id|slug, collection, field }' },
          { status: 400 },
        )
      }

      const synthetic: ParsedAction = {
        action: av.action,
        id: av.id,
        slug: av.slug,
        value: message,
        collection: av.collection,
        nextAction: av.nextAction,
      }

      // Post/page title updates dispatch through handlePosts (slug-based)
      if (av.action === 'update_post_title' || av.action === 'update_page_title') {
        return handlePosts(synthetic, tenantId, token, false)
      }

      const dryRunHandler = DRY_RUN[synthetic.action]
      if (dryRunHandler) return dryRunHandler(synthetic, tenantId, token)

      return Response.json(
        { error: `Action "${synthetic.action}" is not supported` },
        { status: 400 },
      )
    }

    // =========================================================================
    // AWAITING-FIELDS PATH — client provided the next field value during a
    // create-record multi-field collection sequence.
    // =========================================================================
    if (awaitingFields) {
      const af = awaitingFields
      if (
        typeof af.action !== 'string' ||
        typeof af.field !== 'string' ||
        !af.collected ||
        typeof af.collected !== 'object'
      ) {
        return Response.json(
          { error: 'Invalid "awaitingFields" — expected { action, field, collected }' },
          { status: 400 },
        )
      }

      if (!CREATE_FIELD_DEFS[af.action]) {
        return Response.json({ error: `Unknown create action: ${af.action}` }, { status: 400 })
      }

      const result = handleAwaitingFieldsRoundTrip({
        awaitingFields: {
          action: af.action,
          field: af.field,
          collected: af.collected,
        },
        message,
      })

      return Response.json(result, { status: 200 })
    }

    // =========================================================================
    // AWAITING-FIELD PATH — client chose question / answer / both for a FAQ
    // =========================================================================
    if (awaitingField) {
      const af = awaitingField
      if (
        typeof af.action !== 'string' ||
        typeof af.collection !== 'string' ||
        typeof af.id !== 'string'
      ) {
        return Response.json(
          { error: 'Invalid "awaitingField" — expected { action, id, collection }' },
          { status: 400 },
        )
      }

      const choice = await parseFieldChoice(message)
      console.log('[agent] parseFieldChoice:', JSON.stringify(choice))

      if (choice.field === 'unknown') {
        // Re-ask — the user said something unrecognizable
        return Response.json(
          {
            status: 'awaiting_field',
            action: af.action,
            id: af.id,
            collection: af.collection,
            prompt: `I didn't catch that. Would you like to update the question, the answer, or both?`,
          },
          { status: 200 },
        )
      }

      if (choice.field === 'both') {
        // Start the two-step sequence: question first, then answer
        const awaitingValueBody: Record<string, unknown> = {
          status: 'awaiting_value',
          action: 'update_faq_question',
          id: af.id,
          collection: 'faqs',
          field: 'question',
          prompt: `What would you like the question to say instead?`,
          nextAction: 'update_faq_answer',
        }
        return Response.json(awaitingValueBody, { status: 200 })
      }

      // Single field — return awaiting_value with the correct action
      const action = choice.field === 'answer' ? 'update_faq_answer' : 'update_faq_question'
      const field = choice.field === 'answer' ? 'answer' : 'question'
      return Response.json(
        {
          status: 'awaiting_value',
          action,
          id: af.id,
          collection: 'faqs',
          field,
          prompt: `What would you like the ${field} to say instead?`,
        },
        { status: 200 },
      )
    }

    // =========================================================================
    // DRY-RUN PATH
    // =========================================================================
    let parsed: ParsedAction
    try {
      parsed = await callDeepSeek(message)
    } catch (e) {
      const msg = (e as Error).message
      if (msg.startsWith('DeepSeek')) return Response.json({ error: msg }, { status: 500 })
      return Response.json({ error: `DeepSeek call failed: ${msg}` }, { status: 500 })
    }

    console.log('[agent] DeepSeek parsed action:', JSON.stringify(parsed))

    if (parsed.action === 'unknown')
      return Response.json({ error: parsed.reason || 'Unknown command' }, { status: 400 })

    // Hard guard: link_image without a real mediaId is a DeepSeek misfire
    if (parsed.action === 'link_image' && !mediaId) {
      return Response.json(
        {
          error: "I couldn't determine what you'd like to change. Could you rephrase your request?",
        },
        { status: 400 },
      )
    }

    // Inject mediaId from request body — DeepSeek never handles it
    if (mediaId && parsed.action === 'link_image') {
      parsed.mediaId = mediaId
    }

    // For create actions that support images, inject the mediaId into
    // parsed.fields so it flows through initCreateFlow → collected → POST body.
    // DeepSeek must never extract or guess the image field — it is always
    // system-injected here.
    if (
      mediaId &&
      (parsed.action === 'add_testimonial' || parsed.action === 'add_portfolio_item')
    ) {
      if (!parsed.fields) parsed.fields = {}
      parsed.fields.image = mediaId
    }

    console.log('[agent] after mediaId injection:', JSON.stringify(parsed))

    // If link_image has no resolved id yet, trigger record selection first
    if (parsed.action === 'link_image' && !parsed.id) {
      const records = await fetchTenantRecords(
        parsed.collection as 'testimonials' | 'portfolio-items',
        tenantId,
        token,
      )
      return Response.json({ status: 'needs_selection', collection: parsed.collection, records })
    }

    if (parsed.action === 'update_post_title' || parsed.action === 'update_page_title')
      return handlePosts(parsed, tenantId, token, false)

    const dryRunHandler = DRY_RUN[parsed.action]
    if (dryRunHandler) return dryRunHandler(parsed, tenantId, token)

    return Response.json({ error: `Action "${parsed.action}" is not supported` }, { status: 400 })
  } catch (e) {
    return Response.json(
      { error: `Internal server error: ${(e as Error).message}` },
      { status: 500 },
    )
  }
}
