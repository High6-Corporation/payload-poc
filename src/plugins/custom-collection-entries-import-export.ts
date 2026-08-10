import type { PayloadRequest } from 'payload'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const OBJECT_ID_RE = /^[a-f0-9]{24}$/i

interface SchemaField {
  name: string
  type: string
}

async function resolveSiteId(value: string, req: PayloadRequest): Promise<string | null> {
  if (OBJECT_ID_RE.test(value)) {
    try {
      await req.payload.findByID({ collection: 'sites', id: value, req, depth: 0 })
      return value
    } catch {
      /* fall through to slug lookup */
    }
  }
  try {
    const { docs } = await req.payload.find({
      collection: 'sites',
      where: { slug: { equals: value } },
      limit: 1,
      req,
    })
    return (docs[0]?.id as string) ?? null
  } catch {
    return null
  }
}

async function resolveCollectionId(value: string, req: PayloadRequest): Promise<string | null> {
  if (OBJECT_ID_RE.test(value)) {
    try {
      await req.payload.findByID({ collection: 'custom-collections', id: value, req, depth: 0 })
      return value
    } catch {
      /* fall through */
    }
  }
  try {
    const { docs } = await req.payload.find({
      collection: 'custom-collections',
      where: { slug: { equals: value } },
      limit: 1,
      req,
    })
    return (docs[0]?.id as string) ?? null
  } catch {
    return null
  }
}

async function mediaExists(id: string, req: PayloadRequest): Promise<boolean> {
  try {
    await req.payload.findByID({ collection: 'media', id, req, depth: 0 })
    return true
  } catch {
    return false
  }
}

async function fetchSchema(collectionId: string, req: PayloadRequest): Promise<SchemaField[]> {
  try {
    const coll = await req.payload.findByID({
      collection: 'custom-collections',
      id: collectionId,
      req,
      depth: 0,
    })
    return Array.isArray(coll?.fields) ? (coll.fields as SchemaField[]) : []
  } catch {
    return []
  }
}

async function isDuplicate(
  title: string,
  parentCollectionId: string,
  siteId: string,
  req: PayloadRequest,
): Promise<boolean> {
  try {
    const { docs } = await req.payload.find({
      collection: 'custom-collection-entries',
      where: {
        and: [
          { title: { equals: title } },
          { parentCollection: { equals: parentCollectionId } },
          { site: { equals: siteId } },
        ],
      },
      limit: 1,
      req,
    })
    return docs.length > 0
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Batch name resolution (media filenames + category titles)
// ---------------------------------------------------------------------------

async function buildRefNameMap(
  ids: Set<string>,
  req: PayloadRequest,
): Promise<Record<string, string>> {
  const map: Record<string, string> = {}
  const idList = [...ids]
  if (idList.length === 0) return map

  // Media first
  try {
    const { docs } = await req.payload.find({
      collection: 'media',
      where: { id: { in: idList } },
      limit: idList.length,
      req,
    })
    for (const doc of docs) {
      map[doc.id as string] = (doc.filename as string) || (doc.id as string)
    }
  } catch {
    /* leave unresolved */
  }

  // Categories for remaining
  const unresolved = idList.filter((id) => !map[id])
  if (unresolved.length > 0) {
    try {
      const { docs } = await req.payload.find({
        collection: 'categories',
        where: { id: { in: unresolved } },
        limit: unresolved.length,
        req,
      })
      for (const doc of docs) {
        map[doc.id as string] = (doc.title as string) || (doc.id as string)
      }
    } catch {
      /* leave unresolved */
    }
  }

  return map
}

// ---------------------------------------------------------------------------
// Export hook
// ---------------------------------------------------------------------------

/**
 * Transforms export rows so the CSV is human-readable and doubles as an
 * import template:
 *
 * 1. Flattens `data` JSON blob → `data_<key>` columns (the plugin treats
 *    `json` type fields as opaque — admins can't read a JSON string in a
 *    spreadsheet).
 * 2. Resolves `site` ID → slug, `parentCollection` ID → slug.
 * 3. Resolves media IDs → filenames and category IDs → titles inside
 *    `data_*` columns so the spreadsheet shows names, not ObjectIDs.
 * 4. Ensures `parentCollection` is always present (pulls from originalData
 *    when the export fields UI omitted it).
 * 5. Strips internal columns (`id`, `tenant`, `updatedAt`, `createdAt`).
 *
 * All ID→name lookups are batched — one query per entity type regardless of
 * row count.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const entryExportHook = async (args: any): Promise<Record<string, unknown>[]> => {
  const data = args.data as Record<string, unknown>[]
  const originalData = args.originalData as Record<string, unknown>[]
  const req = args.req as PayloadRequest
  if (data.length === 0) return data

  // ---- Phase 1: flatten every row, collect all IDs ----

  const siteIds = new Set<string>()
  const collectionIds = new Set<string>()
  const refIds = new Set<string>()
  const flatRows: Record<string, unknown>[] = []

  for (let i = 0; i < data.length; i++) {
    const row = data[i]
    const orig = originalData[i] as Record<string, unknown> | undefined
    const out: Record<string, unknown> = {}

    // Copy non-internal, non-data fields
    for (const [key, value] of Object.entries(row)) {
      if (key === 'id' || key === 'tenant' || key === 'updatedAt' || key === 'createdAt') continue
      if (key === 'data') continue
      out[key] = value
    }

    // --- Collect site & parentCollection IDs ---
    const s = out.site ?? orig?.site
    const c = out.parentCollection ?? orig?.parentCollection

    if (typeof s === 'string' && s.length > 0) siteIds.add(s)
    else if (s && typeof s === 'object') {
      const sid = (s as Record<string, unknown>).id as string | undefined
      if (sid) siteIds.add(sid)
    }

    if (typeof c === 'string' && c.length > 0) collectionIds.add(c)
    else if (c && typeof c === 'object') {
      const cid = (c as Record<string, unknown>).id as string | undefined
      if (cid) collectionIds.add(cid)
    }

    // Ensure parentCollection is present
    if (!out.parentCollection && orig) {
      const oc = orig.parentCollection
      if (typeof oc === 'string') out.parentCollection = oc
      else if (oc && typeof oc === 'object') {
        const p = oc as Record<string, unknown>
        out.parentCollection = (p.slug as string) || (p.id as string) || ''
      }
    }

    // --- Flatten data JSON → data_* columns ---
    let obj: Record<string, unknown> | null = null
    const raw = row.data

    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      obj = raw as Record<string, unknown>
    } else if (typeof raw === 'string' && raw.length > 0) {
      try {
        const p = JSON.parse(raw)
        if (p && typeof p === 'object' && !Array.isArray(p)) obj = p
      } catch {
        /* not JSON — skip */
      }
    }

    if (obj) {
      for (const [k, v] of Object.entries(obj)) {
        if (Array.isArray(v)) {
          out[`data_${k}`] = v.join(',')
          for (const item of v) {
            if (typeof item === 'string' && OBJECT_ID_RE.test(item)) refIds.add(item)
          }
        } else if (v === null || v === undefined) {
          out[`data_${k}`] = ''
        } else if (typeof v === 'object') {
          out[`data_${k}`] = JSON.stringify(v)
        } else {
          const sv = String(v)
          out[`data_${k}`] = sv
          if (OBJECT_ID_RE.test(sv)) refIds.add(sv)
        }
      }
    }

    flatRows.push(out)
  }

  // ---- Phase 2: batch-resolve all IDs → human-readable names ----

  const siteSlugMap: Record<string, string> = {}
  const collectionSlugMap: Record<string, string> = {}
  let refNameMap: Record<string, string> = {}

  if (siteIds.size > 0) {
    try {
      const { docs } = await req.payload.find({
        collection: 'sites',
        where: { id: { in: [...siteIds] } },
        limit: siteIds.size,
        req,
      })
      for (const doc of docs)
        siteSlugMap[doc.id as string] = (doc.slug as string) || (doc.id as string)
    } catch {
      /* leave as-is */
    }
  }

  if (collectionIds.size > 0) {
    try {
      const { docs } = await req.payload.find({
        collection: 'custom-collections',
        where: { id: { in: [...collectionIds] } },
        limit: collectionIds.size,
        req,
      })
      for (const doc of docs)
        collectionSlugMap[doc.id as string] = (doc.slug as string) || (doc.id as string)
    } catch {
      /* leave as-is */
    }
  }

  if (refIds.size > 0) {
    refNameMap = await buildRefNameMap(refIds, req)
  }

  // ---- Phase 3: apply resolved names to every row ----

  return flatRows.map((out) => {
    if (out.site && typeof out.site === 'string') {
      out.site = siteSlugMap[out.site] || out.site
    }
    if (out.parentCollection && typeof out.parentCollection === 'string') {
      out.parentCollection = collectionSlugMap[out.parentCollection] || out.parentCollection
    }

    for (const [key, value] of Object.entries(out)) {
      if (!key.startsWith('data_')) continue
      if (typeof value !== 'string' || value.length === 0) continue

      if (value.includes(',')) {
        const resolved = value.split(',').map((p) => {
          const t = p.trim()
          return refNameMap[t] || t
        })
        out[key] = resolved.join(', ')
      } else if (refNameMap[value]) {
        out[key] = refNameMap[value]
      }
    }

    return out
  })
}

// ---------------------------------------------------------------------------
// Import hook
// ---------------------------------------------------------------------------

/**
 * Per-row pre-flight validation and slug→ID resolution for bulk-importing
 * Custom Collection Entries.
 *
 * Runs once per batch BEFORE documents are written.  Handles:
 * 1. Site slug/ID → valid site document ID
 * 2. ParentCollection slug/ID → valid collection document ID
 * 3. Default `data` to {} when missing (field is required)
 * 4. Comma-separated strings → arrays for category/gallery fields
 * 5. Media/gallery ID pre-flight (checks referenced media docs exist)
 * 6. Duplicate detection (same title + parentCollection + site → reject)
 *
 * Rejected rows are removed from the returned array and logged at warn level.
 *
 * Volume assumption: `disableJobsQueue: true` (synchronous).  Each rejected
 * row costs 1–3 extra API calls.  Acceptable at low hundreds; flag for batch
 * optimisation if imports routinely exceed ~500 rows.
 */
export const entryImportHook = async ({
  data,
  req,
}: {
  data: Record<string, unknown>[]
  req: PayloadRequest
}): Promise<Record<string, unknown>[]> => {
  const rejected: Array<{ row: number; reason: string }> = []
  const accepted: typeof data = []

  // ---- Detect preview vs. actual import ----
  // The preview endpoint POSTs to /api/imports/preview-data while the actual
  // import runs via the afterChange hook on a POST /api/imports (create).
  //
  // In preview mode, return the parsed CSV data as-is — no validation, no
  // ID resolution.  This keeps the preview table showing human-readable
  // values (slugs, not ObjectIDs) and avoids hiding rows that would be
  // rejected (duplicates, missing sites, etc.) — a "no data" preview is
  // indistinguishable from a broken upload.
  const isPreview = (req as unknown as { url?: string }).url?.includes('/preview-data') ?? false
  if (isPreview) return data

  // ---- 0. Read target collection from the import form ----
  // The "Import into Custom Collection" dropdown on the import form stores
  // its value on the import document.  Since the hook doesn't receive the
  // import doc ID directly, find the most recent pending import for this
  // collection (safe because disableJobsQueue: true = synchronous).

  let targetCollectionId: string | null = null
  try {
    const { docs } = await req.payload.find({
      collection: 'imports',
      where: {
        and: [
          { collectionSlug: { equals: 'custom-collection-entries' } },
          { status: { equals: 'pending' } },
        ],
      },
      sort: '-createdAt',
      limit: 1,
      req,
    })
    const target = docs[0]?.targetCollection
    if (typeof target === 'string') {
      targetCollectionId = target
    } else if (target && typeof target === 'object') {
      targetCollectionId = ((target as unknown as Record<string, unknown>).id as string) || null
    }
  } catch {
    /* proceed without it */
  }

  for (let i = 0; i < data.length; i++) {
    const row = { ...data[i] }
    const rowNum = i + 1

    // ---- 1. Resolve site (validate slug/ID; mutate only in import mode) ----

    let resolvedSiteId: string | null = null

    if (row.site != null && typeof row.site === 'string' && row.site.length > 0) {
      const resolved = await resolveSiteId(row.site, req)
      if (!resolved) {
        rejected.push({
          row: rowNum,
          reason: `Site '${row.site}' not found — check the slug or provide a valid site ID`,
        })
        continue
      }
      resolvedSiteId = resolved
      row.site = resolved

      // The multi-tenant plugin requires tenant on every entry but does not
      // auto-resolve it from site.  Fetch the site doc to get its tenant.
      if (!row.tenant) {
        try {
          const siteDoc = await req.payload.findByID({
            collection: 'sites',
            id: resolved,
            req,
            depth: 0,
          })
          if (siteDoc?.tenant) {
            row.tenant =
              typeof siteDoc.tenant === 'string'
                ? siteDoc.tenant
                : (siteDoc.tenant as unknown as Record<string, unknown>).id || siteDoc.tenant
          }
        } catch {
          /* proceed — Payload will catch the missing tenant during validation */
        }
      }
    }

    // ---- 2. Resolve parentCollection (validate slug/ID; mutate only in import mode) ----

    let resolvedCollectionId: string | null = null

    if (
      row.parentCollection != null &&
      typeof row.parentCollection === 'string' &&
      row.parentCollection.length > 0
    ) {
      const resolved = await resolveCollectionId(row.parentCollection, req)
      if (!resolved) {
        rejected.push({
          row: rowNum,
          reason: `Collection '${row.parentCollection}' not found — check the slug or provide a valid collection ID`,
        })
        continue
      }
      resolvedCollectionId = resolved
      row.parentCollection = resolved
    } else if (targetCollectionId) {
      // No parentCollection in CSV — fall back to the form's dropdown selection
      row.parentCollection = targetCollectionId
      resolvedCollectionId = targetCollectionId
    }

    // ---- 3. Default data to empty object ----
    // data is required on the collection.  CSV rows without data_* columns
    // need an explicit default so Payload validation passes.

    if (!row.data || typeof row.data !== 'object' || Array.isArray(row.data)) {
      row.data = {}
    }

    // ---- 4. Normalise comma-separated array fields ----
    // The export hook joins array values with commas (data_category: "a,b").
    // unflattenObject sees them as plain strings — split back into arrays.

    if (resolvedCollectionId && row.data && typeof row.data === 'object') {
      const schema = await fetchSchema(resolvedCollectionId, req)
      const dataObj = row.data as Record<string, unknown>

      for (const field of schema) {
        if (field.type !== 'category' && field.type !== 'gallery') continue

        const value = dataObj[field.name]
        if (typeof value === 'string' && value.length > 0) {
          dataObj[field.name] = value
            .split(',')
            .map((v) => v.trim())
            .filter(Boolean)
        }
      }
    }

    // ---- 5. Media pre-flight validation ----

    if (resolvedCollectionId && row.data && typeof row.data === 'object') {
      const schema = await fetchSchema(resolvedCollectionId, req)
      const dataObj = row.data as Record<string, unknown>

      for (const field of schema) {
        if (field.type !== 'media' && field.type !== 'gallery') continue

        const value = dataObj[field.name]
        if (value == null || value === '') continue

        const ids: string[] = Array.isArray(value)
          ? value.filter((item): item is string => typeof item === 'string' && item.length > 0)
          : typeof value === 'string'
            ? [value]
            : []

        let mediaFailed = false
        for (const id of ids) {
          if (!(await mediaExists(id, req))) {
            rejected.push({
              row: rowNum,
              reason: `Media ID '${id}' not found for field '${field.name}'`,
            })
            mediaFailed = true
            break
          }
        }
        if (mediaFailed) continue
      }
    }

    // ---- 6. Duplicate detection ----

    if (row.title && resolvedCollectionId && resolvedSiteId) {
      if (await isDuplicate(row.title as string, resolvedCollectionId, resolvedSiteId, req)) {
        rejected.push({
          row: rowNum,
          reason: `Duplicate — entry '${row.title}' already exists in this collection for this site`,
        })
        continue
      }
    }

    accepted.push(row)
  }

  if (rejected.length > 0) {
    req.payload.logger.warn(
      `[import] custom-collection-entries: ${rejected.length} row(s) rejected out of ${data.length} total`,
    )
    for (const r of rejected) {
      req.payload.logger.warn(`  Row ${r.row}: ${r.reason}`)
    }
  }

  return accepted
}
