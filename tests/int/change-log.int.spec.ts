import { describe, it, expect } from 'vitest'

import {
  diffFields,
  getTenantAndSite,
  isExcludedPath,
  stripSensitive,
} from '@/hooks/changeLog'

describe('change-log diff machinery', () => {
  it('detects changed top-level fields and ignores unchanged ones', () => {
    const rows = diffFields(
      { title: 'Old', body: 'same', order: 1 },
      { title: 'New', body: 'same', order: 1 },
    )
    expect(rows).toEqual([{ fieldPath: 'title', previousValue: 'Old', newValue: 'New' }])
  })

  it('recurses into nested objects keeping the dotted path (Payload tab/group fields)', () => {
    const rows = diffFields(
      { smtp: { senderEmail: 'a@x.com', enabled: true } },
      { smtp: { senderEmail: 'b@x.com', enabled: true } },
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual({
      fieldPath: 'smtp.senderEmail',
      previousValue: 'a@x.com',
      newValue: 'b@x.com',
    })
  })

  it('ignores excluded paths at any depth and strips them from stored values', () => {
    const rows = diffFields(
      { smtp: { apiKey: 'secret-1', senderEmail: 'a@x.com' } },
      { smtp: { apiKey: 'secret-2', senderEmail: 'b@x.com' } },
      ['apiKey', '_apiKey'],
    )
    expect(rows).toHaveLength(1) // only senderEmail
    expect(rows[0].fieldPath).toBe('smtp.senderEmail')
    expect(JSON.stringify(rows[0])).not.toContain('secret')
    expect(stripSensitive({ password: 'pw', name: 'x' }, ['password'])).toEqual({ name: 'x' })
  })

  it('handles create-style diffs (previous value null)', () => {
    const rows = diffFields({}, { name: 'New Site' })
    expect(rows).toEqual([{ fieldPath: 'name', previousValue: null, newValue: 'New Site' }])
  })

  it('treats arrays as atomic values', () => {
    const rows = diffFields({ tenants: [{ tenant: 'a' }] }, { tenants: [{ tenant: 'b' }] })
    expect(rows).toEqual([
      {
        fieldPath: 'tenants',
        previousValue: [{ tenant: 'a' }],
        newValue: [{ tenant: 'b' }],
      },
    ])
  })

  it('matches excluded paths by suffix', () => {
    expect(isExcludedPath('smtp.apiKey', ['apiKey', '_apiKey'])).toBe(true)
    expect(isExcludedPath('apiKey', ['apiKey', '_apiKey'])).toBe(true)
    expect(isExcludedPath('smtp.senderEmail', ['apiKey', '_apiKey'])).toBe(false)
  })

  it('attributes tenant/site per collection', () => {
    expect(getTenantAndSite('tenants', { id: 't1' })).toEqual({ tenant: 't1', site: null })
    expect(getTenantAndSite('sites', { id: 's1', tenant: 't1' })).toEqual({
      tenant: 't1',
      site: 's1',
    })
    expect(getTenantAndSite('smtp-settings', { tenant: 't1', site: 's1' })).toEqual({
      tenant: 't1',
      site: 's1',
    })
    expect(getTenantAndSite('smtp-settings', { tenant: { id: 't1' } })).toEqual({
      tenant: 't1',
      site: null,
    })
    expect(getTenantAndSite('users', { id: 'u1' })).toEqual({ tenant: null, site: null })
  })
})
