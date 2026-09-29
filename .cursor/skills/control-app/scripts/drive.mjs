#!/usr/bin/env node
// Drives the running docs preview in headless Chromium and writes screenshots,
// one walkthrough .webm, and report.json into $EVIDENCE.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(path.join(process.env.CONTROL_APP_TOOLS, 'package.json'))
const { chromium } = require('playwright')

const BASE = process.env.BASE_URL
const EVIDENCE = process.env.EVIDENCE
const DEFAULT_PLAN = {
  features: ['locales', 'nav', 'search', 'langswitch', 'pages'],
  search: { en: 'auto-mode', zh: '权限' },
  pages: [{ path: '/reference/commands', sections: { en: ['Configuration'], zh: ['配置'] } }],
}
const plan = process.env.PLAN ? { ...DEFAULT_PLAN, ...JSON.parse(fs.readFileSync(process.env.PLAN, 'utf8')) } : DEFAULT_PLAN

const LOCALES = {
  en: { prefix: '', lang: 'en-US', searchLabel: 'Search', label: 'English',
        nav: [['Guides', 'Permissions & approvals', '/guide/permissions'], ['Reference', 'Slash commands', '/reference/commands']] },
  zh: { prefix: '/zh', lang: 'zh-CN', searchLabel: '搜索文档', label: '简体中文',
        nav: [['使用场景', '权限与审批', '/zh/guide/permissions'], ['参考', '斜杠命令', '/zh/reference/commands']] },
}

const steps = []
const errors = []
const slug = (s) => s.replace(/^\/+|\/+$/g, '').replace(/[^\w\u4e00-\u9fff-]+/g, '-') || 'home'
const url = (p) => BASE + (p.endsWith('/') ? p : p + '.html')

async function step(id, page, fn) {
  const rec = { id, ok: false }
  try {
    Object.assign(rec, (await fn()) || {})
    rec.ok = true
  } catch (e) {
    rec.error = String(e.message || e).split('\n')[0]
    rec.failShot = `fail-${slug(id)}.png`
    await page.screenshot({ path: path.join(EVIDENCE, rec.failShot) }).catch(() => {})
  }
  rec.url = page.url()
  steps.push(rec)
  console.log(`${rec.ok ? 'PASS' : 'FAIL'} ${id}${rec.error ? ' :: ' + rec.error : ''}`)
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(EVIDENCE, name) })
  return name
}

function expect(cond, msg) {
  if (!cond) throw new Error(msg)
}

async function open(page, p) {
  const res = await page.goto(url(p), { waitUntil: 'networkidle' })
  expect(res && res.status() === 200, `GET ${p} -> ${res && res.status()}`)
  expect(!(await page.locator('.NotFound').count()), `${p} rendered the 404 page`)
}

const headingText = (t) => t.replace(/[\u200b#]/g, '').trim()

async function sectionShot(page, text, name) {
  const box = await page.evaluate((want) => {
    const clean = (t) => t.replace(/[\u200b#]/g, '').trim()
    const hs = [...document.querySelectorAll('.vp-doc h2, .vp-doc h3')]
    const i = hs.findIndex((h) => clean(h.textContent) === want || clean(h.textContent).startsWith(want))
    if (i < 0) return null
    const h = hs[i]
    const level = Number(h.tagName[1])
    const next = hs.slice(i + 1).find((x) => Number(x.tagName[1]) <= level)
    h.scrollIntoView({ block: 'start' })
    window.scrollBy(0, -80)
    const top = h.getBoundingClientRect().top + window.scrollY - 8
    const doc = document.querySelector('.vp-doc').getBoundingClientRect()
    const end = next ? next.getBoundingClientRect().top + window.scrollY - 8 : doc.bottom + window.scrollY
    return { x: Math.max(0, doc.left - 16), y: top, width: doc.width + 32, height: Math.min(Math.max(end - top, 40), 3000), heading: clean(h.textContent) }
  }, text)
  expect(box, `section "${text}" not found`)
  await page.waitForTimeout(700)
  const { heading, ...clip } = box
  await page.screenshot({ path: path.join(EVIDENCE, name), clip, fullPage: true })
  return { heading, screenshot: name }
}

const features = {
  async locales(page) {
    for (const [key, loc] of Object.entries(LOCALES)) {
      await step(`locales:${key}-home`, page, async () => {
        await open(page, loc.prefix + '/')
        const lang = await page.getAttribute('html', 'lang')
        expect(lang === loc.lang, `html lang ${lang} != ${loc.lang}`)
        const title = await page.locator('.VPNavBarTitle').innerText()
        expect(/dsh-cc/.test(title), `nav title "${title}" does not name dsh-cc`)
        const hero = (await page.locator('.VPHero .heading').innerText()).replace(/\s+/g, ' ')
        return { lang, hero, screenshot: await shot(page, `locales-${key}-home.png`) }
      })
    }
  },
  async nav(page) {
    for (const [key, loc] of Object.entries(LOCALES)) {
      for (const [navText, sideText, target] of loc.nav) {
        await step(`nav:${key}:${navText}>${sideText}`, page, async () => {
          await open(page, loc.prefix + '/')
          await page.locator('.VPNavBarMenuLink', { hasText: navText }).first().click()
          await page.locator('.VPSidebar').waitFor()
          await page.locator('.VPSidebar a', { hasText: sideText }).first().click()
          await page.waitForURL((u) => u.pathname.startsWith(target))
          const settled = await page.waitForFunction(
            (want) => (document.querySelector('.vp-doc h1')?.textContent ?? '').replace(/[\u200b#]/g, '').trim() === want,
            sideText, { timeout: 10000 }).then(() => true, () => false)
          const h1 = headingText(await page.locator('.vp-doc h1').first().innerText())
          expect(settled, `h1 "${h1}" != sidebar link "${sideText}"`)
          const active = await page.locator('.VPSidebar .is-active a, .VPSidebar a.active, .VPSidebar .VPSidebarItem.is-active').count()
          expect(active > 0, 'no active sidebar item')
          return { h1, screenshot: await shot(page, `nav-${key}-${slug(target)}.png`) }
        })
      }
    }
  },
  async search(page) {
    for (const [key, loc] of Object.entries(LOCALES)) {
      const q = plan.search[key]
      await step(`search:${key}:${q}`, page, async () => {
        await open(page, loc.prefix + '/')
        await page.locator(`button.DocSearch-Button[aria-label="${loc.searchLabel}"]`).click()
        await page.locator('.VPLocalSearchBox input.search-input').fill(q)
        const results = page.locator('.VPLocalSearchBox .results li a')
        await results.first().waitFor()
        const hrefs = await results.evaluateAll((as) => as.slice(0, 5).map((a) => a.getAttribute('href')))
        expect(hrefs.every((h) => (key === 'zh') === h.startsWith('/zh/')), `results cross locales: ${hrefs.join(', ')}`)
        const shotName = await shot(page, `search-${key}-results.png`)
        await page.keyboard.press('Enter')
        const target = hrefs[0].split('#')[0]
        await page.waitForURL((u) => u.pathname === target)
        return { query: q, results: hrefs, landed: page.url(), screenshot: shotName }
      })
    }
  },
  async langswitch(page, browser) {
    const pick = async (label) => {
      await page.locator('.VPNavBarTranslations button[aria-label="Change language"]').hover()
      await page.locator('.VPNavBarTranslations .VPMenu a', { hasText: label }).click()
    }
    await step('langswitch:en->zh', page, async () => {
      await open(page, '/guide/permissions')
      await page.evaluate(() => localStorage.removeItem('dshcc-lang'))
      await pick(LOCALES.zh.label)
      await page.waitForURL((u) => u.pathname.startsWith('/zh/guide/permissions'))
      const pref = await page.evaluate(() => localStorage.getItem('dshcc-lang'))
      expect(pref === 'zh', `dshcc-lang=${pref}`)
      return { pref, screenshot: await shot(page, 'langswitch-to-zh.png') }
    })
    await step('langswitch:zh->en', page, async () => {
      await pick(LOCALES.en.label)
      await page.waitForURL((u) => u.pathname.startsWith('/guide/permissions'))
      const pref = await page.evaluate(() => localStorage.getItem('dshcc-lang'))
      expect(pref === 'en', `dshcc-lang=${pref}`)
      return { pref, screenshot: await shot(page, 'langswitch-to-en.png') }
    })
    const ctx = await browser.newContext({ locale: 'zh-CN', viewport: { width: 1280, height: 800 } })
    const zhPage = await ctx.newPage()
    await step('langswitch:first-visit-zh-browser-routes-to-zh', zhPage, async () => {
      await zhPage.goto(BASE + '/', { waitUntil: 'networkidle' })
      await zhPage.waitForURL((u) => u.pathname.startsWith('/zh/'))
      return { screenshot: await shot(zhPage, 'langswitch-first-visit-zh.png') }
    })
    await step('langswitch:explicit-en-choice-wins', zhPage, async () => {
      await zhPage.locator('.VPNavBarTranslations button[aria-label="Change language"]').hover()
      await zhPage.locator('.VPNavBarTranslations .VPMenu a', { hasText: LOCALES.en.label }).click()
      await zhPage.goto(BASE + '/', { waitUntil: 'networkidle' })
      expect(new URL(zhPage.url()).pathname === '/', `redirected to ${zhPage.url()}`)
      return { screenshot: await shot(zhPage, 'langswitch-explicit-en.png') }
    })
    await ctx.close()
  },
  async pages(page) {
    for (const entry of plan.pages) {
      for (const [key, loc] of Object.entries(LOCALES)) {
        const p = loc.prefix + entry.path
        await step(`page:${p}`, page, async () => {
          await open(page, p)
          const h1 = headingText(await page.locator('.vp-doc h1').first().innerText())
          const shotName = `page-${slug(p)}.png`
          await page.screenshot({ path: path.join(EVIDENCE, shotName), fullPage: true })
          return { h1, screenshot: shotName }
        })
        for (const [i, text] of ((entry.sections || {})[key] || []).entries()) {
          await step(`section:${p}#${text}`, page, async () => sectionShot(page, text, `section-${slug(p)}-${i + 1}.png`))
        }
      }
    }
  },
}

fs.mkdirSync(EVIDENCE, { recursive: true })
const videoTmp = fs.mkdtempSync(path.join(EVIDENCE, '.video-'))
const browser = await chromium.launch()
const context = await browser.newContext({
  locale: 'en-US',
  viewport: { width: 1280, height: 800 },
  recordVideo: { dir: videoTmp, size: { width: 1280, height: 800 } },
})
const page = await context.newPage()
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`))

for (const f of plan.features) {
  if (!features[f]) throw new Error(`unknown feature ${f}`)
  await features[f](page, browser)
}

const video = page.video()
await context.close()
await video.saveAs(path.join(EVIDENCE, 'walkthrough.webm'))
fs.rmSync(videoTmp, { recursive: true, force: true })
await browser.close()

const failed = steps.filter((s) => !s.ok)
const report = { base: BASE, finishedAt: new Date().toISOString(), plan, passed: steps.length - failed.length, failed: failed.length, steps, browserErrors: errors, video: 'walkthrough.webm' }
fs.writeFileSync(path.join(EVIDENCE, 'report.json'), JSON.stringify(report, null, 2))
console.log(`\n${report.passed} passed, ${report.failed} failed; ${errors.length} browser error(s)\nevidence: ${EVIDENCE}`)
process.exit(failed.length ? 1 : 0)
