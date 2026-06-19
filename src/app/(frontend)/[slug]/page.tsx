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

  return generateMeta({ doc: page })
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
