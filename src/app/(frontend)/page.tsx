import type { Metadata } from 'next'
import Link from 'next/link'
import React from 'react'

import { getServerSideURL } from '@/utilities/getURL'
import { mergeOpenGraph } from '@/utilities/mergeOpenGraph'

export const metadata: Metadata = {
  title: 'High6 CMS — Multi-Tenant Content Platform',
  description:
    'Payload CMS platform for managing content across multiple client sites from a single admin panel.',
  openGraph: mergeOpenGraph(),
  twitter: {
    card: 'summary_large_image',
    creator: '@high6agency',
  },
  metadataBase: new URL(getServerSideURL()),
}

export default function HomePage() {
  return (
    <main>
      {/* ================================================================
          Hero — Split layout: copy left, browser mockup right, dark bg
          ================================================================ */}
      <section className="relative overflow-hidden bg-[#0A0E1A] text-white">
        {/* Subtle grid pattern overlay */}
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
            backgroundSize: '64px 64px',
          }}
        />
        {/* Faint "6" watermark behind hero copy */}
        <div
          aria-hidden="true"
          className="absolute left-0 top-1/2 -translate-y-1/2 select-none font-display text-[28rem] font-bold leading-none text-white/[0.02]"
          style={{ fontFamily: 'var(--font-space-grotesk)' }}
        >
          6
        </div>

        <div className="container relative z-10 py-24 md:py-32 lg:py-40">
          <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
            {/* Left — copy */}
            <div className="max-w-xl">
              <h1
                className="text-4xl font-semibold leading-tight tracking-tight md:text-5xl lg:text-6xl"
                style={{ fontFamily: 'var(--font-space-grotesk)' }}
              >
                High6{' '}
                <span className="relative inline-block">
                  CMS
                  <span
                    aria-hidden="true"
                    className="absolute bottom-0 left-0 h-[3px] w-full"
                    style={{ background: '#009217' }}
                  />
                </span>
              </h1>
              <p className="mt-6 text-lg leading-relaxed text-white/70 md:text-xl">
                A multi-tenant content platform for managing client websites. One dashboard,
                unlimited sites — each with their own content, media, and team.
              </p>
              <div className="mt-8 flex flex-wrap gap-4">
                <Link
                  className="inline-flex h-12 items-center justify-center rounded-md px-8 text-sm font-semibold text-white transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009217]"
                  href="/admin"
                  style={{ background: '#009217' }}
                >
                  Open Admin
                </Link>
              </div>
            </div>

            {/* Right — browser-frame mockup */}
            <div className="hidden lg:block">
              <div className="rounded-lg border border-white/10 bg-[#161B28] shadow-2xl">
                {/* Browser chrome */}
                <div className="flex items-center gap-2 border-b border-white/5 px-4 py-3">
                  <div className="h-3 w-3 rounded-full bg-white/20" />
                  <div className="h-3 w-3 rounded-full bg-white/20" />
                  <div className="h-3 w-3 rounded-full bg-white/20" />
                  <div className="ml-4 flex-1 rounded-full bg-white/5 px-4 py-1 text-xs text-white/30">
                    app.high6.com/admin
                  </div>
                </div>
                {/* Mockup content */}
                <div className="p-6">
                  {/* Sidebar mock */}
                  <div className="flex gap-4">
                    <div className="w-1/3 space-y-2">
                      <div className="h-3 w-1/2 rounded bg-white/10" />
                      <div className="h-2 w-2/3 rounded bg-white/5" />
                      <div className="h-2 w-3/4 rounded bg-white/5" />
                      <div className="mt-4 h-2 w-1/2 rounded bg-[#009217]/30" />
                      <div className="h-2 w-2/3 rounded bg-white/5" />
                      <div className="h-2 w-3/4 rounded bg-white/5" />
                    </div>
                    {/* Content area mock */}
                    <div className="w-2/3 space-y-3">
                      <div className="h-4 w-1/3 rounded bg-white/10" />
                      <div className="h-2 w-full rounded bg-white/5" />
                      <div className="h-2 w-5/6 rounded bg-white/5" />
                      <div className="h-2 w-4/6 rounded bg-white/5" />
                      <div className="mt-4 grid grid-cols-3 gap-2">
                        <div className="h-16 rounded bg-white/5" />
                        <div className="h-16 rounded bg-[#009217]/10" />
                        <div className="h-16 rounded bg-white/5" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================
          Capabilities — 3-column
          ================================================================ */}
      <section className="bg-[#F5F7FB] py-24 md:py-32">
        <div className="container">
          <div className="mx-auto max-w-2xl text-center">
            <h2
              className="text-3xl font-semibold tracking-tight md:text-4xl"
              style={{ fontFamily: 'var(--font-space-grotesk)' }}
            >
              One platform,{' '}
              <span className="relative inline-block">
                infinite sites
                <span
                  aria-hidden="true"
                  className="absolute bottom-0 left-0 h-[3px] w-full"
                  style={{ background: '#009217' }}
                />
              </span>
            </h2>
            <p className="mt-4 text-lg text-[#525A70]">
              Manage content, media, and configuration across multiple client sites — from a single
              admin panel.
            </p>
          </div>

          <div className="mt-16 grid gap-8 md:grid-cols-3">
            {/* Feature 1 */}
            <div className="rounded-lg border border-[#DADEE8] bg-white p-8 transition-shadow duration-200 hover:shadow-md">
              <div
                className="mb-4 flex h-12 w-12 items-center justify-center rounded-md text-xl font-bold text-white"
                style={{ background: '#0066D6' }}
              >
                <svg
                  className="h-6 w-6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  viewBox="0 0 24 24"
                >
                  <path
                    d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <h3
                className="text-lg font-semibold text-[#0F172A]"
                style={{ fontFamily: 'var(--font-space-grotesk)' }}
              >
                Headless CMS
              </h3>
              <p className="mt-2 leading-relaxed text-[#525A70]">
                API-first architecture means your content works on websites, mobile apps, and
                anywhere else. No lock-in, no compromises.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="rounded-lg border border-[#DADEE8] bg-white p-8 transition-shadow duration-200 hover:shadow-md">
              <div
                className="mb-4 flex h-12 w-12 items-center justify-center rounded-md text-xl font-bold text-white"
                style={{ background: '#009217' }}
              >
                <svg
                  className="h-6 w-6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  viewBox="0 0 24 24"
                >
                  <path
                    d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <h3
                className="text-lg font-semibold text-[#0F172A]"
                style={{ fontFamily: 'var(--font-space-grotesk)' }}
              >
                Multi-site Management
              </h3>
              <p className="mt-2 leading-relaxed text-[#525A70]">
                Run dozens of client sites from one dashboard. Each tenant gets their own content,
                media library, and team — fully isolated.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="rounded-lg border border-[#DADEE8] bg-white p-8 transition-shadow duration-200 hover:shadow-md">
              <div
                className="mb-4 flex h-12 w-12 items-center justify-center rounded-md text-xl font-bold text-white"
                style={{ background: '#F26600' }}
              >
                <svg
                  className="h-6 w-6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  viewBox="0 0 24 24"
                >
                  <path
                    d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <h3
                className="text-lg font-semibold text-[#0F172A]"
                style={{ fontFamily: 'var(--font-space-grotesk)' }}
              >
                AI-Assisted Content
              </h3>
              <p className="mt-2 leading-relaxed text-[#525A70]">
                Smart content suggestions, SEO recommendations, and automated workflows so your team
                spends less time in the dashboard and more time creating.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================
          Admin Quick Links
          ================================================================ */}
      <section className="bg-white py-24 md:py-32">
        <div className="container">
          <div className="mx-auto max-w-3xl text-center">
            <h2
              className="text-3xl font-semibold tracking-tight text-[#0F172A] md:text-4xl"
              style={{ fontFamily: 'var(--font-space-grotesk)' }}
            >
              Jump to the{' '}
              <span className="relative inline-block">
                admin panel
                <span
                  aria-hidden="true"
                  className="absolute bottom-0 left-0 h-[3px] w-full"
                  style={{ background: '#009217' }}
                />
              </span>
            </h2>
            <p className="mt-4 text-lg text-[#525A70]">
              Everything below is managed through the CMS. Log in to add content, configure tenants,
              or inspect the API.
            </p>

            <div className="mt-12 grid gap-6 md:grid-cols-2">
              <Link
                className="rounded-lg border border-[#DADEE8] bg-[#F5F7FB] p-6 text-left transition-shadow duration-200 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009217]"
                href="/admin"
              >
                <p
                  className="font-semibold text-[#0F172A]"
                  style={{ fontFamily: 'var(--font-space-grotesk)' }}
                >
                  Admin Dashboard
                </p>
                <p className="mt-1 text-sm text-[#8A92A6]">
                  Manage collections, tenants, media, and globals from the Payload admin panel.
                </p>
              </Link>
              <Link
                className="rounded-lg border border-[#DADEE8] bg-[#F5F7FB] p-6 text-left transition-shadow duration-200 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009217]"
                href="/api/graphql"
              >
                <p
                  className="font-semibold text-[#0F172A]"
                  style={{ fontFamily: 'var(--font-space-grotesk)' }}
                >
                  GraphQL Playground
                </p>
                <p className="mt-1 text-sm text-[#8A92A6]">
                  Explore the API — tenant-scoped queries, mutations, and the full schema.
                </p>
              </Link>
              <Link
                className="rounded-lg border border-[#DADEE8] bg-[#F5F7FB] p-6 text-left transition-shadow duration-200 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009217]"
                href="/next/seed"
              >
                <p
                  className="font-semibold text-[#0F172A]"
                  style={{ fontFamily: 'var(--font-space-grotesk)' }}
                >
                  Seed Content
                </p>
                <p className="mt-1 text-sm text-[#8A92A6]">
                  POST to <code className="rounded bg-[#DADEE8] px-1 text-xs">/next/seed</code> to
                  populate the database with sample pages, posts, and media.
                </p>
              </Link>
              <Link
                className="rounded-lg border border-[#DADEE8] bg-[#F5F7FB] p-6 text-left transition-shadow duration-200 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#009217]"
                href="/admin/collections/tenants?limit=10"
              >
                <p
                  className="font-semibold text-[#0F172A]"
                  style={{ fontFamily: 'var(--font-space-grotesk)' }}
                >
                  Tenant Management
                </p>
                <p className="mt-1 text-sm text-[#8A92A6]">
                  Configure tenant identities, scoping rules, and access control for multi-tenant
                  content.
                </p>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ================================================================
          Admin CTA Banner
          ================================================================ */}
      <section className="bg-[#0A0E1A] py-24 md:py-32">
        <div className="container text-center">
          <h2
            className="text-3xl font-semibold tracking-tight text-white md:text-4xl"
            style={{ fontFamily: 'var(--font-space-grotesk)' }}
          >
            Everything runs through the CMS
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-white/60">
            Pages, posts, media, tenants, navigation — all managed from one admin panel. No
            hardcoded content, no direct database edits.
          </p>
          <div className="mt-8">
            <Link
              className="inline-flex h-12 items-center justify-center rounded-md px-10 text-sm font-semibold text-white transition-colors duration-200 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              href="/admin"
              style={{ background: '#009217' }}
            >
              Open Admin Panel
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}
