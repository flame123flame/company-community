/**
 * ด่านตรวจหมากฮอสออนไลน์ — สองเบราว์เซอร์ คนละบัญชี เล่นกันจริง
 *
 * รันด้วย: APP_URL=http://localhost:3001 npx tsx scripts/checkers-online-test.mts
 *
 * ★★★ เทสต์ที่เปิดแท็บเดียวพิสูจน์โหมดออนไลน์ไม่ได้เลย
 *     ★ สิ่งที่ต้องรู้คือ "ฝั่งโน้นเห็นตาที่ฝั่งนี้เดินไหม" ซึ่งต้องมีสองฝั่งจริง
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { chromium, type Browser, type Page } from 'playwright-core'

const APP = process.env.APP_URL ?? 'http://localhost:3001'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
let pass = 0, fail = 0
const check = (ok: boolean, n: string, d = '') => { ok ? pass++ : fail++; console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${n}${d ? ` \x1b[2m${d}\x1b[0m` : ''}`) }
const head = (s: string) => console.log(`\n\x1b[1m${s}\x1b[0m`)

async function login(browser: Browser, user: string): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } })
  const p = await ctx.newPage()
  p.setDefaultTimeout(45000)
  await p.goto(`${APP}/`, { waitUntil: 'networkidle' })
  await p.locator('input[autocomplete="username"]').fill(user)
  await p.locator('input[type="password"]').first().fill('AwaDemo2026!')
  await p.locator('form button[type="submit"]').first().click()
  await p.waitForTimeout(9000)
  if (await p.locator('input[autocomplete="username"]').count()) {
    throw new Error(`เข้าระบบ ${user} ไม่สำเร็จ`)
  }
  return p
}

/*
 * ★★★ ล้างเกมและคำท้าของคู่นี้ก่อนเริ่ม
 *
 *     ★ รอบก่อนล้มเพราะเกมที่ค้างจากรอบก่อนหน้าทำให้ส่วน "เกมที่ค้างอยู่"
 *       โผล่ขึ้นมาก่อน แล้ว selector ของคนในรายชื่อไปโดนแถวเกมแทน
 *       ★★ เทสต์ที่ผลขึ้นกับว่าเคยรันมากี่รอบ ไม่ใช่เทสต์ — มันคือการเดา
 *     ★ ล้างเฉพาะคู่ที่ใช้ทดสอบ ไม่แตะข้อมูลของคนอื่น
 */
const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n').filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SECRET_KEY!)
const { data: who } = await db.from('profiles').select('id, username').in('username', ['ton.k', 'pim.s'])
const ids = (who ?? []).map((w) => w.id)
if (ids.length === 2) {
  await db.from('checkers_games').delete().in('bottom_id', ids).in('top_id', ids)
  await db.from('game_challenges').delete().in('from_id', ids).in('to_id', ids)
}

const browser = await chromium.launch({ executablePath: CHROME, headless: true })

try {
  head('เข้าระบบสองคน')
  /* ★ เข้าระบบทีละคนในเบราว์เซอร์เดียวแต่คนละ context — cookie แยกกัน
       ★★ ด่านจำกัดอัตราของ signIn นับตาม IP จึงเว้นจังหวะระหว่างสองคน */
  const A = await login(browser, 'ton.k')
  await A.waitForTimeout(1500)
  const B = await login(browser, 'pim.s')
  check(true, 'ทั้งสองคนเข้าระบบแล้ว')

  head('ท้า → รับ → เข้าเกม')
  await A.goto(`${APP}/office/fun/checkers`, { waitUntil: 'load' })
  await A.waitForTimeout(2000)
  await A.getByRole('button', { name: /ท้าเพื่อน/ }).click()
  await A.waitForTimeout(2500)

  const search = A.locator('input[placeholder]').first()
  await search.fill('พิม')
  await A.waitForTimeout(600)
  /* ★ รายชื่อคนอยู่ใน section สุดท้ายเสมอ — ส่วนบนเป็นเกมค้างและคำท้า */
  const target = A.locator('main section').last().locator('ul button').first()
  const targetName = (await target.textContent())?.trim() ?? ''
  check(targetName.length > 0, 'เจอคนในรายชื่อ', targetName)
  await target.click()
  await A.waitForTimeout(2000)
  check(true, 'ส่งคำท้าแล้ว')

  await B.goto(`${APP}/office/fun/checkers`, { waitUntil: 'load' })
  await B.waitForTimeout(2000)
  await B.getByRole('button', { name: /ท้าเพื่อน/ }).click()
  await B.waitForTimeout(2500)

  const accept = B.getByRole('button', { name: /^รับ$/ })
  check(await accept.count() > 0, 'ฝั่งที่ถูกท้าเห็นคำท้า')
  await accept.first().click()
  await B.waitForTimeout(3000)
  check(await B.locator('[role="gridcell"]').count() === 64, 'รับแตะเดียวแล้วเข้ากระดานเลย')

  head('เดินหมากแล้วอีกฝ่ายเห็น (Realtime)')
  /* ★ A เป็นคนท้า = ฝ่ายล่าง เดินก่อน */
  await A.goto(`${APP}/office/fun/checkers`, { waitUntil: 'load' })
  await A.waitForTimeout(2000)
  await A.getByRole('button', { name: /ท้าเพื่อน/ }).click()
  await A.waitForTimeout(2500)
  /* ★ เกมที่ค้างอยู่เป็น section แรก */
  const ongoing = A.locator('main section').first().locator('ul button').first()
  await ongoing.click()
  await A.waitForTimeout(3000)
  check(await A.locator('[role="gridcell"]').count() === 64, 'ฝั่งผู้ท้าเปิดเกมที่ค้างอยู่ได้')

  const turnBadge = await A.evaluate(() => document.body.textContent?.includes('ตาคุณ') ?? false)
  check(turnBadge, 'ฝั่งผู้ท้าเป็นฝ่ายเดินก่อน')

  /*
   * หาหมากฝ่ายล่างที่ "เดินได้จริง"
   *
   * ★★ รอบแรกผมเขียนให้ไล่จากท้ายกระดานขึ้นมา แล้วได้ช่อง 62 ซึ่งอยู่
   *    แถวหลังสุด — ข้างหน้ามีหมากตัวเองบังหมด จึงไม่มีตาให้เดิน
   *    ★ เทสต์ฟ้องว่า "ไม่มีไฮไลต์" ซึ่งถูกต้อง ความผิดอยู่ที่ฉาก ไม่ใช่เกม
   *    ★★ แก้เป็นลองแตะทีละตัวจนกว่าจะเจอตัวที่มีช่องให้ไปจริง
   *       แทนที่จะเดาว่าตัวไหนเดินได้
   */
  let fromIdx = -1
  let toIdx = -1
  const candidates = await A.evaluate(() => {
    const out: number[] = []
    const cs = [...document.querySelectorAll('[role="gridcell"]')]
    for (let i = 0; i < cs.length; i++) {
      const sp = cs[i]!.querySelector('span.rounded-full.shadow')
      if (sp && getComputedStyle(sp).backgroundColor !== 'rgba(0, 0, 0, 0)') out.push(i)
    }
    return out
  })
  for (const c of candidates) {
    await A.locator('[role="gridcell"]').nth(c).click()
    await A.waitForTimeout(350)
    const t = await A.evaluate(() => {
      const cs = [...document.querySelectorAll('[role="gridcell"]')]
      for (let i = 0; i < cs.length; i++) if (cs[i]!.querySelector('span.bg-accent\\/70')) return i
      return -1
    })
    if (t >= 0) { fromIdx = c; toIdx = t; break }
  }
  check(toIdx >= 0, 'ไฮไลต์ช่องที่เดินได้', `จาก ${fromIdx} ไป ${toIdx}`)
  await A.locator('[role="gridcell"]').nth(toIdx).click()
  await A.waitForTimeout(3000)

  const movedA = await A.evaluate((i) => !document.querySelectorAll('[role="gridcell"]')[i]!.querySelector('span.rounded-full.shadow'), fromIdx)
  check(movedA, 'ฝั่งที่เดิน: หมากย้ายแล้ว')

  /* ★★★ ข้อสำคัญที่สุด: อีกฝั่งต้องเห็นเองโดยไม่ต้องรีโหลด */
  await B.waitForTimeout(4000)
  const movedB = await B.evaluate((i) => !document.querySelectorAll('[role="gridcell"]')[i]!.querySelector('span.rounded-full.shadow'), fromIdx)
  check(movedB, 'อีกฝั่งเห็นตาที่เดินโดยไม่ต้องรีโหลด (Realtime)')

  const bTurn = await B.evaluate(() => document.body.textContent?.includes('ตาคุณ') ?? false)
  check(bTurn, 'ตาเปลี่ยนไปที่อีกฝ่ายแล้ว')

  head('เดินผิดตาไม่ได้')
  /*
   * ★ A เพิ่งเดินไป ตอนนี้เป็นตาของ B — ช่องฝั่ง A ต้องกดไม่ได้
   *
   * ★★ รอบแรกผมเขียนให้ "คลิกแล้วดูว่าไม่มีไฮไลต์" แต่ Playwright
   *    รอให้ปุ่ม enabled ก่อนคลิกเสมอ จึง timeout
   *    ★ ซึ่งแปลว่าปุ่ม disabled จริง — เป็นคำตอบที่ต้องการอยู่แล้ว
   *      ★★ ยืนยันที่แอตทริบิวต์ตรง ๆ ดีกว่า: ตรงประเด็นกว่า และไม่ต้อง
   *         รอ timeout 30 วินาทีเพื่อให้ได้คำตอบเดียวกัน
   */
  const disabledCount = await A.evaluate(
    () => [...document.querySelectorAll('[role="gridcell"]')].filter((b) => (b as HTMLButtonElement).disabled).length,
  )
  check(disabledCount === 64, 'ไม่ใช่ตาเรา → ทุกช่องกดไม่ได้', `${disabledCount}/64`)
  const hl = await A.evaluate(() => document.querySelectorAll('[role="gridcell"] span.bg-accent\\/70').length)
  check(hl === 0, 'ไม่มีไฮไลต์ค้างอยู่', `${hl} ช่อง`)

  head('ยอมแพ้')
  B.on('dialog', (d) => void d.accept())
  await B.locator('main button[aria-expanded]').last().click()
  await B.waitForTimeout(500)
  await B.getByRole('button', { name: /ยอมแพ้/ }).click()
  await B.waitForTimeout(3000)
  const bLost = await B.evaluate(() => document.body.textContent?.includes('บอทชนะ') || document.body.textContent?.includes('แพ้') || false)
  check(bLost, 'ฝั่งที่ยอมแพ้เห็นว่าแพ้')
  await A.waitForTimeout(3500)
  const aWon = await A.evaluate(() => document.body.textContent?.includes('คุณชนะ') ?? false)
  check(aWon, 'อีกฝั่งเห็นว่าชนะ (ผู้ชนะคืออีกฝ่าย ไม่ใช่คนที่กด)')
} catch (e) {
  console.error('\n', e)
  fail++
} finally {
  await browser.close()
}

console.log(`\n\x1b[1mผ่าน ${pass} · ล้ม ${fail}\x1b[0m`)
process.exit(fail ? 1 : 0)
