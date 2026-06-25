/**
 * Agent Upload API Route — POST /api/agent-upload
 *
 * Phase 5 — Dedicated image upload endpoint for the portal agent.
 *
 * Accepts multipart/form-data with a file and tenantId, forwards the file
 * to Payload's media upload endpoint, and returns the uploaded media's ID and URL.
 *
 * This endpoint is called by the apir-tayo portal proxy (/api/portal/upload)
 * when a portal client attaches an image in the chat.
 */

import { getAgentToken } from '@/utilities/payloadAuth'

function getServerURL(): string {
  return process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'
}

export async function POST(request: Request): Promise<Response> {
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return Response.json({ error: 'Request must be multipart/form-data' }, { status: 400 })
  }

  const file = formData.get('file')
  const tenantId = formData.get('tenantId')

  if (!file || !(file instanceof File)) {
    return Response.json({ error: 'Missing or invalid "file" field' }, { status: 400 })
  }

  if (!tenantId || typeof tenantId !== 'string' || tenantId === 'undefined') {
    return Response.json({ error: 'Missing or invalid "tenantId" field' }, { status: 400 })
  }

  // --- Get agent token ---
  let token: string
  try {
    token = await getAgentToken()
  } catch (e) {
    return Response.json(
      { error: `Authentication failed: ${(e as Error).message}` },
      { status: 500 },
    )
  }

  // --- Forward file to Payload media upload endpoint ---
  const baseUrl = getServerURL()

  // Build a new FormData with the file and tenant fields
  const payloadFormData = new FormData()
  payloadFormData.append('file', file)
  // The multi-tenant plugin resolves the tenant via getTenantFromCookie
  // (looks for "payload-tenant"), so we pass it as a Cookie header.
  // FormData fields like "tenant" are not parsed into args.data during
  // multipart file uploads — only the file binary is extracted.
  payloadFormData.append('tenant', tenantId)

  let uploadRes: Response
  try {
    uploadRes = await fetch(`${baseUrl}/api/media`, {
      method: 'POST',
      headers: {
        Authorization: `JWT ${token}`,
        Cookie: `payload-tenant=${tenantId}`,
        // Do NOT set Content-Type — browser/fetch sets the multipart boundary automatically
      },
      body: payloadFormData,
    })
  } catch (e) {
    return Response.json({ error: `Media upload failed: ${(e as Error).message}` }, { status: 500 })
  }

  if (!uploadRes.ok) {
    const errBody = await uploadRes.text()

    // Try to extract a clean user-facing message from the Payload APIError
    // response.  Payload returns JSON like:
    //   {"errors":[{"message":"File \"x.jpg\" is too large (13.9MB). Maximum allowed size is 5MB."}]}
    let userMessage = ''
    try {
      const parsed = JSON.parse(errBody)
      if (Array.isArray(parsed.errors)) {
        userMessage = parsed.errors
          .map((e: Record<string, unknown>) => e.message as string)
          .filter(Boolean)
          .join('; ')
      }
    } catch {
      // Not JSON — fall through
    }

    return Response.json(
      {
        error: userMessage || `The file could not be uploaded. Please try a different file.`,
      },
      { status: 500 },
    )
  }

  const mediaData = await uploadRes.json()
  const mediaDoc = mediaData?.doc ?? mediaData
  const mediaId: string | undefined = mediaDoc?.id
  const mediaUrl: string | undefined = mediaDoc?.url

  if (!mediaId) {
    return Response.json(
      { error: `Media upload response missing ID: ${JSON.stringify(mediaData)}` },
      { status: 500 },
    )
  }

  // --- Tenant scoping verification ---
  // The Media collection has a tenant field (added by multi-tenant plugin).
  // Verify the uploaded media's tenant matches the provided tenantId.
  try {
    const mediaCheckRes = await fetch(`${baseUrl}/api/media/${mediaId}`, {
      headers: { Authorization: `JWT ${token}` },
    })

    if (mediaCheckRes.ok) {
      const mediaCheckData = await mediaCheckRes.json()
      const mediaTenant = mediaCheckData?.tenant

      let resolvedTenant: string | null = null
      if (typeof mediaTenant === 'string') {
        resolvedTenant = mediaTenant
      } else if (
        mediaTenant &&
        typeof mediaTenant === 'object' &&
        (mediaTenant as Record<string, unknown>).id
      ) {
        resolvedTenant = (mediaTenant as Record<string, unknown>).id as string
      }

      if (resolvedTenant && resolvedTenant !== tenantId) {
        return Response.json(
          { error: 'Access denied: uploaded media belongs to a different tenant' },
          { status: 403 },
        )
      }
    }
    // If the check fails (e.g., the Media collection has no tenant), skip
    // gracefully — this is a safety net, not a hard requirement.
  } catch {
    // Tenant check is best-effort; don't fail the upload over a check error
    console.warn('[agent-upload] Tenant verification check failed, proceeding anyway')
  }

  return Response.json(
    {
      mediaId,
      url: mediaUrl ?? `${baseUrl}/api/media/${mediaId}`,
    },
    { status: 200 },
  )
}
