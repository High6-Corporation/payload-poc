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
            children: [{ text: 'Welcome to our ', type: 'text' }, { text: 'web design', type: 'text', bold: true }, { text: ' agency.', type: 'text' }],
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
