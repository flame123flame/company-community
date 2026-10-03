/**
 * ชุดทดสอบกระเป๋าเงิน — เฟส 6
 *
 * รันด้วย:  APP_URL=http://localhost:3001 npx tsx scripts/wallet-test.ts
 *
 * ★★★ ทดสอบบนเบราว์เซอร์จริงที่จอ 375px ไม่ใช่ unit test
 *
 *     ★ ข้อกำหนดของงานนี้เกือบทั้งหมดเป็นเรื่อง "กดกี่ครั้ง · เลื่อนไหม ·
 *       ปุ่มสูงพอไหม" ★★ ซึ่งพิสูจน์ได้จากการวัดบน DOM จริงเท่านั้น
 *     ★ การคำนวณเงินแยกไปอยู่ scripts/split-test.ts และ promptpay-test.ts
 *       ซึ่งรันเร็วกว่ามากและไม่ต้องเปิดเบราว์เซอร์
 *
 * ★★ เข้าระบบครั้งเดียวแล้วใช้ cookie ซ้ำทุก context
 *    ★ ด่านจำกัดอัตราของหน้าเข้าระบบนับตาม IP — สคริปต์ที่ล็อกอินใหม่ทุกบล็อก
 *      จะชนเพดานตัวเองแล้วรายงานว่า "ระบบพัง" ทั้งที่ด่านทำงานถูก
 */
import { chromium, type BrowserContext, type Page } from 'playwright-core'
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const APP = process.env.APP_URL ?? 'http://localhost:3001'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PHONE = { width: 375, height: 812 }
const T = 90_000

/** จุดแตะต้องสูงอย่างน้อยเท่านี้ (ข้อกำหนด) */
const MIN_TAP = 44

const env: Record<string, string> = {}
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m) env[m[1]!] = m[2]!.replace(/^["']|["']$/g, '')
}
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false },
})

let pass = 0
let fail = 0
function check(ok: boolean, name: string, detail = '') {
  if (ok) pass++
  else fail++
  console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${name}${detail ? ` \x1b[2m${detail}\x1b[0m` : ''}`)
}
const head = (s: string) => console.log(`\n\x1b[1m${s}\x1b[0m`)

async function login(browserCtx: BrowserContext, user: string, pw: string) {
  const p = await browserCtx.newPage()
  p.setDefaultTimeout(T)
  await p.goto(`${APP}/`, { waitUntil: 'networkidle' })
  await p.locator('input[autocomplete="username"]').fill(user)
  await p.locator('input[type="password"]').first().fill(pw)
  await p.locator('form button[type="submit"]').first().click()
  await p.waitForTimeout(8000)
  if (await p.locator('input[autocomplete="username"]').count()) {
    const msg = await p.locator('[role="alert"]').first().textContent().catch(() => '')
    throw new Error(`เข้าระบบ ${user} ไม่สำเร็จ: ${msg}`)
  }
  await p.close()
  return browserCtx.storageState()
}

/** วัดจุดแตะที่เตี้ยกว่าเกณฑ์ — เฉพาะในเนื้อหาหน้า ไม่รวมแถบบน/ท้ายของเว็บ */
async function smallTargets(p: Page) {
  return p.evaluate((min) => {
    const scope = document.querySelector('main') ?? document.body
    const bad: string[] = []
    for (const el of scope.querySelectorAll('button, a[href], select, input[type=checkbox]')) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      /* ★ checkbox เล็กได้ถ้า label ที่ห่อมันสูงพอ — วัดที่ label แทน */
      const box = el.tagName === 'INPUT' ? (el.closest('label') ?? el).getBoundingClientRect() : r
      /* ★ ท้ายหน้า (footer) เป็นของเดิมทั้งเว็บ ไม่ใช่ของที่เฟสนี้แก้ */
      if (el.closest('footer')) continue
      if (box.height < min) bad.push(`${el.tagName}:${(el.textContent ?? '').trim().slice(0, 14)}=${Math.round(box.height)}`)
    }
    return bad
  }, MIN_TAP)
}

async function main() {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true })

  const seedCtx = await browser.newContext({ viewport: PHONE })
  const tonState = await login(seedCtx, 'ton.k', 'AwaDemo2026!')
  await seedCtx.close()

  const ctx = await browser.newContext({ viewport: PHONE, storageState: tonState })
  const p = await ctx.newPage()
  p.setDefaultTimeout(T)
  const errors: string[] = []
  p.on('pageerror', (e) => errors.push(String(e).slice(0, 120)))

  const { data: me } = await db.from('profiles').select('id').eq('username', 'ton.k').single()
  const { data: other } = await db.from('profiles').select('id, nickname').eq('username', 'pim.s').single()

  /* ═══ 1 · สร้างบิลด้วย "หารแบบครั้งก่อน" = 3 แตะ ═══════════════ */
  head('สร้างบิลด้วย "หารแบบครั้งก่อน"')
  await p.goto(`${APP}/office/wallet/create`, { waitUntil: 'networkidle' })
  await p.waitForTimeout(3500)

  const focused = await p.evaluate(() => ({
    id: (document.activeElement as HTMLElement)?.id ?? null,
    mode: (document.activeElement as HTMLInputElement)?.inputMode ?? null,
  }))
  check(focused.id === 'amt', 'ช่องยอดเงินถูกโฟกัสเองตอนเปิดหน้า', `activeElement=${focused.id}`)
  check(focused.mode === 'decimal', 'ช่องยอดเงินเปิดคีย์บอร์ดตัวเลข', `inputmode=${focused.mode}`)

  const again = p.locator('button').filter({ hasText: /หารแบบครั้งก่อน/ }).first()
  const hasAgain = (await again.count()) > 0
  check(hasAgain, 'มีปุ่ม "หารแบบครั้งก่อน"')

  if (hasAgain) {
    let taps = 0
    await again.click(); taps++                                    // แตะ 1
    await p.waitForTimeout(700)
    await p.locator('#amt').fill('240')                             // พิมพ์ยอด (ไม่นับเป็นแตะ)
    await p.waitForTimeout(600)

    const ready = await p.evaluate(() => {
      const btn = document.querySelector('main .sticky button') as HTMLButtonElement | null
      const sum = [...document.querySelectorAll('p')].find((x) => /คนละ/.test(x.textContent ?? ''))
      return {
        label: btn?.textContent?.replace(/[⁦-⁩]/g, '') ?? '',
        summary: sum?.textContent?.replace(/[⁦-⁩]/g, '') ?? null,
      }
    })
    check(
      !/กรอกยอดเงิน|เลือกคนที่หาร|Enter the amount|Pick who/i.test(ready.label),
      'ปุ่มบันทึกพร้อมกดหลังแตะเดียว + พิมพ์ยอด',
      `ปุ่ม="${ready.label}"`,
    )
    check(Boolean(ready.summary), 'สรุปยอดต่อคนขึ้นทันที', ready.summary ?? '')
    check(taps + 1 <= 3, `จบได้ใน 3 แตะ`, `ใช้ ${taps} แตะ + พิมพ์ยอด + 1 แตะบันทึก = ${taps + 1}`)
  }

  /* ═══ 2 · สร้างบิลใหม่ทั้งหมด ไม่ต้องเลื่อน ไม่ต้องเปิดรายละเอียด ═══ */
  head('สร้างบิลใหม่ทั้งหมด (ยอด + เลือก 3 คน)')
  await p.goto(`${APP}/office/wallet/create`, { waitUntil: 'networkidle' })
  await p.waitForTimeout(3500)
  await p.locator('#amt').fill('300')
  const avatars = p.locator('button.w-16')
  const n = Math.min(3, await avatars.count())
  for (let i = 0; i < n; i++) await avatars.nth(i).click()
  await p.waitForTimeout(800)

  const noScroll = await p.evaluate(() => {
    /* ★ "ไม่ต้องเลื่อน" = ทุกอย่างที่ต้องใช้อยู่ในจอเดียว
         ★★ วัดจากตำแหน่งของสรุปยอด ไม่ใช่จากความสูงทั้งหน้า
            เพราะปุ่มบันทึกเป็น sticky จึงอยู่ในจอเสมออยู่แล้ว */
    const sum = [...document.querySelectorAll('p')].find((x) => /คนละ/.test(x.textContent ?? ''))
    const detailsBtn = [...document.querySelectorAll('button[aria-expanded]')].find((x) =>
      /เพิ่มรายละเอียด/.test(x.textContent ?? ''),
    )
    return {
      summaryTop: sum ? Math.round(sum.getBoundingClientRect().top) : -1,
      vh: window.innerHeight,
      detailsOpen: detailsBtn?.getAttribute('aria-expanded') === 'true',
    }
  })
  check(
    noScroll.summaryTop > 0 && noScroll.summaryTop < noScroll.vh,
    'สรุปยอดต่อคนอยู่ในจอโดยไม่ต้องเลื่อน',
    `top=${noScroll.summaryTop} vh=${noScroll.vh}`,
  )
  check(!noScroll.detailsOpen, 'ไม่ต้องเปิด "+ เพิ่มรายละเอียด"')

  const small1 = await smallTargets(p)
  check(small1.length === 0, 'จุดแตะในหน้าสร้างบิล ≥44px', small1.slice(0, 3).join(' · '))

  /* ★ ปุ่มบันทึกต้องเป็น sticky ไม่ใช่ fixed — fixed ถูกคีย์บอร์ดบนมือถือทับ */
  const stickyKind = await p.evaluate(() => {
    const el = document.querySelector('main .sticky') as HTMLElement | null
    if (!el) return null
    const r = (el.querySelector('button') as HTMLElement).getBoundingClientRect()
    return { pos: getComputedStyle(el).position, bottom: Math.round(r.bottom), vh: window.innerHeight }
  })
  check(stickyKind?.pos === 'sticky', 'ปุ่มบันทึกเป็น sticky ไม่ใช่ fixed', `position=${stickyKind?.pos}`)
  check(
    (stickyKind?.bottom ?? 0) <= (stickyKind?.vh ?? 0) + 1,
    'ปุ่มบันทึกอยู่ในจอ',
    `bottom=${stickyKind?.bottom} vh=${stickyKind?.vh}`,
  )

  /* ═══ 3 · หักลบหนี้ครบทั้งสองฝั่ง ═══════════════════════════════ */
  head('หักลบหนี้: เพิ่ม ฉันค้าง ฿50 · เขาค้างฉัน ฿30 → สุทธิต้องขยับ ฿20')
  await db.from('debts').delete().like('description', 'เฟส6%')

  /*
   * ★★★ คำนวณยอดที่คาดไว้จากหนี้ที่ค้างอยู่จริง ไม่ฮาร์ดโค้ด ฿20
   *
   *     ★ รอบแรกเขียนทดสอบว่า "ต้องได้ ฿20" ★★ แล้วล้มเพราะสองคนนี้มีหนี้
   *        ค้างกันอยู่ก่อนแล้ว ผลสุทธิจริงคือ ฿174 ซึ่ง "ถูกต้อง"
   *        ★ เทสต์ที่สมมติว่าฐานข้อมูลว่าง คือเทสต์ที่ฟ้องของที่ไม่ผิด
   *     ★ สิ่งที่ต้องพิสูจน์จริงคือ "ใส่ +50 −30 แล้วสุทธิขยับขึ้น 20" ซึ่งวัดได้
   *       โดยไม่ต้องแตะข้อมูลของจริง
   */
  const beforeRows = await db
    .from('debts')
    .select('amount, creditor_id, debtor_id')
    .eq('status', 'PENDING')
    .or(`and(creditor_id.eq.${me!.id},debtor_id.eq.${other!.id}),and(creditor_id.eq.${other!.id},debtor_id.eq.${me!.id})`)
  const baseSat = (beforeRows.data ?? []).reduce(
    (a, d) => a + (d.debtor_id === me!.id ? 1 : -1) * Math.round(Number(d.amount) * 100),
    0,
  )
  const expectSat = baseSat + 5000 - 3000
  console.log(`  \x1b[2mสุทธิก่อนเพิ่ม ${(baseSat / 100).toFixed(2)} → คาดว่าได้ ${(expectSat / 100).toFixed(2)}\x1b[0m`)
  const { data: d1 } = await db
    .from('debts')
    .insert({ creditor_id: other!.id, debtor_id: me!.id, amount: 50, description: 'เฟส6 ฉันค้างเขา', status: 'PENDING' })
    .select('id')
    .single()
  const { data: d2 } = await db
    .from('debts')
    .insert({ creditor_id: me!.id, debtor_id: other!.id, amount: 30, description: 'เฟส6 เขาค้างฉัน', status: 'PENDING' })
    .select('id')
    .single()

  await p.goto(`${APP}/office/wallet/owed`, { waitUntil: 'networkidle' })
  await p.waitForTimeout(4000)

  const row = p.locator('.rounded-2xl.border').filter({ hasText: other!.nickname! }).first()
  const netView = await row.evaluate((el) => ({
    text: (el as HTMLElement).innerText.replace(/[⁦-⁩]/g, ''),
    netted: /หักลบแล้ว/.test((el as HTMLElement).innerText),
  }))
  check(netView.netted, 'ขึ้นป้าย "หักลบแล้ว"')
  const expectText = `฿${(Math.abs(expectSat) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
  check(netView.text.includes(expectText), `แสดงยอดสุทธิ ${expectText}`, netView.text.split('\n').join(' | ').slice(0, 70))

  /* จ่าย 2 แตะ */
  let payTaps = 0
  /*
   * ★ ปุ่มจ่ายมียอดอยู่บนตัวมันเองแล้ว ("จ่าย ฿123.45")
   *   ★★ จึงผูกกับ "ขึ้นต้นด้วยคำว่าจ่าย" ไม่ใช่ "เท่ากับคำว่าจ่าย"
   *      ★ ยังแยกจากปุ่มอื่นในการ์ดได้ เพราะไม่มีปุ่มไหนขึ้นต้นด้วยคำนี้
   *   ★★ ห้ามใช้ \b ปิดท้าย — อักษรไทยไม่ใช่ \w ในนิพจน์ปกติของ JS
   *      ขอบคำจึงไม่มีทางเกิดหลัง "จ่าย" เลยสักครั้ง
   */
  await row.locator('button').filter({ hasText: /^(จ่าย|Pay)/ }).first().click(); payTaps++
  await p.waitForTimeout(1500)
  const sheetAmount = await p.evaluate(
    () => document.querySelector('[role="dialog"] .text-2xl')?.textContent?.replace(/[⁦-⁩]/g, '') ?? null,
  )
  check(sheetAmount?.includes(expectText) ?? false, 'แผ่นจ่ายเงินแสดงยอดสุทธิ', sheetAmount ?? '')
  await p.locator('[role="dialog"] button').filter({ hasText: /จ่ายแล้ว/ }).first().click(); payTaps++
  await p.waitForTimeout(5000)
  check(payTaps === 2, 'จ่ายหนี้จบใน 2 แตะ', `ใช้ ${payTaps} แตะ`)

  const after = await db.from('debts').select('id, status').in('id', [d1!.id, d2!.id])
  const closedBoth = (after.data ?? []).every((d) => d.status === 'SETTLED')
  check(closedBoth, 'หนี้เดิมทั้งสองฝั่งถูกปิด', JSON.stringify((after.data ?? []).map((d) => d.status)))

  const { data: settle } = await db
    .from('debts')
    .select('id, amount, status, is_settlement, creditor_id')
    .eq('is_settlement', true)
    .order('created_at', { ascending: false })
    .limit(1)
  const s = settle?.[0]
  check(
    Math.round(Number(s?.amount ?? 0) * 100) === Math.abs(expectSat),
    `ใบสุทธิมียอด ${expectText}`,
    `฿${s?.amount}`,
  )
  check(s?.status === 'PAID_PENDING', 'ใบสุทธิอยู่สถานะรอยืนยัน', String(s?.status))

  /* ═══ 4 · ยืนยันรับเงิน 1 แตะ (ฝั่งเจ้าหนี้) ════════════════════ */
  head('ยืนยันรับเงิน')
  const ctx2 = await browser.newContext({ viewport: PHONE })
  const pimState = await login(ctx2, 'pim.s', 'AwaDemo2026!')
  await ctx2.close()
  const ctx3 = await browser.newContext({ viewport: PHONE, storageState: pimState })
  const p2 = await ctx3.newPage()
  p2.setDefaultTimeout(T)
  await p2.goto(`${APP}/office/wallet/owed`, { waitUntil: 'networkidle' })
  await p2.waitForTimeout(4000)
  await p2.locator('button[aria-pressed]').nth(1).click()
  await p2.waitForTimeout(1200)

  const { data: tonP } = await db.from('profiles').select('nickname').eq('username', 'ton.k').single()
  const row2 = p2.locator('.rounded-2xl.border').filter({ hasText: tonP!.nickname! }).first()
  const confirmBtn = row2.locator('button').filter({ hasText: /ยืนยันรับเงิน|Confirm/ }).first()
  const hasConfirm = (await confirmBtn.count()) > 0
  check(hasConfirm, 'ปุ่ม "ยืนยันรับเงิน" อยู่ในแถว')

  if (hasConfirm) {
    await confirmBtn.click()
    await p2.waitForTimeout(5000)
    const { data: done } = await db.from('debts').select('status').eq('id', s!.id).single()
    check(done!.status === 'SETTLED', 'ยืนยัน 1 แตะแล้วหนี้ปิด', String(done!.status))
  }

  const small2 = await smallTargets(p2)
  check(small2.length === 0, 'จุดแตะในหน้ายอดค้าง ≥44px', small2.slice(0, 3).join(' · '))
  await ctx3.close()

  /* ═══ 5 · ตัวเลขหน้าสรุปตรงกับหน้ายอดค้าง ═══════════════════════ */
  head('ความสอดคล้องของตัวเลขข้ามหน้า')
  const cross = await p.evaluate(async () => {
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const last = new Date(y, now.getMonth() + 1, 0).getDate()
    const [sumRes, owedRes] = await Promise.all([
      fetch(`/api/office/wallet/summary?from=${y}-${m}-01&to=${y}-${m}-${last}`).then((r) => r.text()),
      fetch('/api/office/wallet').then((r) => r.text()),
    ])
    return { sum: JSON.parse(sumRes).data, owed: JSON.parse(owedRes).data }
  })
  const sat = (v: number) => Math.round(Number(v) * 100)
  const itemsSat = (cross.sum.items as { amount: number }[]).reduce((a, i) => a + sat(i.amount), 0)
  check(itemsSat === sat(cross.sum.total), 'ผลรวมรายการ = ยอดรวมในหน้าสรุป', `${itemsSat} vs ${sat(cross.sum.total)}`)
  check(
    sat(cross.sum.myShare) + sat(cross.sum.myShareOthers) === sat(cross.sum.total),
    'การ์ดสองใบบวกกันได้ยอดรวม',
  )

  /* ═══ 6 · ทวงซ้ำระหว่างคูลดาวน์ ════════════════════════════════ */
  head('ทวงซ้ำระหว่างคูลดาวน์ 24 ชม.')
  const { data: fresh } = await db
    .from('debts')
    .insert({ creditor_id: me!.id, debtor_id: other!.id, amount: 15, description: 'เฟส6 ทวง', status: 'PENDING' })
    .select('id')
    .single()
  await p.goto(`${APP}/office/wallet/owed`, { waitUntil: 'networkidle' })
  await p.waitForTimeout(4000)
  await p.locator('button[aria-pressed]').nth(1).click()
  await p.waitForTimeout(1200)
  const rowR = p.locator('.rounded-2xl.border').filter({ hasText: other!.nickname! }).first()
  const remindBtn = rowR.locator('button').filter({ hasText: /^(ทวง|Nudge|Remind)$/ }).first()
  if (await remindBtn.count()) {
    await remindBtn.click()
    await p.waitForTimeout(4500)
    const state = await rowR.evaluate((el) => {
      const b = [...el.querySelectorAll('button')].find((x) => /^(ทวง|Nudge|Remind)$/.test((x.textContent ?? '').trim()))
      return {
        disabled: (b as HTMLButtonElement | undefined)?.disabled ?? null,
        text: (el as HTMLElement).innerText.replace(/[⁦-⁩]/g, ''),
      }
    })
    check(state.disabled === true, 'ปุ่มทวงกดไม่ได้หลังทวงไปแล้ว')
    check(/ทวงได้อีกใน|ทวงแล้ว/.test(state.text), 'บอกว่าทวงได้อีกเมื่อไหร่', state.text.split('\n').find((x) => /ทวง/.test(x)) ?? '')
  } else {
    check(false, 'หาปุ่มทวงไม่เจอ')
  }

  /* ═══ 7 · CSV ════════════════════════════════════════════════ */
  head('ส่งออก CSV')
  const csv = await p.evaluate(async () => {
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const last = new Date(y, now.getMonth() + 1, 0).getDate()
    const d = JSON.parse(
      await fetch(`/api/office/wallet/summary?from=${y}-${m}-01&to=${y}-${m}-${last}`).then((r) => r.text()),
    ).data
    return { hasDelivery: d.items[0]?.deliveryFee !== undefined, hasShop: 'shop' in (d.items[0] ?? {}) }
  })
  check(csv.hasDelivery, 'รายการมีคอลัมน์ค่าส่ง/ส่วนลด')
  check(csv.hasShop, 'รายการมีคอลัมน์ร้าน')

  await p.goto(`${APP}/office/wallet/summary`, { waitUntil: 'networkidle' })
  await p.waitForTimeout(3500)
  const dl = await p.waitForEvent('download', { timeout: 20_000 }).catch(() => null)
  const clicked = p.locator('button').filter({ hasText: /Export CSV|ส่งออก/ }).first()
  if (await clicked.count()) {
    const [download] = await Promise.all([
      p.waitForEvent('download', { timeout: 20_000 }).catch(() => null),
      clicked.click(),
    ])
    if (download) {
      const path = await download.path()
      const buf = path ? readFileSync(path) : Buffer.alloc(0)
      check(buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf, 'ไฟล์ CSV มี UTF-8 BOM (ไทยไม่เพี้ยนใน Excel)')
      const text = buf.toString('utf8')
      check(/[ก-๙]/.test(text), 'ไฟล์มีภาษาไทย')
    } else {
      check(false, 'ดาวน์โหลด CSV ไม่สำเร็จ')
    }
  }
  void dl

  /* ═══ 8 · กล้อง: เลือกรูปจากคลังได้ด้วย ═════════════════════════ */
  head('ใบเสร็จ: เลือกจากคลังได้เมื่อไม่อนุญาตกล้อง')
  await p.goto(`${APP}/office/wallet/create`, { waitUntil: 'networkidle' })
  await p.waitForTimeout(3000)
  await p.locator('button[aria-expanded]').filter({ hasText: /เพิ่มรายละเอียด/ }).click()
  await p.waitForTimeout(500)
  const fileInput = await p.evaluate(() => {
    const el = document.querySelector('input[type="file"]') as HTMLInputElement | null
    return el ? { capture: el.getAttribute('capture'), accept: el.accept, multiple: el.multiple } : null
  })
  check(fileInput?.capture === 'environment', 'เปิดกล้องหลังเป็นค่าเริ่มต้น')
  check(
    Boolean(fileInput?.accept?.includes('image/')),
    'ยังเลือกรูปจากคลังได้ (accept เป็นชนิดรูป ไม่ได้บังคับกล้อง)',
    fileInput?.accept ?? '',
  )

  /* ═══ 9 · ทั้งสองโหมดสี ═══════════════════════════════════════ */
  head('โหมดสว่าง / โหมดมืด')
  for (const scheme of ['light', 'dark'] as const) {
    const c = await browser.newContext({ viewport: PHONE, colorScheme: scheme, storageState: tonState })
    const pg = await c.newPage()
    pg.setDefaultTimeout(T)
    const bad: string[] = []
    for (const [path, label] of [
      ['/office/wallet/owed', 'ยอดค้าง'],
      ['/office/wallet/create', 'สร้างรายการ'],
      ['/office/wallet/summary', 'สรุปค่าข้าว'],
      ['/office/wallet/qr', 'QR'],
    ] as const) {
      await pg.goto(`${APP}${path}`, { waitUntil: 'networkidle' })
      await pg.waitForTimeout(2500)
      const r = await pg.evaluate(() => ({
        overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        rawKeys: (document.body.innerText.match(/\b[a-z]+\.[a-z]+\.[A-Za-z]+\b/g) ?? []).slice(0, 2),
        invisible: [...document.querySelectorAll('main *')].filter((el) => {
          const cs = getComputedStyle(el)
          return cs.color === cs.backgroundColor && (el.textContent ?? '').trim().length > 0
        }).length,
      }))
      if (r.overflowX) bad.push(`${label}: ล้นแนวนอน`)
      if (r.rawKeys.length) bad.push(`${label}: กุญแจหลุด ${r.rawKeys.join(',')}`)
      if (r.invisible > 0) bad.push(`${label}: ตัวหนังสือสีเดียวกับพื้น ${r.invisible} จุด`)
    }
    check(bad.length === 0, `โหมด${scheme === 'light' ? 'สว่าง' : 'มืด'} ทั้ง 4 หน้า`, bad.join(' · '))
    await c.close()
  }

  check(errors.length === 0, 'ไม่มี error บนหน้าเว็บ', errors.slice(0, 2).join(' | '))

  /* ── ล้างข้อมูลทดสอบ ──────────────────────────────────────── */
  await db.from('debts').delete().like('description', 'เฟส6%')
  if (fresh) await db.from('debts').delete().eq('id', fresh.id)

  await browser.close()
  console.log(`\n  ผ่าน ${pass} · ล้ม ${fail}\n`)
  if (fail > 0) process.exitCode = 1
}

void main()
