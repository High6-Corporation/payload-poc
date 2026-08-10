import type { Metadata } from 'next'

import { PayloadRedirects } from '@/components/PayloadRedirects'
import configPromise from '@payload-config'
import { getPayload, type RequiredDataFromCollectionSlug } from 'payload'
import { draftMode } from 'next/headers'
import React, { cache } from 'react'
import { homeStatic } from '@/endpoints/seed/home-static'

import { RenderBlocks } from '@/blocks/RenderBlocks'
import { RenderHero } from '@/heros/RenderHero'
import { generateMeta } from '@/utilities/generateMeta'
import PageClient from './page.client'
import type { Tenant } from '@/payload-types'

import { LivePreviewListener } from '@/components/LivePreviewListener'
import { resolveTenantIdFromSiteSlug } from '@/utilities/resolveSite'
import { TenantCookieSync } from '@/components/TenantCookieSync'

export async function generateStaticParams() {
  const payload = await getPayload({ config: configPromise })
  const pages = await payload.find({
    collection: 'pages',
    draft: false,
    limit: 1000,
    overrideAccess: false,
    pagination: false,
    select: {
      slug: true,
    },
  })

  const params = pages.docs
    ?.filter((doc) => {
      return doc.slug !== 'home'
    })
    .map(({ slug }) => {
      return { slug }
    })

  return params
}

type Args = {
  params: Promise<{
    slug?: string
  }>
  searchParams: Promise<{
    tenant?: string
  }>
}

export default async function Page({
  params: paramsPromise,
  searchParams: searchParamsPromise,
}: Args) {
  const { isEnabled: draft } = await draftMode()
  const { slug = 'home' } = await paramsPromise
  const { tenant: tenantSlug } = await searchParamsPromise
  // Decode to support slugs with special characters
  const decodedSlug = decodeURIComponent(slug)
  const url = '/' + decodedSlug

  const tenantId = await resolveTenantIdFromSiteSlug(tenantSlug)

  let page: RequiredDataFromCollectionSlug<'pages'> | null

  page = await queryPageBySlug({
    slug: decodedSlug,
  })

  // Remove this code once your website is seeded
  if (!page && slug === 'home') {
    page = homeStatic
  }

  if (!page) {
    return <PayloadRedirects url={url} />
  }

  // Resolve the page's tenant slug for the client-side cookie sync.
  // Pages are tenant-scoped (multi-tenant plugin), so we look up the
  // tenant directly — site derivation is not needed here.
  const pageTenantId =
    typeof page.tenant === 'string' ? page.tenant : ((page.tenant as Tenant)?.id ?? null)
  let pageTenantSlug: string | null = null
  if (pageTenantId) {
    try {
      const tenantPayload = await getPayload({ config: configPromise })
      const tenant = await tenantPayload.findByID({
        collection: 'tenants',
        id: pageTenantId,
        depth: 0,
      })
      pageTenantSlug = (tenant as { slug?: string })?.slug ?? null
    } catch {
      pageTenantSlug = null
    }
  }

  const { hero, layout } = page

  return (
    <article className="pt-16 pb-24">
      <TenantCookieSync tenantSlug={pageTenantSlug} />
      <PageClient />
      {/* Allows redirects for valid pages too */}
      <PayloadRedirects disableNotFound url={url} />

      {draft && <LivePreviewListener />}

      <RenderHero {...hero} />
      <RenderBlocks blocks={layout} tenantId={tenantId} />
    </article>
  )
}

export async function generateMetadata({ params: paramsPromise }: Args): Promise<Metadata> {
  const { slug = 'home' } = await paramsPromise
  // Decode to support slugs with special characters
  const decodedSlug = decodeURIComponent(slug)
  const page = await queryPageBySlug({
    slug: decodedSlug,
  })

  // Page-level focus keywords take precedence; fall back to the tenant's
  // SiteSettings keywords when the page has none set.
  let keywords: string | null = page?.meta?.focusKeyword ?? null
  if (!keywords && page?.tenant) {
    keywords = await resolveSiteSettingsKeywords(page.tenant)
  }

  return generateMeta({ doc: page, keywords })
}

/**
 * Resolve the tenant's SiteSettings focus keywords via the
 * tenant → sites → site-settings chain.
 *
 * `overrideAccess: true` is required because both `sites` and
 * `site-settings` deny anonymous reads (tenant-scoped access control),
 * while this metadata is rendered into the public page's
 * `<meta name="keywords">` and is public by nature.
 */
const resolveSiteSettingsKeywords = async (
  tenant: string | Tenant | null | undefined,
): Promise<string | null> => {
  const tenantId = typeof tenant === 'string' ? tenant : tenant?.id
  if (!tenantId) return null

  const payload = await getPayload({ config: configPromise })

  try {
    const { docs: sites } = await payload.find({
      collection: 'sites',
      where: { tenant: { equals: tenantId } },
      depth: 0,
      pagination: false,
      limit: 1,
      overrideAccess: true,
    })

    const site = sites?.[0]
    if (!site) return null

    const { docs: settings } = await payload.find({
      collection: 'site-settings',
      where: { site: { equals: site.id } },
      depth: 0,
      pagination: false,
      limit: 1,
      overrideAccess: true,
    })

    return settings?.[0]?.meta?.focusKeyword ?? null
  } catch {
    return null
  }
}

const queryPageBySlug = cache(async ({ slug }: { slug: string }) => {
  const { isEnabled: draft } = await draftMode()

  const payload = await getPayload({ config: configPromise })

  const result = await payload.find({
    collection: 'pages',
    draft,
    limit: 1,
    pagination: false,
    overrideAccess: draft,
    where: {
      slug: {
        equals: slug,
      },
    },
  })

  return result.docs?.[0] || null
})
