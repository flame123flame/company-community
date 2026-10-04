/**
 * เติมข้อมูลทดสอบให้ "ครบทุกเมนู" — ต่อจาก seed-demo.mjs
 *
 * ใช้:
 *   node --experimental-websocket scripts/seed-more.mjs          → ซ้อม บอกว่าจะเติมอะไร ไม่เขียนจริง
 *   node --experimental-websocket scripts/seed-more.mjs --yes    → เขียนจริง
 *   node --experimental-websocket scripts/seed-more.mjs --yes --undo → ถอนเฉพาะแถวที่สคริปต์นี้สร้าง
 *
 * ★ --experimental-websocket เพราะ supabase-js ต้องการ WebSocket ซึ่ง Node 20 ยังไม่มีในตัว
 *
 * ★★★ ทำไมไม่แก้ seed-demo.mjs แทน
 *     ★ ตัวนั้นถูกรันไปแล้ว — ข้อมูลของมันอยู่ในฐานแล้ว รันซ้ำได้ร้านซ้ำ
 *       ★★ และรายชื่อประเภทอาหารของมัน ('ตามสั่ง' · 'ฝรั่ง') ไม่ผ่าน CHECK ของ 0061 แล้ว
 *     ★ ไฟล์นี้เติมเฉพาะ "ช่องที่ยังว่าง" ที่วัดจากฐานจริงเมื่อ 4 ต.ค. 2026:
 *       ร้านคาราโอเกะ (0) · ประวัติการกิน (0) · ผลพิมพ์ดีด (0) · หมากฮอสจบแล้ว (1) ·
 *       ทัวร์นาเมนต์ที่ยังแข่งอยู่ (0) · เลขงวดหน้า (0 ตามวันใน app_settings) ·
 *       ประกาศตลาดหมวดที่ยังไม่มี · กลุ่มหารบิล (1) · ชุดรายชื่อ
 *
 * ★★ จดไอดีทุกแถวลง scripts/.seed-more-ids.json — ถอนคืนได้เป๊ะ ไม่แตะข้อมูลจริงของใคร
 *    ★ แถวที่ไม่มี id ของตัวเอง (โหวต · ผู้เล่นพิมพ์ดีด) ผูกกับร้าน/ห้องที่สคริปต์สร้าง
 *      จึงหายตาม cascade ตอนถอน
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'node:fs'

function loadEnv() {
  let raw = ''
  for (const f of ['.env.local', '.env']) {
    try {
      raw = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
      break
    } catch {
      /* ไฟล์ถัดไป */
    }
  }
  for (const line of raw.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
loadEnv()

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL_ || !KEY) {
  console.error('✗ ไม่พบ NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY ใน .env.local')
  process.exit(1)
}
/* ★★★ กันยิงผิดโปรเจกต์ — ชุดเดียวกับ seed-demo.mjs */
const FORBIDDEN = 'vackilhpblpkfzonlodl'
if (URL_.includes(FORBIDDEN)) {
  console.error(`✗ หยุด — URL ชี้ไปโปรเจกต์เก่า (${FORBIDDEN}) ซึ่งเป็นของอีกแอป ห้ามแตะ`)
  process.exit(1)
}

const APPLY = process.argv.includes('--yes')
const UNDO = process.argv.includes('--undo')
const db = createClient(URL_, KEY, { auth: { persistSession: false } })

const now = Date.now()
const ago = (days, hours = 0, mins = 0) => new Date(now - ((days * 24 + hours) * 60 + mins) * 60_000).toISOString()

/** สุ่มแบบคงที่ — รันซ้ำได้ผลเดิม */
let seed = 20261004
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
const pick = (arr) => arr[Math.floor(rnd() * arr.length)]
const chance = (p) => rnd() < p
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1))
const shuffle = (arr) => [...arr].sort(() => rnd() - 0.5)

const log = (...a) => console.log(...a)
const step = (t) => log(`\n\x1b[1m${t}\x1b[0m`)

const LEDGER = new URL('./.seed-more-ids.json', import.meta.url)
const made = []

async function ins(table, rows, opts = {}) {
  if (!rows.length) return []
  if (!APPLY) {
    log(`  (ซ้อม) ${table} ← ${rows.length} แถว`)
    return rows.map((r, i) => ({ id: `dry-${table}-${i}`, ...r }))
  }
  const { data, error } = await db.from(table).insert(rows).select(opts.select ?? 'id')
  if (error) {
    console.error(`  ✗ ${table}:`, error.message)
    throw error
  }
  if (!opts.noLedger) made.push({ table, key: opts.key ?? 'id', ids: data.map((d) => d[opts.key ?? 'id']) })
  log(`  ${table} ← ${data.length} แถว`)
  return data
}

function saveLedger() {
  if (!APPLY || !made.length) return
  let old = []
  try {
    old = JSON.parse(readFileSync(LEDGER, 'utf8'))
  } catch {
    /* ยังไม่เคยรัน */
  }
  writeFileSync(LEDGER, JSON.stringify([...old, ...made], null, 1))
  log(`\n  จดไอดีไว้ที่ scripts/.seed-more-ids.json แล้ว (ถอนคืนด้วย --yes --undo)`)
}

async function undo() {
  step('ถอนข้อมูลที่ seed-more สร้าง')
  let ledger = []
  try {
    ledger = JSON.parse(readFileSync(LEDGER, 'utf8'))
  } catch {
    log('  ไม่เจอไฟล์ไอดี — ไม่มีอะไรให้ถอน')
    return
  }
  for (const e of [...ledger].reverse()) {
    if (!APPLY) {
      log(`  (ซ้อม) ${e.table} → ลบ ${e.ids.length} แถว`)
      continue
    }
    const { error } = await db.from(e.table).delete().in(e.key ?? 'id', e.ids)
    if (error) console.error(`  ✗ ${e.table}:`, error.message)
    else log(`  ${e.table} → ลบ ${e.ids.length} แถว`)
  }
  if (APPLY) writeFileSync(LEDGER, '[]')
}

/* ── คนในระบบ: ใช้คนที่มีอยู่จริง ไม่สร้างบัญชีใหม่ ── */
const TEST_PREFIX = /^(drv[ab]|who[ab]|grp[ab]|rb[ab]|nm|i18n)/
async function loadPeople() {
  const { data, error } = await db.from('profiles').select('id, username, nickname').not('username', 'is', null)
  if (error) throw error
  const people = (data ?? []).filter((p) => p.nickname && !TEST_PREFIX.test(p.username))
  log(`  พนักงานที่ใช้ได้ ${people.length} คน`)
  if (people.length < 4) throw new Error('คนในระบบน้อยเกินไป — รัน seed-demo.mjs ก่อน')
  return people
}
const label = (p) => ({ id: p.id, label: p.nickname })

/* ═══════════════════════════════════════════════════════════════════
 * 1 · กินอะไรดี — ร้านใหม่ (รวมคาราโอเกะ) · เมนู · โหวต · รีวิว · ประวัติการกิน
 * ═══════════════════════════════════════════════════════════════════ */
const OFFICE = { lat: 13.7279, lng: 100.5241 }
const NEW_SHOPS = [
  {
    name: 'K-Star Karaoke สาขาสีลม',
    dish: 'ห้อง VIP + ชุดเหล้า',
    cuisine: 'คาราโอเกะ',
    price: '฿฿฿',
    dist: 'DRIVE',
    note: 'ไว้เลี้ยงปิดโปรเจกต์ จองห้องล่วงหน้าอย่างน้อย 1 วัน',
    dishes: [['ชุดผลไม้รวม', 350], ['เฟรนช์ฟรายส์', 180], ['ปีกไก่ทอดน้ำปลา', 250]],
    karaoke: {
      hostessPerHour: 300,
      packages: [
        { name: 'Regency 1 กลม', price: 1600, hostesses: 2 },
        { name: 'Black Label 1 ขวด', price: 2900, hostesses: 3 },
        { name: 'เบียร์ 1 ถัง (24 ขวด)', price: 1900, hostesses: 2 },
      ],
      rooms: [
        { name: 'ห้องเล็ก (6 คน)', perHour: 300, night: null },
        { name: 'VIP (12 คน)', perHour: 600, night: 3500 },
        { name: 'VVIP ปาร์ตี้ (20 คน)', perHour: null, night: 6000 },
      ],
      note: 'ค่าเปิดขวด 300 · คิดค่าบริการ 10% · เปิด 19:00–02:00',
    },
  },
  {
    name: 'Melody Box ร้องเพลงรายชั่วโมง',
    dish: 'ห้องร้องเพลงรายชั่วโมง',
    cuisine: 'คาราโอเกะ',
    price: '฿฿',
    dist: 'WALK',
    note: 'แบบกล่องร้องเพลงไม่มีเด็กเอ็น เหมาะไปกันหลังเลิกงาน',
    dishes: [['ป๊อปคอร์นถังใหญ่', 120], ['น้ำอัดลมรีฟิล', 60]],
    karaoke: {
      hostessPerHour: null,
      packages: [{ name: 'เบียร์ 1 ทาวเวอร์', price: 690, hostesses: 0 }],
      rooms: [
        { name: 'ห้องคู่ (2 คน)', perHour: 150, night: null },
        { name: 'ห้องกลาง (8 คน)', perHour: 350, night: 2200 },
      ],
      note: 'จันทร์–พฤหัส ก่อน 18:00 ลด 20%',
    },
  },
  { name: 'ข้าวซอยลำดวน สาขาออฟฟิศ', dish: 'ข้าวซอยไก่', cuisine: 'ไทย', price: '฿', dist: 'WALK', note: 'น้ำแกงเข้มข้น ใส่มะนาวเยอะ ๆ', dishes: [['ข้าวซอยไก่', 70], ['ข้าวซอยเนื้อ', 90], ['ขนมจีนน้ำเงี้ยว', 60]] },
  { name: 'ลาบยโส แซ่บนัว', dish: 'ลาบหมู + ข้าวเหนียว', cuisine: 'อีสาน', price: '฿', dist: 'WALK', note: 'ข้าวเหนียวหมดไวช่วงเที่ยง', dishes: [['ลาบหมู', 70], ['ต้มแซ่บกระดูกอ่อน', 90], ['ไก่ย่าง', 120], ['ส้มตำไทย', 50]] },
  { name: 'Ramen Tatsu', dish: 'ทงคตสึราเมงไข่ยางมะตูม', cuisine: 'ญี่ปุ่น', price: '฿฿', dist: 'DRIVE', note: 'คิวยาววันศุกร์ มาก่อน 11:30', dishes: [['ทงคตสึราเมง', 245], ['เกี๊ยวซ่า 5 ชิ้น', 120], ['ข้าวหน้าหมูชาชู', 189]] },
  { name: 'ติ่มซำฮ่องกงเจ๊หลิน', dish: 'ฮะเก๋า + ขนมจีบกุ้ง', cuisine: 'จีน', price: '฿฿', dist: 'DRIVE', note: 'เสาร์อาทิตย์ปิด', dishes: [['ฮะเก๋า', 65], ['ขนมจีบกุ้ง', 65], ['ซาลาเปาลาวา', 55], ['โจ๊กหมู', 70]] },
  { name: 'แกงใต้ตำรับย่าเหลียน', dish: 'แกงส้มปลากะพง', cuisine: 'ใต้', price: '฿', dist: 'WALK', note: 'เผ็ดแบบใต้แท้ สั่งเผ็ดน้อยไว้ก่อน', dishes: [['แกงส้มปลากะพง', 120], ['คั่วกลิ้งหมู', 90], ['ใบเหลียงผัดไข่', 70]] },
  { name: 'Banh Mi Corner', dish: 'บั๋นหมี่หมูยอ', cuisine: 'เวียดนาม', price: '฿', dist: 'DELIVERY', note: 'สั่งรวมกัน 5 ชิ้นขึ้นไปส่งฟรี', dishes: [['บั๋นหมี่หมูยอ', 79], ['ปอเปี๊ยะสด', 89], ['กาแฟเวียดนามเย็น', 65]] },
  { name: 'Pasta Nonna', dish: 'คาโบนาร่าสูตรโรมัน', cuisine: 'อิตาเลียน', price: '฿฿', dist: 'DRIVE', note: 'ร้านเล็ก โต๊ะน้อย ควรโทรจอง', dishes: [['คาโบนาร่า', 280], ['ลาซานญ่าเนื้อ', 320], ['ทีรามิสุ', 160]] },
  { name: 'Yakiniku Kuro', dish: 'เนื้อวากิวบุฟเฟต์ 90 นาที', cuisine: 'ปิ้งย่าง', price: '฿฿฿', dist: 'DRIVE', note: 'โปรวันเกิดลด 50% สำหรับเจ้าของวันเกิด', dishes: [['บุฟเฟต์มาตรฐาน', 599], ['บุฟเฟต์พรีเมียม', 899]] },
  { name: 'Green Bowl', dish: 'โบวล์อกไก่คีนัว', cuisine: 'สุขภาพ', price: '฿฿', dist: 'DELIVERY', note: 'แคลอรีเขียนไว้ทุกเมนู', dishes: [['โบวล์อกไก่คีนัว', 189], ['สลัดแซลมอน', 259], ['สมูทตี้เขียว', 95]] },
  { name: 'Slow Bar Coffee', dish: 'ดริปเมล็ดเอธิโอเปีย', cuisine: 'กาแฟ', price: '฿฿', dist: 'WALK', note: 'มีปลั๊กทุกโต๊ะ นั่งประชุมเล็ก ๆ ได้', dishes: [['ดริปเอธิโอเปีย', 120], ['อเมริกาโน่เย็น', 85], ['บานอฟฟี่', 110]] },
]

const REVIEW_LINES = {
  5: ['อร่อยมาก กลับมาซ้ำแน่นอน', 'ดีที่สุดในละแวกนี้แล้ว', 'คุ้มราคามาก ๆ แนะนำเลย', 'พาลูกค้าไปแล้วประทับใจ'],
  4: ['อร่อย แต่รอนานไปหน่อยช่วงเที่ยง', 'รสชาติดี ที่จอดรถหายาก', 'ดี ราคาสูงขึ้นนิดนึง'],
  3: ['ก็โอเค ไม่ได้ว้าว', 'รสชาติกลาง ๆ สะดวกเพราะใกล้'],
  2: ['วันนี้เค็มไปหน่อย ปกติดีกว่านี้'],
}

async function seedFood(people) {
  step('1 · กินอะไรดี')
  const rows = NEW_SHOPS.map((s, i) => ({
    name: s.name,
    signature_dish: s.dish,
    cuisine: s.cuisine,
    price_range: s.price,
    distance: s.dist,
    note: s.note,
    added_by: pick(people).id,
    lat: +(OFFICE.lat + (rnd() - 0.5) * 0.02).toFixed(6),
    lng: +(OFFICE.lng + (rnd() - 0.5) * 0.02).toFixed(6),
    created_at: ago(30 - i * 2, int(1, 8)),
  }))
  const shops = await ins('restaurants', rows)

  /* ★ คาราโอเกะเขียนแยกหลังสร้างร้าน — CHECK ของ 0061 ยอมเฉพาะร้านที่ cuisine = คาราโอเกะ */
  if (APPLY) {
    for (let i = 0; i < shops.length; i++) {
      const k = NEW_SHOPS[i].karaoke
      if (!k) continue
      const { error } = await db.from('restaurants').update({ karaoke: k }).eq('id', shops[i].id)
      if (error) console.error('  ✗ karaoke:', error.message)
    }
    log(`  ราคาคาราโอเกะ ← ${NEW_SHOPS.filter((s) => s.karaoke).length} ร้าน`)
  }

  const dishes = []
  shops.forEach((shop, i) =>
    NEW_SHOPS[i].dishes.forEach(([name, baht], sort) =>
      dishes.push({ restaurant_id: shop.id, name, price_satang: baht * 100, sort }),
    ),
  )
  await ins('restaurant_dishes', dishes)

  /* ★ โหวตเฉพาะร้านใหม่ — โหวตไม่มี id ของตัวเอง แต่หายตามร้านตอนถอน */
  const votes = []
  shops.forEach((shop) => {
    const p = 0.2 + rnd() * 0.6
    for (const person of people) if (chance(p)) votes.push({ restaurant_id: shop.id, user_id: person.id, created_at: ago(int(0, 25)) })
  })
  await ins('restaurant_votes', votes, { select: 'restaurant_id', noLedger: true })

  /* ★ รีวิวทั้งร้านใหม่และร้านเดิม — ร้านเดิมจะได้มีดาวเฉลี่ยที่หลากหลายให้ดู */
  const { data: oldShops } = await db.from('restaurants').select('id').neq('cuisine', 'คาราโอเกะ')
  const { data: oldReviews } = await db.from('restaurant_reviews').select('restaurant_id, author_id')
  const taken = new Set((oldReviews ?? []).map((r) => `${r.restaurant_id}:${r.author_id}`))
  const targets = [...shops.map((s) => s.id), ...(oldShops ?? []).map((s) => s.id)]
  const reviews = []
  for (const rid of targets) {
    for (const person of shuffle(people).slice(0, int(1, 4))) {
      const key = `${rid}:${person.id}`
      if (taken.has(key)) continue
      taken.add(key)
      const rating = pick([5, 5, 5, 4, 4, 4, 3, 3, 2])
      reviews.push({
        restaurant_id: rid,
        author_id: person.id,
        rating,
        body: pick(REVIEW_LINES[rating]),
        at_shop: chance(0.4),
        created_at: ago(int(0, 40), int(0, 10)),
      })
    }
  }
  await ins('restaurant_reviews', reviews)

  /* ★ ประวัติการกิน (ตาราง restaurant_visits ว่างอยู่) — หน้า "ล่าสุด" จะได้มีของ */
  const all = targets.filter((id) => !String(id).startsWith('dry-'))
  const visits = []
  for (const person of people) {
    for (let k = 0; k < int(2, 6); k++) {
      if (!all.length) break
      visits.push({ restaurant_id: pick(all), user_id: person.id, visited_at: ago(int(0, 30), int(11, 13), int(0, 59)) })
    }
  }
  await ins('restaurant_visits', visits)
}

/* ═══════════════════════════════════════════════════════════════════
 * 2 · กระเป๋าเงิน — กลุ่มหารบิลที่ใช้บ่อย
 * ═══════════════════════════════════════════════════════════════════ */
async function seedWallet(people) {
  step('2 · กระเป๋าเงิน')
  const groups = ['แก๊งกาแฟบ่ายสาม', 'ทีม Dev สั่งข้าว', 'ก๊วนแบดวันพุธ', 'ห้องประชุมชั้น 12'].map((name, i) => {
    const owner = people[i % people.length]
    const members = shuffle(people.filter((p) => p.id !== owner.id)).slice(0, int(2, 5))
    return { owner_id: owner.id, name, member_ids: members.map((m) => m.id), created_at: ago(int(3, 20)) }
  })
  await ins('split_groups', groups)
}

/* ═══════════════════════════════════════════════════════════════════
 * 3 · สุ่มและเกม — เลขงวดหน้า · ชุดรายชื่อ · ทัวร์นาเมนต์ที่ยังแข่ง · หมากฮอส · พิมพ์ดีด
 * ═══════════════════════════════════════════════════════════════════ */
const TYPING_TH =
  'การทำงานเป็นทีมที่ดีเริ่มจากการสื่อสารที่ชัดเจน ทุกคนรู้ว่าตัวเองต้องทำอะไร และพร้อมช่วยเหลือกันเมื่อมีปัญหา'

async function seedFun(people) {
  step('3 · สุ่มและเกม')

  /* เลขงวดหน้า — ตามวันใน app_settings.lottery_next_draw */
  const { data: setting } = await db.from('app_settings').select('value').eq('key', 'lottery_next_draw').maybeSingle()
  const draw = typeof setting?.value === 'string' ? setting.value : '2026-10-16'
  const picks = []
  const seen = new Set()
  for (const person of people) {
    for (let k = 0; k < int(1, 3); k++) {
      const len = pick([2, 2, 3, 3, 6])
      const number = String(int(0, 10 ** len - 1)).padStart(len, '0')
      const key = `${person.id}:${number}`
      if (seen.has(key)) continue
      seen.add(key)
      picks.push({ user_id: person.id, number, draw_date: draw, created_at: ago(int(0, 5), int(0, 12)) })
    }
  }
  await ins('lottery_picks', picks)

  /* ชุดรายชื่อสำหรับวงล้อ/แบ่งทีม — ชื่อชุดห้ามซ้ำต่อเจ้าของ */
  const { data: oldSets } = await db.from('name_sets').select('owner_id, name')
  const setTaken = new Set((oldSets ?? []).map((s) => `${s.owner_id}:${s.name}`))
  const sets = [
    ['ทุกคนในออฟฟิศ', people],
    ['ก๊วนข้าวเที่ยง', shuffle(people).slice(0, 6)],
    ['ทีมฟุตซอลวันศุกร์', shuffle(people).slice(0, 10)],
  ]
    .map(([name, members], i) => ({ owner_id: people[(i + 1) % people.length].id, name, members: members.map(label), created_at: ago(int(5, 30)) }))
    .filter((s) => !setTaken.has(`${s.owner_id}:${s.name}`))
  await ins('name_sets', sets)

  /* ทัวร์นาเมนต์ที่ยังแข่งอยู่ — 8 ทีม รอบแรกจบ 3 คู่ เหลือ 1 คู่ให้กดผลเอง */
  const [t] = await ins('tournaments', [{ owner_id: people[0].id, name: 'ฟุตบอลโต๊ะชิงแชมป์ไตรมาส 4', status: 'OPEN', created_at: ago(3) }])
  const COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#14b8a6', '#ec4899', '#64748b']
  const NAMES = ['ทีมกาแฟดำ', 'ทีมชาเย็น', 'ทีมโค้ดไม่มีบั๊ก', 'ทีมประชุมไม่จบ', 'ทีมเลิกงานตรงเวลา', 'ทีมส้มตำปูปลาร้า', 'ทีมบั๊กบนโปรดักชัน', 'ทีมไม่มีชื่อ']
  const pool = shuffle(people)
  const teams = await ins(
    'tournament_teams',
    NAMES.map((name, i) => ({
      tournament_id: t.id,
      name,
      color: COLORS[i],
      members: [pool[(i * 2) % pool.length], pool[(i * 2 + 1) % pool.length]].map(label),
      seed: i + 1,
      created_at: ago(3),
    })),
  )
  const matches = []
  for (let slot = 1; slot <= 4; slot++) {
    const a = teams[(slot - 1) * 2]
    const b = teams[(slot - 1) * 2 + 1]
    const done = slot <= 3
    const sa = done ? int(0, 5) : null
    const sb = done ? (sa === 5 ? int(0, 4) : int(sa + 1, 5)) : null
    matches.push({
      tournament_id: t.id,
      round: 1,
      slot,
      team_a: a.id,
      team_b: b.id,
      winner: done ? (sa > sb ? a.id : b.id) : null,
      score_a: sa,
      score_b: sb,
      played_at: done ? ago(int(0, 2), int(1, 6)) : null,
      created_at: ago(3),
    })
  }
  await ins('tournament_matches', matches)

  /* หมากฮอสที่เล่นจบแล้ว — ตารางอันดับจะได้มีหลายคน มีทั้งชนะ แพ้ เสมอ ยอมแพ้ หมดเวลา */
  const BOARD = [0, -1, 0, -1, 0, 0, 0, -1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]
  const games = []
  for (let k = 0; k < 18; k++) {
    const [a, b] = shuffle(people)
    const reason = pick(['WIN', 'WIN', 'WIN', 'RESIGN', 'TIMEOUT', 'DRAW'])
    const winner = reason === 'DRAW' ? null : chance(0.5) ? a.id : b.id
    const at = ago(int(0, 20), int(0, 9))
    games.push({
      bottom_id: a.id,
      top_id: b.id,
      board: BOARD,
      turn: pick(['TOP', 'BOTTOM']),
      quiet_plies: int(0, 12),
      version: int(20, 80),
      status: 'FINISHED',
      winner_id: winner,
      end_reason: reason,
      force_capture: true,
      created_at: at,
      updated_at: at,
    })
  }
  await ins('checkers_games', games)

  /* พิมพ์ดีด — ผลฝึกเดี่ยว (ตารางอันดับ) + ห้องรอแข่ง 1 ห้องที่มีคนรออยู่ */
  const results = []
  for (const person of people) {
    const base = int(18, 75)
    for (let k = 0; k < int(2, 5); k++) {
      const lang = chance(0.65) ? 'th' : 'en'
      const wpm = Math.max(8, base + int(-8, 12) + (lang === 'en' ? 10 : 0))
      results.push({
        user_id: person.id,
        room_id: null,
        lang,
        wpm,
        accuracy: +(85 + rnd() * 15).toFixed(1),
        elapsed_ms: int(25_000, 90_000),
        created_at: ago(int(0, 14), int(0, 10)),
      })
    }
  }
  await ins('typing_results', results)

  const ALPH = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
  const code = Array.from({ length: 5 }, () => ALPH[int(0, ALPH.length - 1)]).join('')
  const host = people[people.length - 1]
  const [room] = await ins('typing_rooms', [{ code, owner_id: host.id, lang: 'th', length: 'medium', text_body: TYPING_TH, status: 'WAITING', created_at: ago(0, 0, 3) }])
  await ins(
    'typing_players',
    [host, people[people.length - 2]].map((p) => ({ room_id: room.id, user_id: p.id, joined_at: ago(0, 0, 2) })),
    { select: 'room_id', noLedger: true },
  )
}

/* ═══════════════════════════════════════════════════════════════════
 * 4 · ตลาดนัด — ครบทุกหมวด · ทุกแบบ · ทุกสถานะ
 * ═══════════════════════════════════════════════════════════════════ */
const LISTINGS = [
  ['หูฟัง Sony WH-1000XM4 กล่องครบ', 4500, 'SELL', 'ELECTRONICS', 'GOOD', 'AVAILABLE', 'ใช้มา 1 ปี แบตยังดี ตัดเสียงรบกวนได้ปกติ'],
  ['โต๊ะยืนทำงานปรับระดับไฟฟ้า', 6900, 'SELL', 'FURNITURE', 'GOOD', 'RESERVED', 'ย้ายบ้านไม่มีที่วาง ต้องมายกเองชั้น 8'],
  ['เสื้อกันหนาวขนเป็ด ไซส์ M', 1200, 'SELL', 'CLOTHES', 'NEW', 'AVAILABLE', 'ซื้อไปญี่ปุ่นแล้วไม่ได้ใส่ ป้ายยังอยู่'],
  ['นิยายแฮร์รี่พอตเตอร์ครบชุด 7 เล่ม', 0, 'FREE', 'BOOKS', 'FLAWED', 'AVAILABLE', 'ปกมีรอยนิดหน่อย แจกให้คนที่อ่านจริง'],
  ['ไม้แบด Yonex Astrox 88D', 2500, 'SELL', 'SPORTS', 'GOOD', 'SOLD', 'ขึ้นเอ็น 26 ปอนด์ล่าสุดเดือนที่แล้ว'],
  ['คุกกี้เนยสดโฮมเมด (รับพรีออเดอร์)', 150, 'SELL', 'FOOD', 'NEW', 'AVAILABLE', 'กล่องละ 12 ชิ้น สั่งวันจันทร์ได้วันพุธ'],
  ['แจกหน่อพลูด่างใส่แก้ว', 0, 'FREE', 'PLANT', 'NEW', 'AVAILABLE', 'มีหลายแก้ว มาหยิบที่โต๊ะได้เลย'],
  ['แลกบัตรคอนเสิร์ตวันเสาร์ เป็นวันอาทิตย์', 0, 'TRADE', 'OTHER', null, 'AVAILABLE', 'โซน B แถวกลาง ติดธุระวันเสาร์'],
  ['ตามหา: ร่มพับอัตโนมัติ สีอะไรก็ได้', 0, 'WANTED', 'OTHER', null, 'AVAILABLE', 'ร่มหายไปกับแท็กซี่ ใครมีเหลือขอซื้อต่อ'],
  ['ตามหา: แท่นวางโน้ตบุ๊กอะลูมิเนียม', 0, 'WANTED', 'ELECTRONICS', null, 'AVAILABLE', 'งบไม่เกิน 500'],
]

async function seedMarket(people) {
  step('4 · ตลาดนัด')
  const rows = LISTINGS.map(([title, price, kind, category, condition, status, description], i) => ({
    seller_id: people[(i + 3) % people.length].id,
    title,
    price,
    kind,
    category,
    condition,
    description,
    meet_building: 'อาคาร A',
    meet_floor: String(int(3, 15)),
    meet_desk: chance(0.5) ? `โต๊ะ ${int(1, 40)}` : null,
    status,
    created_at: ago(int(0, 18), int(0, 10)),
  }))
  await ins('listings', rows)
}

async function main() {
  log(`\n\x1b[1mเติมข้อมูลทดสอบให้ครบทุกเมนู\x1b[0m ${APPLY ? '' : '(ซ้อม — ใส่ --yes เพื่อเขียนจริง)'}`)
  if (UNDO) return undo()
  const people = await loadPeople()
  try {
    await seedFood(people)
    await seedWallet(people)
    await seedFun(people)
    await seedMarket(people)
  } finally {
    saveLedger()
  }
  log('\n\x1b[32m✓ เสร็จ\x1b[0m')
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
