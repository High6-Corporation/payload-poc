import { getPayload } from 'payload'
import config from '@payload-config'
import { headers } from 'next/headers'
import { sendViaSmtp2goApi } from '@/email/smtp2go'
import { resolveSmtpConfig } from '@/utilities/resolveSmtpConfig'

export const maxDuration = 30 // seconds

export async function POST(request: Request): Promise<Response> {
  const payload = await getPayload({ config })
  const requestHeaders = await headers()

  // Authenticate via Payload admin session
  const { user } = await payload.auth({ headers: requestHeaders })
  if (!user) {
    return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 })
  }

  let body: { smtpSettingsId: string; testEmail: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ success: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const { smtpSettingsId, testEmail } = body
  if (!smtpSettingsId || !testEmail) {
    return Response.json(
      { success: false, error: 'smtpSettingsId and testEmail are required' },
      { status: 400 },
    )
  }

  // Validate email format
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testEmail)) {
    return Response.json({ success: false, error: 'Invalid email address' }, { status: 400 })
  }

  // Fetch the SmtpSettings doc with EXPLICIT overrideAccess: false so normal
  // access control (tenantEnabledAccess) gates this read.  A tenant-admin for
  // Tenant A who tries to test-send using a Tenant B config gets 403/404 here.
  //
  // CRITICAL (verified 2026-08-12): Payload 3.85.1's LOCAL API (payload.findByID
  // on a getPayload instance) DEFAULTS overrideAccess to TRUE — the opposite of
  // the documented REST default.  Omitting the option silently bypasses access
  // control for everyone (verified live: a tenant-admin read another tenant's
  // doc and reached the SMTP send).  The `user` option is also required — the
  // local API otherwise builds a request with req.user = null and the
  // authenticated gate would deny EVERYONE, super-admins included.
  let smtpDoc: Record<string, unknown>
  try {
    smtpDoc = (await payload.findByID({
      collection: 'smtp-settings',
      id: smtpSettingsId,
      depth: 0,
      overrideAccess: false,
      user,
    })) as unknown as Record<string, unknown>
  } catch (err) {
    const status = (err as any)?.status || 500
    return Response.json(
      {
        success: false,
        error: status === 403 ? 'Access denied' : `SmtpSettings "${smtpSettingsId}" not found`,
      },
      { status: status === 403 ? 403 : 404 },
    )
  }

  // Resolve the tenant ID from the doc
  const tenantId =
    typeof smtpDoc.tenant === 'string' ? smtpDoc.tenant : (smtpDoc.tenant as { id: string })?.id

  if (!tenantId) {
    return Response.json(
      { success: false, error: 'SmtpSettings document has no tenant' },
      { status: 400 },
    )
  }

  // Resolve config (site-override or tenant-default).
  // resolveSmtpConfig reads the raw _apiKey via direct MongoDB access,
  // bypassing the afterRead masking hook.
  const siteId = smtpDoc.site
    ? typeof smtpDoc.site === 'string'
      ? smtpDoc.site
      : (smtpDoc.site as { id: string })?.id
    : undefined

  try {
    const smtpConfig = await resolveSmtpConfig(payload, tenantId, siteId)

    // Send via SMTP2GO's HTTP API — the API key is only valid there.
    // The SMTP relay (mail.smtp2go.com) authenticates with a separate SMTP
    // User username/password pair, so relay sends always 535 with an API key.
    await sendViaSmtp2goApi(smtpConfig, {
      from: {
        address: smtpConfig.senderEmail,
        name: smtpConfig.senderName,
      },
      to: testEmail,
      subject: 'SMTP2GO Test Email — High6 CMS',
      html: `
        <div style="font-family: system-ui, sans-serif; max-width: 480px; margin: 0 auto;">
          <h2>SMTP2GO Test Email</h2>
          <p>This email confirms that your SMTP2GO configuration is working correctly.</p>
          <table style="border-collapse: collapse; width: 100%; margin: 1rem 0;">
            <tr><td style="padding: 0.4rem 0; color: #666;">Config</td><td>${smtpDoc.label || 'N/A'}</td></tr>
            <tr><td style="padding: 0.4rem 0; color: #666;">Sender</td><td>${smtpConfig.senderEmail}</td></tr>
          </table>
          <p style="color: #999; font-size: 0.8rem;">
            Sent at ${new Date().toISOString()} from High6 CMS
          </p>
        </div>
      `,
    })

    return Response.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return Response.json({ success: false, error: message }, { status: 502 })
  }
}
