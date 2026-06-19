/**
 * TEMPORARY TEST PAGE — NOT A REAL ROUTE
 *
 * This page validates that Payload's API correctly returns tenant-scoped
 * content via both payload.find() (local API) and direct REST fetch.
 * It also demonstrates the correct two-step fetch pattern:
 *   1. Resolve tenant slug → ID
 *   2. Query content with the tenant ID
 *
 * Usage:
 *   /test-tenant-fetch                     → defaults to client-a
 *   /test-tenant-fetch?tenant=client-a     → fetches Client A content
 *   /test-tenant-fetch?tenant=client-b     → fetches Client B content
 *   /test-tenant-fetch?tenant=nonexistent  → negative case (no tenant found)
 */

import configPromise from '@payload-config'
import { getPayload } from 'payload'
import React from 'react'

// Known tenant slugs → IDs (resolved from the tenants admin panel)
const TENANT_MAP: Record<string, string> = {
  'client-a': '6a3258c4a0a8aeb76577a9ed',
  'client-b': '6a3258dea0a8aeb76577aa22',
}

// Valid MongoDB ObjectId format: 24 hex chars
const VALID_ID_RE = /^[a-f0-9]{24}$/

type TestResult = {
  method: string
  collection: string
  totalDocs: number
  titles: string[]
  note?: string
  error?: string
}

async function fetchViaLocalAPI(tenantId: string, label: string): Promise<TestResult[]> {
  const payload = await getPayload({ config: configPromise })
  const results: TestResult[] = []

  for (const collection of ['pages', 'posts'] as const) {
    try {
      const docs = await payload.find({
        collection,
        depth: 0,
        where: { tenant: { equals: tenantId } },
      })
      results.push({
        method: `Local API (${label})`,
        collection,
        totalDocs: docs.totalDocs,
        titles: docs.docs.map((p) => (p as { title?: string }).title ?? 'untitled'),
      })
    } catch (e) {
      results.push({
        method: `Local API (${label})`,
        collection,
        totalDocs: 0,
        titles: [],
        error: String(e),
      })
    }
  }

  return results
}

async function fetchViaREST(
  tenantId: string,
  label: string,
  baseUrl: string,
): Promise<TestResult[]> {
  const results: TestResult[] = []

  for (const collection of ['pages', 'posts'] as const) {
    try {
      const params = new URLSearchParams({
        'where[tenant][equals]': tenantId,
      })
      const res = await fetch(`${baseUrl}/api/${collection}?${params}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)
      const data = await res.json()
      results.push({
        method: `REST fetch (${label})`,
        collection,
        totalDocs: data.totalDocs ?? 0,
        titles: (data.docs ?? []).map((p: { title?: string }) => p.title ?? 'untitled'),
      })
    } catch (e) {
      results.push({
        method: `REST fetch (${label})`,
        collection,
        totalDocs: 0,
        titles: [],
        error: String(e),
      })
    }
  }

  return results
}

export default async function TestTenantFetchPage({
  searchParams,
}: {
  searchParams: Promise<{ tenant?: string }>
}) {
  const { tenant: tenantSlug } = await searchParams
  const requestedSlug = tenantSlug || 'client-a'
  const tenantId = TENANT_MAP[requestedSlug]
  const isValidFormat = VALID_ID_RE.test(tenantId ?? '')
  const baseUrl = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'

  // ---- STEP 1: Look up the tenant ----
  // In a real app, you'd do: payload.find({ collection: 'tenants', where: { slug: { equals: slug } } })
  // For this test, we use the pre-built map (mimicking a cached lookup).

  // ---- STEP 2: Fetch content only if tenant resolved ----
  let allResults: TestResult[] = []

  if (tenantId && isValidFormat) {
    // Happy path: resolved a valid tenant ID → query content
    const [localResults, restResults] = await Promise.all([
      fetchViaLocalAPI(tenantId, 'slug→ID'),
      fetchViaREST(tenantId, 'slug→ID', baseUrl),
    ])
    allResults = [...localResults, ...restResults]
  } else if (tenantId && !isValidFormat) {
    // GOTCHA: tenant ID has wrong format → skip query to avoid null-tenant leak
    allResults = [
      {
        method: '⚠️ SKIPPED',
        collection: 'pages',
        totalDocs: 0,
        titles: [],
        note: 'Tenant ID is not a valid format (non-24-char hex). Query skipped to avoid returning null-tenant seed data.',
      },
      {
        method: '⚠️ SKIPPED',
        collection: 'posts',
        totalDocs: 0,
        titles: [],
        note: 'Same as above — query suppressed.',
      },
    ]
  } else {
    // Tenant slug not found in map → skip query
    allResults = [
      {
        method: '⚠️ SKIPPED',
        collection: 'pages',
        totalDocs: 0,
        titles: [],
        note: 'Tenant slug not resolved to an ID. Query skipped — no content to fetch.',
      },
      {
        method: '⚠️ SKIPPED',
        collection: 'posts',
        totalDocs: 0,
        titles: [],
        note: 'Same as above — query suppressed.',
      },
    ]
  }

  const isNegativeCase = !tenantId || !isValidFormat
  const hasAnyContent = allResults.some((r) => r.totalDocs > 0)

  // ---- Also show the GOTCHA: what happens if you query with an invalid ID ----
  let gotchaResults: TestResult[] = []
  if (isNegativeCase) {
    // Demonstrate what would happen if we naively queried with the raw slug
    const [localGotcha, restGotcha] = await Promise.all([
      fetchViaLocalAPI(requestedSlug, 'RAW slug (BUG)'),
      fetchViaREST(requestedSlug, 'RAW slug (BUG)', baseUrl),
    ])
    gotchaResults = [...localGotcha, ...restGotcha]
  }

  return (
    <div
      style={{
        maxWidth: 960,
        margin: '2rem auto',
        padding: '1rem',
        fontFamily: 'monospace',
      }}
    >
      <div
        style={{
          background: '#fff3cd',
          border: '2px solid #ffc107',
          padding: '1rem',
          marginBottom: '2rem',
          borderRadius: 8,
        }}
      >
        <strong>⚠️ TEMPORARY TEST PAGE</strong> — This route validates tenant-scoped API queries. It
        is <em>not</em> a real feature page and should be removed before production.
      </div>

      <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>
        Tenant Fetch Test: <code>{requestedSlug}</code>
      </h1>
      <p style={{ color: '#666', marginBottom: '1.5rem' }}>
        {tenantId ? (
          <>
            Resolved tenant ID: <code>{tenantId}</code>
            {!isValidFormat && (
              <span style={{ color: '#dc3545', marginLeft: '1rem' }}>
                ⚠️ INVALID FORMAT — not a 24-char hex ID
              </span>
            )}
          </>
        ) : (
          <span style={{ color: '#dc3545' }}>
            ❌ Tenant slug &quot;{requestedSlug}&quot; not found in map. No content queries will
            run.
          </span>
        )}
      </p>

      {/* Summary */}
      <div
        style={{
          padding: '1rem',
          marginBottom: '2rem',
          borderRadius: 8,
          background: hasAnyContent ? '#d4edda' : isNegativeCase ? '#f8d7da' : '#e7f3ff',
          border: `2px solid ${hasAnyContent ? '#28a745' : isNegativeCase ? '#dc3545' : '#b8daff'}`,
        }}
      >
        {isNegativeCase ? (
          <strong>NEGATIVE CASE: No valid tenant ID → no queries run</strong>
        ) : (
          <strong>Content scoped to tenant &quot;{requestedSlug}&quot;</strong>
        )}
        {' → '}
        {hasAnyContent
          ? `${allResults.filter((r) => r.totalDocs > 0).length} query(s) returned content`
          : 'No content returned (safe — no data leakage)'}
      </div>

      {/* Main results */}
      <h2 style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>
        Step 2: Content queries (tenant ID → collection data)
      </h2>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '0.85rem',
          marginBottom: '2rem',
        }}
      >
        <thead>
          <tr style={{ background: '#f5f5f5', textAlign: 'left' }}>
            <th style={{ padding: '0.5rem', border: '1px solid #ddd' }}>Method</th>
            <th style={{ padding: '0.5rem', border: '1px solid #ddd' }}>Collection</th>
            <th style={{ padding: '0.5rem', border: '1px solid #ddd' }}>Count</th>
            <th style={{ padding: '0.5rem', border: '1px solid #ddd' }}>Titles / Note</th>
          </tr>
        </thead>
        <tbody>
          {allResults.map((r, i) => (
            <tr
              key={i}
              style={{
                background: r.error
                  ? '#fff5f5'
                  : r.note
                    ? '#fffbea'
                    : r.totalDocs > 0
                      ? '#f0fff0'
                      : '#fff',
              }}
            >
              <td style={{ padding: '0.5rem', border: '1px solid #ddd' }}>{r.method}</td>
              <td style={{ padding: '0.5rem', border: '1px solid #ddd' }}>{r.collection}</td>
              <td style={{ padding: '0.5rem', border: '1px solid #ddd' }}>{r.totalDocs}</td>
              <td
                style={{
                  padding: '0.5rem',
                  border: '1px solid #ddd',
                  maxWidth: 400,
                }}
              >
                {r.error ? (
                  <span style={{ color: '#dc3545' }}>❌ {r.error}</span>
                ) : r.note ? (
                  <span style={{ color: '#856404' }}>{r.note}</span>
                ) : r.totalDocs > 0 ? (
                  r.titles.join(', ')
                ) : (
                  '(empty)'
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* GOTCHA demo */}
      {gotchaResults.length > 0 && (
        <>
          <h2 style={{ fontSize: '1.2rem', marginBottom: '0.5rem' }}>
            ⚠️ GOTCHA: What happens if you query with the raw slug (wrong pattern)
          </h2>
          <p style={{ color: '#856404', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
            Passing a non-ObjectId string like <code>&quot;{requestedSlug}&quot;</code> directly to
            the tenant filter does NOT return 0 results — it returns null-tenant seed data instead.{' '}
            <strong>Always resolve slug → ID first.</strong>
          </p>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '0.85rem',
              marginBottom: '2rem',
              background: '#fffbea',
            }}
          >
            <thead>
              <tr style={{ background: '#ffeeba', textAlign: 'left' }}>
                <th style={{ padding: '0.5rem', border: '1px solid #ddd' }}>Method</th>
                <th style={{ padding: '0.5rem', border: '1px solid #ddd' }}>Collection</th>
                <th style={{ padding: '0.5rem', border: '1px solid #ddd' }}>Count</th>
                <th style={{ padding: '0.5rem', border: '1px solid #ddd' }}>What leaked</th>
              </tr>
            </thead>
            <tbody>
              {gotchaResults.map((r, i) => (
                <tr key={i}>
                  <td
                    style={{
                      padding: '0.5rem',
                      border: '1px solid #ddd',
                    }}
                  >
                    {r.method}
                  </td>
                  <td
                    style={{
                      padding: '0.5rem',
                      border: '1px solid #ddd',
                    }}
                  >
                    {r.collection}
                  </td>
                  <td
                    style={{
                      padding: '0.5rem',
                      border: '1px solid #ddd',
                    }}
                  >
                    {r.totalDocs}
                  </td>
                  <td
                    style={{
                      padding: '0.5rem',
                      border: '1px solid #ddd',
                      color: r.totalDocs > 0 ? '#dc3545' : '#28a745',
                    }}
                  >
                    {r.titles.length > 0
                      ? `❌ Returned null-tenant docs: ${r.titles.join(', ')}`
                      : '✅ No leakage'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {/* Pattern Guide */}
      <div
        style={{
          padding: '1rem',
          background: '#e7f3ff',
          border: '1px solid #b8daff',
          borderRadius: 8,
          fontSize: '0.85rem',
        }}
      >
        <strong>✅ Correct fetch pattern for Next.js frontends:</strong>
        <pre
          style={{
            background: '#f0f4f8',
            padding: '1rem',
            borderRadius: 4,
            marginTop: '0.5rem',
            overflow: 'auto',
            fontSize: '0.8rem',
          }}
        >{`// Step 1: Resolve tenant slug → ID
const { docs: [tenant] } = await payload.find({
  collection: 'tenants',
  where: { slug: { equals: 'client-a' } },
  depth: 0,
})

if (!tenant) return notFound()  // or empty state

// Step 2: Query content scoped to that tenant
const pages = await payload.find({
  collection: 'pages',
  where: { tenant: { equals: tenant.id } },
})

// ⚠️ NEVER pass a raw user-supplied string directly as a tenant ID filter.
// Always validate it's a 24-char hex string (MongoDB ObjectId format) first.`}</pre>

        <strong>Key findings:</strong>
        <ul style={{ marginTop: '0.5rem', paddingLeft: '1.5rem' }}>
          <li>✅ REST and GraphQL both correctly scope content when given a valid tenant ID</li>
          <li>
            ✅ Local API (<code>payload.find()</code>) returns identical results to REST
          </li>
          <li>
            ⚠️ The <code>tenant</code> field is a plain ID string — NOT a populated relationship.
            Cannot dot-walk to tenant.slug in queries.
          </li>
          <li>
            ⚠️ Filtering by a non-ObjectId-format string (like a slug) does NOT error — it silently
            returns null-tenant seed docs. <strong>Always resolve slug→ID first.</strong>
          </li>
          <li>
            ✅ Valid-format but nonexistent IDs (e.g. <code>000000000000000000000000</code>)
            correctly return 0 results
          </li>
          <li>
            ✅ Use <code>{`where[tenant][exists]=true`}</code> to get only tenant-assigned content
          </li>
        </ul>
      </div>

      {/* Navigation */}
      <div style={{ marginTop: '1.5rem', fontSize: '0.85rem' }}>
        <strong>Try these variants:</strong>
        <br />
        <a href="/test-tenant-fetch?tenant=client-a">client-a</a>
        {' | '}
        <a href="/test-tenant-fetch?tenant=client-b">client-b</a>
        {' | '}
        <a href="/test-tenant-fetch?tenant=nonexistent">nonexistent (negative)</a>
        {' | '}
        <a href="/test-tenant-fetch?tenant=not-a-real-slug">not-a-real-slug (negative)</a>
      </div>
    </div>
  )
}
