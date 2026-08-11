import type { PayloadRequest } from 'payload'
import { ValidationError } from 'payload'

// ---------------------------------------------------------------------------
// Filename sanitization — safe S3 object keys
// ---------------------------------------------------------------------------

/**
 * Strips path-traversal sequences, spaces, and unsafe characters from the
 * uploaded filename.  Mutates `data.filename` in place.
 *
 * Must run in `beforeValidate` so Payload uses the sanitized name for storage.
 */
export function sanitizeFilename({
  data,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any
}): void {
  if (!data?.filename) return

  const raw = data.filename as string

  // 1. Strip path-traversal and directory separators
  let sanitized = raw.replace(/\.\.\/|\.\.\\|[\/\\]/g, '')

  // 2. Split into basename + extension so the extension is preserved
  const dotIndex = sanitized.lastIndexOf('.')
  const ext = dotIndex > 0 ? sanitized.slice(dotIndex).toLowerCase() : ''
  const basename = dotIndex > 0 ? sanitized.slice(0, dotIndex) : sanitized

  // 3. Replace whitespace with hyphens, drop everything else unsafe
  let clean = basename
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')

  // 4. Fallback for filenames that collapse to nothing after sanitization
  if (!clean) clean = 'import'

  data.filename = `${clean}${ext}`
}

// ---------------------------------------------------------------------------
// MIME type & content validation
// ---------------------------------------------------------------------------

const ALLOWED_MIMES = ['text/csv', 'application/json']

/**
 * Validates the uploaded file before it is written to storage:
 * 1. MIME type must be text/csv or application/json
 * 2. File must not be empty
 * 3. CSV files must not contain null bytes (binary indicator)
 * 4. JSON files must parse as valid JSON
 */
export function validateMimeType({
  data,
  req,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any
  req: PayloadRequest
}): void {
  // Skip validation when no file is being uploaded (e.g. during the
  // import-export plugin's afterChange update, which re-invokes
  // beforeValidate but has no req.file).  Throwing here would roll back
  // the transaction and cause the import document to vanish (404).
  if (!req.file) return

  const mimeType = (data?.mimeType as string) || ''

  if (!ALLOWED_MIMES.includes(mimeType)) {
    throw new ValidationError({
      errors: [
        {
          message: `Invalid file type: ${mimeType || 'unknown'}. Only CSV and JSON files are accepted.`,
          path: 'file',
        },
      ],
    })
  }

  const fileData = req.file.data as Buffer | undefined
  if (!fileData || fileData.length === 0) {
    throw new ValidationError({
      errors: [
        {
          message: 'Empty file. Please upload a valid CSV or JSON file.',
          path: 'file',
        },
      ],
    })
  }

  // CSV: detect binary by checking for null bytes in the first 1 KiB
  if (mimeType === 'text/csv') {
    const sample = fileData.slice(0, Math.min(1024, fileData.length))
    if (sample.includes(0x00)) {
      throw new ValidationError({
        errors: [
          {
            message:
              'File appears to be binary, not a valid CSV. Please check the file and try again.',
            path: 'file',
          },
        ],
      })
    }
  }

  // JSON: must parse as valid JSON
  if (mimeType === 'application/json') {
    try {
      JSON.parse(fileData.toString('utf-8'))
    } catch {
      throw new ValidationError({
        errors: [
          {
            message: 'Invalid JSON file. Please check the file format and try again.',
            path: 'file',
          },
        ],
      })
    }
  }
}

// ---------------------------------------------------------------------------
// CSV UTF-8 BOM stripping
// ---------------------------------------------------------------------------

/**
 * Detects and strips the UTF-8 BOM (EF BB BF) from CSV file buffers so
 * downstream CSV parsing (PapaParse / the plugin's import engine) doesn't
 * misinterpret the first column header.
 *
 * Mutates `req.file.data` in place (slicing off the BOM) so the plugin's
 * afterChange hook reads the clean buffer.
 */
export function stripCsvBom({
  data,
  req,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any
  req: PayloadRequest
}): void {
  if ((data.mimeType as string) !== 'text/csv') return

  const fileData = req.file?.data as Buffer | undefined
  if (!fileData || fileData.length < 3) return

  // UTF-8 BOM: EF BB BF
  if (fileData[0] === 0xef && fileData[1] === 0xbb && fileData[2] === 0xbf) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    req.file!.data = fileData.subarray(3)
  }
}

// ---------------------------------------------------------------------------
// Content sanity check (runs after BOM strip)
// ---------------------------------------------------------------------------

/**
 * Lightweight pre-flight check before the plugin's import engine takes over:
 * - CSV must have at least a header row
 * - JSON must be a non-empty array of objects
 */
export function validateContent({
  data,
  req,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any
  req: PayloadRequest
}): void {
  const fileData = req.file?.data as Buffer | undefined
  if (!fileData) return

  const mimeType = data.mimeType as string

  if (mimeType === 'text/csv') {
    const content = fileData.toString('utf-8').trim()
    if (!content) {
      throw new ValidationError({
        errors: [
          {
            message: 'CSV file is empty. Please check the file content.',
            path: 'file',
          },
        ],
      })
    }
    const lines = content.split('\n').filter((l) => l.trim().length > 0)
    if (lines.length < 1) {
      throw new ValidationError({
        errors: [
          {
            message:
              'CSV file has no readable rows. Ensure the file has a header row and at least one data row.',
            path: 'file',
          },
        ],
      })
    }
  }

  if (mimeType === 'application/json') {
    const content = fileData.toString('utf-8').trim()
    if (!content) {
      throw new ValidationError({
        errors: [
          {
            message: 'JSON file is empty. Please check the file content.',
            path: 'file',
          },
        ],
      })
    }
    try {
      const parsed = JSON.parse(content)
      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new ValidationError({
          errors: [
            {
              message: 'JSON file must contain a non-empty array of objects to import.',
              path: 'file',
            },
          ],
        })
      }
    } catch (e) {
      if (e instanceof ValidationError) throw e
      throw new ValidationError({
        errors: [
          {
            message: 'Invalid JSON file. Please check the file format and try again.',
            path: 'file',
          },
        ],
      })
    }
  }
}

// ---------------------------------------------------------------------------
// Uploaded-by capture
// ---------------------------------------------------------------------------

/**
 * Records which user uploaded the import file.
 */
export function captureUploadedBy({
  data,
  req,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any
  req: PayloadRequest
}): void {
  if (req.user?.id) {
    data.uploadedBy = req.user.id
  }
}
