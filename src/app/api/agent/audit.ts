// ---------------------------------------------------------------------------
// Agent API — Audit log
// ---------------------------------------------------------------------------

import { getServerSideURL } from '@/utilities/getURL'

function getServerURL(): string {
  return getServerSideURL()
}

/**
 * Write an immutable audit log entry to the AgentAuditLog collection.
 * Logs to stderr on failure but does not throw — audit failures are non-fatal
 * to the primary operation.
 */
export async function writeAuditLog(params: {
  tenantId: string
  action: string
  collection: string
  documentId: string
  slug: string
  previousValue: string
  newValue: string
  token: string
}): Promise<void> {
  const baseUrl = getServerURL()
  const res = await fetch(`${baseUrl}/api/agent-audit-log`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.token}`,
    },
    body: JSON.stringify({
      tenant: params.tenantId,
      action: params.action,
      collectionSlug: params.collection,
      documentId: params.documentId,
      slug: params.slug,
      previousValue: params.previousValue,
      newValue: params.newValue,
      confirmedAt: new Date().toISOString(),
    }),
  })

  if (!res.ok) {
    const errBody = await res.text()
    console.error(`[agent] Audit log write failed (HTTP ${res.status}): ${errBody}`)
  }
}
