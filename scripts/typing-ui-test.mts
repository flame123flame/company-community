/**
 * ด่านตรวจหน้าแข่งพิมพ์ดีดบนเบราว์เซอร์จริง — จอ 375px
 * รันด้วย: APP_URL=http://localhost:3001 npx tsx scripts/typing-ui-test.mts
 *
 * ★★ unit test พิสูจน์ว่าสูตรถูก ★ ไฟล์นี้พิสูจน์ว่าสูตรถูกต่อเข้ากับช่องจริง
 *    ★★ สองอย่างนี้พังแยกกันได้ — การนับที่ถูกแต่ไม่เคยถูกเรียก ก็ยังผิดอยู่ดี
 */
import { chromium } from 'playwright-core'
const APP = process.env.APP_URL ?? 'http://localhost:3001'
let pass = 0, fail = 0
const check = (ok: boolean, n: string, d = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${n}${d ? ` \x1b[2m${d}\x1b[0m` : ''}`) }
const head = (s: string) => console.log(`\n\x1b[1m${s}\x1b[0m`)

const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, permissions: [] })
const p = await ctx.newPage(); p.setDefaultTimeout(45000)
const errs: string[] = []
p.on('pageerror', (e) => errs.push(e.message))

await p.goto(`${APP}/`, { waitUntil: 'networkidle' })
await p.locator('input[autocomplete="username"]').fill('ton.k')
await p.locator('input[type="password"]').first().fill('AwaDemo2026!')
await p.locator('form button[type="submit"]').first().click()
await p.waitForTimeout(9000)

head('เปิดหน้าแล้วพิมพ์ได้ทันที')
await p.goto(`${APP}/office/fun/typing`, { waitUntil: 'load' })
await p.waitForTimeout(2500)
errs.length = 0

const input = p.locator('input[aria-label]').last()
check(await input.count() > 0, 'มีช่องพิมพ์')

/* ★ ข้อกำหนด 3.3: ปิด autocorrect/autocapitalize/autocomplete/spellcheck */
const attrs = await input.evaluate((el: HTMLInputElement) => ({
  autocomplete: el.getAttribute('autocomplete'),
  autocorrect: el.getAttribute('autocorrect'),
  autocapitalize: el.getAttribute('autocapitalize'),
  spellcheck: el.getAttribute('spellcheck'),
}))
check(attrs.autocomplete === 'off', 'ปิด autocomplete', String(attrs.autocomplete))
check(attrs.autocorrect === 'off', 'ปิด autocorrect', String(attrs.autocorrect))
check(attrs.autocapitalize === 'off', 'ปิด autocapitalize', String(attrs.autocapitalize))
check(attrs.spellcheck === 'false', 'ปิด spellcheck', String(attrs.spellcheck))

head('พิมพ์ภาษาไทย')
/* หน้านี้เริ่มที่ภาษาไทยเป็นค่าเริ่มต้น */
const target = await p.evaluate(() => {
  const spans = [...document.querySelectorAll('main p[dir=auto] span')]
  return spans.map((s) => s.textContent ?? '').join('')
})
check(target.length > 10, 'มีข้อความให้พิมพ์', `${[...target].length} ตัวอักษร`)
check(/[ก-๙]/.test(target), 'ข้อความเป็นภาษาไทย')

await input.click()
const first8 = [...target].slice(0, 8).join('')
await input.type(first8, { delay: 40 })
await p.waitForTimeout(500)

const after = await p.evaluate(() => {
  const nums = [...document.querySelectorAll('main .tabular-nums')].map((e) => e.textContent ?? '')
  const okChars = document.querySelectorAll('main p[dir=auto] span.text-ink').length
  return { nums, okChars }
})
check(after.okChars >= 8, 'ตัวที่พิมพ์ถูกถูกทำเครื่องหมายครบ', `${after.okChars} ตัว`)
check(Number(after.nums[0]) > 0, 'WPM เดินจริง', `WPM=${after.nums[0]}`)
check(after.nums[1] === '100%', 'พิมพ์ถูกหมด = ความแม่นยำ 100%', String(after.nums[1]))

head('พิมพ์ผิดแล้วต้องแก้ก่อนไปต่อ')
await input.type('ZZ', { delay: 40 })
await p.waitForTimeout(400)
const wrong = await p.evaluate(() => ({
  bad: document.querySelectorAll('main p[dir=auto] span.bg-danger\\/30').length,
  acc: [...document.querySelectorAll('main .tabular-nums')][1]?.textContent ?? '',
}))
check(wrong.bad > 0, 'ตัวที่ผิดถูกไฮไลต์แดง', `${wrong.bad} จุด`)
check(wrong.acc !== '100%', 'ความแม่นยำลดลงหลังพิมพ์ผิด', wrong.acc)

/* ลบออกแล้วความแม่นยำต้องไม่กลับเป็น 100% */
await p.keyboard.press('Backspace')
await p.keyboard.press('Backspace')
await p.waitForTimeout(400)
const fixed = await p.evaluate(() => [...document.querySelectorAll('main .tabular-nums')][1]?.textContent ?? '')
check(fixed !== '100%', 'ลบแก้แล้วความแม่นยำยังไม่กลับเป็น 100%', fixed)

head('ห้าม paste')
await p.evaluate(() => navigator.clipboard?.writeText?.('โกง').catch(() => undefined))
const before = await input.inputValue()
await p.keyboard.press('Meta+V')
await p.waitForTimeout(300)
check((await input.inputValue()) === before, 'วางข้อความไม่ได้')

head('สลับเป็นอังกฤษ')
await p.getByRole('button', { name: 'อังกฤษ' }).click()
await p.waitForTimeout(600)
const en = await p.evaluate(() => [...document.querySelectorAll('main p[dir=auto] span')].map((s) => s.textContent ?? '').join(''))
check(/^[\x20-\x7E]+$/.test(en), 'ข้อความเปลี่ยนเป็นอังกฤษ', en.slice(0, 30))
check((await input.inputValue()) === '', 'สลับภาษาแล้วล้างสิ่งที่พิมพ์ไว้')

head('หน้าตา')
const over = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
check(over <= 1, 'ไม่ล้นแนวนอน', `เกิน ${over}px`)
const small = await p.evaluate(() => {
  const bad: string[] = []
  for (const el of document.querySelectorAll('main button, main a[href]')) {
    const r = el.getBoundingClientRect()
    if (!r.height || r.height >= 44 || el.closest('footer')) continue
    bad.push(`${(el.textContent ?? '').trim().slice(0, 12)}=${Math.round(r.height)}`)
  }
  return bad.slice(0, 4)
})
check(small.length === 0, 'จุดแตะ ≥44px', small.join(' · '))
check(errs.length === 0, 'ไม่มี JS error', errs.slice(0, 2).join(' · '))

console.log(`\n\x1b[1mผ่าน ${pass} · ล้ม ${fail}\x1b[0m`)
await b.close()
process.exit(fail ? 1 : 0)
