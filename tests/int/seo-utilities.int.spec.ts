import { describe, expect, it } from 'vitest'
import { evaluateSeoChecklist } from '../../src/utilities/seoChecklist'
import { extractPlainText } from '../../src/utilities/extractPlainText'

// ---------------------------------------------------------------------------
// extractPlainText
// ---------------------------------------------------------------------------

describe('extractPlainText', () => {
  it('returns empty string for null/undefined', () => {
    expect(extractPlainText(null)).toBe('')
    expect(extractPlainText(undefined)).toBe('')
    expect(extractPlainText('')).toBe('')
  })

  it('returns lowercased plain string as-is', () => {
    expect(extractPlainText('Hello World')).toBe('hello world')
  })

  it('extracts text from lexical JSON', () => {
    const lexical = {
      root: {
        children: [
          {
            children: [
              { text: 'Welcome to our ', type: 'text' },
              { text: 'web design', type: 'text', bold: true },
              { text: ' agency.', type: 'text' },
            ],
            type: 'paragraph',
          },
        ],
        direction: null,
        format: '',
        indent: 0,
        type: 'root',
        version: 1,
      },
    }
    const result = extractPlainText(lexical)
    expect(result).toContain('welcome to our')
    expect(result).toContain('web design')
    expect(result).toContain('agency')
  })

  it('extracts text from blocks layout array', () => {
    const blocks = [
      {
        blockType: 'Content',
        richText: {
          root: {
            children: [
              { children: [{ text: 'Our web design agency in Manila.' }], type: 'paragraph' },
            ],
          },
        },
      },
      {
        blockType: 'MediaBlock', // no text content — should be skipped
        media: 'some-id',
      },
      {
        blockType: 'unknown-block', // unknown — skipped silently
        foo: 'bar',
      },
    ]
    const result = extractPlainText(blocks)
    expect(result).toContain('our web design agency in manila')
    // Unknown/empty block types should not throw
  })

  it('skips unknown lexical node shapes silently', () => {
    const weird = { something: 'unexpected', nested: { deep: 'value' } }
    expect(() => extractPlainText(weird)).not.toThrow()
  })

  it('handles deeply nested lexical content', () => {
    const deep = {
      root: {
        children: [
          {
            type: 'paragraph',
            children: [
              { text: 'A', type: 'text' },
              { type: 'linebreak' },
              { text: 'B', type: 'text' },
            ],
          },
        ],
      },
    }
    expect(extractPlainText(deep)).toBe('a b')
  })
})

// ---------------------------------------------------------------------------
// evaluateSeoChecklist
// ---------------------------------------------------------------------------

describe('evaluateSeoChecklist', () => {
  const fullInput = {
    focusKeyword: 'web design',
    seoTitle: 'Professional Web Design Services',
    metaDescription: 'Expert web design agency in Manila',
    slug: 'web-design-services',
    content: 'we offer professional web design services',
  }

  it('returns all na when focusKeyword is empty', () => {
    const result = evaluateSeoChecklist({ ...fullInput, focusKeyword: '' })
    for (const item of result.items) {
      expect(item.status).toBe('na')
    }
  })

  it('returns all na when focusKeyword is whitespace only', () => {
    const result = evaluateSeoChecklist({ ...fullInput, focusKeyword: '   ' })
    for (const item of result.items) {
      expect(item.status).toBe('na')
    }
  })

  it('detects keyword in title (case-insensitive)', () => {
    const result = evaluateSeoChecklist({ ...fullInput, focusKeyword: 'WEB DESIGN' })
    expect(result.items[0].status).toBe('pass')
    expect(result.items[0].detail).toContain('"web design" found')
  })

  it('detects missing keyword in title', () => {
    const result = evaluateSeoChecklist({ ...fullInput, focusKeyword: 'graphic design' })
    expect(result.items[0].status).toBe('fail')
    expect(result.items[0].detail).toContain('graphic design')
  })

  it('detects keyword in meta description', () => {
    const result = evaluateSeoChecklist(fullInput)
    expect(result.items[1].status).toBe('pass')
  })

  it('detects keyword in slug', () => {
    const result = evaluateSeoChecklist(fullInput)
    expect(result.items[2].status).toBe('pass')
  })

  it('detects keyword in content', () => {
    const result = evaluateSeoChecklist(fullInput)
    expect(result.items[3].status).toBe('pass')
  })

  // ---- Recommendations ----

  it('title length: optimal when 50-60 chars', () => {
    const title50 = 'A'.repeat(50)
    const result = evaluateSeoChecklist({ ...fullInput, seoTitle: title50 })
    const titleRec = result.recommendations[0]
    expect(titleRec.status).toBe('pass')
  })

  it('title length: too short below 50 chars', () => {
    const result = evaluateSeoChecklist({ ...fullInput, seoTitle: 'Short' })
    expect(result.recommendations[0].status).toBe('fail')
    expect(result.recommendations[0].message).toContain('too short')
  })

  it('title length: too long above 60 chars', () => {
    const result = evaluateSeoChecklist({ ...fullInput, seoTitle: 'A'.repeat(70) })
    expect(result.recommendations[0].status).toBe('fail')
    expect(result.recommendations[0].message).toContain('too long')
  })

  it('title length: na when empty', () => {
    const result = evaluateSeoChecklist({ ...fullInput, seoTitle: '' })
    expect(result.recommendations[0].status).toBe('na')
  })

  it('meta description: optimal when 120-160 chars', () => {
    const desc150 = 'A'.repeat(150)
    const result = evaluateSeoChecklist({ ...fullInput, metaDescription: desc150 })
    expect(result.recommendations[1].status).toBe('pass')
  })

  it('meta description: too short below 120 chars', () => {
    const result = evaluateSeoChecklist({ ...fullInput, metaDescription: 'Short desc' })
    expect(result.recommendations[1].status).toBe('fail')
  })

  it('meta description: too long above 160 chars', () => {
    const result = evaluateSeoChecklist({ ...fullInput, metaDescription: 'A'.repeat(170) })
    expect(result.recommendations[1].status).toBe('fail')
  })

  it('includes natural usage advisory', () => {
    const result = evaluateSeoChecklist(fullInput)
    const naturalRec = result.recommendations[2]
    expect(naturalRec.message).toContain('keyword stuffing')
  })

  // ---- Pass/fail ratio ----

  it('all pass when keyword is everywhere', () => {
    const result = evaluateSeoChecklist(fullInput)
    const passes = result.items.filter((i) => i.status === 'pass')
    expect(passes.length).toBe(4)
  })

  it('all fail when keyword is nowhere', () => {
    const result = evaluateSeoChecklist({
      ...fullInput,
      seoTitle: 'About Us',
      metaDescription: 'Learn about our company',
      slug: 'about-us',
      content: 'we are a company',
    })
    const fails = result.items.filter((i) => i.status === 'fail')
    expect(fails.length).toBe(4)
  })
})

// ---------------------------------------------------------------------------
// evaluateSeoChecklist — comma-separated focus keywords
// ---------------------------------------------------------------------------

describe('evaluateSeoChecklist — comma-separated focus keywords', () => {
  const multiInput = {
    focusKeyword: 'Equator Energy, Solar Energy, Water Machine',
    seoTitle: 'Equator Energy Services',
    metaDescription: 'Equator Energy delivers solar power solutions',
    slug: 'equator-energy-services',
    content: 'equator energy offers installation services',
  }

  it('passes all four criteria when the first keyword matches everywhere (repro)', () => {
    const result = evaluateSeoChecklist(multiInput)
    for (const item of result.items) {
      expect(item.status).toBe('pass')
    }
  })

  it('passes a criterion when only a later keyword matches', () => {
    const result = evaluateSeoChecklist({
      focusKeyword: 'Solar Energy, Water Machine',
      seoTitle: 'Water Machine installation',
      metaDescription: 'Water Machine repair services',
      slug: 'water-machine-installation',
      content: 'we service water machine units',
    })
    for (const item of result.items) {
      expect(item.status).toBe('pass')
    }
    // single matched keyword keeps the legacy detail format
    expect(result.items[0].detail).toBe('"water machine" found in the SEO title.')
  })

  it('fails all criteria when no keyword matches', () => {
    const result = evaluateSeoChecklist({
      ...multiInput,
      seoTitle: 'About Us',
      metaDescription: 'Learn about our company',
      slug: 'about-us',
      content: 'we are a company',
    })
    for (const item of result.items) {
      expect(item.status).toBe('fail')
    }
  })

  it('lists matched keywords when multiple match the same criterion', () => {
    const result = evaluateSeoChecklist({
      focusKeyword: 'Equator Energy, Water Machine',
      seoTitle: 'Equator Energy and Water Machine services',
      metaDescription: 'Equator Energy water machine maintenance',
      slug: 'equator-energy-water-machine',
      content: 'we maintain equator energy and water machine units',
    })
    expect(result.items[0].detail).toBe(
      'Matched in the SEO title: "equator energy", "water machine".',
    )
    expect(result.items[1].detail).toBe(
      'Matched in the meta description: "equator energy", "water machine".',
    )
    expect(result.items[2].detail).toBe(
      'Matched in the URL slug: "equator energy", "water machine".',
    )
    expect(result.items[3].detail).toBe(
      'Matched in the body content: "equator energy", "water machine".',
    )
  })

  it('uses the multi-keyword fail detail when none matched', () => {
    const result = evaluateSeoChecklist({
      ...multiInput,
      seoTitle: 'About Us',
      metaDescription: 'Learn about our company',
      slug: 'about-us',
      content: 'we are a company',
    })
    expect(result.items[0].detail).toBe(
      'None of your focus keywords are in the SEO title. Consider adding one near the beginning.',
    )
    expect(result.items[2].detail).toBe(
      'None of your focus keywords are in the URL slug. A keyword-rich URL helps search engines.',
    )
  })

  it('treats comma / whitespace-only input as empty (all na)', () => {
    for (const kw of [',', ',,', ', ,', ' , ', ',, ,']) {
      const result = evaluateSeoChecklist({ ...multiInput, focusKeyword: kw })
      for (const item of result.items) {
        expect(item.status).toBe('na')
      }
    }
    // typed-but-unparseable input gets its own copy, not the legacy empty copy
    const result = evaluateSeoChecklist({ ...multiInput, focusKeyword: ',,' })
    expect(result.items[0].detail).toBe(
      'No valid focus keywords found — enter at least one keyword above to start checking.',
    )
  })

  it('trims keywords and drops empty segments (both endpoints survive)', () => {
    const result = evaluateSeoChecklist({
      focusKeyword: '  Equator Energy  ,  , Solar Energy',
      seoTitle: 'Equator Energy Services',
      metaDescription: 'Installation services',
      slug: 'equator-energy-services',
      content: 'we install solar energy systems',
    })
    expect(result.items[0].status).toBe('pass')
    expect(result.items[0].detail).toBe('"equator energy" found in the SEO title.')
    expect(result.items[3].status).toBe('pass')
    expect(result.items[3].detail).toBe('"solar energy" found in the body content.')
  })

  it('keeps single-keyword output byte-identical (regression)', () => {
    const pass = evaluateSeoChecklist({
      focusKeyword: 'web design',
      seoTitle: 'Professional Web Design Services',
      metaDescription: 'Expert web design agency in Manila',
      slug: 'web-design-services',
      content: 'we offer professional web design services',
    })
    expect(pass.items.map((i) => i.status)).toEqual(['pass', 'pass', 'pass', 'pass'])
    expect(pass.items.map((i) => i.detail)).toEqual([
      '"web design" found in the SEO title.',
      '"web design" found in the meta description.',
      '"web design" appears in the URL slug.',
      '"web design" found in the body content.',
    ])

    const fail = evaluateSeoChecklist({
      focusKeyword: 'graphic design',
      seoTitle: 'About Us',
      metaDescription: 'Learn about our company',
      slug: 'about-us',
      content: 'we are a company',
    })
    expect(fail.items.map((i) => i.status)).toEqual(['fail', 'fail', 'fail', 'fail'])
    expect(fail.items.map((i) => i.detail)).toEqual([
      '"graphic design" is not in the SEO title. Consider adding it near the beginning.',
      '"graphic design" is not in the meta description. Add it naturally to improve click-through.',
      '"graphic design" is not in the URL slug. A keyword-rich URL helps search engines.',
      '"graphic design" is not in the body content. Use it naturally in your first paragraph.',
    ])
  })
})

// ---------------------------------------------------------------------------
// evaluateSeoChecklist — multi-word keyphrase matching (word-order)
// ---------------------------------------------------------------------------

describe('evaluateSeoChecklist — multi-word keyphrase matching', () => {
  const baseInput = {
    seoTitle: 'Careers & Job Opportunities | Equator Energy Philippines',
    metaDescription: 'Explore career opportunities at Equator Energy.',
    slug: 'careers',
    content: 'we build careers at equator energy together',
  }

  it('matches a keyphrase when function words are dropped and content words appear in order (repro)', () => {
    const result = evaluateSeoChecklist({ ...baseInput, focusKeyword: 'Careers at Equator Energy' })
    expect(result.items[0].status).toBe('pass')
    expect(result.items[0].detail).toBe('"careers at equator energy" found in the SEO title.')
    // body has all three content words in order too (verbatim here)
    expect(result.items[3].status).toBe('pass')
    // slug 'careers' only has the first content word — must NOT match
    expect(result.items[2].status).toBe('fail')
  })

  it('does not match when content words appear out of order', () => {
    const result = evaluateSeoChecklist({
      ...baseInput,
      seoTitle: 'Equator Energy careers hub',
      focusKeyword: 'Careers at Equator Energy',
    })
    expect(result.items[0].status).toBe('fail')
  })

  it('does not match when a content word is missing', () => {
    const result = evaluateSeoChecklist({
      ...baseInput,
      seoTitle: 'Careers & Job Opportunities | Philippines',
      focusKeyword: 'Careers at Equator Energy',
    })
    expect(result.items[0].status).toBe('fail')
  })

  it('never matches a function-word-only keyword', () => {
    const result = evaluateSeoChecklist({ ...baseInput, focusKeyword: 'at the' })
    for (const item of result.items) {
      expect(item.status).toBe('fail')
    }
  })

  it('matches slug via word-order after hyphen normalisation', () => {
    const result = evaluateSeoChecklist({
      ...baseInput,
      slug: 'careers-equator-energy',
      focusKeyword: 'Careers at Equator Energy',
    })
    expect(result.items[2].status).toBe('pass')
    expect(result.items[2].detail).toBe('"careers at equator energy" appears in the URL slug.')
  })

  it('single-word keyword behaviour is unchanged', () => {
    const result = evaluateSeoChecklist({ ...baseInput, focusKeyword: 'Career' })
    // 'career' is a substring of 'careers' — matches title and slug
    expect(result.items[0].status).toBe('pass')
    expect(result.items[2].status).toBe('pass')
  })

  it('matches a keyphrase in the description when only pluralisation differs (repro)', () => {
    const result = evaluateSeoChecklist({
      ...baseInput,
      focusKeyword: 'Careers at Equator Energy',
    })
    expect(result.items[1].status).toBe('pass')
    expect(result.items[1].detail).toBe(
      '"careers at equator energy" found in the meta description.',
    )
  })

  it('folds -ies plurals in word-order matching', () => {
    const result = evaluateSeoChecklist({
      ...baseInput,
      seoTitle: 'Job opportunity hub',
      metaDescription: '',
      slug: 'job-opportunity',
      content: '',
      focusKeyword: 'Job opportunities',
    })
    expect(result.items[0].status).toBe('pass')
    expect(result.items[2].status).toBe('pass')
  })
})
