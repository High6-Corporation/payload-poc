/**
 * Seed script for the apir-tayo tenant.
 *
 * Populates FAQs, PricingPlans, Testimonials, and PortfolioItems
 * via the Payload REST API. Safe to re-run — existing records
 * are detected and skipped.
 *
 * Usage:
 *   cd ~/work/payload-poc
 *   pnpm tsx src/scripts/seed-apirtayo.ts
 *
 * Requires the dev server running at http://localhost:3000.
 */

const BASE_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000'
const EMAIL = process.env.AGENT_EMAIL || 'agent@payload-poc.local'
const PASSWORD = process.env.AGENT_PASSWORD || 'password123'
const TENANT_SLUG = 'apir-tayo'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SeedResult {
  collection: string
  created: number
  skipped: number
  errors: string[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function login(): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/users/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Login failed (HTTP ${res.status}): ${body}`)
  }

  const data = await res.json()
  if (!data?.token) {
    throw new Error(`Login response missing token: ${JSON.stringify(data)}`)
  }
  return data.token
}

async function resolveTenant(token: string, slug: string): Promise<string> {
  const url = `${BASE_URL}/api/tenants?where[slug][equals]=${encodeURIComponent(slug)}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Tenant lookup failed (HTTP ${res.status}): ${body}`)
  }

  const { docs } = (await res.json()) as { docs: { id: string; slug: string }[] }
  if (!docs?.length) {
    throw new Error(`Tenant "${slug}" not found. Has the tenant been created in the admin panel?`)
  }

  const { id } = docs[0]
  if (!/^[a-f0-9]{24}$/.test(id)) {
    throw new Error(`Tenant "${slug}" resolved to invalid ObjectId: ${id}`)
  }

  return id
}

async function checkExists(
  token: string,
  collection: string,
  tenantId: string,
  matchField: string,
  matchValue: string,
): Promise<boolean> {
  const url = `${BASE_URL}/api/${collection}?where[and][0][tenant][equals]=${encodeURIComponent(tenantId)}&where[and][1][${matchField}][equals]=${encodeURIComponent(matchValue)}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Check exists failed on ${collection} (HTTP ${res.status}): ${body}`)
  }

  const { totalDocs } = (await res.json()) as { totalDocs: number }
  return totalDocs > 0
}

async function createDoc(
  token: string,
  collection: string,
  data: Record<string, unknown>,
): Promise<{ id: string }> {
  const res = await fetch(`${BASE_URL}/api/${collection}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Create failed on ${collection} (HTTP ${res.status}): ${body}`)
  }

  const doc = (await res.json()) as { doc?: { id: string }; id?: string }
  // Payload wraps created docs in { doc: {...} } or returns { id: ... } directly
  const id = doc?.doc?.id ?? doc?.id
  if (!id) {
    throw new Error(`Create succeeded but no id in response: ${JSON.stringify(doc)}`)
  }
  return { id }
}

// ---------------------------------------------------------------------------
// Seed helpers — each seeds one record and returns true if created, false if skipped
// ---------------------------------------------------------------------------

async function seedOne(
  token: string,
  collection: string,
  tenantId: string,
  matchField: string,
  matchValue: string,
  data: Record<string, unknown>,
): Promise<{ created: boolean; error?: string }> {
  try {
    const exists = await checkExists(token, collection, tenantId, matchField, matchValue)
    if (exists) {
      console.log(`  ⏭  Skipping "${matchValue}" (already exists)`)
      return { created: false }
    }

    await createDoc(token, collection, { ...data, tenant: tenantId })
    console.log(`  ✓  Created "${matchValue}"`)
    return { created: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`  ✗  Failed "${matchValue}": ${msg}`)
    return { created: false, error: msg }
  }
}

// ---------------------------------------------------------------------------
// Collection seeders
// ---------------------------------------------------------------------------

async function seedFAQs(token: string, tenantId: string): Promise<SeedResult> {
  console.log('\n📋 Seeding FAQs…')
  const faqs = [
    {
      question: 'Is this custom?',
      answer:
        "Yes, every website is custom-designed specifically for your business and brand. We don't use generic templates.",
      order: 1,
    },
    {
      question: 'Can I upgrade later?',
      answer:
        'Absolutely! You can upgrade your website at any time to add more pages, features, or functionality as your business grows.',
      order: 2,
    },
    {
      question: 'Is there a contract?',
      answer:
        'We offer flexible month-to-month plans with no long-term contracts. You can cancel anytime without penalties.',
      order: 3,
    },
    {
      question: 'What do I need to prepare?',
      answer:
        "Just your business information, any existing brand assets (logos, colors), and content you'd like to include on your website.",
      order: 4,
    },
    {
      question: 'Is maintenance included?',
      answer:
        'Yes! Regular updates, maintenance, and quarterly check-ins are all included in your monthly subscription.',
      order: 5,
    },
  ]

  let created = 0
  let skipped = 0
  const errors: string[] = []

  for (const faq of faqs) {
    const result = await seedOne(token, 'faqs', tenantId, 'question', faq.question, {
      question: faq.question,
      answer: faq.answer,
      order: faq.order,
    })
    if (result.created) created++
    else if (!result.error) skipped++
    if (result.error) errors.push(`FAQ "${faq.question}": ${result.error}`)
  }

  return { collection: 'FAQs', created, skipped, errors }
}

async function seedPricingPlans(token: string, tenantId: string): Promise<SeedResult> {
  console.log('\n💰 Seeding Pricing Plans…')
  const plans = [
    {
      label: 'Website Essentials',
      items: [{ item: 'Company overview' }, { item: 'Products or services' }, { item: 'Testimonials' }, { item: 'Contact form' }],
      order: 1,
    },
    {
      label: 'Technical Setup',
      items: [{ item: 'Mobile-responsive layout' }, { item: 'Hosting' }, { item: 'Basic security' }],
      order: 2,
    },
    {
      label: 'Ongoing Support',
      items: [{ item: 'Support & updates' }, { item: 'Quarterly check' }],
      order: 3,
    },
    {
      label: 'Flexible & Transparent',
      items: [{ item: 'No hidden fees' }, { item: 'Cancel anytime' }],
      order: 4,
    },
  ]

  let created = 0
  let skipped = 0
  const errors: string[] = []

  for (const plan of plans) {
    const result = await seedOne(token, 'pricing-plans', tenantId, 'label', plan.label, {
      label: plan.label,
      items: plan.items,
      order: plan.order,
    })
    if (result.created) created++
    else if (!result.error) skipped++
    if (result.error) errors.push(`PricingPlan "${plan.label}": ${result.error}`)
  }

  return { collection: 'Pricing Plans', created, skipped, errors }
}

async function seedTestimonials(token: string, tenantId: string): Promise<SeedResult> {
  console.log('\n⭐ Seeding Testimonials…')
  const testimonials = [
    {
      quote:
        'High6 delivered a clean, modern website that perfectly reflects our brand. The process was smooth, fast, and very well-managed from start to finish.',
      name: 'Jason Go',
      position: 'Vice President, GTGO Enterprises Inc.',
    },
    {
      quote:
        'Working with High6 was seamless. They understood our requirements clearly and delivered a website that looks professional and performs well across all devices.',
      name: 'Gene Nicolas',
      position: 'Founder, Premiere Builders Corp.',
    },
    {
      quote:
        'High6 transformed our ideas into a functional and engaging website. Their attention to detail and responsiveness made the entire collaboration easy and efficient.',
      name: 'Claudia Soriano',
      position: 'CEO, All About People',
    },
  ]

  let created = 0
  let skipped = 0
  const errors: string[] = []

  for (const t of testimonials) {
    const result = await seedOne(token, 'testimonials', tenantId, 'name', t.name, {
      quote: t.quote,
      name: t.name,
      position: t.position,
    })
    if (result.created) created++
    else if (!result.error) skipped++
    if (result.error) errors.push(`Testimonial "${t.name}": ${result.error}`)
  }

  return { collection: 'Testimonials', created, skipped, errors }
}

async function seedPortfolioItems(token: string, tenantId: string): Promise<SeedResult> {
  console.log('\n🖼  Seeding Portfolio Items…')
  const items = [
    { title: 'Soding Bros', category: 'Technology', url: 'https://sodingbros.com/' },
    { title: 'Tipping Point PH', category: 'Services', url: 'https://tippingpoint.ph/' },
    { title: 'Ad-Haven', category: 'Maintenance', url: 'https://ad-haven.com/' },
    { title: 'Michael James Love', category: 'Education', url: 'https://michaeljameslove.com/' },
    { title: 'City Tech', category: 'Construction', url: 'https://citytech.com.ph/' },
    { title: 'Edgetech', category: 'Industrial', url: 'https://edgetech-ph.com/' },
  ]

  let created = 0
  let skipped = 0
  const errors: string[] = []

  for (const item of items) {
    const result = await seedOne(token, 'portfolio-items', tenantId, 'title', item.title, {
      title: item.title,
      category: item.category,
      url: item.url,
    })
    if (result.created) created++
    else if (!result.error) skipped++
    if (result.error) errors.push(`PortfolioItem "${item.title}": ${result.error}`)
  }

  return { collection: 'Portfolio Items', created, skipped, errors }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('🌱 Seed: apir-tayo tenant')
  console.log(`   Server: ${BASE_URL}`)
  console.log(`   User:   ${EMAIL}`)
  console.log(`   Tenant: ${TENANT_SLUG}`)

  // 1. Authenticate
  console.log('\n🔐 Logging in…')
  const token = await login()
  console.log('   Token obtained ✓')

  // 2. Resolve tenant
  console.log(`\n🔍 Resolving tenant "${TENANT_SLUG}"…`)
  const tenantId = await resolveTenant(token, TENANT_SLUG)
  console.log(`   Tenant ID: ${tenantId} ✓`)

  // 3. Seed collections in order
  const results: SeedResult[] = []

  results.push(await seedFAQs(token, tenantId))
  results.push(await seedPricingPlans(token, tenantId))
  results.push(await seedTestimonials(token, tenantId))
  results.push(await seedPortfolioItems(token, tenantId))

  // 4. Summary
  const totalCreated = results.reduce((sum, r) => sum + r.created, 0)
  const totalSkipped = results.reduce((sum, r) => sum + r.skipped, 0)
  const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0)

  console.log('\n═══════════════════════════════════════')
  console.log('📊 Seed Summary')
  console.log('═══════════════════════════════════════')
  for (const r of results) {
    const status = r.errors.length > 0 ? '⚠' : '✓'
    console.log(`  ${status} ${r.collection}: ${r.created} new, ${r.skipped} skipped${r.errors.length ? `, ${r.errors.length} errors` : ''}`)
  }
  console.log('───────────────────────────────────────')
  console.log(`  Total: ${totalCreated} created, ${totalSkipped} skipped, ${totalErrors} errors`)

  if (totalErrors > 0) {
    console.log('\n❌ Errors:')
    for (const r of results) {
      for (const err of r.errors) {
        console.log(`  - ${err}`)
      }
    }
    process.exit(1)
  }

  console.log('\n✅ Done.\n')
}

main().catch((err) => {
  console.error('\n💥 Seed failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
