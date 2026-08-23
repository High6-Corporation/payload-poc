import type {
  CollectionAfterChangeHook,
  CollectionAfterDeleteHook,
  PayloadRequest,
} from 'payload'

export type ChangeLogSource = 'admin' | 'api' | 'agent' | 'public' | 'system'

export interface ChangeLogRow {
  fieldPath: string | null
  previousValue: unknown
  newValue: unknown
}

const DEFAULT_EXCLUDED = new Set(['id', 'createdAt', 'updatedAt'])

/** Matches the `json` field type expected by the change-log collection. */
type JsonFieldValue =
  | string
  | number
  | boolean
  | unknown[]
  | { [k: string]: unknown }
  | null
  | undefined

const asJsonField = (v: unknown): JsonFieldValue =>
  (v === undefined || v === null ? null : v) as JsonFieldValue

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * Canonical JSON comparison — sorts object keys so key order differences
 * (admin payload vs stored doc) don't produce false-positive diffs.
 */
const stableStringify = (value: unknown): string => {
  if (value === null || value === undefined) return 'null'
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (isPlainObject(value)) {
    const entries = Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`)
    return `{${entries.join(',')}}`
  }
  return JSON.stringify(value)
}

/**
 * Path exclusion matches the exact path OR any suffix segment — so
 * 'apiKey' excludes both bare `apiKey` and nested `smtp.apiKey`.
 */
export function isExcludedPath(path: string, excludedPaths: string[]): boolean {
  return excludedPaths.some((p) => path === p || path.endsWith(`.${p}`))
}

/** Recursively remove excluded keys from any value before it is stored. */
export function stripSensitive(value: unknown, excludedPaths: string[]): unknown {
  if (Array.isArray(value)) return value.map((v) => stripSensitive(v, excludedPaths))
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      if (isExcludedPath(k, excludedPaths)) continue
      out[k] = stripSensitive(v, excludedPaths)
    }
    return out
  }
  return value
}

/**
 * Field-level diff between the stored doc and the saved doc.
 * Recurses into plain-object values (Payload tabs/groups store nested);
 * arrays and other non-plain values compare as a whole.
 */
export function diffFields(
  prev: Record<string, unknown>,
  next: Record<string, unknown>,
  excludedPaths: string[] = [],
  parentPath = '',
): ChangeLogRow[] {
  const keys = new Set([...Object.keys(prev ?? {}), ...Object.keys(next ?? {})])
  const rows: ChangeLogRow[] = []
  for (const key of keys) {
    if (DEFAULT_EXCLUDED.has(key)) continue
    const path = parentPath ? `${parentPath}.${key}` : key
    if (isExcludedPath(path, excludedPaths)) continue
    const pv = prev?.[key]
    const nv = next?.[key]
    if (isPlainObject(pv) && isPlainObject(nv)) {
      rows.push(...diffFields(pv, nv, excludedPaths, path))
    } else if (stableStringify(pv) !== stableStringify(nv)) {
      rows.push({
        fieldPath: path,
        previousValue: stripSensitive(pv, excludedPaths),
        newValue: stripSensitive(nv, excludedPaths),
      })
    }
  }
  return rows
}

/** v1 source detection — see the change-log collection's source field description. */
export function getChangeLogSource(req: PayloadRequest): ChangeLogSource {
  if (req.payloadAPI === 'local') return 'system'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const user = req.user as any
  if (!user) return 'public'
  const agentEmail = process.env.AGENT_EMAIL
  if (agentEmail && user.email === agentEmail) return 'agent'
  return 'admin'
}

const idOf = (v: unknown): string | null => {
  if (typeof v === 'string' && v) return v
  if (isPlainObject(v) && typeof v.id === 'string') return v.id
  return null
}

export function getTenantAndSite(
  slug: string,
  doc: Record<string, unknown>,
): { tenant: string | null; site: string | null } {
  switch (slug) {
    case 'tenants':
      // The doc IS the tenant
      return { tenant: typeof doc.id === 'string' ? doc.id : null, site: null }
    case 'sites':
      return { tenant: idOf(doc.tenant), site: typeof doc.id === 'string' ? doc.id : null }
    case 'smtp-settings':
      return { tenant: idOf(doc.tenant), site: idOf(doc.site) }
    case 'users':
      // Cross-tenant — the interesting diff (tenants array) is captured via fieldPath
      return { tenant: null, site: null }
    default:
      return { tenant: null, site: null }
  }
}

/**
 * Write change-log rows. Failures are logged and swallowed — audit capture
 * must never break the primary operation.
 */
async function writeChangeLogRows(
  req: PayloadRequest,
  slug: string,
  doc: Record<string, unknown>,
  operation: 'create' | 'update' | 'delete',
  rows: ChangeLogRow[],
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const user = req.user as any
  const { tenant, site } = getTenantAndSite(slug, doc)
  const base = {
    collectionSlug: slug,
    docId: String(doc.id),
    operation,
    actor: user?.id ?? null,
    actorRole: user?.roles?.length ? user.roles.join(',') : null,
    source: getChangeLogSource(req),
    tenant,
    site,
  }

  for (const row of rows) {
    try {
      await req.payload.create({
        collection: 'change-log',
        data: {
          ...base,
          fieldPath: row.fieldPath,
          previousValue: asJsonField(row.previousValue),
          newValue: asJsonField(row.newValue),
        },
        overrideAccess: true,
        context: { _changeLogWrite: true },
        req,
      })
    } catch (err) {
      console.error(`[change-log] failed to write row for ${slug}/${doc.id}:`, err)
    }
  }
}

export function buildChangeLogHooks(options: { excludedPaths?: string[] } = {}): {
  afterChange: CollectionAfterChangeHook
  afterDelete: CollectionAfterDeleteHook
} {
  const excludedPaths = options.excludedPaths ?? []

  const afterChange: CollectionAfterChangeHook = async ({
    collection,
    doc,
    previousDoc,
    operation,
    req,
    context,
  }) => {
    // Opt-out for bulk/system flows (seed) + re-entry guard
    if (context?.skipChangeLog || context?._changeLogWrite) return doc

    let rows: ChangeLogRow[]
    if (operation === 'create' || !previousDoc) {
      rows = [
        {
          fieldPath: null,
          previousValue: null,
          newValue: stripSensitive(doc, excludedPaths),
        },
      ]
    } else {
      rows = diffFields(previousDoc, doc, excludedPaths)
    }

    if (rows.length > 0) {
      await writeChangeLogRows(req, collection.slug, doc, 'update', rows)
    }
    return doc
  }

  const afterDelete: CollectionAfterDeleteHook = async ({
    collection,
    doc,
    req,
    context,
  }) => {
    if (context?.skipChangeLog || context?._changeLogWrite) return doc
    await writeChangeLogRows(req, collection.slug, doc, 'delete', [
      {
        fieldPath: null,
        previousValue: stripSensitive(doc, excludedPaths),
        newValue: null,
      },
    ])
    return doc
  }

  return { afterChange, afterDelete }
}
