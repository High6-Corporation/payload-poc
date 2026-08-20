/**
 * extractPlainText — converts Payload rich-content shapes into a single
 * lowercased plain-text string for keyword matching.
 *
 * Pages use a blocks-based layout array (Content, Media, Archive, etc.).
 * Posts use a lexical richText JSON tree.
 *
 * Unknown block types and unrecognised lexical node shapes are skipped
 * silently — a checklist that under-counts is better than one that crashes
 * the edit view.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimal shape for a lexical editor root (Posts). */
interface LexicalRoot {
  root: {
    children: LexicalNode[]
    direction?: string | null
    format?: string
    indent?: number
    type?: string
    version?: number
  }
}

interface LexicalNode {
  children?: LexicalNode[]
  text?: string
  type?: string
  [key: string]: unknown
}

/** Minimal shape for a single block in a Pages layout array. */
interface LayoutBlock {
  blockType?: string
  blockName?: string
  [key: string]: unknown
}

// ---------------------------------------------------------------------------
// Lexical tree walker
// ---------------------------------------------------------------------------

function extractFromLexical(node: LexicalNode | LexicalRoot): string {
  const parts: string[] = []

  function walk(n: unknown): void {
    if (!n || typeof n !== 'object') return

    const obj = n as Record<string, unknown>

    // Leaf text node
    if (typeof obj.text === 'string' && obj.text.length > 0) {
      parts.push(obj.text)
    }

    // Recurse into children (lexical nodes, nested blocks, tables, etc.)
    if (Array.isArray(obj.children)) {
      for (const child of obj.children) {
        walk(child)
      }
    }

    // Lexical root wrapper: { root: { children: [...] } }
    if (obj.root && typeof obj.root === 'object') {
      walk(obj.root)
    }

    // Descend into nested lexical-shaped values (e.g. a hero group's
    // `richText` field) so group fields contribute to body text.
    for (const [key, value] of Object.entries(obj)) {
      if (key === 'text' || key === 'children' || key === 'root') continue
      if (value && typeof value === 'object') {
        const nested = value as Record<string, unknown>
        if (nested.root && typeof nested.root === 'object') {
          walk(nested)
        }
      }
    }
  }

  walk(node)
  return parts.join(' ')
}

// ---------------------------------------------------------------------------
// Blocks layout walker
// ---------------------------------------------------------------------------

function extractFromBlocks(blocks: LayoutBlock[]): string {
  const parts: string[] = []

  for (const block of blocks) {
    if (!block || typeof block !== 'object') continue

    // Content block — has a richText field
    if (block.blockType === 'Content' || block.blockType === 'content') {
      const richText = (block as Record<string, unknown>).richText
      if (richText && typeof richText === 'object') {
        parts.push(extractFromLexical(richText as LexicalRoot))
      }
      continue
    }

    // CallToAction block — has richText
    if (block.blockType === 'CallToAction' || block.blockType === 'cta') {
      const richText = (block as Record<string, unknown>).richText
      if (richText && typeof richText === 'object') {
        parts.push(extractFromLexical(richText as LexicalRoot))
      }
      continue
    }

    // Banner block — has content (richText)
    if (block.blockType === 'Banner' || block.blockType === 'banner') {
      const content = (block as Record<string, unknown>).content
      if (content && typeof content === 'object') {
        parts.push(extractFromLexical(content as LexicalRoot))
      }
      continue
    }

    // Form block — skip (no searchable body content)
    // MediaBlock — skip (no text content)
    // Archive block — skip (dynamic listing, no static content)
    // Code block — could extract code but unlikely to help SEO keyword matching
    // Unknown block types — skip silently
  }

  return parts.join(' ')
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Convert a Payload content value (lexical JSON, blocks array, or plain
 * string) into a single lowercased plain-text string suitable for keyword
 * substring matching.
 *
 * Returns an empty string for null/undefined/unrecognised shapes.
 */
export function extractPlainText(content: unknown): string {
  if (!content) return ''

  // Already a string — used as-is (e.g. fallback values)
  if (typeof content === 'string') return content.toLowerCase()

  // Lexical richText (Posts): { root: { children: [...] } }
  if (typeof content === 'object' && 'root' in (content as Record<string, unknown>)) {
    return extractFromLexical(content as LexicalRoot).toLowerCase()
  }

  // Blocks layout array (Pages): [ { blockType: 'Content', richText: {...} }, ... ]
  if (Array.isArray(content)) {
    return extractFromBlocks(content as LayoutBlock[]).toLowerCase()
  }

  // Group fields (e.g. the Page hero group) — walk for nested lexical
  // richText values; returns '' when none are found.
  const text = extractFromLexical(content as LexicalRoot)
  return text.toLowerCase()
}
