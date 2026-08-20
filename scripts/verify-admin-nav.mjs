import { createRequire } from 'node:module'
import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
const require = createRequire(new URL('../package.json', import.meta.url))
require('dotenv/config')
const { chromium } = require('@playwright/test')

const SHOT_DIR = new URL('../.playwright/', import.meta.url).pathname

// Credentials come from env vars only — never committed (v35 precedent:
// a spec was deleted for holding login credentials). dotenv loads the
// gitignored .env automatically if one exists in the repo root.
const EMAIL = process.env.VERIFY_ADMIN_EMAIL
const PASSWORD = process.env.VERIFY_ADMIN_PASSWORD
if (!EMAIL || !PASSWORD) {
  console.error(
    'VERIFY_ADMIN_EMAIL and VERIFY_ADMIN_PASSWORD env vars are required. ' +
      'Set them in your shell or in a gitignored .env file (dotenv loads it automatically).',
  )
  process.exit(2)
}

// Playwright's pinned headless-shell build may not be installed on this
// machine (its install stalls on this network). Fall back to any chromium
// build already present in the ms-playwright cache — machine-portable, no
// hardcoded paths.
function findPlaywrightChromium() {
  const cacheRoot = join(homedir(), 'Library', 'Caches', 'ms-playwright')
  if (!existsSync(cacheRoot)) return null
  const candidates = readdirSync(cacheRoot)
    .filter((d) => d.startsWith('chromium-') && !d.includes('headless_shell'))
    .sort()
    .reverse()
  for (const dir of candidates) {
    const bin = join(
      cacheRoot,
      dir,
      'chrome-mac-arm64',
      'Google Chrome for Testing.app',
      'Contents',
      'MacOS',
      'Google Chrome for Testing',
    )
    if (existsSync(bin)) return bin
  }
  return null
}

async function launch() {
  try {
    return await chromium.launch({ headless: true })
  } catch {
    const fallback = findPlaywrightChromium()
    if (!fallback) throw new Error('No Playwright chromium build found in the ms-playwright cache')
    return chromium.launch({ headless: true, executablePath: fallback })
  }
}

async function login(page) {
  await page.goto('http://localhost:3000/admin/login')
  await page.waitForSelector('input[name="email"]', { timeout: 45000 })
  await page.waitForTimeout(3000) // let React hydration settle before touching controlled inputs
  const setValue = async (sel, value) => {
    await page.click(sel)
    await page.evaluate(
      ([s, v]) => {
        const el = document.querySelector(s)
        const setter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value',
        ).set
        setter.call(el, v)
        el.dispatchEvent(new Event('input', { bubbles: true }))
        el.dispatchEvent(new Event('change', { bubbles: true }))
      },
      [sel, value],
    )
  }
  await setValue('input[name="email"]', EMAIL)
  await setValue('input[name="password"]', PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL('http://localhost:3000/admin', { timeout: 45000 })
  await page.waitForSelector('nav.nav__wrap', { timeout: 45000 })
}

const failures = []
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures.push(name)
}

// The admin list view can be slow to render while the dev server is busy
// compiling. Retry the navigation a few times and log page state on failure.
async function gotoMediaTable(page) {
  let lastError = null
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await page.goto('http://localhost:3000/admin/collections/media')
      await page.waitForSelector('.table', { timeout: 60000 })
      return
    } catch (e) {
      lastError = e
      if (attempt < 3) console.log(`media table wait timed out (attempt ${attempt}) — retrying`)
    }
  }
  const info = await page.evaluate(() => ({
    url: location.href,
    body: document.body.innerText.slice(0, 500),
  }))
  console.log('media page diagnostics:', JSON.stringify(info, null, 1))
  throw lastError
}

const browser = await launch()

// ---------- Sidebar scroll assertions ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  await login(page)

  await gotoMediaTable(page)
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
  await page.waitForTimeout(500)

  const r = await page.evaluate(() => {
    const nav = document.querySelector('nav.nav__wrap')
    const links = [...document.querySelectorAll('nav.nav__wrap a')]
    const logout = links[links.length - 1]
    return {
      navTop: Math.round(nav.getBoundingClientRect().top),
      innerHeight: window.innerHeight,
      clientH: nav.clientHeight,
      scrollH: nav.scrollHeight,
      logoutBottom: Math.round(logout.getBoundingClientRect().bottom),
    }
  })

  // Pinned: nav top must stay at 0 while the page is scrolled to the bottom
  check('sidebar pinned at page scroll bottom', r.navTop === 0, `navTop=${r.navTop}`)
  // Own scroll: content taller than viewport must be reachable via nav scroll.
  // Page is first scrolled back to the top so a pass can only come from the
  // sidebar's own scroll — not from the page carrying the nav upward.
  const reachable = await page.evaluate(() => {
    const nav = document.querySelector('nav.nav__wrap')
    window.scrollTo(0, 0)
    const links = [...document.querySelectorAll('nav.nav__wrap a')]
    const logout = links[links.length - 1]
    nav.scrollTop = nav.scrollHeight
    const scrolled = nav.scrollTop > 0
    const visible = logout.getBoundingClientRect().bottom <= window.innerHeight
    return { scrolled, visible, scrollTop: nav.scrollTop }
  })
  check(
    'logout reachable via sidebar self-scroll',
    reachable.scrolled && reachable.visible,
    JSON.stringify(reachable),
  )

  await page.screenshot({ path: `${SHOT_DIR}sidebar-fixed-bottom.png` })
  await ctx.close()
}

// ---------- Nav group assertions ----------
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  await login(page)

  const groups = await page.evaluate(() => {
    const result = {}
    for (const el of document.querySelectorAll('.nav-group')) {
      const label = el.querySelector('.nav-group__label')?.textContent || ''
      const items = [...el.querySelectorAll('.nav-group__content a')].map(
        (a) => a.querySelector('.nav__link-label')?.textContent || a.textContent || '',
      )
      result[label] = items
    }
    return result
  })

  check('Logs group exists', 'Logs' in groups, JSON.stringify(Object.keys(groups)))
  check(
    'Logs group contains Email Logs',
    (groups['Logs'] || []).some((l) => l.includes('Email Logs')),
  )
  check(
    'Logs group contains Agent Audit Log (super-admin only)',
    (groups['Logs'] || []).some((l) => l.includes('Agent Audit Log')),
  )
  check(
    'Logs group renders after Custom Content (bottom)',
    Object.keys(groups).indexOf('Logs') > Object.keys(groups).indexOf('Custom Content'),
    JSON.stringify(Object.keys(groups)),
  )
  check(
    'Tenant Management no longer contains Email Logs',
    !(groups['Tenant Management'] || []).some((l) => l.includes('Email Logs')),
  )
  await page.screenshot({ path: `${SHOT_DIR}nav-groups.png` })
  await ctx.close()
}

// ---------- Mobile collapse regression ----------
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await ctx.newPage()
  await login(page)
  const m = await page.evaluate(() => ({
    navOpen: document.querySelector('.template-default--nav-open') !== null,
    hOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }))
  // At <=768px Payload collapses the nav behind the toggler; it must not be forced open
  check('mobile nav collapsed (no forced open)', !m.navOpen)
  check('no horizontal overflow on mobile', !m.hOverflow)
  await ctx.close()
}

await browser.close()
if (failures.length) {
  console.error(`\n${failures.length} check(s) FAILED: ${failures.join('; ')}`)
  process.exit(1)
}
console.log('\nall checks passed')
