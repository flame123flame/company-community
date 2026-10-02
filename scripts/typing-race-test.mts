/**
 * ด่านตรวจห้องแข่งพิมพ์ดีด — สองเบราว์เซอร์ คนละบัญชี แข่งกันจริง
 * รันด้วย: APP_URL=http://localhost:3001 npx tsx scripts/typing-race-test.mts
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { chromium, type Browser, type Page } from 'playwright-core'

const APP = process.env.APP_URL ?? 'http://localhost:3001'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
let pass = 0, fail = 0
const check = (ok: boolean, n: string, d = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${n}${d ? ` \x1b[2m${d}\x1b[0m` : ''}`) }
const head = (s: string) => console.log(`\n\x1b[1m${s}\x1b[0m`)

/*
 * ★★★ ถอดอักขระคั่นทิศทางก่อนเทียบข้อความเสมอ
 *
 *     ระบบ i18n ห่อตัวแปรทุกตัวด้วย FSI/PDI (U+2068/U+2069) เพื่อให้
 *     ภาษาขวาไปซ้ายแสดงถูก ★ ผลคือ "มีคนในห้อง 2 คน" บนจอจริงคือ
 *     "มีคนในห้อง ⁨2⁩ คน" ★★ การ includes('2 คน') จึงไม่เจอ
 *     และ regex /\d+ คน/ ก็ไม่เจอ — ทั้งที่ตาคนอ่านว่าถูกต้องทุกตัว
 */
const plain = (s: string) => s.replace(/[\u2066-\u2069]/g, '')

/* ★ ล้างห้องค้างของคู่ทดสอบ — เทสต์ที่ผลขึ้นกับว่าเคยรันมากี่รอบ ไม่ใช่เทสต์ */
const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n').filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SECRET_KEY!)
const { data: who } = await db.from('profiles').select('id, username').in('username', ['ton.k', 'pim.s'])
const ids = (who ?? []).map((w) => w.id)
if (ids.length) {
  const { data: rooms } = await db.from('typing_players').select('room_id').in('user_id', ids)
  const rids = [...new Set((rooms ?? []).map((r) => r.room_id))]
  if (rids.length) await db.from('typing_rooms').delete().in('id', rids)
}

async function login(browser: Browser, user: string): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } })
  const p = await ctx.newPage()
  p.setDefaultTimeout(45000)
  await p.goto(`${APP}/`, { waitUntil: 'networkidle' })
  await p.locator('input[autocomplete="username"]').fill(user)
  await p.locator('input[type="password"]').first().fill('AwaDemo2026!')
  await p.locator('form button[type="submit"]').first().click()
  await p.waitForTimeout(9000)
  if (await p.locator('input[autocomplete="username"]').count()) throw new Error(`เข้าระบบ ${user} ไม่ได้`)
  return p
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true })

try {
  head('เข้าระบบสองคน')
  const A = await login(browser, 'ton.k')
  await A.waitForTimeout(1500)
  const B = await login(browser, 'pim.s')
  check(true, 'ทั้งสองคนเข้าระบบแล้ว')

  head('ฝึกคนเดียว = แตะเดียวเริ่มได้')
  await A.goto(`${APP}/office/fun/typing`, { waitUntil: 'load' })
  await A.waitForTimeout(2500)
  const hasText = await A.evaluate(() => (document.querySelectorAll('main p[dir=auto] span').length > 10))
  check(hasText, 'เปิดหน้ามาเจอข้อความให้พิมพ์ทันที ไม่มีหน้าเลือกโหมดคั่น')

  head('สร้างห้อง → อีกคนเข้าด้วยรหัส')
  await A.getByRole('button', { name: /แข่งด่วน/ }).click()
  await A.waitForTimeout(3500)
  const code = await A.evaluate(() => document.querySelector('main .font-mono.tracking-\\[0\\.3em\\]')?.textContent?.trim() ?? '')
  check(code.length === 5, 'ได้รหัสห้อง 5 ตัว', code)

  await B.goto(`${APP}/office/fun/typing`, { waitUntil: 'load' })
  await B.waitForTimeout(2500)
  await B.getByRole('button', { name: /เข้าด้วยรหัสห้อง/ }).click()
  await B.waitForTimeout(400)
  await B.locator('input[placeholder]').last().fill(code)
  await B.getByRole('button', { name: /^เข้า$/ }).click()
  await B.waitForTimeout(3500)

  /* ★ วินิจฉัย: B เข้าห้องได้จริงไหม หรือมี error ค้างอยู่ */
  const bErr = await B.evaluate(() => document.querySelector('[role=alert]')?.textContent ?? '')
  const bInRoom = await B.evaluate(() => document.body.textContent?.includes('ออกจากห้อง') ?? false)
  check(bErr === '', 'ฝั่งที่เข้าห้องไม่มี error', bErr.slice(0, 60))
  check(bInRoom, 'ฝั่งที่เข้าห้องอยู่ในห้องแล้ว')

  /* ★★★ ข้อสำคัญ: ฝั่งเจ้าของห้องต้องเห็นว่ามีคนเข้ามาโดยไม่ต้องรีโหลด */
  await A.waitForTimeout(2500)
  /*
   * ★★ รอให้เงื่อนไขเป็นจริง ไม่ใช่สุ่มดูครั้งเดียวแล้วตัดสิน
   *    ★ Realtime มาถึงเมื่อไหร่ไม่มีใครรับประกัน การ sample ครั้งเดียว
   *      วัดความเร็วเน็ตมากกว่าวัดว่าฟีเจอร์ทำงานไหม
   */
  let seen = false
  for (let i = 0; i < 12 && !seen; i++) {
    seen = (await A.evaluate(() => document.querySelectorAll('main ul li').length)) >= 2
    if (!seen) await A.waitForTimeout(1000)
  }
  check(seen, 'เจ้าของห้องเห็นคนเข้ามาโดยไม่ต้องรีโหลด (Realtime)')

  const barsA = await A.evaluate(() => document.querySelectorAll('main ul li').length)
  check(barsA >= 2, 'มีแถบความคืบหน้าสองคน', `${barsA} แถว`)

  head('ทุกคนได้ข้อความเดียวกัน')
  await A.getByRole('button', { name: /เริ่มแข่ง/ }).click()
  /* นับถอยหลัง 3 วินาที */
  await A.waitForTimeout(5000)
  await B.waitForTimeout(500)

  const textA = await A.evaluate(() => [...document.querySelectorAll('main p[dir=auto] span')].map((s) => s.textContent).join(''))
  const textB = await B.evaluate(() => [...document.querySelectorAll('main p[dir=auto] span')].map((s) => s.textContent).join(''))
  check(textA.length > 10 && textA === textB, 'ข้อความเหมือนกันทั้งห้อง', `${[...textA].length} ตัวอักษร`)

  head('พิมพ์แล้วอีกฝั่งเห็นแถบขยับ')
  const input = A.locator('input[aria-label]').last()
  await input.click()
  await input.type([...textA].slice(0, 25).join(''), { delay: 25 })
  await A.waitForTimeout(2500)

  const myWpm = await A.evaluate(() => {
    const t = [...document.querySelectorAll('main ul li')].find((li) => li.textContent?.includes('%'))
    return t?.textContent ?? ''
  })
  /* ★ ดึงเฉพาะตัวเลข WPM ไม่ใช่ทั้งแถว — '100%' ทำให้ /[1-9]/ ผ่านทั้งที่ WPM เป็น 0 */
  const wpmNum = Number(plain(myWpm).match(/(\d+)\s*·/)?.[1] ?? '0')
  check(wpmNum > 0, 'WPM ของตัวเองเดินจริง', `${wpmNum} WPM`)

  /* ★★★ ฝั่ง B ต้องเห็นแถบของ A ขยับ */
  let widthOnB: number[] = []
  for (let i = 0; i < 12; i++) {
    widthOnB = await B.evaluate(() =>
      ([...document.querySelectorAll('main ul li div div')] as HTMLElement[]).map((b) => parseFloat(b.style.width) || 0),
    )
    if (widthOnB.some((w) => w > 0)) break
    await B.waitForTimeout(1000)
  }
  check(widthOnB.some((w) => w > 0), 'อีกฝั่งเห็นแถบความคืบหน้าขยับ (Realtime)', widthOnB.map((w) => w.toFixed(0) + '%').join(' · '))

  head('ห้ามวาง + ปิด autocorrect')
  const attrs = await input.evaluate((el: HTMLInputElement) => ({
    ac: el.getAttribute('autocorrect'), sp: el.getAttribute('spellcheck'),
  }))
  check(attrs.ac === 'off' && attrs.sp === 'false', 'ข้อจำกัดเดียวกับโหมดฝึก')
  const before = await input.inputValue()
  await A.keyboard.press('Meta+V')
  await A.waitForTimeout(300)
  check((await input.inputValue()) === before, 'วางข้อความไม่ได้')

  head('ออกจากห้องแล้วห้องยังอยู่')
  await B.getByRole('button', { name: /ออกจากห้อง/ }).click()
  await B.waitForTimeout(2500)
  const aStill = await A.evaluate(() => document.querySelectorAll('main ul li').length)
  check(aStill >= 1, 'คนที่เหลืออยู่ยังแข่งต่อได้', `${aStill} แถว`)
} catch (e) {
  console.error('\n', e)
  fail++
} finally {
  await browser.close()
}

console.log(`\n\x1b[1mผ่าน ${pass} · ล้ม ${fail}\x1b[0m`)
process.exit(fail ? 1 : 0)
