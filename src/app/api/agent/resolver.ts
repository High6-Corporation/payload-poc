// ---------------------------------------------------------------------------
// Agent API — Record resolution and data access helpers
// ---------------------------------------------------------------------------

import { getServerSideURL } from '@/utilities/getURL'
import { type SelectionRecord } from './types'

function getServerURL(): string {
  return getServerSideURL()
}

// ---------------------------------------------------------------------------
// Single-record operations
// ---------------------------------------------------------------------------

/** Fetch a document by ID from any collection. Returns the parsed JSON doc or null. */
export async function fetchRecordById(
  collection: string,
  id: string,
  token: string,
): Promise<Record<string, unknown> | null> {
  const baseUrl = getServerURL()
  const res = await fetch(`${baseUrl}/api/${collection}/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!res.ok) return null

  const data = await res.json()
  return data ?? null
}

/** Resolve a slug to a document ID, scoped to a tenant. Returns null if not found. */
export async function resolveSlugToId(
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

  if (docs.length !== 1) return null

  return docs[0].id
}

/** Fetch a document by ID and return its title field. Returns null if not found. */
export async function getDocumentTitle(
  collection: 'posts' | 'pages',
  id: string,
  token: string,
): Promise<string | null> {
  const doc = await fetchRecordById(collection, id, token)
  if (!doc) return null
  return ((doc as Record<string, unknown>).title as string | null) ?? null
}

/**
 * Validate that a record in a collection belongs to the given tenant.
 *
 * Scoping chain:
 *   - posts/pages: direct tenant field (from multi-tenant plugin)
 *   - faqs/testimonials/portfolio-items: site.tenant (via Sites collection)
 *
 * Returns the tenant ID that owns the record, or null if it cannot be resolved.
 */
export async function resolveRecordTenant(
  collection: string,
  record: Record<string, unknown>,
  token: string,
): Promise<string | null> {
  const COLLECTIONS_WITH_DIRECT_TENANT = ['posts', 'pages']

  if (COLLECTIONS_WITH_DIRECT_TENANT.includes(collection)) {
    const tenant = record.tenant
    if (typeof tenant === 'string') return tenant
    if (tenant && typeof tenant === 'object' && (tenant as Record<string, unknown>).id) {
      return (tenant as Record<string, unknown>).id as string
    }
    return null
  }

  // For collections scoped via site.tenant
  const site = record.site
  let siteId: string | null = null
  if (typeof site === 'string') {
    siteId = site
  } else if (site && typeof site === 'object' && (site as Record<string, unknown>).id) {
    siteId = (site as Record<string, unknown>).id as string
  }

  if (!siteId) return null

  const siteRecord = await fetchRecordById('sites', siteId, token)
  if (!siteRecord) return null

  const siteTenant = siteRecord.tenant
  if (typeof siteTenant === 'string') return siteTenant
  if (siteTenant && typeof siteTenant === 'object' && (siteTenant as Record<string, unknown>).id) {
    return (siteTenant as Record<string, unknown>).id as string
  }

  return null
}

/** Get a specific field value from a record by field name. */
export function getFieldValue(record: Record<string, unknown>, field: string): string | null {
  const val = record[field]
  if (typeof val === 'string') return val
  return null
}

// ---------------------------------------------------------------------------
// Mutation helpers
// ---------------------------------------------------------------------------

/** Patch a document in a collection. Returns the response for inspection. */
export async function patchRecord(
  collection: string,
  id: string,
  data: Record<string, unknown>,
  token: string,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> | null }> {
  const baseUrl = getServerURL()
  const res = await fetch(`${baseUrl}/api/${collection}/${id}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  })

  const resData = await res.json().catch(() => null)
  return { ok: res.ok, status: res.status, data: resData }
}

/** Patch the title of a document in a collection. Returns the response for 401 inspection. */
export async function patchTitle(
  collection: 'posts' | 'pages',
  id: string,
  title: string,
  token: string,
): Promise<{ ok: boolean; status: number; data: { id: string; title: string } }> {
  const result = await patchRecord(collection, id, { title }, token)
  return {
    ok: result.ok,
    status: result.status,
    data: (result.data as { id: string; title: string }) ?? { id: '', title: '' },
  }
}

// ---------------------------------------------------------------------------
// List / tenant-scoped queries
// ---------------------------------------------------------------------------

/** Fetch tenant-scoped records from a site-scoped collection for list views. */
export async function fetchTenantRecords(
  collection: 'faqs' | 'testimonials' | 'portfolio-items',
  tenantId: string,
  token: string,
): Promise<SelectionRecord[] | null> {
  const baseUrl = getServerURL()

  try {
    // Step 1: get all sites for this tenant
    const sitesRes = await fetch(
      `${baseUrl}/api/sites?where[tenant][equals]=${tenantId}&limit=100`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    if (!sitesRes.ok) return null

    const sitesData = await sitesRes.json()
    const siteIds: string[] = (sitesData?.docs ?? []).map((s: { id: string }) => s.id)
    if (siteIds.length === 0) return []

    // Step 2: query the collection scoped to those sites
    const siteFilter = siteIds.map((id) => `[in]=${id}`).join('&where[site]')
    const url = `${baseUrl}/api/${collection}?where[site]${siteFilter}&limit=50`

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return null

    const data = await res.json()
    const docs: Array<Record<string, unknown>> = data?.docs ?? []

    // Step 3: map to display shape
    return docs.map((doc) => {
      const id = String(doc.id ?? '')
      if (collection === 'faqs') {
        const question = typeof doc.question === 'string' ? doc.question : ''
        const answer = typeof doc.answer === 'string' ? doc.answer : ''
        const answerPreview = answer
          ? answer.length > 80
            ? answer.slice(0, 77) + '...'
            : answer
          : ''
        return {
          id,
          label: question || '(no question)',
          preview: answerPreview ? `"${answerPreview}"` : '',
        }
      }
      if (collection === 'testimonials') {
        const name = typeof doc.name === 'string' ? doc.name : ''
        const quote = typeof doc.quote === 'string' ? doc.quote : ''
        const quotePreview = quote ? (quote.length > 60 ? quote.slice(0, 57) + '...' : quote) : ''
        return {
          id,
          label: name || '(no name)',
          preview: quotePreview ? `"${quotePreview}"` : '',
        }
      }
      // portfolio-items
      const title = typeof doc.title === 'string' ? doc.title : ''
      const category = typeof doc.category === 'string' ? doc.category : ''
      return {
        id,
        label: title || '(no title)',
        preview: category || '(no category)',
      }
    })
  } catch {
    return null
  }
}
