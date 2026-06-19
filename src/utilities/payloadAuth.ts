/**
 * Agent Service Account — JWT token management.
 *
 * Obtains a Payload JWT for the agent service account (credentials from
 * AGENT_EMAIL / AGENT_PASSWORD env vars) and caches it in memory.
 * Re-logs in proactively if the token is within 5 minutes of expiry.
 */

interface TokenCache {
  token: string
  expiresAt: number // Date.now() ms
}

let tokenCache: TokenCache | null = null

function getServerURL(): string {
  return process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'
}

/** Decode the `exp` claim from a JWT without a library. Returns ms since epoch, or null. */
function decodeJwtExp(token: string): number | null {
  try {
    const segments = token.split('.')
    if (segments.length !== 3) return null

    const payload = segments[1]
    // Base64url → Base64, then decode
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const json = Buffer.from(base64, 'base64').toString('utf8')
    const parsed = JSON.parse(json)

    const exp = parsed?.exp
    if (typeof exp === 'number') return exp * 1000 // Unix seconds → ms
    return null
  } catch {
    return null
  }
}

/** Clear the cached token so the next call to getAgentToken() forces a fresh login. */
export function clearAgentToken(): void {
  tokenCache = null
}

const FIVE_MINUTES_MS = 5 * 60 * 1000

export async function getAgentToken(): Promise<string> {
  // Return cached token if it's still fresh (outside the 5-min expiry window)
  if (tokenCache && Date.now() < tokenCache.expiresAt - FIVE_MINUTES_MS) {
    return tokenCache.token
  }

  const email = process.env.AGENT_EMAIL
  const password = process.env.AGENT_PASSWORD

  if (!email || !password) {
    throw new Error('AGENT_EMAIL and AGENT_PASSWORD must be set in environment')
  }

  const baseUrl = getServerURL()
  const res = await fetch(`${baseUrl}/api/users/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Agent login failed (HTTP ${res.status}): ${body}`)
  }

  const data = await res.json()

  const token: string | undefined = data?.token
  if (!token) {
    throw new Error(`Agent login response missing token field: ${JSON.stringify(data)}`)
  }

  const expiresAt = decodeJwtExp(token) ?? Date.now() + 2 * 60 * 60 * 1000 // fallback: 2h

  tokenCache = { token, expiresAt }
  return token
}
