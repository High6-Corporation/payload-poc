import { describe, it, expect, vi, beforeEach } from 'vitest'

import config from '@/payload.config'
import { tenantEnabledAccess } from '@/access/tenantScoped'
import { resolveMenuItems } from '@/utilities/resolveMenuItems'

// ---------------------------------------------------------------------------
// Collection registration
// ---------------------------------------------------------------------------

describe('MenuItems collection', () => {
  it('is registered with tenant + site scoping fields', async () => {
    const resolved = await config
    const menuItems = resolved.collections?.find((c) => c.slug === 'menu-items')
    expect(menuItems).toBeDefined()

    const names = (menuItems!.fields as { name: string }[]).map((f) => f.name)
    expect(names).toEqual(
      expect.arrayContaining(['label', 'link', 'order', 'enabled', 'tenant', 'site']),
    )
    expect(menuItems!.admin?.useAsTitle).toBe('label')
  })

  it('gates all four operations with the same tenantEnabledAccess factory', async () => {
    const resolved = await config
    const menuItems = resolved.collections?.find((c) => c.slug === 'menu-items')
    const access = menuItems!.access!
    expect(access.create).toBe(access.read)
    expect(access.update).toBe(access.read)
    expect(access.delete).toBe(access.read)
  })
})

// ---------------------------------------------------------------------------
// Access control (factory unit tests — no DB, req.payload.find is mocked)
// ---------------------------------------------------------------------------

const makeReq = (user: unknown, tenantDocs: unknown[]) => {
  const req = {
    user,
    context: {},
    payload: {
      find: vi.fn().mockResolvedValue({ docs: tenantDocs }),
    },
    headers: new Headers(),
  }
  return req
}

const tenantAdmin = (tenantIds: string[]) => ({
  id: 'u1',
  roles: ['tenant-admin'],
  tenants: tenantIds.map((id) => ({ tenant: id })),
})

describe('tenantEnabledAccess("menu-items")', () => {
  const access = tenantEnabledAccess('menu-items')

  it('allows unauthenticated reads (public nav rendering)', async () => {
    const result = await access({ req: makeReq(null, []) } as any)
    expect(result).toBe(true)
  })

  it('allows super-admin without any tenant lookup', async () => {
    const req = makeReq({ id: 'u1', roles: ['super-admin'] }, [])
    const result = await access({ req } as any)
    expect(result).toBe(true)
    expect(req.payload.find).not.toHaveBeenCalled()
  })

  it('scopes tenant-admins to their enabled tenants', async () => {
    const req = makeReq(tenantAdmin(['t1', 't2']), [
      { id: 't1', disabledCollections: [] },
      { id: 't2', disabledCollections: [] },
    ])
    const result = await access({ req } as any)
    expect(result).toEqual({ tenant: { in: ['t1', 't2'] } })
  })

  it('denies when every assigned tenant disables menu-items', async () => {
    const req = makeReq(tenantAdmin(['t1']), [
      { id: 't1', disabledCollections: ['builtin:menu-items'] },
    ])
    const result = await access({ req } as any)
    expect(result).toBe(false)
  })

  it('allows create when the incoming tenant is enabled', async () => {
    const req = makeReq(tenantAdmin(['t1']), [{ id: 't1', disabledCollections: [] }])
    const result = await access({ req, data: { tenant: 't1' } } as any)
    expect(result).toBe(true)
  })

  it('denies create for a tenant outside the enabled set', async () => {
    const req = makeReq(tenantAdmin(['t1']), [{ id: 't1', disabledCollections: [] }])
    const result = await access({ req, data: { tenant: 't2' } } as any)
    expect(result).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// resolveMenuItems — site-override → tenant-default (stubbed payload, no DB)
// ---------------------------------------------------------------------------

describe('resolveMenuItems', () => {
  let find: ReturnType<typeof vi.fn>
  const payloadStub = {} as any

  beforeEach(() => {
    find = vi.fn()
    payloadStub.find = find
  })

  it('returns site-override items when present', async () => {
    find.mockResolvedValueOnce({
      docs: [
        { id: 'a', label: 'Site A', order: 0 },
        { id: 'b', label: 'Site B', order: 1 },
      ],
    })
    const items = await resolveMenuItems(payloadStub, 't1', 's1')
    expect(items.map((i) => i.id)).toEqual(['a', 'b'])
    expect(find).toHaveBeenCalledTimes(1)
  })

  it('falls back to tenant-default items when the site has none', async () => {
    find.mockResolvedValueOnce({ docs: [] })
    find.mockResolvedValueOnce({ docs: [{ id: 'd', label: 'Default', order: 0 }] })
    const items = await resolveMenuItems(payloadStub, 't1', 's1')
    expect(items.map((i) => i.id)).toEqual(['d'])
    expect(find).toHaveBeenCalledTimes(2)
    const second = find.mock.calls[1][0]
    expect(second.where.and).toContainEqual({ site: { exists: false } })
  })

  it('returns [] when nothing exists', async () => {
    find.mockResolvedValue({ docs: [] })
    const items = await resolveMenuItems(payloadStub, 't1', 's1')
    expect(items).toEqual([])
  })

  it('queries enabled items sorted by order, bypassing access', async () => {
    find.mockResolvedValue({ docs: [] })
    await resolveMenuItems(payloadStub, 't1', 's1')
    const call = find.mock.calls[0][0]
    expect(call.collection).toBe('menu-items')
    expect(call.sort).toBe('order')
    expect(call.overrideAccess).toBe(true)
    expect(call.where.and).toContainEqual({ enabled: { equals: true } })
  })
})
