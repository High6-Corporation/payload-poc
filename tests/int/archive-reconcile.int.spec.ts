import { describe, it, expect } from 'vitest'

import { countArchiveLines, envDays } from '@/jobs/archiveShared'

describe('archive reconcile helpers', () => {
  it('counts non-empty NDJSON lines and ignores trailing whitespace lines', () => {
    expect(countArchiveLines('{"a":1}\n{"b":2}\n')).toBe(2)
    expect(countArchiveLines('{"a":1}\n\n  \n{"b":2}\n')).toBe(2)
    expect(countArchiveLines('')).toBe(0)
  })

  it('matches rows exactly for the common shapes', () => {
    const rows = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    const ndjson = rows.map((r) => JSON.stringify(r)).join('\n') + '\n'
    expect(countArchiveLines(ndjson)).toBe(rows.length)
  })

  it('envDays falls back on missing/invalid values', () => {
    delete process.env.TEST_RETENTION_DAYS
    expect(envDays('TEST_RETENTION_DAYS', 365)).toBe(365)
    process.env.TEST_RETENTION_DAYS = '0'
    expect(envDays('TEST_RETENTION_DAYS', 365)).toBe(365)
    process.env.TEST_RETENTION_DAYS = '-5'
    expect(envDays('TEST_RETENTION_DAYS', 365)).toBe(365)
    process.env.TEST_RETENTION_DAYS = 'abc'
    expect(envDays('TEST_RETENTION_DAYS', 365)).toBe(365)
    process.env.TEST_RETENTION_DAYS = '7'
    expect(envDays('TEST_RETENTION_DAYS', 365)).toBe(7)
    delete process.env.TEST_RETENTION_DAYS
  })
})
