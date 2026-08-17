/**
 * evaluateSeoChecklist — pure function that scores SEO fields against a
 * focus keyword. Returns a checklist array and recommendations block.
 *
 * No side effects. No stored fields. Input shape is intentionally flat so
 * callers (custom field components) don't need to know collection internals.
 *
 * All keyword checks are case-insensitive substring matches.
 * The focus keyword input is comma-separated: every parsed keyword is checked
 * against each criterion, and an item passes if ANY keyword matches.
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

// ---------------------------------------------------------------------------
// Function words (connectors) stripped from multi-word keyphrases before
// word-order matching — mirrors Yoast's keyphrase matching behaviour.
// ---------------------------------------------------------------------------

const FUNCTION_WORDS = new Set([
  'a',
  'an',
  'the',
  'at',
  'in',
  'on',
  'of',
  'for',
  'to',
  'with',
  'by',
  'from',
  'and',
  'or',
  'but',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'it',
  'its',
  'this',
  'that',
  'these',
  'those',
  'your',
  'our',
  'their',
  'his',
  'her',
  'my',
  'as',
  'if',
  'than',
  'then',
  'so',
  'not',
  'no',
  'do',
  'does',
  'did',
  'have',
  'has',
  'had',
  'will',
  'would',
  'can',
  'could',
  'should',
  'may',
  'might',
  'must',
  'about',
  'into',
  'over',
  'under',
  'out',
  'up',
  'down',
  'off',
  'between',
  'among',
  'during',
  'before',
  'after',
  'above',
  'below',
  'through',
  'via',
  'per',
  'we',
  'you',
  'they',
  'he',
  'she',
  'i',
])

/** Split text into lowercase word tokens. */
function tokenise(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
}

/**
 * Fold simple English plural suffixes so singular/plural forms compare equal
 * in the word-order fallback: "careers" → "career", "opportunities" →
 * "opportunity", "buses" → "bus". Used only in the fallback token comparison —
 * substring and single-word matching are untouched.
 */
function normaliseToken(word: string): string {
  if (word.length <= 3) return word
  if (word.endsWith('ies')) return word.slice(0, -3) + 'y'
  if (word.endsWith('es') && /(s|x|z|sh|ch)$/.test(word.slice(0, -2))) return word.slice(0, -2)
  if (word.endsWith('s')) return word.slice(0, -1)
  return word
}

/**
 * Keyword-in-text check used by all criteria.
 *
 * 1. Exact phrase (substring) first — strongest signal, and identical to the
 *    legacy behaviour for single keywords.
 * 2. Word-order fallback for multi-word keyphrases: strip function words
 *    ("at", "the", "and", …) from the keyword and require the remaining
 *    content words to appear in order anywhere in the text. So
 *    "Careers at Equator Energy" matches "Careers & Job Opportunities |
 *    Equator Energy Philippines".
 */
function hasKeywordInText(text: string, keyword: string): boolean {
  if (!keyword || !text) return false
  if (text.toLowerCase().includes(keyword)) return true

  const contentWords = tokenise(keyword)
    .filter((word) => !FUNCTION_WORDS.has(word))
    .map(normaliseToken)
  if (contentWords.length < 2) return false

  let next = 0
  for (const word of tokenise(text).map(normaliseToken)) {
    if (word === contentWords[next]) {
      next += 1
      if (next === contentWords.length) return true
    }
  }
  return false
}

function hasKeyword(text: string, keyword: string): boolean {
  return hasKeywordInText(text, keyword)
}

/** Slug-aware check — normalises hyphens and underscores to spaces first. */
function hasKeywordInSlug(slug: string, keyword: string): boolean {
  if (!keyword || !slug) return false
  const normalised = slug.toLowerCase().replace(/[-_]/g, ' ')
  return hasKeywordInText(normalised, keyword)
}

/**
 * Parse a comma-separated focus keyword string into a list of normalised
 * keywords, mirroring generateMeta's keyword parsing convention.
 * Empty / whitespace / comma-only input yields an empty list.
 */
function parseFocusKeywords(focusKeyword: string): string[] {
  return focusKeyword
    .split(',')
    .map((keyword) => keyword.trim())
    .filter(Boolean)
    .map(normaliseKeyword)
}

/** Quote and join a list of keywords for detail strings. */
function formatKeywords(keywords: string[]): string {
  return keywords.map((kw) => `"${kw}"`).join(', ')
}

/**
 * Build the detail string for one checklist item.
 * A single keyword keeps the exact legacy phrasing; with multiple keywords
 * the pass state lists what matched and the fail state notes none matched.
 */
function keywordDetail(args: {
  keywords: string[]
  matched: string[]
  pass: (kw: string) => string
  passMany: (matched: string[]) => string
  fail: (kw: string) => string
  failMany: () => string
}): string {
  const { keywords, matched, pass, passMany, fail, failMany } = args
  if (matched.length > 0) {
    return matched.length === 1 ? pass(matched[0]) : passMany(matched)
  }
  return keywords.length === 1 ? fail(keywords[0]) : failMany()
}

// ---------------------------------------------------------------------------
// hasBasicSeo — shared "does this page have minimal SEO?" gate.
// Used by both SeoChecklistPanel and the Pages list SEO Status column.
// All three fields must be non-empty (after trim) to pass.
// ---------------------------------------------------------------------------

export interface BasicSeoInput {
  seoTitle: string | null | undefined
  metaDescription: string | null | undefined
  focusKeyword: string | null | undefined
}

export function hasBasicSeo(input: BasicSeoInput): boolean {
  const title = (input.seoTitle ?? '').trim()
  const desc = (input.metaDescription ?? '').trim()
  const kw = (input.focusKeyword ?? '').trim()
  return title.length > 0 && desc.length > 0 && kw.length > 0
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function evaluateSeoChecklist(input: SeoChecklistInput): SeoChecklistResult {
  const keywords = parseFocusKeywords(input.focusKeyword)
  const isEmpty = keywords.length === 0

  // ---- Per-criterion matched keywords (pass if ANY keyword matches) ----

  const matchedInTitle = keywords.filter((keyword) => hasKeyword(input.seoTitle, keyword))
  const matchedInDescription = keywords.filter((keyword) =>
    hasKeyword(input.metaDescription, keyword),
  )
  const matchedInSlug = keywords.filter((keyword) => hasKeywordInSlug(input.slug, keyword))
  const matchedInContent = keywords.filter((keyword) => hasKeyword(input.content, keyword))

  // ---- Checklist items ----

  const items: ChecklistItem[] = [
    {
      id: 'keyword-in-title',
      label: 'Focus Keyword in SEO Title',
      status: isEmpty ? 'na' : matchedInTitle.length > 0 ? 'pass' : 'fail',
      detail: isEmpty
        ? input.focusKeyword.trim().length === 0
          ? 'Enter a focus keyword above to start checking.'
          : 'No valid focus keywords found — enter at least one keyword above to start checking.'
        : keywordDetail({
            keywords,
            matched: matchedInTitle,
            pass: (kw) => `"${kw}" found in the SEO title.`,
            passMany: (matched) => `Matched in the SEO title: ${formatKeywords(matched)}.`,
            fail: (kw) => `"${kw}" is not in the SEO title. Consider adding it near the beginning.`,
            failMany: () =>
              'None of your focus keywords are in the SEO title. Consider adding one near the beginning.',
          }),
    },
    {
      id: 'keyword-in-description',
      label: 'Focus Keyword in Meta Description',
      status: isEmpty ? 'na' : matchedInDescription.length > 0 ? 'pass' : 'fail',
      detail: isEmpty
        ? ''
        : keywordDetail({
            keywords,
            matched: matchedInDescription,
            pass: (kw) => `"${kw}" found in the meta description.`,
            passMany: (matched) =>
              `Matched in the meta description: ${formatKeywords(matched)}.`,
            fail: (kw) =>
              `"${kw}" is not in the meta description. Add it naturally to improve click-through.`,
            failMany: () =>
              'None of your focus keywords are in the meta description. Add them naturally to improve click-through.',
          }),
    },
    {
      id: 'keyword-in-slug',
      label: 'Focus Keyword in URL Slug',
      status: isEmpty ? 'na' : matchedInSlug.length > 0 ? 'pass' : 'fail',
      detail: isEmpty
        ? ''
        : keywordDetail({
            keywords,
            matched: matchedInSlug,
            pass: (kw) => `"${kw}" appears in the URL slug.`,
            passMany: (matched) => `Matched in the URL slug: ${formatKeywords(matched)}.`,
            fail: (kw) => `"${kw}" is not in the URL slug. A keyword-rich URL helps search engines.`,
            failMany: () =>
              'None of your focus keywords are in the URL slug. A keyword-rich URL helps search engines.',
          }),
    },
    {
      id: 'keyword-in-content',
      label: 'Focus Keyword in Body Content',
      status: isEmpty ? 'na' : matchedInContent.length > 0 ? 'pass' : 'fail',
      detail: isEmpty
        ? ''
        : keywordDetail({
            keywords,
            matched: matchedInContent,
            pass: (kw) => `"${kw}" found in the body content.`,
            passMany: (matched) => `Matched in the body content: ${formatKeywords(matched)}.`,
            fail: (kw) => `"${kw}" is not in the body content. Use it naturally in your first paragraph.`,
            failMany: () =>
              'None of your focus keywords are in the body content. Use them naturally in your first paragraph.',
          }),
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
