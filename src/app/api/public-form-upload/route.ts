import { APIError, getPayload } from 'payload'
import config from '@payload-config'

const MAX_SIZE = 5 * 1024 * 1024 // 5MB — matches media collection
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']

const MAGIC_BYTES: Record<string, number[]> = {
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/png': [0x89, 0x50, 0x4e, 0x47],
  'image/gif': [0x47, 0x49, 0x46, 0x38],
  'image/webp': [0x52, 0x49, 0x46, 0x46],
  'application/pdf': [0x25, 0x50, 0x44, 0x46],
}

/**
 * POST /api/public-form-upload
 *
 * Accepts a multipart file upload for public (unauthenticated) form
 * submissions. Narrowly scoped: validates that the `formId` references a
 * real form with an upload-enabled field, applies the same type/size
 * restrictions as the media collection, then creates the media document
 * server-side via `overrideAccess: true`.
 *
 * This avoids opening the `media` collection to anonymous writes — the
 * collection's `access.create` stays `authenticated`. Only this one
 * controlled handler bypasses it.
 *
 * Rate limiting note: `formId` gating narrows the target to real upload
 * forms (stops accidental drive-by hits and spam aimed at non-upload forms),
 * but since the formId is visible in the page source, a determined attacker
 * can still hammer this endpoint. Per-IP rate limiting is a deferred
 * follow-up; the 5MB cap makes storage-bombing expensive but not impossible.
 */
export async function POST(request: Request) {
  const payload = await getPayload({ config })

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return Response.json({ error: 'Request must be multipart/form-data.' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  const formId = formData.get('formId') as string | null

  if (!file || !(file instanceof File)) {
    return Response.json({ error: 'A file is required.' }, { status: 400 })
  }

  if (!formId) {
    return Response.json({ error: 'formId is required.' }, { status: 400 })
  }

  // ── Validate the form exists and has an upload field ──

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let form: any = null
  try {
    form = await payload.findByID({ collection: 'forms', id: formId, depth: 0 })
  } catch {
    return Response.json({ error: `Form "${formId}" not found.` }, { status: 400 })
  }

  if (!form) {
    return Response.json({ error: `Form "${formId}" not found.` }, { status: 400 })
  }

  const formFields = (form.fields as Array<Record<string, unknown>>) || []
  const hasUploadField = formFields.some((f) => f.blockType === 'upload')
  if (!hasUploadField) {
    return Response.json({ error: 'This form does not accept file uploads.' }, { status: 400 })
  }

  // ── Validate file type and size (matches media collection hooks) ──

  if (file.size > MAX_SIZE) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1)
    return Response.json(
      { error: `File is too large (${sizeMB}MB). Maximum allowed size is 5MB.` },
      { status: 400 },
    )
  }

  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return Response.json(
      {
        error: `File type "${file.type}" is not allowed. Accepted types: JPEG, PNG, WebP, GIF, PDF.`,
      },
      { status: 400 },
    )
  }

  // Magic-byte validation
  const buf = Buffer.from(await file.arrayBuffer())
  const expectedMagic = MAGIC_BYTES[file.type]
  if (expectedMagic) {
    const matches = expectedMagic.every((byte, i) => buf[i] === byte)
    const isWebpValid =
      file.type !== 'image/webp' ||
      (buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50)
    if (!matches || !isWebpValid) {
      return Response.json(
        { error: `File does not appear to be a valid ${file.type} file.` },
        { status: 400 },
      )
    }
  }

  // Truncated-file guard
  if ((file as unknown as { truncated?: boolean }).truncated) {
    return Response.json(
      { error: 'File is too large. Maximum allowed size is 5MB.' },
      { status: 400 },
    )
  }

  // ── Create media document ──

  try {
    const mediaDoc = await payload.create({
      collection: 'media',
      data: {
        tenant: (form.tenant as string) ?? undefined,
        prefix: (form.tenant as string) ?? undefined,
      },
      file: {
        name: file.name,
        data: buf,
        mimetype: file.type,
        size: file.size,
      },
      overrideAccess: true,
    })

    return Response.json({
      id: mediaDoc.id,
      url: (mediaDoc as unknown as Record<string, unknown>).url ?? null,
    })
  } catch (err) {
    const message = err instanceof APIError ? err.message : 'Upload failed'
    payload.logger.error({ err }, '[public-form-upload] media create failed')
    return Response.json({ error: message }, { status: 500 })
  }
}
