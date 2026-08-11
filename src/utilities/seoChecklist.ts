/**
 * evaluateSeoChecklist — pure function that scores SEO fields against a
 * focus keyword. Returns a checklist array and recommendations block.
 *
 * No side effects. No stored fields. Input shape is intentionally flat so
 * callers (custom field components) don't need to know collection internals.
 *
 * All keyword checks are case-insensitive substring matches.
 * Empty / whitespace-only focusKeyword → all items return 'na'.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SeoChecklistInput {
  focusKeyword: string
  seoTitle: string
  metaDescription: string
  slug: string
  content: string // pre-extracted plain text (lowercased)
}

export type ChecklistStatus = 'pass' | 'fail' | 'na'

export interface ChecklistItem {
  id: string
  label: string
  status: ChecklistStatus
  detail: string
}

export interface Recommendation {
  status: ChecklistStatus
  message: string
}

export interface SeoChecklistResult {
  items: ChecklistItem[]
  recommendations: Recommendation[]
}

// ---------------------------------------------------------------------------
// Character-count thresholds (source: Yoast / Google best-practice ranges)
// ---------------------------------------------------------------------------

const TITLE_MIN = 50
const TITLE_MAX = 60
const META_MIN = 120
const META_MAX = 160

// ---------------------------------------------------------------------------
// External link (canonical — used consistently across the panel)
// ---------------------------------------------------------------------------

export const SEO_STARTER_GUIDE_URL =
  'https://developers.google.com/search/docs/fundamentals/seo-starter-guide'
export const SEO_STARTER_GUIDE_LABEL = 'Google Search Central — SEO Starter Guide'

// ---------------------------------------------------------------------------
// Keyword helpers
// ---------------------------------------------------------------------------

/** Normalise the focus keyword for matching. */
function normaliseKeyword(kw: string): string {
  return kw.trim().toLowerCase()
}

function hasKeyword(text: string, keyword: string): boolean {
  if (!keyword || !text) return false
  return text.toLowerCase().includes(keyword)
}

/** Slug-aware check — normalises hyphens and underscores to spaces first. */
function hasKeywordInSlug(slug: string, keyword: string): boolean {
  if (!keyword || !slug) return false
  const normalised = slug.toLowerCase().replace(/[-_]/g, ' ')
  return normalised.includes(keyword)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function evaluateSeoChecklist(input: SeoChecklistInput): SeoChecklistResult {
  const kw = normaliseKeyword(input.focusKeyword)
  const isEmpty = kw.length === 0

  // ---- Checklist items ----

  const items: ChecklistItem[] = [
    {
      id: 'keyword-in-title',
      label: 'Focus Keyword in SEO Title',
      status: isEmpty ? 'na' : hasKeyword(input.seoTitle, kw) ? 'pass' : 'fail',
      detail: isEmpty
        ? 'Enter a focus keyword above to start checking.'
        : hasKeyword(input.seoTitle, kw)
          ? `"${kw}" found in the SEO title.`
          : `"${kw}" is not in the SEO title. Consider adding it near the beginning.`,
    },
    {
      id: 'keyword-in-description',
      label: 'Focus Keyword in Meta Description',
      status: isEmpty ? 'na' : hasKeyword(input.metaDescription, kw) ? 'pass' : 'fail',
      detail: isEmpty
        ? ''
        : hasKeyword(input.metaDescription, kw)
          ? `"${kw}" found in the meta description.`
          : `"${kw}" is not in the meta description. Add it naturally to improve click-through.`,
    },
    {
      id: 'keyword-in-slug',
      label: 'Focus Keyword in URL Slug',
      status: isEmpty ? 'na' : hasKeywordInSlug(input.slug, kw) ? 'pass' : 'fail',
      detail: isEmpty
        ? ''
        : hasKeywordInSlug(input.slug, kw)
          ? `"${kw}" appears in the URL slug.`
          : `"${kw}" is not in the URL slug. A keyword-rich URL helps search engines.`,
    },
    {
      id: 'keyword-in-content',
      label: 'Focus Keyword in Body Content',
      status: isEmpty ? 'na' : hasKeyword(input.content, kw) ? 'pass' : 'fail',
      detail: isEmpty
        ? ''
        : hasKeyword(input.content, kw)
          ? `"${kw}" found in the body content.`
          : `"${kw}" is not in the body content. Use it naturally in your first paragraph.`,
    },
  ]

  // ---- Recommendations ----

  const titleLen = input.seoTitle.length
  const descLen = input.metaDescription.length

  const recommendations: Recommendation[] = [
    {
      status:
        titleLen === 0 ? 'na' : titleLen >= TITLE_MIN && titleLen <= TITLE_MAX ? 'pass' : 'fail',
      message:
        titleLen === 0
          ? 'Add an SEO title to control how your page appears in search results.'
          : titleLen < TITLE_MIN
            ? `SEO title is too short (${titleLen} chars). Aim for ${TITLE_MIN}–${TITLE_MAX} characters for best visibility.`
            : titleLen > TITLE_MAX
              ? `SEO title is too long (${titleLen} chars). Aim for ${TITLE_MIN}–${TITLE_MAX} characters to avoid truncation in search results.`
              : `SEO title length is optimal (${titleLen} chars).`,
    },
    {
      status: descLen === 0 ? 'na' : descLen >= META_MIN && descLen <= META_MAX ? 'pass' : 'fail',
      message:
        descLen === 0
          ? 'Add a meta description to improve click-through from search results.'
          : descLen < META_MIN
            ? `Meta description is too short (${descLen} chars). Aim for ${META_MIN}–${META_MAX} characters.`
            : descLen > META_MAX
              ? `Meta description is too long (${descLen} chars). Aim for ${META_MIN}–${META_MAX} characters to avoid truncation.`
              : `Meta description length is optimal (${descLen} chars).`,
    },
    {
      status: 'na',
      message:
        'Use your focus keyword naturally — once in the first paragraph is enough. Avoid keyword stuffing; search engines penalise overuse.',
    },
  ]

  return { items, recommendations }
}
