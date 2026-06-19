/**
 * Agent API Route — POST /api/agent
 *
 * Accepts plain-language commands scoped to a tenant, parses them via DeepSeek,
 * and executes the resulting CMS action against the Payload REST API.
 *
 * Guardrails (enforced in this handler):
 *   - Allowed mutations:  post titles, page titles only
 *   - Allowed reads:      tenant resolution, slug→ID lookups (posts & pages)
 *   - Forbidden:          delete, tenant reassignment, media, any other collection
 */

import { resolveTenantIdFromSlug } from '@/utilities/resolveTenant'
import { getAgentToken, clearAgentToken } from '@/utilities/payloadAuth'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEEPSEEK_BASE_URL = 'https://api.deepseek.com'
const DEEPSEEK_MODEL = 'deepseek-chat'

const SYSTEM_PROMPT = `You are an agent that controls a CMS via API calls.
You will receive a plain-language command and must respond ONLY with a JSON object —
no explanation, no markdown, no backticks.

Allowed actions:
- Update the title of a post: { "action": "update_post_title", "slug": "<post-slug>", "value": "<new-title>" }
- Update the title of a page: { "action": "update_page_title", "slug": "<page-slug>", "value": "<new-title>" }

If the command does not match a supported action, respond with:
{ "action": "unknown", "reason": "<brief explanation>" }`

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getServerURL(): string {
  return process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'
}

interface ParsedAction {
  action: string
  slug?: string
  value?: string
  reason?: string
}

function isParsedAction(v: unknown): v is ParsedAction {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return typeof o.action === 'string'
}

/** Resolve a post slug to a document ID, scoped to a tenant. Returns null if not found. */
async function resolveSlugToId(
  collection: 'posts' | 'pages',
  slug: string,
  tenantId: string,
  token: string,
): Promise<string | null> {
  const baseUrl = getServerURL()
  const params = new URLSearchParams({
    [`where[slug][equals]`]: slug,
    [`where[tenant][equals]`]: tenantId,
  })

  const res = await fetch(`${baseUrl}/api/${collection}?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!res.ok) return null

  const data = await res.json()
  const docs: Array<{ id: string }> = data?.docs ?? []

  // Must be exactly one match
  if (docs.length !== 1) return null

  return docs[0].id
}

/** Patch the title of a document in a collection. Returns the response for 401 inspection. */
async function patchTitle(
  collection: 'posts' | 'pages',
  id: string,
  title: string,
  token: string,
): Promise<{ ok: boolean; status: number; data: { id: string; title: string } }> {
  const baseUrl = getServerURL()
  const res = await fetch(`${baseUrl}/api/${collection}/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ title }),
  })

  const data = await res.json().catch(() => null)
  return { ok: res.ok, status: res.status, data }
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function POST(request: Request): Promise<Response> {
  try {
    // --- Parse request body ------------------------------------------------
    let body: { command?: string; tenantSlug?: string }
    try {
      body = await request.json()
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { command, tenantSlug } = body
    if (!command || typeof command !== 'string') {
      return Response.json({ error: 'Missing or invalid "command" field' }, { status: 400 })
    }
    if (!tenantSlug || typeof tenantSlug !== 'string') {
      return Response.json({ error: 'Missing or invalid "tenantSlug" field' }, { status: 400 })
    }

    // --- Step 1: Get agent token -------------------------------------------
    let token: string
    try {
      token = await getAgentToken()
    } catch (e) {
      return Response.json(
        { error: `Authentication failed: ${(e as Error).message}` },
        { status: 500 },
      )
    }

    // --- Step 2: Resolve tenant slug → ID ----------------------------------
    const tenantId = await resolveTenantIdFromSlug(tenantSlug)
    if (!tenantId) {
      return Response.json({ error: 'Unknown tenant' }, { status: 400 })
    }

    // --- Step 3: Call DeepSeek to parse the command ------------------------
    const deepseekKey = process.env.DEEPSEEK_API_KEY
    if (!deepseekKey) {
      return Response.json({ error: 'DEEPSEEK_API_KEY not configured' }, { status: 500 })
    }

    let parsed: ParsedAction
    try {
      const dsRes = await fetch(`${DEEPSEEK_BASE_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${deepseekKey}`,
        },
        body: JSON.stringify({
          model: DEEPSEEK_MODEL,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: command },
          ],
          temperature: 0,
        }),
      })

      if (!dsRes.ok) {
        const errBody = await dsRes.text()
        return Response.json(
          { error: `DeepSeek API error (HTTP ${dsRes.status}): ${errBody}` },
          { status: 500 },
        )
      }

      const dsData = await dsRes.json()
      const raw = dsData?.choices?.[0]?.message?.content ?? ''

      // Strip any backticks or markdown fences the model may have emitted
      const cleaned = raw
        .replace(/```(?:json)?\s*/gi, '')
        .replace(/```/g, '')
        .trim()

      try {
        parsed = JSON.parse(cleaned)
      } catch {
        return Response.json(
          { error: `DeepSeek returned unparseable output: ${raw}` },
          { status: 500 },
        )
      }

      if (!isParsedAction(parsed)) {
        return Response.json(
          { error: `DeepSeek response missing "action" field: ${raw}` },
          { status: 500 },
        )
      }
    } catch (e) {
      return Response.json(
        { error: `DeepSeek call failed: ${(e as Error).message}` },
        { status: 500 },
      )
    }

    // --- Step 4: Dispatch on parsed action ---------------------------------

    if (parsed.action === 'unknown') {
      return Response.json({ error: parsed.reason || 'Unknown command' }, { status: 400 })
    }

    if (parsed.action === 'update_post_title' || parsed.action === 'update_page_title') {
      const collection = parsed.action === 'update_post_title' ? 'posts' : 'pages'

      if (!parsed.slug || !parsed.value) {
        return Response.json(
          { error: `Missing "slug" or "value" for action ${parsed.action}` },
          { status: 400 },
        )
      }

      // Step 5a: Resolve slug → document ID (tenant-scoped)
      const docId = await resolveSlugToId(collection, parsed.slug, tenantId, token)
      if (!docId) {
        return Response.json(
          { error: `${collection === 'posts' ? 'Post' : 'Page'} not found` },
          { status: 404 },
        )
      }

      // Step 5b: Patch the title (retry once on 401 with fresh token)
      let patchResult = await patchTitle(collection, docId, parsed.value, token)

      if (patchResult.status === 401) {
        clearAgentToken()
        try {
          token = await getAgentToken()
        } catch {
          return Response.json(
            { error: 'Token refresh failed after 401 response' },
            { status: 500 },
          )
        }
        patchResult = await patchTitle(collection, docId, parsed.value, token)
        if (patchResult.status === 401) {
          return Response.json(
            { error: 'Authentication failed after token refresh' },
            { status: 500 },
          )
        }
      }

      if (!patchResult.ok || !patchResult.data) {
        return Response.json(
          { error: `PATCH ${collection}/${docId} failed (HTTP ${patchResult.status})` },
          { status: 500 },
        )
      }

      // Step 5c: Return success
      return Response.json(
        { success: true, updated: { id: patchResult.data.id, title: patchResult.data.title } },
        { status: 200 },
      )
    }

    // --- Any other action — reject (guardrail) -----------------------------
    return Response.json({ error: `Action "${parsed.action}" is not supported` }, { status: 400 })
  } catch (e) {
    // --- Unexpected error --------------------------------------------------
    return Response.json(
      { error: `Internal server error: ${(e as Error).message}` },
      { status: 500 },
    )
  }
}
