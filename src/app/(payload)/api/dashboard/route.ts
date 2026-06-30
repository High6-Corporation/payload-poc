import { getPayload } from 'payload'
import config from '@payload-config'
import { headers } from 'next/headers'

export const maxDuration = 30 // seconds

export interface DashboardResponse {
  tenants: number
  sites: number
  collections: number
}

export async function GET(): Promise<Response> {
  const payload = await getPayload({ config })
  const requestHeaders = await headers()

  // Authenticate via Payload admin session
  const { user } = await payload.auth({ headers: requestHeaders })

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── Tenants count ────────────────────────────────────
  const tenantsResult = await payload.count({ collection: 'tenants' })

  // ── Sites count ──────────────────────────────────────
  const sitesResult = await payload.count({ collection: 'sites' })

  // ── Collections count (from live Payload instance) ───
  // payload.collections is a Record keyed by slug; includes plugin-
  // added collections (forms, redirects, search, etc.).
  const collectionsCount = Object.keys(payload.collections).length

  const data: DashboardResponse = {
    tenants: tenantsResult.totalDocs,
    sites: sitesResult.totalDocs,
    collections: collectionsCount,
  }

  return Response.json(data)
}
