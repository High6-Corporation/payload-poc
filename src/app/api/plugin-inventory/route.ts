import { getPayload } from 'payload'
import config from '@payload-config'
import { headers } from 'next/headers'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { PLUGIN_PURPOSES, type PluginPurpose } from '../../../../docs/payload/plugin-purposes'

export const maxDuration = 30 // seconds

// ---------------------------------------------------------------------------
// Plugin inventory endpoint — super-admin only.
//
// Reads the REAL installed version of every Payload-related package from its
// own package.json in node_modules (not the semver range in the root
// package.json), cross-references the plugins/editor wiring in
// payload.config.ts + src/plugins/index.ts, and checks the npm registry for
// the latest published version with a 6–24h file cache.
//
// Reporting follows `npm outdated` semantics — three version columns:
//   Installed — the version actually on disk (node_modules/<pkg>/package.json)
//   Wanted    — highest version satisfying THIS project's package.json range
//   Latest    — the registry's `latest` dist-tag
// plus a status that distinguishes a MAJOR jump (breaking-change risk) from
// a minor/patch bump (routine).  An exact pin (e.g. "3.85.1") therefore
// reports "Update available — pinned" rather than pretending the project is
// silently out of date.
//
// The role gate here is the enforcement point — the admin view and nav link
// are just UI. A tenant-admin hitting this route directly gets 403.
// ---------------------------------------------------------------------------

const PROJECT_ROOT = path.resolve(process.cwd())
const CACHE_DIR = path.join(PROJECT_ROOT, 'node_modules', '.cache')
const CACHE_FILE = path.join(CACHE_DIR, 'plugin-inventory-registry.json')
const REGISTRY_BASE = 'https://registry.npmjs.org'

/** Config files whose Payload package imports count as "wired into the app". */
const CONFIG_FILES = [
  'src/payload.config.ts',
  'src/plugins/index.ts',
  'src/fields/defaultLexical.ts',
]

const DEFAULT_CACHE_TTL_HOURS = 12
const MIN_TTL_HOURS = 6
const MAX_TTL_HOURS = 24

function getCacheTtlHours(): number {
  const raw = Number(process.env.PLUGIN_INVENTORY_CACHE_TTL_HOURS)
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_CACHE_TTL_HOURS
  return Math.min(MAX_TTL_HOURS, Math.max(MIN_TTL_HOURS, raw))
}

type RegistryCacheEntry = { latest: string; checkedAt: number; versions?: string[] }
type RegistryCache = Record<string, RegistryCacheEntry>

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as T
  } catch {
    return null
  }
}

async function readRegistryCache(): Promise<RegistryCache> {
  return (await readJson<RegistryCache>(CACHE_FILE)) ?? {}
}

async function writeRegistryCache(cache: RegistryCache): Promise<void> {
  try {
    await mkdir(CACHE_DIR, { recursive: true })
    await writeFile(CACHE_FILE, JSON.stringify(cache), 'utf8')
  } catch {
    // Cache writes are best-effort — a full registry re-fetch is only slower.
  }
}

function parseVersion(version: string): number[] {
  return version
    .split('.')
    .slice(0, 3)
    .map((n) => parseInt(n, 10) || 0)
}

/** Compare two exact semver strings ("3.85.1"). Returns >0 if a is newer than b. */
function compareVersions(a: string, b: string): number {
  const [pa, pb] = [parseVersion(a), parseVersion(b)]
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i]
  }
  return 0
}

/**
 * Minimal semver range matcher — covers the range forms present in this
 * project's package.json: exact pins ("3.85.1"), caret ("^3.85.1"), and
 * tilde ("~3.85.1"). `*` / empty means "anything". Anything else falls back
 * to exact-match comparison (the safe failure mode for a reporting view).
 */
function satisfiesRange(version: string, range: string): boolean {
  const v = parseVersion(version)
  const r = range.trim()
  if (!r || r === '*' || r === 'latest') return true
  if (r.startsWith('^')) {
    const base = parseVersion(r.slice(1))
    return v[0] === base[0] && compareVersions(version, r.slice(1)) >= 0
  }
  if (r.startsWith('~')) {
    const base = parseVersion(r.slice(1))
    return v[0] === base[0] && v[1] === base[1] && compareVersions(version, r.slice(1)) >= 0
  }
  return version === r
}

/** Is this a bare exact pin (no ^, ~, *, or comparison operators)? */
function isExactRange(range: string): boolean {
  return /^\d+(\.\d+){0,2}$/.test(range.trim())
}

async function fetchLatest(name: string): Promise<string | null> {
  const res = await fetch(`${REGISTRY_BASE}/${name}/latest`, {
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) return null
  const data = (await res.json()) as { version?: string }
  return data.version ?? null
}

/** Full packument versions list — only fetched when a non-exact range needs it. */
async function fetchVersionsList(name: string): Promise<string[] | null> {
  const res = await fetch(`${REGISTRY_BASE}/${name}`, {
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) return null
  const data = (await res.json()) as { versions?: Record<string, unknown> }
  const versions = Object.keys(data.versions ?? {})
  versions.sort(compareVersions)
  return versions.length ? versions : null
}

/**
 * Highest published version satisfying the project's package.json range.
 * For exact pins this is trivially the pin itself. For caret/tilde ranges
 * the `latest` dist-tag usually satisfies the range (same major); the full
 * versions list is only fetched when it does not (e.g. latest went 4.x).
 */
function computeWanted(
  range: string,
  latest: string | null,
  allVersions?: string[] | null,
): string | null {
  if (!range) return null
  if (isExactRange(range)) return range
  if (!latest) return null
  if (satisfiesRange(latest, range)) return latest
  if (allVersions?.length) {
    const satisfying = allVersions.filter((v) => satisfiesRange(v, range))
    if (satisfying.length) return satisfying[satisfying.length - 1]
  }
  return null
}

/** Extract the set of Payload package names imported by the wiring config files. */
async function configuredPackages(): Promise<Set<string>> {
  const found = new Set<string>()
  for (const file of CONFIG_FILES) {
    let source: string
    try {
      source = await readFile(path.join(PROJECT_ROOT, file), 'utf8')
    } catch {
      continue
    }
    // Package ROOT only — subpath imports (e.g. @payloadcms/plugin-seo/types)
    // normalize to the package name.
    for (const match of source.matchAll(/from\s+['"](@payloadcms\/[^/'"]+|payload)['"]/g)) {
      found.add(match[1])
    }
  }
  return found
}

export type UpdateStatus = 'current' | 'minor-update' | 'major-update' | 'unknown'
export type RangeStatus = 'in-range' | 'pinned' | 'outside-range' | null

export interface InventoryRow {
  name: string
  category: PluginPurpose['category'] | 'unknown'
  wiring: PluginPurpose['wiring'] | 'undocumented'
  active: boolean
  /** package.json range spec (dependencies ∪ devDependencies) */
  range: string | null
  installed: string | null
  /** highest version satisfying `range` */
  wanted: string | null
  latest: string | null
  updateStatus: UpdateStatus
  /** null unless an update exists — is it within the declared range? */
  rangeStatus: RangeStatus
  updateAvailable: boolean
  /** major(installed) < major(latest) — breaking-change risk */
  majorUpdate: boolean
  registryCacheHit: boolean | null
  purpose: string | null
  addedBecause: string | null
}

export async function GET(request: Request): Promise<Response> {
  const payload = await getPayload({ config })
  const requestHeaders = await headers()

  // ---- Role gate: super-admin only (the enforcement point) ----
  const { user } = await payload.auth({ headers: requestHeaders })
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!((user as any)?.roles as string[] | undefined)?.includes('super-admin')) {
    return Response.json({ error: 'Forbidden: super-admin access required' }, { status: 403 })
  }

  // ---- Enumerate Payload-related packages from the root package.json ----
  const rootPkg = await readJson<{
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }>(path.join(PROJECT_ROOT, 'package.json'))
  const allDeps = { ...(rootPkg?.dependencies ?? {}), ...(rootPkg?.devDependencies ?? {}) }
  const payloadPackages = Object.keys(allDeps).filter(
    (name) => name === 'payload' || name.startsWith('@payloadcms/'),
  )

  // ---- Installed versions: each package's own package.json in node_modules ----
  const installedVersions = new Map<string, string | null>()
  await Promise.all(
    payloadPackages.map(async (name) => {
      const pkg = await readJson<{ version?: string }>(
        path.join(PROJECT_ROOT, 'node_modules', name, 'package.json'),
      )
      installedVersions.set(name, pkg?.version ?? null)
    }),
  )

  // ---- Registry latest, with the 6–24h file cache ----
  const ttlHours = getCacheTtlHours()
  const ttlMs = ttlHours * 60 * 60 * 1000
  const cache = await readRegistryCache()
  const now = Date.now()
  const latestVersions = new Map<string, string | null>()
  const cacheHits = new Map<string, boolean>()
  const results = await Promise.allSettled(
    payloadPackages.map(async (name) => {
      const cached = cache[name]
      if (cached && now - cached.checkedAt < ttlMs) {
        latestVersions.set(name, cached.latest)
        cacheHits.set(name, true)
        return
      }
      const latest = await fetchLatest(name)
      latestVersions.set(name, latest)
      cacheHits.set(name, false)
      if (latest) cache[name] = { latest, checkedAt: now }
    }),
  )
  await writeRegistryCache(cache)

  // ---- Cross-reference the wiring config files ----
  const configured = await configuredPackages()

  // ---- npm-outdated style rows: Installed / Wanted / Latest + status ----
  const undocumented: string[] = []
  const rows: InventoryRow[] = []
  for (const name of payloadPackages) {
    const annotation = PLUGIN_PURPOSES[name]
    if (!annotation) undocumented.push(name)

    const range = allDeps[name] ?? null
    const installed = installedVersions.get(name) ?? null
    const latest = latestVersions.get(name) ?? null

    // Non-exact ranges may need the full versions list when `latest` has
    // moved beyond the range's major (e.g. 4.x published, project on ^3.x).
    let allVersions: string[] | null = null
    if (range && !isExactRange(range) && latest && !satisfiesRange(latest, range)) {
      const cached = cache[name]?.versions
      allVersions = cached ?? (await fetchVersionsList(name))
      if (allVersions && !cached) cache[name] = { ...(cache[name] ?? {}), versions: allVersions }
    }
    const wanted = computeWanted(range ?? '', latest, allVersions)

    let updateStatus: UpdateStatus = 'unknown'
    let rangeStatus: RangeStatus = null
    let updateAvailable = false
    let majorUpdate = false
    if (installed && latest) {
      const diff = compareVersions(latest, installed)
      updateAvailable = diff > 0
      majorUpdate = parseVersion(latest)[0] > parseVersion(installed)[0]
      if (diff <= 0) {
        updateStatus = 'current'
      } else if (majorUpdate) {
        updateStatus = 'major-update'
        rangeStatus = wanted && wanted !== installed ? 'in-range' : 'outside-range'
      } else {
        updateStatus = 'minor-update'
        if (wanted && wanted !== installed) {
          rangeStatus = 'in-range'
        } else if (isExactRange(range ?? '')) {
          rangeStatus = 'pinned'
        } else {
          rangeStatus = 'outside-range'
        }
      }
    }

    rows.push({
      name,
      category: annotation?.category ?? 'unknown',
      wiring: annotation?.wiring ?? 'undocumented',
      active: annotation ? annotation.wiring !== 'unused' : false,
      range,
      installed,
      wanted,
      latest,
      updateStatus,
      rangeStatus,
      updateAvailable,
      majorUpdate,
      registryCacheHit: latest ? (cacheHits.get(name) ?? null) : null,
      purpose: annotation?.purpose ?? null,
      addedBecause: annotation?.addedBecause ?? null,
    })
  }

  // Every @payloadcms/* package wired into the config must have an annotation.
  const unconfigured: string[] = [...configured].filter((name) => !PLUGIN_PURPOSES[name])

  // Payload core pinned to the top row; then plugins, core, infrastructure, unknown.
  const categoryOrder: Record<InventoryRow['category'], number> = {
    plugin: 0,
    core: 1,
    infrastructure: 2,
    unknown: 3,
  }
  rows.sort((a, b) => {
    if (a.name === 'payload') return -1
    if (b.name === 'payload') return 1
    if (categoryOrder[a.category] !== categoryOrder[b.category]) {
      return categoryOrder[a.category] - categoryOrder[b.category]
    }
    return a.name.localeCompare(b.name)
  })

  return Response.json({
    generatedAt: new Date().toISOString(),
    registryCache: { ttlHours, entries: Object.keys(cache).length },
    registryErrors: results.filter((r) => r.status === 'rejected').length,
    rows,
    flags: { undocumented, unconfigured },
  })
}
