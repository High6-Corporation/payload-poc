import type { Payload } from 'payload'

// ── Types ──────────────────────────────────────────────────

export interface ActivityItem {
  collection: string
  id: string
  title: string
  updatedAt: string
}

export interface ContentStats {
  faqs: number
  testimonials: number
  'portfolio-items': number
  'pricing-plans': number
  posts: number
  pages: number
  forms: number
  'form-submissions': number
}

export interface LastActivityTimestamps {
  [collection: string]: string | null
}

export interface DashboardData {
  stats: ContentStats
  activity: ActivityItem[]
  lastActivity: LastActivityTimestamps
}

// ── TTL Cache ──────────────────────────────────────────────

interface CacheEntry<T> {
  data: T
  timestamp: number
}

const cache = new Map<string, CacheEntry<unknown>>()
const TTL_MS = 60_000 // 60 seconds

function getCached<T>(key: string): T | null {
  const entry = cache.get(key)
  if (!entry) return null
  if (Date.now() - entry.timestamp > TTL_MS) {
    cache.delete(key)
    return null
  }
  return entry.data as T
}

function setCache<T>(key: string, data: T): void {
  cache.set(key, { data, timestamp: Date.now() })
}

// ── Collection groupings ───────────────────────────────────

/** Collections that have an explicit `site` relationship field. */
const SITE_SCOPED_COLLECTIONS = [
  'faqs',
  'testimonials',
  'portfolio-items',
  'pricing-plans',
  'forms',
  'form-submissions',
] as const

/** Collections scoped via the multi-tenant plugin's `tenant` field. */
const TENANT_SCOPED_COLLECTIONS = ['posts', 'pages'] as const

const ALL_ACTIVITY_COLLECTIONS = [
  ...SITE_SCOPED_COLLECTIONS,
  ...TENANT_SCOPED_COLLECTIONS,
]

/**
 * Which field to use for the human-readable title in the activity feed.
 * Matches each collection's `admin.useAsTitle` config.
 */
const DISPLAY_FIELDS: Record<string, string> = {
  faqs: 'question',
  testimonials: 'name',
  'portfolio-items': 'title',
  'pricing-plans': 'label',
  posts: 'title',
  pages: 'title',
  forms: 'title',
  'form-submissions': 'id', // no natural title; fall back to document id
}

// ── Helpers ────────────────────────────────────────────────

/** Resolve a site's tenant ID for tenant-scoped collections. */
async function resolveTenantId(
  payload: Payload,
  siteId: string,
): Promise<string | null> {
  try {
    const site = await payload.findByID({
      collection: 'sites',
      id: siteId,
      depth: 0,
    })
    if (site?.tenant) {
      return typeof site.tenant === 'string'
        ? site.tenant
        : String((site.tenant as { id: string }).id ?? site.tenant)
    }
    return null
  } catch {
    return null
  }
}

/** Extract a display title from a document, falling back to id. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function docTitle(doc: any, collection: string): string {
  const field = DISPLAY_FIELDS[collection] ?? 'id'
  const value = doc[field]
  return value != null ? String(value) : String(doc.id ?? '')
}

// ── A1: Content Stats ──────────────────────────────────────

export async function getContentStats(
  payload: Payload,
  siteId: string,
): Promise<ContentStats> {
  const cacheKey = `stats:${siteId}`
  const cached = getCached<ContentStats>(cacheKey)
  if (cached) return cached

  const tenantId = await resolveTenantId(payload, siteId)

  interface CountResult {
    collection: string
    count: number
  }

  const siteScopedQueries: Promise<CountResult>[] = SITE_SCOPED_COLLECTIONS.map(
    (collection) =>
      payload
        .count({
          collection,
          where: { site: { equals: siteId } },
        })
        .then((r) => ({ collection, count: r.totalDocs }))
        .catch((): CountResult => ({ collection, count: 0 })),
  )

  const tenantScopedQueries: Promise<CountResult>[] = tenantId
    ? TENANT_SCOPED_COLLECTIONS.map((collection) =>
        payload
          .count({
            collection,
            where: { tenant: { equals: tenantId } },
          })
          .then((r) => ({ collection, count: r.totalDocs }))
          .catch((): CountResult => ({ collection, count: 0 })),
      )
    : TENANT_SCOPED_COLLECTIONS.map((collection) =>
        Promise.resolve({ collection, count: 0 }),
      )

  const results = await Promise.all([
    ...siteScopedQueries,
    ...tenantScopedQueries,
  ])

  const stats: Record<string, number> = {
    faqs: 0,
    testimonials: 0,
    'portfolio-items': 0,
    'pricing-plans': 0,
    posts: 0,
    pages: 0,
    forms: 0,
    'form-submissions': 0,
  }

  for (const { collection, count } of results) {
    stats[collection] = count
  }

  const contentStats: ContentStats = {
    faqs: stats.faqs ?? 0,
    testimonials: stats.testimonials ?? 0,
    'portfolio-items': stats['portfolio-items'] ?? 0,
    'pricing-plans': stats['pricing-plans'] ?? 0,
    posts: stats.posts ?? 0,
    pages: stats.pages ?? 0,
    forms: stats.forms ?? 0,
    'form-submissions': stats['form-submissions'] ?? 0,
  }

  setCache(cacheKey, contentStats)
  return contentStats
}

// ── A2: Recent Activity ────────────────────────────────────

export async function getRecentActivity(
  payload: Payload,
  siteId: string,
  limit = 15,
): Promise<ActivityItem[]> {
  const cacheKey = `activity:${siteId}:${limit}`
  const cached = getCached<ActivityItem[]>(cacheKey)
  if (cached) return cached

  const tenantId = await resolveTenantId(payload, siteId)

  const siteQueries = SITE_SCOPED_COLLECTIONS.map((collection) =>
    payload
      .find({
        collection,
        where: { site: { equals: siteId } },
        sort: '-updatedAt',
        limit,
        depth: 0,
      })
      .then((r) =>
        r.docs.map((doc) => ({
          collection,
          id: String(doc.id),
          title: docTitle(doc, collection),
          updatedAt: doc.updatedAt as string,
        })),
      )
      .catch((): ActivityItem[] => []),
  )

  const tenantQueries = tenantId
    ? TENANT_SCOPED_COLLECTIONS.map((collection) =>
        payload
          .find({
            collection,
            where: { tenant: { equals: tenantId } },
            sort: '-updatedAt',
            limit,
            depth: 0,
          })
          .then((r) =>
            r.docs.map((doc) => ({
              collection,
              id: String(doc.id),
              title: docTitle(doc, collection),
              updatedAt: doc.updatedAt as string,
            })),
          )
          .catch((): ActivityItem[] => []),
      )
    : []

  const allResults = await Promise.all([...siteQueries, ...tenantQueries])

  const merged = allResults
    .flat()
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    )
    .slice(0, limit)

  setCache(cacheKey, merged)
  return merged
}

// ── A4: Last Activity Timestamps ───────────────────────────

export async function getLastActivityTimestamps(
  payload: Payload,
  siteId: string,
): Promise<LastActivityTimestamps> {
  // Re-use recent-activity data (already cached) instead of querying again.
  const activities = await getRecentActivity(payload, siteId, 100)

  const timestamps: LastActivityTimestamps = {}
  for (const collection of ALL_ACTIVITY_COLLECTIONS) {
    const latest = activities.find((a) => a.collection === collection)
    timestamps[collection] = latest?.updatedAt ?? null
  }

  return timestamps
}

// ── Convenience: all dashboard data in one call ─────────────

export async function getDashboardData(
  payload: Payload,
  siteId: string,
): Promise<DashboardData> {
  const [stats, activity, lastActivity] = await Promise.all([
    getContentStats(payload, siteId),
    getRecentActivity(payload, siteId),
    getLastActivityTimestamps(payload, siteId),
  ])

  return { stats, activity, lastActivity }
}
