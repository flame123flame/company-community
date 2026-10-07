/**
 * กวาดหาข้อความไทยที่หลุดบนหน้าภาษาอื่น — ครบทุกชิ้นในรอบเดียว
 *
 * รันด้วย:  npm run test:leak
 *           PAGE=/office/food/picks npm run test:leak
 *
 * ★★★ มีขึ้นเพราะ scripts/i18n-test.ts รายงานทีละ 4 ข้อความ
 *
 *     ★ ด่านนั้นตรวจ 16 ภาษา × หลายหน้า จึงต้องตัดรายงานให้สั้น
 *       ★★ แต่เวลาไล่แก้จริง มันแปลว่าต้องรันรอบละ 15 นาทีเพื่อเห็นอีก 4 ชิ้น
 *          ★ ตอนรื้อหน้าแรกใหม่มีข้อความหลุด 101 ชิ้น — ไล่แบบนั้นคือ 25 รอบ
 *     ★★ ตัวนี้เปิดหน้าเดียว ภาษาเดียว แล้วคืนครบทุกชิ้นพร้อมตำแหน่งใน DOM
 *
 * ★★ ใช้เกณฑ์เดียวกับ i18n-test เป๊ะ (ข้าม dir="auto" และ [lang]) ไม่งั้น
 *    มันจะบอกว่าสะอาดแล้วแต่ด่านจริงยังฟ้องอยู่
 *
 * ★ สมัครบัญชีชั่วคราวเองแล้วลบทิ้ง — ข้อความส่วนใหญ่ขึ้นเฉพาะคนที่ล็อกอินแล้ว
 *   ★★ ตรวจตอนยังไม่ล็อกอินได้ 0 ชิ้น ทั้งที่ของจริงมี 101
 */
import { chromium } from 'playwright-core'
const PAGE = process.env.PAGE ?? '/'
const LOCALE = process.env.LOCALE ?? 'ar'

const b = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } })
await ctx.addCookies([{ name: 'mr_locale', value: LOCALE, domain: 'localhost', path: '/' }])
const p = await ctx.newPage()
p.setDefaultTimeout(60_000)
/* สมัครบัญชีชั่วคราว — ข้อความที่หลุดขึ้นเฉพาะคนที่เข้าระบบแล้ว */
const U = 'leak' + (process.pid % 10000)
await p.goto('http://localhost:3000/register', { waitUntil: 'networkidle' })
await p.locator('input[autocomplete="username"]').fill(U)
const pw = p.locator('input[autocomplete="new-password"]')
await pw.nth(0).fill('LeakTest123!')
await pw.nth(1).fill('LeakTest123!')
await p.locator('[data-field="nickname"] input').fill('ทดสอบ')
await p.locator('select').first().selectOption({ index: 1 })
await p.locator('input[type="checkbox"]').first().check()
await p.locator('form button[type="submit"]').first().click()
await p.waitForURL((u) => new URL(u).pathname === '/', { timeout: 60_000 })
await p.waitForTimeout(4500)
const leaks = await p.evaluate(() => {
  const THAI = /[฀-๿]/
  const ISOLATED = /⁨[^⁩]*⁩/g
  const BAHT = /฿/g
  const out: { text: string; path: string }[] = []
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  for (let node = walk.nextNode(); node; node = walk.nextNode()) {
    const text = (node.nodeValue ?? '').replace(ISOLATED, '').replace(BAHT, '').trim()
    if (!text || !THAI.test(text)) continue
    const el = node.parentElement
    if (!el) continue
    if (el.closest('[dir="auto"]')) continue
    const tagged = el.closest('[lang]')
    if (tagged && tagged !== document.documentElement) continue
    if (!el.getClientRects().length) continue
    const path: string[] = []
    for (let e: Element | null = el; e && e !== document.body; e = e.parentElement) {
      const cls = String((e as HTMLElement).className || '').split(' ').filter(Boolean).slice(0, 2).join('.')
      path.unshift(e.tagName.toLowerCase() + (cls ? '.' + cls : ''))
      if (path.length >= 3) break
    }
    out.push({ text: text.slice(0, 60), path: path.join(' > ') })
  }
  const seen = new Set<string>()
  return out.filter((x) => (seen.has(x.text) ? false : (seen.add(x.text), true)))
})
console.log(`พบข้อความไทยหลุด ${leaks.length} ชิ้น ที่ ${PAGE} (ภาษา ${LOCALE})\n`)
for (const l of leaks) console.log(`  "${l.text}"\n     ${l.path}`)
await b.close()

/* เก็บกวาดบัญชีทดสอบ */
{
  const { createClient } = await import('@supabase/supabase-js')
  const { readFileSync } = await import('node:fs')
  const env: Record<string, string> = {}
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) env[m[1]!] = m[2]!.replace(/^["']|["']$/g, '')
  }
  const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } })
  const { data } = await db.auth.admin.listUsers({ perPage: 1000 })
  const hit = data?.users?.find((u) => u.email === `${U}@frameroom.invalid`)
  if (hit) {
    await db.auth.admin.deleteUser(hit.id)
    console.log('\nเก็บกวาดบัญชีทดสอบแล้ว')
  }
}

if (leaks.length > 0) process.exit(1)
