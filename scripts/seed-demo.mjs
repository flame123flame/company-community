/**
 * ข้อมูลตัวอย่างที่ "เหมือนมีคนใช้จริง" — ลงครบทุกโมดูล
 *
 * ใช้:
 *   node scripts/seed-demo.mjs            → บอกว่าจะทำอะไร ไม่เขียนอะไรเลย
 *   node scripts/seed-demo.mjs --yes      → เขียนจริง
 *   node scripts/seed-demo.mjs --yes --clean-tests  → ลบบัญชีทดสอบอัตโนมัติด้วย
 *   node scripts/seed-demo.mjs --yes --undo         → ถอนเฉพาะแถวที่สคริปต์นี้สร้าง
 *
 * ★★★ ทำไมต้องมีไฟล์นี้ ทั้งที่กดเล่นเองก็ได้
 *
 *     ★ ระบบว่างเปล่าโกหกเรื่องตัวเอง — ทุกหน้าดูสวยตอนไม่มีข้อมูล
 *       ★★ ของที่พังจริงจะโผล่ตอนมีข้อมูลเยอะเท่านั้น: ชื่อยาวล้นการ์ด ·
 *          รายการ 40 แถวที่ไม่มีการแบ่งหน้า · ยอดเงินหลักหมื่นที่ดันคอลัมน์
 *     ★ และ "กดเล่นเอง" สร้างได้ทีละรายการ ★★ ซึ่งไม่มีวันถึงปริมาณที่
 *       ทำให้ปัญหาพวกนั้นโผล่
 *
 * ★★★ ข้อมูลต้องสมจริง ไม่ใช่ "ทดสอบ 1 · ทดสอบ 2"
 *
 *     ★ ชื่อปลอมที่อ่านไม่เหมือนของจริง ทำให้มองไม่ออกว่าหน้าจอใช้งานได้จริงไหม
 *       ★★ "ร้าน A" ยาว 6 ตัวอักษร ส่วน "ข้าวมันไก่ประตูน้ำ สาขาสีลม"
 *          ยาว 27 ตัว — อันหลังเท่านั้นที่บอกได้ว่าการ์ดรับไหวหรือเปล่า
 *     ★ ยอดเงินก็เหมือนกัน: 100 บาทถ้วนทุกรายการไม่เคยทำให้เห็นปัญหา
 *       การปัดเศษของการหารสามคน
 *
 * ★★ เขียนผ่าน service role ตรง ๆ ไม่ผ่าน RPC
 *    ★ RPC หลายตัวส่งแจ้งเตือนและเขียน audit_log ตามมาด้วย ซึ่งถูกต้อง
 *      สำหรับการใช้งานจริง ★★ แต่สำหรับ seed จะได้แจ้งเตือน 200 รายการ
 *      ที่ไม่มีใครอ่าน และกระดิ่งขึ้นเลข 200 ตั้งแต่เปิดหน้าแรก
 *    ★ แจ้งเตือนจึงใส่เองเฉพาะที่สมเหตุสมผล (ดูส่วนท้ายไฟล์)
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline/promises'

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

/*
 * ★★★ กันยิงผิดโปรเจกต์ — ชุดเดียวกับ reset-office-data.mjs
 *     โปรเจกต์เก่าเป็นของอีกแอปที่ห้ามแตะเด็ดขาด
 */
const FORBIDDEN = 'vackilhpblpkfzonlodl'
if (URL_.includes(FORBIDDEN)) {
  console.error(`✗ หยุด — URL ชี้ไปโปรเจกต์เก่า (${FORBIDDEN}) ซึ่งเป็นของอีกแอป ห้ามแตะ`)
  process.exit(1)
}

const APPLY = process.argv.includes('--yes')
const CLEAN_TESTS = process.argv.includes('--clean-tests')
const UNDO = process.argv.includes('--undo')
const db = createClient(URL_, KEY, { auth: { persistSession: false } })

const FAKE_DOMAIN = 'frameroom.invalid'
const COMPANY = 'บริษัท เอดับเบิ้ลยูเอ จำกัด (AWA Company Limited)'

/* ── เวลา: ทุกอย่างย้อนหลังจากตอนนี้ ─────────────────────────────
 *
 * ★★ ข้อมูลที่มี created_at เป็นวินาทีเดียวกันหมด ดูออกทันทีว่าเป็นของปลอม
 *    ★ และทำให้หน้าที่เรียงตามเวลาแสดงผลผิดธรรมชาติ — ทุกอย่างเป็น
 *      "เมื่อสักครู่" พร้อมกัน แล้วป้ายเวลาก็ไม่ได้ทดสอบอะไรเลย
 */
const now = Date.now()
const ago = (days, hours = 0, mins = 0) =>
  new Date(now - ((days * 24 + hours) * 60 + mins) * 60_000).toISOString()
const dateAgo = (days) => new Date(now - days * 86_400_000).toISOString().slice(0, 10)

/** สุ่มแบบคงที่ — ผลลัพธ์เหมือนเดิมทุกครั้งที่รัน ทำให้เทียบภาพหน้าจอได้ */
let seed = 20261002
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
const pick = (arr) => arr[Math.floor(rnd() * arr.length)]
const chance = (p) => rnd() < p

const log = (...a) => console.log(...a)
const step = (t) => log(`\n\x1b[1m${t}\x1b[0m`)

/*
 * ★★★ จดไอดีทุกแถวที่สร้าง ลงไฟล์ข้าง ๆ สคริปต์
 *
 *     ★ ฐานข้อมูลนี้มีข้อมูลจริงของเจ้าของปนอยู่แล้ว (บิล · ประกาศ · ห้องแชท)
 *       ★★ การถอน seed ด้วยการ "ลบทั้งตาราง" จะลบของเขาไปด้วย
 *          ★ และการเดาจากชื่อก็ไม่ปลอดภัย — ถ้าเขาบังเอิญตั้งชื่อร้านซ้ำ
 *     ★ ไอดีที่จดไว้คือหลักฐานเป๊ะว่าแถวไหนมาจากสคริปต์นี้
 *
 * ★ ไฟล์นี้ไม่ควรเข้า git — มันเป็นของเฉพาะฐานข้อมูลเครื่องที่รัน
 */
const LEDGER = new URL('./.seed-demo-ids.json', import.meta.url)
const made = []

async function ins(table, rows, opts = {}) {
  if (!rows.length) return []
  if (!APPLY) {
    log(`  (ซ้อม) ${table} ← ${rows.length} แถว`)
    return rows
  }
  const { data, error } = await db.from(table).insert(rows).select(opts.select ?? 'id')
  if (error) {
    console.error(`  ✗ ${table}:`, error.message)
    throw error
  }
  if (!opts.select) made.push({ table, ids: data.map((d) => d.id) })
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
  log(`\n  จดไอดีไว้ที่ scripts/.seed-demo-ids.json แล้ว (ถอนคืนด้วย --undo)`)
}

/**
 * ถอน seed ออก — ลบเฉพาะแถวที่สคริปต์นี้สร้าง
 *
 * ★ ลบจากใหม่ไปเก่า เพื่อให้ลูกถูกลบก่อนแม่ (แม้จะมี cascade อยู่แล้ว
 *   ตัวเลขที่รายงานจะได้ไม่โกหก)
 */
async function undo() {
  step('ถอน seed ออก')
  let ledger = []
  try {
    ledger = JSON.parse(readFileSync(LEDGER, 'utf8'))
  } catch {
    log('  ไม่เจอไฟล์ไอดี — ไม่มีอะไรให้ถอน')
    return
  }
  for (const entry of [...ledger].reverse()) {
    if (!APPLY) {
      log(`  (ซ้อม) ${entry.table} → ลบ ${entry.ids.length} แถว`)
      continue
    }
    const { error } = await db.from(entry.table).delete().in('id', entry.ids)
    if (error) console.error(`  ✗ ${entry.table}:`, error.message)
    else log(`  ${entry.table} → ลบ ${entry.ids.length} แถว`)
  }
  if (APPLY) writeFileSync(LEDGER, '[]')
}

/* ═══════════════════════════════════════════════════════════════════
 * 0 · เพื่อนร่วมงาน
 * ═══════════════════════════════════════════════════════════════════
 *
 * ★★ ชื่อเล่นไทยล้วน ความยาวต่างกันตั้งแต่ 2 ถึง 9 ตัวอักษร
 *    ★ ชื่อสั้นหมดทุกคนจะไม่มีวันเจอปัญหาชื่อล้นในรายการแคบ ๆ
 *      ★★ และชื่อยาวหมดก็ไม่สมจริงพอ ๆ กัน — ออฟฟิศจริงมีทั้งสองแบบ
 */
const PEOPLE = [
  { u: 'pim.s',      nick: 'พิม',        dept: 'ฝ่ายออกแบบ',                        pos: 'UI/UX Designer',     ph: '0812345671' },
  { u: 'ton.k',      nick: 'ต้น',        dept: 'ฝ่ายพัฒนาระบบ',                      pos: 'Backend Developer',  ph: '0812345672' },
  { u: 'ying.w',     nick: 'หญิง',       dept: 'ฝ่ายบัญชีและการเงิน',                  pos: 'นักบัญชี',            ph: '0812345673' },
  { u: 'beer.p',     nick: 'เบียร์',      dept: 'ฝ่ายพัฒนาระบบ',                      pos: 'Frontend Developer', ph: '0812345674' },
  { u: 'nut.c',      nick: 'นัท',        dept: 'ฝ่ายบริหารโครงการ',                   pos: 'Project Manager',    ph: '0812345675' },
  { u: 'fah.t',      nick: 'ฟ้า',        dept: 'ฝ่ายบุคคล',                          pos: 'HR Officer',         ph: '0812345676' },
  { u: 'golf.r',     nick: 'กอล์ฟ',      dept: 'ฝ่ายโครงสร้างพื้นฐานและระบบเครือข่าย',   pos: 'DevOps Engineer',    ph: '0812345677' },
  { u: 'mint.a',     nick: 'มิ้นท์',      dept: 'ฝ่ายทดสอบระบบ',                      pos: 'QA Engineer',        ph: '0812345678' },
  { u: 'bank.s',     nick: 'แบงค์',      dept: 'ฝ่ายขายและการตลาด',                   pos: 'Sales Executive',    ph: '0812345679' },
  { u: 'ploy.n',     nick: 'พลอย',      dept: 'ฝ่ายวิเคราะห์ระบบ',                    pos: 'Business Analyst',   ph: '0812345680' },
  { u: 'oat.j',      nick: 'โอ๊ต',       dept: 'ฝ่ายสนับสนุนและบริการลูกค้า',           pos: 'Support Specialist', ph: '0812345681' },
  { u: 'nan.v',      nick: 'แนน',       dept: 'ฝ่ายพัฒนาระบบ',                      pos: 'Mobile Developer',   ph: '0812345682' },
]

/** ชื่อผู้ใช้ที่สคริปต์ทดสอบของผมสร้างไว้ — ลบได้ปลอดภัยเพราะเป็นของผมเอง */
const TEST_PREFIX = /^(drv[ab]|who[ab]|grp[ab]|rb[ab]|nm|i18n)/

async function cleanTestAccounts() {
  step('0 · เก็บกวาดบัญชีทดสอบที่สคริปต์สร้างไว้')
  const { data: all } = await db.from('profiles').select('id, username')
  const junk = (all ?? []).filter((p) => p.username && TEST_PREFIX.test(p.username))
  log(`  เจอ ${junk.length} บัญชี`)
  if (!APPLY || !junk.length) return
  for (const p of junk) {
    const { error } = await db.auth.admin.deleteUser(p.id)
    if (error) console.error(`  ✗ ลบ ${p.username}:`, error.message)
  }
  log(`  ลบแล้ว ${junk.length} บัญชี`)
}

async function ensurePeople() {
  step('1 · เพื่อนร่วมงาน')
  const { data: existing } = await db.from('profiles').select('id, username, nickname')
  const byUser = new Map((existing ?? []).map((p) => [p.username, p]))
  const out = []

  for (const p of PEOPLE) {
    const found = byUser.get(p.u)
    if (found) {
      out.push({ ...p, id: found.id })
      continue
    }
    if (!APPLY) {
      log(`  (ซ้อม) สร้าง ${p.u} — ${p.nick}`)
      out.push({ ...p, id: null })
      continue
    }
    const { data: created, error } = await db.auth.admin.createUser({
      email: `${p.u}@${FAKE_DOMAIN}`,
      password: 'AwaDemo2026!',
      email_confirm: true,
    })
    if (error || !created?.user?.id) {
      console.error(`  ✗ ${p.u}:`, error?.message)
      continue
    }
    const id = created.user.id
    await db.from('profiles').update({ username: p.u }).eq('id', id)
    const { error: rpcErr } = await db.rpc('register_open', {
      p_actor: id,
      p_nickname: p.nick,
      p_phone: p.ph,
      p_company: COMPANY,
      p_dept: p.dept,
      p_position: p.pos,
      p_purpose: null,
    })
    if (rpcErr) console.error(`  ✗ โปรไฟล์ ${p.u}:`, rpcErr.message)
    out.push({ ...p, id })
    log(`  + ${p.nick} (${p.u}) · ${p.pos}`)
  }

  /* ★ คนเดิมที่มีอยู่แล้วก็นับเป็นพนักงานด้วย — ข้อมูลต้องพาดพิงถึงพวกเขา
       ★★ ไม่งั้นเจ้าของระบบเปิดดูแล้วไม่เห็นชื่อตัวเองอยู่ในอะไรเลย */
  const keepers = (existing ?? []).filter(
    (p) => p.username && !TEST_PREFIX.test(p.username) && !PEOPLE.some((x) => x.u === p.username),
  )
  for (const k of keepers) out.push({ u: k.username, nick: k.nickname, id: k.id, existing: true })

  log(`  รวมพนักงานทั้งหมด ${out.length} คน`)
  return out.filter((p) => p.id)
}

/* ═══════════════════════════════════════════════════════════════════
 * 2 · กินอะไรดี
 * ═══════════════════════════════════════════════════════════════════ */
const RESTAURANTS = [
  ['ข้าวมันไก่ประตูน้ำ สาขาสีลม', 'ข้าวมันไก่ต้ม + น้ำจิ้มเต้าเจี้ยว', 'ไทย', '฿', 'WALK', 'เดินจากตึก 5 นาที แถวเที่ยงคนเยอะมาก ไปก่อน 11:40 ดี'],
  ['ส้มตำนัวนัว', 'ตำปูปลาร้า + คอหมูย่าง', 'อีสาน', '฿', 'WALK', 'เผ็ดจริง สั่งเผ็ดน้อยก็ยังเผ็ด'],
  ['ก๋วยเตี๋ยวเรือพี่ใหญ่', 'เรือน้ำตก ชามใหญ่', 'ไทย', '฿', 'WALK', 'ชามละ 45 สั่ง 2 ชามกำลังอิ่ม'],
  ['Sushi Hiro', 'ชุดซาชิมิรวม 9 ชิ้น', 'ญี่ปุ่น', '฿฿฿', 'DRIVE', 'ไว้วันเงินเดือนออก จองโต๊ะล่วงหน้า'],
  ['ครัวป้าแดง', 'กะเพราหมูกรอบไข่ดาว', 'ตามสั่ง', '฿', 'WALK', 'ป้าใจดี สั่งพิเศษไม่คิดเพิ่ม'],
  ['Pizza Forno', 'มาร์เกอริต้าเตาถ่าน', 'อิตาเลียน', '฿฿', 'DELIVERY', 'สั่งรวมกันเกิน 500 ส่งฟรี'],
  ['หมูกระทะเฮียชัย', 'ชุดหมูกระทะ 199 ไม่อั้น', 'ปิ้งย่าง', '฿฿', 'DRIVE', 'ไว้เลี้ยงปิดโปรเจกต์ จองล่วงหน้า 1 วัน'],
  ['ข้าวแกงใต้ร้านเจ๊นิด', 'แกงไตปลา + ผัดสะตอกุ้ง', 'ใต้', '฿', 'WALK', 'ใต้ตึกจอดรถ เปิดถึงบ่ายสองเท่านั้น'],
  ['Pho Saigon', 'เฝอเนื้อตุ๋น', 'เวียดนาม', '฿฿', 'DRIVE', 'น้ำซุปดีมาก วันฝนตกเหมาะสุด'],
  ['บะหมี่เกี๊ยวกุ้งเจ๊หมวย', 'บะหมี่แห้งเกี๊ยวกุ้ง', 'จีน', '฿', 'WALK', 'หมดเร็ว บ่ายโมงไปก็ไม่เหลือแล้ว'],
  ['Salad Factory', 'สลัดอกไก่ย่างน้ำใส', 'สุขภาพ', '฿฿', 'DELIVERY', 'ไว้วันที่รู้สึกผิดกับตัวเอง'],
  ['ข้าวหมูแดงนายหมง', 'ข้าวหมูแดงหมูกรอบรวม', 'จีน', '฿', 'WALK', 'ราดน้ำเยอะ ๆ อร่อย'],
  ['ชาบูบุฟเฟต์ Mo-Mo', 'ชาบูหม้อไฟ 2 รส', 'ชาบู', '฿฿', 'DRIVE', 'คนเยอะวันศุกร์ จองก่อน'],
  ['ร้านลุงหนวดข้าวผัดอเมริกัน', 'ข้าวผัดอเมริกันไข่ดาว 2 ฟอง', 'ฝรั่ง', '฿', 'WALK', 'เด็กฝึกงานชอบมาก'],
  ['Kope Lab', 'ลาเต้คั่วกลาง + ครัวซองต์', 'กาแฟ', '฿฿', 'WALK', 'ที่นั่งน้อย ซื้อกลับดีกว่า'],
]

async function seedFood(people) {
  step('2 · กินอะไรดี')
  const rows = RESTAURANTS.map(([name, dish, cuisine, price, dist, note], i) => ({
    name,
    signature_dish: dish,
    cuisine,
    price_range: price,
    distance: dist,
    note,
    added_by: pick(people).id,
    /* ★ ร้านเก่ากว่าได้เวลาสร้างย้อนหลังมากกว่า — รายการจึงไม่ได้เรียงสุ่ม */
    created_at: ago(70 - i * 4, Math.floor(rnd() * 9)),
    /* ★ ร้านหนึ่งถูกแจ้งว่าอาจปิด — หน้าจอต้องมีเคสนี้ให้ดูด้วย */
    maybe_closed: name === 'ร้านลุงหนวดข้าวผัดอเมริกัน',
  }))
  const made = await ins('restaurants', rows)
  if (!APPLY) return []

  /*
   * ★★ โหวตไม่เท่ากัน — ร้านดังได้เกือบทุกคน ร้านรองได้ไม่กี่คน
   *    ★ ถ้าทุกร้านได้โหวตเท่ากัน วงล้อถ่วงน้ำหนักจะดูเหมือนไม่ทำงาน
   *      ★★ และหน้า "ร้านโปรดของออฟฟิศ" จะเรียงมั่วไปหมด
   */
  const votes = []
  const visits = []
  made.forEach((r, i) => {
    const popularity = [0.85, 0.7, 0.75, 0.3, 0.8, 0.45, 0.5, 0.6, 0.35, 0.65, 0.2, 0.55, 0.4, 0.25, 0.6][i] ?? 0.4
    for (const p of people) {
      if (chance(popularity)) votes.push({ restaurant_id: r.id, user_id: p.id, created_at: ago(Math.floor(rnd() * 60)) })
    }
    /* ★ ประวัติการกิน — ร้านใกล้ถูกกินบ่อยกว่าร้านไกลตามธรรมชาติ */
    const times = Math.floor(popularity * 9)
    for (let k = 0; k < times; k++) {
      visits.push({
        restaurant_id: r.id,
        user_id: pick(people).id,
        visited_at: ago(Math.floor(rnd() * 55), Math.floor(rnd() * 5) + 11),
      })
    }
  })
  await ins('restaurant_votes', votes, { select: 'restaurant_id' })
  await ins('restaurant_visits', visits)
  return made
}

/* ═══════════════════════════════════════════════════════════════════
 * 3 · กระเป๋าเงิน
 * ═══════════════════════════════════════════════════════════════════ */
const BILLS = [
  ['ค่าข้าวเที่ยงทีม Dev', 1_240.0, 'FOOD', 3],
  ['กาแฟเช้าทั้งทีม', 465.0, 'COFFEE', 1],
  ['หมูกระทะปิดสปรินต์ 14', 2_985.0, 'FOOD', 8],
  ['ค่าเค้กวันเกิดพี่หญิง', 890.0, 'OTHER', 12],
  ['ข้าวเที่ยงวันประชุมลูกค้า', 1_560.0, 'FOOD', 15],
  ['ชานมไข่มุกบ่ายสาม', 520.0, 'COFFEE', 2],
  ['ค่าส่วนกลางซื้อกระดาษทิชชู่', 348.0, 'OTHER', 21],
  ['พิซซ่าคืนวันดีพลอย', 1_180.0, 'FOOD', 6],
  ['ชาบูทีม QA', 2_150.0, 'FOOD', 26],
  ['ค่าน้ำดื่มตู้กดเดือนนี้', 600.0, 'OTHER', 30],
  ['ข้าวมันไก่เที่ยงวันจันทร์', 735.0, 'FOOD', 0],
  ['กาแฟหลังประชุมยาว', 390.0, 'COFFEE', 0],
  ['ส้มตำไก่ย่างเย็นวันศุกร์', 1_420.0, 'FOOD', 1],
  ['ค่าขนมเบรกงานอบรม', 980.0, 'OTHER', 1],
  ['บะหมี่เกี๊ยวกุ้งเที่ยงนี้', 540.0, 'FOOD', 1],
  ['ชาเขียวมัทฉะบ่ายวันพุธ', 445.0, 'COFFEE', 2],
  ['พิซซ่าฉลองปิดงบไตรมาส', 2_460.0, 'FOOD', 17],
  ['ค่าถ่านรีโมทแอร์ห้องประชุม', 180.0, 'OTHER', 24],
  ['ข้าวแกงใต้เที่ยงวันอังคาร', 690.0, 'FOOD', 13],
  ['เฝอเวียดนามวันฝนตก', 1_150.0, 'FOOD', 19],
]

/*
 * ★★★ ครึ่งหนึ่งของบิลต้องอยู่ใน "เดือนปัจจุบัน"
 *
 *     ★ หน้าสรุปค่าข้าวเปิดมาที่เดือนนี้เป็นค่าเริ่มต้น ★★ ถ้าบิลทั้งหมด
 *       กระจายย้อนหลัง 30 วัน แล้ววันนี้เป็นวันที่ 2 ของเดือน
 *       หน้าสรุปจะว่างเปล่าสนิททั้งที่ฐานข้อมูลมีบิล 20 ใบ
 *     ★ วัดจากหน้าจอจริงแล้วเจอแบบนั้นเป๊ะ — "Nothing in this period yet"
 *       ★★ ซึ่งอ่านได้ว่าฟีเจอร์พัง ทั้งที่มันทำงานถูกต้องทุกบรรทัด
 *     ★ ออฟฟิศจริงก็กินข้าวทุกวันอยู่แล้ว การกองอยู่ในไม่กี่วันล่าสุด
 *       จึงสมจริงกว่าการกระจายเท่า ๆ กันตลอดเดือนด้วยซ้ำ
 */

async function seedWallet(people) {
  step('3 · กระเป๋าเงิน')
  const bills = []
  const plan = []

  /*
   * ★★★ คนออกเงินหมุนเวียนทุกคน ไม่ได้สุ่ม
   *
   *     ★ เดิมใช้ pick() สุ่มคนออกเงิน ★★ ผลที่วัดได้จากฐานข้อมูลจริง:
   *       6 คนจาก 20 ไม่เคยเป็นเจ้าหนี้เลย และ 1 คนไม่มีรายการใด ๆ ทั้งสองฝั่ง
   *       ★ หน้า "คนอื่นติดฉัน" ของคนเหล่านั้นจึงว่างเปล่าตลอด
   *     ★★ ออฟฟิศจริงผลัดกันจ่าย — การหมุนเวียนคือรูปร่างที่ถูกต้อง
   *        ไม่ใช่การสุ่มซึ่งให้คนโชคดีจ่ายศูนย์ครั้ง
   */
  const seen = new Map(people.map((p) => [p.id, 0]))

  for (const [i, [title, total, category, daysAgo]] of BILLS.entries()) {
    const payer = people[i % people.length]
    /*
     * ★★ จำนวนคนหารต่างกันทุกบิล — 4 ถึง 9 คน
     *    ★ เดิมใช้ 2-7 แล้วพบตอนเปิดหน้าจริงว่า หนี้ 49 รายการกระจายไป
     *      20 คน เหลือคนละ 2 รายการ ★★ หน้า "ติดเงิน" จึงมีแถวเดียว
     *      ซึ่งไม่ใช่ภาพของออฟฟิศที่กินข้าวด้วยกันทุกวัน
     *    ★ บิลที่หารเท่ากันหมดทุกใบ จะไม่เคยเจอเศษสตางค์ที่หารไม่ลงตัว
     */
    const n = 4 + Math.floor(rnd() * 6)
    /*
     * ★ เลือกคนที่ "ยังอยู่ในบิลน้อยที่สุด" ก่อน แล้วค่อยสุ่มในกลุ่มนั้น
     *   ★★ สุ่มล้วนทำให้บางคนโดนทุกบิลและบางคนไม่โดนเลย ซึ่งเป็นผลของ
     *      การสุ่มที่ถูกต้องทางคณิตศาสตร์ แต่ผิดในฐานะภาพของออฟฟิศ
     */
    const pool = people
      .filter((p) => p.id !== payer.id)
      .sort((a, b) => (seen.get(a.id) ?? 0) - (seen.get(b.id) ?? 0) || rnd() - 0.5)
    const members = pool.slice(0, Math.min(n, pool.length))
    for (const m of members) seen.set(m.id, (seen.get(m.id) ?? 0) + 1)
    const share = Math.round((total / (members.length + 1)) * 100) / 100
    bills.push({
      title,
      total_amount: total,
      category,
      bill_date: dateAgo(daysAgo),
      payer_id: payer.id,
      split_mode: 'EQUAL',
      created_at: ago(daysAgo, 5),
    })
    plan.push({ payer, members, share, daysAgo, title })
  }

  const made = await ins('expense_bills', bills)
  if (!APPLY) return

  /*
   * ★★★ สถานะต้องปนกัน ไม่ใช่ PENDING ทั้งหมด
   *
   *     ★ บิลเก่ากว่าควรจบไปแล้วเป็นส่วนใหญ่ ส่วนบิลใหม่ยังค้างอยู่
   *       ★★ นี่คือรูปร่างของข้อมูลจริง — ถ้าทุกอันค้าง หน้า "ติดเงิน"
   *          จะมี 60 แถวซึ่งไม่เคยเกิดขึ้นจริง และหน้า "จบแล้ว" จะว่าง
   *     ★ และต้องมี PAID_PENDING ด้วย ไม่งั้นปุ่ม "ยืนยันการโอน" ไม่มีอะไรให้กด
   */
  const debts = []
  made.forEach((bill, i) => {
    const { payer, members, share, daysAgo, title } = plan[i]
    for (const m of members) {
      const old = daysAgo > 10
      const status = old
        ? chance(0.85) ? 'SETTLED' : chance(0.5) ? 'PAID_PENDING' : 'PENDING'
        : chance(0.35) ? 'SETTLED' : chance(0.3) ? 'PAID_PENDING' : 'PENDING'
      const paidAt = status === 'PENDING' ? null : ago(Math.max(0, daysAgo - 2), 3)
      debts.push({
        bill_id: bill.id,
        creditor_id: payer.id,
        debtor_id: m.id,
        amount: share,
        description: title,
        status,
        paid_at: paidAt,
        confirmed_at: status === 'SETTLED' ? ago(Math.max(0, daysAgo - 1), 2) : null,
        /* ★ บิลที่ค้างนานถูกทวงไปแล้ว — ป้าย "ทวงล่าสุด" จะได้มีของจริงให้แสดง */
        last_reminded_at: status === 'PENDING' && daysAgo > 14 ? ago(3) : null,
        /*
         * ★★★ auto_reminded เป็น integer[] ไม่ใช่จำนวนครั้ง
         *
         *     ★ มันเก็บ "รอบที่ส่งไปแล้ว" (วันที่ 3, 7, 14 …) เพื่อไม่ให้ cron
         *       ส่งซ้ำรอบเดิม ★★ ส่งเลขเดี่ยวไปจะได้ "expected JSON array"
         *       ซึ่งไม่บอกด้วยซ้ำว่าคอลัมน์ไหนผิด
         */
        auto_reminded: status === 'PENDING' && daysAgo > 14 ? [3] : [],
        created_at: ago(daysAgo, 5),
      })
    }
  })

  /* ★ รายการเดี่ยวที่ไม่ได้มาจากบิลหาร — ระบบรองรับ ต้องมีตัวอย่างให้เห็น */
  const solo = [
    ['ออกค่าแท็กซี่ไปหาลูกค้าให้', 285.0, 4, 'PENDING'],
    ['ยืมเงินค่าข้าวตอนลืมกระเป๋าตังค์', 120.0, 9, 'SETTLED'],
    ['ค่าตั๋วหนังที่ซื้อเผื่อไว้', 320.0, 2, 'PAID_PENDING'],
    ['ออกค่าของขวัญปีใหม่ให้ก่อน', 500.0, 18, 'PENDING'],
  ]
  for (const [desc, amount, daysAgo, status] of solo) {
    const a = pick(people)
    const b = pick(people.filter((p) => p.id !== a.id))
    debts.push({
      bill_id: null,
      creditor_id: a.id,
      debtor_id: b.id,
      amount,
      description: desc,
      status,
      paid_at: status === 'PENDING' ? null : ago(daysAgo - 1),
      confirmed_at: status === 'SETTLED' ? ago(daysAgo - 1) : null,
      /*
       * ★★★ ต้องใส่คีย์นี้ด้วย แม้จะเป็นค่าว่าง
       *
       *     ★ PostgREST ประกอบ INSERT เดียวจาก "ยูเนียนของคีย์ทุกแถว"
       *       ★★ แถวไหนไม่มีคีย์ จะได้ NULL ไม่ใช่ค่า default ของคอลัมน์
       *          ★ แล้ว auto_reminded เป็น not null → ล้มทั้งก้อน
       *     ★★ อาการชี้ไปผิดที่มาก: error บอกชื่อคอลัมน์ที่ "แถวอื่น" ใส่มาถูก
       *        อยู่แล้ว ทำให้หาสาเหตุที่แถวกลุ่มนี้ไม่เจอ
       */
      auto_reminded: [],
      created_at: ago(daysAgo, 2),
    })
  }
  await ins('debts', debts)
}

/* ═══════════════════════════════════════════════════════════════════
 * 4 · สุ่มและเกม
 * ═══════════════════════════════════════════════════════════════════ */
async function seedFun(people) {
  step('4 · สุ่มและเกม')
  const nameOf = (p) => ({ id: p.id, label: p.nick })

  await ins('name_sets', [
    {
      owner_id: people[0].id,
      name: 'ทีม Dev ทั้งหมด',
      members: people.filter((p) => p.dept === 'ฝ่ายพัฒนาระบบ').map(nameOf),
      created_at: ago(40),
    },
    {
      owner_id: people[0].id,
      name: 'คนที่ไปเลี้ยงปิดสปรินต์',
      members: people.slice(0, 8).map(nameOf),
      created_at: ago(12),
    },
    {
      owner_id: people[1].id,
      name: 'เวรล้างแก้วกาแฟ',
      members: people.slice(2, 9).map(nameOf),
      created_at: ago(25),
    },
    {
      /* ★ ชุดที่มีชื่อพิมพ์เองปนกับคนในระบบ — รองรับได้ ต้องมีตัวอย่าง */
      owner_id: people[2].id,
      name: 'จับสลากของขวัญปีใหม่',
      members: [...people.slice(0, 6).map(nameOf), { label: 'พี่ยาม' }, { label: 'พี่แม่บ้าน' }],
      created_at: ago(55),
    },
  ])

  /* ★ เลขหวยของหลายคน หลายงวด — หน้าประวัติจะได้ไม่ว่าง */
  const picks = []
  for (const p of people.slice(0, 9)) {
    const times = 1 + Math.floor(rnd() * 3)
    for (let i = 0; i < times; i++) {
      const digits = pick([2, 3, 6])
      picks.push({
        user_id: p.id,
        number: String(Math.floor(rnd() * 10 ** digits)).padStart(digits, '0'),
        draw_date: dateAgo(-(16 - i * 15)),
        created_at: ago(i * 15 + Math.floor(rnd() * 5)),
      })
    }
  }
  await ins('lottery_picks', picks)

  /* ── ทัวร์นาเมนต์ที่แข่งจบแล้ว ───────────────────────────────── */
  const [tour] = await ins('tournaments', [
    { owner_id: people[4].id, name: 'ศึกชิงเจ้าโต๊ะปิงปองออฟฟิศ', status: 'DONE', created_at: ago(20) },
  ])
  if (APPLY && tour) {
    const teamRows = [
      ['ทีมกะเพราเผ็ดมาก', '#ef4444', [0, 1]],
      ['ทีมชาเย็นหวานน้อย', '#3b82f6', [2, 3]],
      ['ทีมเบิร์นเอาต์', '#f59e0b', [4, 5]],
      ['ทีมดีบักไม่ออก', '#10b981', [6, 7]],
    ].map(([name, color, idx], i) => ({
      tournament_id: tour.id,
      name,
      color,
      members: idx.map((k) => nameOf(people[k])),
      seed: i + 1,
      created_at: ago(20),
    }))
    const teams = await ins('tournament_teams', teamRows)
    await ins('tournament_matches', [
      { tournament_id: tour.id, round: 1, slot: 1, team_a: teams[0].id, team_b: teams[1].id, winner: teams[0].id, score_a: 3, score_b: 1, played_at: ago(19), created_at: ago(20) },
      { tournament_id: tour.id, round: 1, slot: 2, team_a: teams[2].id, team_b: teams[3].id, winner: teams[3].id, score_a: 2, score_b: 3, played_at: ago(19), created_at: ago(20) },
      { tournament_id: tour.id, round: 2, slot: 1, team_a: teams[0].id, team_b: teams[3].id, winner: teams[3].id, score_a: 1, score_b: 3, played_at: ago(18), created_at: ago(20) },
    ])
  }

  /* ── ห้องสุ่มที่หมุนไปแล้ว + ห้องที่ยังเปิดรออยู่ ───────────────── */
  const rooms = await ins('draw_rooms', [
    {
      host_id: people[5].id,
      title: 'ใครเป็นคนไปซื้อกาแฟให้ทีมวันนี้',
      options: ['พิม', 'ต้น', 'หญิง', 'เบียร์', 'นัท'].map((l) => ({ label: l })),
      status: 'DONE',
      winner_label: 'เบียร์',
      spun_at: ago(1, 3),
      created_at: ago(1, 4),
    },
    {
      host_id: people[3].id,
      title: 'เที่ยงนี้กินอะไรดี',
      options: ['ข้าวมันไก่', 'ส้มตำ', 'ก๋วยเตี๋ยวเรือ', 'ชาบู', 'ข้าวแกงใต้'].map((l) => ({ label: l })),
      status: 'OPEN',
      created_at: ago(0, 1),
    },
  ])
  if (APPLY && rooms.length) {
    const members = []
    for (const [i, r] of rooms.entries()) {
      for (const p of people.slice(0, i === 0 ? 6 : 4)) {
        members.push({ room_id: r.id, user_id: p.id, joined_at: ago(i === 0 ? 1 : 0, 4) })
      }
    }
    await ins('draw_room_members', members, { select: 'room_id' })
  }
}

/* ═══════════════════════════════════════════════════════════════════
 * 5 · ตลาดนัด
 * ═══════════════════════════════════════════════════════════════════ */
const LISTINGS = [
  ['คีย์บอร์ด Keychron K2 สวิตช์น้ำตาล', 2_200, 'SELL', 'ELECTRONICS', 'GOOD', 'ใช้มา 8 เดือน ปุ่มครบ ไฟ RGB ปกติ แถมคีย์แคปชุดเดิมให้ด้วย ขายเพราะเปลี่ยนไปใช้ตัว 65%', 'อาคาร A', '8', 'โต๊ะ 12', 'AVAILABLE', 5],
  ['จอ Dell 24 นิ้ว FHD', 2_800, 'SELL', 'ELECTRONICS', 'GOOD', 'ไม่มี dead pixel มีขาตั้งปรับสูงต่ำได้ สาย HDMI ให้ด้วย', 'อาคาร A', '8', 'โต๊ะ 3', 'RESERVED', 9],
  ['เก้าอี้ Ergotrip รุ่นมีที่รองคอ', 3_500, 'SELL', 'FURNITURE', 'GOOD', 'ซื้อมาปีกว่า เบาะยังแน่น ล้อเปลี่ยนใหม่แล้ว ย้ายบ้านเลยต้องปล่อย', 'อาคาร B', '3', 'โต๊ะ 7', 'AVAILABLE', 2],
  ['ต้นมอนสเตอร่า กระถาง 6 นิ้ว', 150, 'SELL', 'PLANT', 'NEW', 'แยกหน่อจากต้นแม่ที่บ้าน ใบสวย 4 ใบ เลี้ยงง่ายมาก รดน้ำอาทิตย์ละครั้งพอ', 'อาคาร A', '8', 'ริมหน้าต่าง', 'AVAILABLE', 1],
  ['หนังสือ Clean Architecture (ภาษาอังกฤษ)', 0, 'FREE', 'BOOKS', 'GOOD', 'อ่านจบแล้ว ส่งต่อให้คนที่อยากอ่าน มาหยิบที่โต๊ะได้เลย', 'อาคาร A', '8', 'โต๊ะ 12', 'AVAILABLE', 3],
  ['เสื้อยืดงาน Tech Conf ไซส์ L', 0, 'FREE', 'CLOTHES', 'NEW', 'ได้มาจากงาน ใส่ไม่ได้ ไซส์ใหญ่ไป ยังไม่แกะ', 'อาคาร B', '3', 'โต๊ะ 9', 'SOLD', 14],
  ['แลกลูกแบดมินตันกับลูกเทนนิส', 0, 'TRADE', 'SPORTS', 'NEW', 'มีลูกแบด Yonex 1 หลอดยังไม่เปิด อยากแลกลูกเทนนิส ใครสนใจทักได้', 'อาคาร A', '2', 'โรงยิม', 'AVAILABLE', 4],
  ['ตามหา: จอเสริมพกพา 15 นิ้ว', 0, 'WANTED', 'ELECTRONICS', 'GOOD', 'ใครมีจอพกพาไม่ได้ใช้ รับซื้อไม่เกิน 3,000 ขอแบบ USB-C เส้นเดียวจบ', 'อาคาร A', '8', 'โต๊ะ 5', 'AVAILABLE', 6],
  ['กล่องข้าวสแตนเลส 3 ชั้น', 220, 'SELL', 'OTHER', 'NEW', 'ซื้อมาแล้วไม่ได้ใช้ ยังอยู่ในกล่อง เก็บความร้อนได้ 4 ชม.', 'อาคาร B', '3', 'โต๊ะ 2', 'AVAILABLE', 8],
  ['iPad Gen 9 64GB + ปากกา', 8_900, 'SELL', 'ELECTRONICS', 'GOOD', 'สภาพดีมาก มีรอยขนแมวด้านหลังนิดหน่อย แบตยัง 92% มีเคสกับฟิล์มให้', 'อาคาร A', '8', 'โต๊ะ 18', 'AVAILABLE', 0],
  ['โคมไฟตั้งโต๊ะ ปรับไฟได้ 3 ระดับ', 390, 'SELL', 'FURNITURE', 'GOOD', 'ใช้มา 1 ปี ไฟไม่กะพริบ สาย USB', 'อาคาร A', '8', 'โต๊ะ 21', 'AVAILABLE', 11],
  ['แจกเมล็ดกาแฟคั่วอ่อน 200g', 0, 'FREE', 'FOOD', 'NEW', 'คั่ววันที่ 20 สั่งมาเยอะไป กลิ่นผลไม้ชัด ใครชอบคั่วอ่อนมาเอาได้', 'อาคาร A', '8', 'ครัวชั้น 8', 'SOLD', 16],
]

async function seedMarket(people) {
  step('5 · ตลาดนัด')
  const rows = LISTINGS.map(([title, price, kind, category, condition, description, b, f, d, status, daysAgo]) => ({
    seller_id: pick(people).id,
    title,
    price,
    kind,
    category,
    condition,
    description,
    meet_building: b,
    meet_floor: f,
    meet_desk: d,
    status,
    created_at: ago(daysAgo, Math.floor(rnd() * 8)),
  }))
  const made = await ins('listings', rows)
  if (!APPLY) return

  /*
   * ★★ คิวจอง — ของชิ้นที่น่าสนใจมีคนต่อคิวหลายคน
   *    ★ คิวคนเดียวทุกชิ้น จะไม่เคยเห็นหน้าจอที่บอกว่า "คุณอยู่คิวที่ 3"
   */
  const res = []
  const threads = []
  made.forEach((l, i) => {
    const [title, , , , , , , , , status] = LISTINGS[i]
    const seller = rows[i].seller_id
    const buyers = people.filter((p) => p.id !== seller)
    const queueLen = status === 'RESERVED' ? 3 : status === 'SOLD' ? 2 : Math.floor(rnd() * 3)
    const taken = []
    for (let k = 0; k < queueLen; k++) {
      const b = pick(buyers.filter((x) => !taken.includes(x.id)))
      if (!b) break
      taken.push(b.id)
      res.push({
        listing_id: l.id,
        user_id: b.id,
        position: Date.now() * 1000 + i * 100 + k,
        status: status === 'SOLD' && k === 0 ? 'CHOSEN' : 'ACTIVE',
        created_at: ago(LISTINGS[i][10], 2 + k),
      })
    }
    /* ★ คนที่ทักถามราคาก่อนจอง — บทสนทนาจริงของตลาดนัดเป็นแบบนี้ */
    if (taken.length) threads.push({ listing_id: l.id, buyer_id: taken[0], title, daysAgo: LISTINGS[i][10] })
  })
  await ins('listing_reservations', res, { select: 'listing_id' })

  const madeThreads = await ins(
    'listing_threads',
    threads.map((t) => ({
      listing_id: t.listing_id,
      buyer_id: t.buyer_id,
      created_at: ago(t.daysAgo, 3),
      last_message_at: ago(t.daysAgo, 1),
    })),
  )
  if (!madeThreads.length) return

  const SAMPLE = [
    ['ของยังอยู่ไหมครับ', 'อยู่ครับ ยังไม่มีใครมาเอา'],
    ['ลดได้อีกนิดไหมคะ', 'ลดให้ได้ 100 นะครับ ต่ำกว่านี้ไม่ไหวจริง ๆ'],
    ['ขอดูรูปเพิ่มได้ไหมครับ', 'เดี๋ยวถ่ายให้ตอนเย็นนะครับ'],
    ['เย็นนี้ไปรับได้เลยไหมคะ', 'ได้เลยครับ อยู่ถึงหกโมง'],
    ['ใช้งานมานานยังครับ', 'ประมาณปีนึงครับ ยังดีอยู่'],
  ]
  const msgs = []
  madeThreads.forEach((t, i) => {
    const pair = SAMPLE[i % SAMPLE.length]
    const d = threads[i].daysAgo
    msgs.push({ thread_id: t.id, sender_id: threads[i].buyer_id, text: pair[0], created_at: ago(d, 3), read_at: ago(d, 2) })
    msgs.push({ thread_id: t.id, sender_id: rows[made.findIndex((m) => m.id === threads[i].listing_id)].seller_id, text: pair[1], created_at: ago(d, 1) })
  })
  await ins('listing_messages', msgs)

  /* ★ คำที่คนตั้งไว้ให้เตือนเมื่อมีประกาศตรง */
  await ins(
    'search_alerts',
    [
      { user_id: people[1].id, keyword: 'คีย์บอร์ด', created_at: ago(30) },
      { user_id: people[3].id, keyword: 'จอ', created_at: ago(22) },
      { user_id: people[6].id, keyword: 'ต้นไม้', created_at: ago(14) },
    ],
  )
}

/* ═══════════════════════════════════════════════════════════════════
 * 6 · แชท
 * ═══════════════════════════════════════════════════════════════════ */
const DM_SCRIPTS = [
  [
    ['พี่ครับ อันนี้ merge ได้เลยไหมครับ', 0],
    ['ขอดูก่อนนะ เดี๋ยวคอมเมนต์ใน PR ให้', 1],
    ['ได้ครับ ขอบคุณครับ', 1],
    ['โอเค เม้นต์ไปแล้ว 2 จุด แก้แล้ว merge ได้เลย', 0],
  ],
  [
    ['เที่ยงนี้ไปไหนดี', 0],
    ['ข้าวมันไก่ไหม นานละไม่ได้กิน', 1],
    ['เอาดิ เดี๋ยว 11:40 เจอกันหน้าลิฟต์', 0],
    ['โอเคครับ', 1],
  ],
  [
    ['ค่าหมูกระทะเมื่อวานโอนให้แล้วนะคะ', 0],
    ['ได้แล้วครับ ขอบคุณครับ', 1],
  ],
  [
    ['ขอไฟล์ design ล่าสุดหน่อยค่ะ', 0],
    ['เดี๋ยวแชร์ Figma ให้นะ ใช้ลิงก์เดิมได้เลย', 1],
    ['ได้แล้วค่ะ ขอบคุณมากกก', 0],
  ],
  [
    ['พรุ่งนี้ประชุมกี่โมงนะ', 0],
    ['10 โมงครับ ห้องประชุมใหญ่', 1],
    ['โอเค ขอบคุณ', 0],
  ],
]

const GROUPS = [
  {
    title: 'ทีม Dev · สปรินต์ 15',
    who: [0, 1, 3, 11, 4],
    msgs: [
      ['สปรินต์นี้มี 3 เรื่องใหญ่นะครับ เดี๋ยวแปะใน board ให้', 4, 2],
      ['รับทราบครับ', 1, 2],
      ['ขอ API spec ของเรื่องที่ 2 ก่อนได้ไหมครับ จะได้ทำ UI รอ', 3, 2],
      ['เดี๋ยวเย็นนี้ส่งให้ครับ', 1, 1],
      ['อันนี้ติด bug ที่หน้า login บน Safari นะ เดี๋ยวแจ้งใน issue', 11, 1],
      ['โอเค รับไปดูครับ', 1, 0],
      ['เดโมวันศุกร์ 14:00 นะครับทุกคน', 4, 0],
    ],
  },
  {
    title: 'ก๊วนกินข้าวเที่ยง',
    who: [0, 2, 5, 8, 10, 7],
    msgs: [
      ['วันนี้ใครไปบ้าง', 2, 1],
      ['ไปครับ', 8, 1],
      ['ไปค่ะ แต่ขอกลับก่อนบ่ายโมงนะ มีประชุม', 5, 1],
      ['งั้นไปร้านใกล้ ๆ ดีกว่า ก๋วยเตี๋ยวเรือไหม', 0, 1],
      ['เอาา', 10, 1],
      ['เจอกันหน้าลิฟต์ 11:45 นะ', 2, 0],
    ],
  },
  {
    title: 'ประกาศจากฝ่ายบุคคล',
    who: [5, 0, 1, 2, 3, 4, 6, 7, 8, 9],
    msgs: [
      ['แจ้งทุกคนนะคะ เดือนหน้ามีตรวจสุขภาพประจำปี วันที่ 12-13 ค่ะ', 5, 6],
      ['ลงชื่อได้ที่ลิงก์ในอีเมลที่ส่งไปนะคะ ปิดรับวันที่ 8', 5, 6],
      ['ลงแล้วครับ', 1, 5],
      ['ขอบคุณค่ะ', 5, 5],
      ['วันหยุดยาวเดือนหน้าประกาศแล้วนะคะ เช็กในปฏิทินบริษัทได้เลย', 5, 2],
    ],
  },
]

async function seedChat(people) {
  step('6 · แชท')
  const roomRows = []
  const plan = []

  /* ── แชทส่วนตัว ────────────────────────────────────────────── */
  const pairs = [[0, 1], [2, 4], [3, 5], [0, 6], [7, 8], [1, 11], [9, 10]]
  pairs.forEach(([a, b], i) => {
    const A = people[a]
    const B = people[b]
    if (!A || !B) return
    const script = DM_SCRIPTS[i % DM_SCRIPTS.length]
    const last = ago(i, 1)
    /* ★ pair_key ต้องเรียงแบบเดียวกับ RPC ไม่งั้นเปิดแชทซ้ำจะได้ห้องใหม่ */
    const key = [A.id, B.id].sort().join(':')
    roomRows.push({ kind: 'DM', created_by: A.id, pair_key: key, last_message_at: last, created_at: ago(i + 6) })
    plan.push({ kind: 'DM', members: [A, B], script, base: i })
  })

  /* ── ห้องกลุ่ม ─────────────────────────────────────────────── */
  for (const g of GROUPS) {
    const members = g.who.map((k) => people[k]).filter(Boolean)
    if (members.length < 2) continue
    roomRows.push({
      kind: 'GROUP',
      title: g.title,
      created_by: members[0].id,
      last_message_at: ago(g.msgs[g.msgs.length - 1][2], 1),
      created_at: ago(20),
    })
    plan.push({ kind: 'GROUP', members, group: g })
  }

  const rooms = await ins('office_chat_rooms', roomRows)
  if (!APPLY) return

  const members = []
  const msgs = []
  rooms.forEach((room, i) => {
    const p = plan[i]
    p.members.forEach((m, k) => {
      members.push({
        room_id: room.id,
        user_id: m.id,
        role: p.kind === 'GROUP' && k === 0 ? 'OWNER' : 'MEMBER',
        /*
         * ★★ เวลาอ่านล่าสุดไม่เท่ากัน — บางคนอ่านครบ บางคนยังมีค้าง
         *    ★ ถ้าทุกคนอ่านครบ ป้ายตัวเลขบนไอคอนแชทจะไม่มีวันขึ้นเลย
         *      ★★ ซึ่งแปลว่าของที่เพิ่งทำเสร็จจะดูเหมือนไม่ทำงาน
         */
        last_read_at: k === 0 ? ago(0, 0, 1) : ago(p.kind === 'DM' ? p.base + 1 : 3),
        joined_at: ago(20),
      })
    })

    if (p.kind === 'DM') {
      p.script.forEach(([text, d], k) => {
        msgs.push({
          room_id: room.id,
          sender_id: p.members[k % 2].id,
          text,
          kind: 'TEXT',
          created_at: ago(p.base + d, 2, -k * 3),
        })
      })
    } else {
      p.group.msgs.forEach(([text, who, d], k) => {
        const sender = people[who]
        if (!sender) return
        msgs.push({
          room_id: room.id,
          sender_id: sender.id,
          text,
          kind: 'TEXT',
          created_at: ago(d, 2, -k * 7),
        })
      })
    }
  })
  await ins('office_chat_members', members, { select: 'room_id' })
  const madeMsgs = await ins('office_chat_messages', msgs)

  /*
   * ★★★ ต้องเขียน last_message_at ทับอีกรอบหลังใส่ข้อความ
   *
   *     ★ ค่าที่ส่งไปตอน insert ห้องไม่ติด — ทุกห้องได้เวลา "ตอนรันสคริปต์"
   *       ★★ ผลที่เห็นบนจอ: รายการแชททุกห้องขึ้นเวลาเดียวกันเป๊ะ (07:09)
   *          ซึ่งเป็นภาพที่เป็นไปไม่ได้ในการใช้งานจริง
   *     ★ อัปเดตจาก "เวลาข้อความล่าสุดจริง ๆ ของห้องนั้น" จึงถูกเสมอ
   *       ไม่ว่าจะมี default หรือ trigger อะไรอยู่เบื้องหลัง
   */
  const lastOf = new Map()
  msgs.forEach((m) => {
    const cur = lastOf.get(m.room_id)
    if (!cur || m.created_at > cur) lastOf.set(m.room_id, m.created_at)
  })
  for (const [roomId, at] of lastOf) {
    await db.from('office_chat_rooms').update({ last_message_at: at }).eq('id', roomId)
  }
  log(`  office_chat_rooms → แก้เวลาข้อความล่าสุด ${lastOf.size} ห้อง`)

  /* ── อิโมจิความรู้สึก ──────────────────────────────────────── */
  const rx = []
  madeMsgs.forEach((m, i) => {
    if (!chance(0.22)) return
    const emoji = pick(['👍', '❤️', '😂', '🙏'])
    const n = 1 + Math.floor(rnd() * 3)
    const used = []
    for (let k = 0; k < n; k++) {
      const p = pick(people)
      if (used.includes(p.id)) continue
      used.push(p.id)
      rx.push({ message_id: m.id, user_id: p.id, emoji, created_at: ago(i % 5) })
    }
  })
  await ins('office_chat_reactions', rx, { select: 'message_id' })
}

/* ═══════════════════════════════════════════════════════════════════
 * 7 · แจ้งเตือน
 * ═══════════════════════════════════════════════════════════════════ */
async function seedNotifications(people) {
  step('7 · แจ้งเตือน')
  /*
   * ★★ ไม่กี่รายการต่อคน และส่วนใหญ่อ่านแล้ว
   *    ★ กระดิ่งที่ขึ้นเลข 50 ตั้งแต่เปิดหน้าแรก ไม่ใช่ภาพของระบบที่ใช้จริง
   *      ★★ มันคือภาพของระบบที่ถูกเททิ้งข้อมูล ซึ่งเป็นคนละเรื่องกัน
   */
  const rows = []
  people.slice(0, 10).forEach((p, i) => {
    rows.push({
      user_id: p.id,
      type: 'debtCreated',
      title_key: 'notify.type.debtCreated',
      params: {},
      link: '/office/wallet/owed',
      read_at: i < 7 ? ago(1) : null,
      created_at: ago(2, i),
    })
    if (i % 3 === 0) {
      rows.push({
        user_id: p.id,
        type: 'marketReserved',
        title_key: 'notify.type.marketReserved',
        params: {},
        link: '/office/market/mine',
        read_at: i < 5 ? ago(3) : null,
        created_at: ago(4, i),
      })
    }
    if (i % 4 === 1) {
      rows.push({
        user_id: p.id,
        type: 'debtReminder',
        title_key: 'notify.type.debtReminder',
        params: {},
        link: '/office/wallet/owed',
        read_at: null,
        created_at: ago(0, 5),
      })
    }
  })
  await ins('notifications', rows)
}

/* ═══════════════════════════════════════════════════════════════════ */
async function main() {
  log(`\n\x1b[1mใส่ข้อมูลตัวอย่างลงทุกโมดูล\x1b[0m`)
  log(`  ฐานข้อมูล: ${URL_}`)
  log(APPLY ? '  โหมด: \x1b[31mเขียนจริง\x1b[0m' : '  โหมด: ซ้อม (ไม่เขียนอะไร)')

  if (APPLY) {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    const ans = await rl.question('\nพิมพ์ SEED เพื่อยืนยัน: ')
    rl.close()
    if (ans.trim() !== 'SEED') {
      log('ยกเลิก')
      process.exit(0)
    }
  }

  if (UNDO) {
    await undo()
    log('\n\x1b[32m✓ ถอนคืนแล้ว\x1b[0m\n')
    return
  }

  if (CLEAN_TESTS) await cleanTestAccounts()
  const people = await ensurePeople()
  if (people.length < 4) {
    console.error('✗ คนน้อยเกินไป — ข้อมูลที่ได้จะไม่สมจริง')
    process.exit(1)
  }
  await seedFood(people)
  await seedWallet(people)
  await seedFun(people)
  await seedMarket(people)
  await seedChat(people)
  await seedNotifications(people)
  saveLedger()
  log('\n\x1b[32m✓ เสร็จแล้ว\x1b[0m\n')
}

main().catch((e) => {
  console.error('\n✗ ล้ม:', e.message)
  process.exit(1)
})
