import { chromium } from 'playwright-core'
const APP = process.env.APP_URL ?? 'http://localhost:3001'
let pass = 0, fail = 0
const check = (ok: boolean, n: string, d = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${n}${d ? ` \x1b[2m${d}\x1b[0m` : ''}`) }

const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const ctx = await b.newContext({ viewport: { width: 375, height: 812 } })
const p = await ctx.newPage(); p.setDefaultTimeout(45000)
const errs: string[] = []
p.on('pageerror', (e) => errs.push(e.message))

await p.goto(`${APP}/`, { waitUntil: 'networkidle' })
await p.locator('input[autocomplete="username"]').fill('ton.k')
await p.locator('input[type="password"]').first().fill('AwaDemo2026!')
await p.locator('form button[type="submit"]').first().click()
await p.waitForTimeout(9000)

console.log('\n\x1b[1mเริ่มเล่นใน 2 แตะ\x1b[0m')
await p.goto(`${APP}/office/fun/checkers`, { waitUntil: 'load' })
await p.waitForTimeout(2500)
errs.length = 0

const vsBot = p.getByRole('button', { name: /เล่นกับบอท/ })
check(await vsBot.count() > 0, 'มีปุ่มเล่นกับบอทบนจอแรก')
await vsBot.click()
await p.waitForTimeout(1200)

const cells = p.locator('[role="gridcell"]')
check(await cells.count() === 64, 'กระดาน 64 ช่อง', `${await cells.count()}`)

const pieces = await p.evaluate(() => document.querySelectorAll('[role="gridcell"] span.rounded-full.shadow').length)
check(pieces === 16, 'หมาก 16 ตัวบนกระดาน', `${pieces}`)

console.log('\n\x1b[1mกระดานพอดีจอแนวตั้ง\x1b[0m')
const g = await p.evaluate(() => {
  const el = document.querySelector('[role="grid"]')!
  const r = el.getBoundingClientRect()
  return { w: Math.round(r.width), h: Math.round(r.height), vw: window.innerWidth, bottom: Math.round(r.bottom), vh: window.innerHeight }
})
check(Math.abs(g.w - g.h) <= 2, 'กระดานเป็นจัตุรัส', `${g.w}×${g.h}`)
check(g.w <= g.vw, 'ไม่ล้นความกว้างจอ', `${g.w} ≤ ${g.vw}`)
check(g.bottom <= g.vh, 'อยู่ในจอแรก', `ล่างสุด ${g.bottom} / ${g.vh}`)
const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
check(over <= 1, 'ไม่ล้นแนวนอน', `เกิน ${over}px`)

console.log('\n\x1b[1mแตะเลือก → ไฮไลต์ → เดิน\x1b[0m')
/* หาหมากฝ่ายล่างที่เดินได้ แล้วแตะ */
const firstIdx = await p.evaluate(() => {
  const cs = [...document.querySelectorAll('[role="gridcell"]')]
  for (let i = 0; i < cs.length; i++) {
    const sp = cs[i]!.querySelector('span.rounded-full.shadow')
    if (sp && getComputedStyle(sp).backgroundColor !== 'rgba(0, 0, 0, 0)' && i >= 40) return i
  }
  return -1
})
check(firstIdx >= 0, 'เจอหมากฝ่ายล่าง', `ช่อง ${firstIdx}`)

await cells.nth(firstIdx).click()
await p.waitForTimeout(400)
const hl = await p.evaluate(() => document.querySelectorAll('[role="gridcell"] span.bg-accent\\/70').length)
check(hl > 0, 'แตะแล้วไฮไลต์ช่องที่เดินได้', `${hl} ช่อง`)

/* แตะช่องปลายทางช่องแรก */
const targetIdx = await p.evaluate(() => {
  const cs = [...document.querySelectorAll('[role="gridcell"]')]
  for (let i = 0; i < cs.length; i++) if (cs[i]!.querySelector('span.bg-accent\\/70')) return i
  return -1
})
await cells.nth(targetIdx).click()
await p.waitForTimeout(600)
const movedAway = await p.evaluate((i) => !document.querySelectorAll('[role="gridcell"]')[i]!.querySelector('span.rounded-full.shadow'), firstIdx)
check(movedAway, 'หมากย้ายออกจากช่องเดิมจริง')

console.log('\n\x1b[1mบอทเดินตอบ\x1b[0m')
await p.waitForTimeout(2500)
const topLost = await p.evaluate(() => document.body.textContent?.includes('บอท') ?? false)
check(topLost, 'ยังอยู่ในเกมกับบอท')
const after = await p.evaluate(() => document.querySelectorAll('[role="gridcell"] span.rounded-full.shadow').length)
check(after === 16, 'จำนวนหมากยังครบหลังทั้งสองฝ่ายเดิน', `${after}`)
check(errs.length === 0, 'ไม่มี JS error', errs.slice(0,2).join(' · '))

console.log('\n\x1b[1mจุดแตะ\x1b[0m')
const small = await p.evaluate(() => {
  const bad: string[] = []
  for (const el of document.querySelectorAll('main button:not([role=gridcell]), main a[href]')) {
    const r = el.getBoundingClientRect()
    if (!r.height || r.height >= 44 || el.closest('footer')) continue
    bad.push(`${(el.textContent ?? '').trim().slice(0,12)}=${Math.round(r.height)}`)
  }
  return bad.slice(0, 4)
})
check(small.length === 0, 'ปุ่มนอกกระดาน ≥44px', small.join(' · '))
const cellH = await p.evaluate(() => Math.round(document.querySelector('[role="gridcell"]')!.getBoundingClientRect().height))
check(cellH >= 38, 'ช่องกระดานใหญ่พอให้แตะแม่น', `${cellH}px`)

console.log(`\n\x1b[1mผ่าน ${pass} · ล้ม ${fail}\x1b[0m`)
await b.close()
process.exit(fail ? 1 : 0)
