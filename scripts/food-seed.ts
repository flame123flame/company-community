/**
 * สร้างข้อมูลร้านอาหารชุดใหม่สำหรับเดโม
 *
 * รันด้วย:  npx tsx scripts/food-seed.ts
 *
 * ★★★ ลบของเก่าทั้งหมดก่อน แล้วสร้างใหม่ — ไม่ใช่เติมทับ
 *
 *     ★ เติมทับแปลว่าร้านเดโมปนกับร้านจริงที่คนในออฟฟิศเพิ่มเอง
 *       ★★ แล้วแยกไม่ออกว่าอันไหนลบได้ ตอนที่อยากล้างเดโมทิ้ง
 *
 * ★★★ รูปเป็นภาพที่สร้างขึ้นเอง ไม่ใช่รูปถ่ายจริงของร้าน
 *
 *     ★ รูปถ่ายอาหารจากอินเทอร์เน็ตมีเจ้าของและมีสัญญาอนุญาต ★★ การดึงมา
 *       ใส่ในระบบของบริษัทคือการเอาปัญหาลิขสิทธิ์มาใส่ตัวเอง
 *     ★ ภาพที่สร้างเองด้วย SVG → PNG จึงเป็นของเราจริง ๆ และยังบอกได้ว่า
 *       ร้านไหนเป็นประเภทอะไรด้วยสีและไอคอน
 *
 * ★★ พิกัดเป็นของจริงย่านสีลม–สาทร เพื่อให้ระยะทางที่คำนวณออกมาสมเหตุสมผล
 *    ★ พิกัดมั่วทำให้ "เดิน 3 นาที" ไปโผล่ที่ร้านอีกเขตหนึ่ง ซึ่งอ่านแล้วรู้ทันที
 *      ว่าข้อมูลปลอม
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import sharp from 'sharp'
import { cuisineStyle } from '../lib/office/cuisine'

const env: Record<string, string> = {}
for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m) env[m[1]!] = m[2]!.replace(/^["']|["']$/g, '')
}
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false },
})

/** ออฟฟิศ — ย่านสีลม ใช้เป็นจุดอ้างอิงของระยะทาง */
const OFFICE = { lat: 13.7279, lng: 100.5241 }

type Seed = {
  name: string
  cuisine: string
  price: '฿' | '฿฿' | '฿฿฿'
  distance: 'WALK' | 'DRIVE' | 'DELIVERY'
  note: string
  lat: number
  lng: number
  dishes: { name: string; price: number | null }[]
  /** ช่วงดาวที่จะสุ่มให้รีวิว */
  stars: [number, number]
  reviews: string[]
  open?: Record<string, [string, string] | null>
}

const WEEKDAY: Record<string, [string, string] | null> = {
  mon: ['10:00', '20:00'],
  tue: ['10:00', '20:00'],
  wed: ['10:00', '20:00'],
  thu: ['10:00', '20:00'],
  fri: ['10:00', '21:00'],
  sat: ['11:00', '21:00'],
  sun: null,
}

const SHOPS: Seed[] = [
  {
    name: 'ข้าวมันไก่ประตูน้ำ สาขาสีลม',
    cuisine: 'ไทย',
    price: '฿',
    distance: 'WALK',
    note: 'ไปก่อนเที่ยงยังไม่ต้องรอคิว หลังเที่ยงครึ่งแถวยาวถึงปากซอย',
    lat: 13.7266,
    lng: 100.5285,
    dishes: [
      { name: 'ข้าวมันไก่ต้ม', price: 60 },
      { name: 'ข้าวมันไก่ทอด', price: 65 },
      { name: 'ข้าวมันไก่รวม', price: 75 },
      { name: 'น้ำซุปเพิ่ม', price: 10 },
    ],
    stars: [4, 5],
    reviews: [
      'ไก่นุ่มมาก น้ำจิ้มเผ็ดกำลังดี สั่งรวมคุ้มกว่า',
      'ข้าวหอมจริง แต่ช่วงเที่ยงคนเยอะต้องรอประมาณ 15 นาที',
      'สั่งกลับมากินที่ออฟฟิศ ข้าวยังไม่แฉะ โอเคเลย',
    ],
    open: WEEKDAY,
  },
  {
    name: 'ก๋วยเตี๋ยวเรือพี่ใหญ่',
    cuisine: 'ไทย',
    price: '฿',
    distance: 'WALK',
    note: 'ชามเล็ก สั่งสองชามกำลังอิ่ม มีหมูกับเนื้อ',
    lat: 13.7258,
    lng: 100.5219,
    dishes: [
      { name: 'ก๋วยเตี๋ยวเรือหมู', price: 25 },
      { name: 'ก๋วยเตี๋ยวเรือเนื้อ', price: 30 },
      { name: 'เกาเหลาเนื้อตุ๋น', price: 70 },
      { name: 'แคบหมู', price: 20 },
    ],
    stars: [4, 5],
    reviews: [
      'น้ำซุปเข้มข้นมาก ใส่พริกน้ำส้มนิดหน่อยอร่อยขึ้นอีก',
      'ราคานี้ในสีลมหายาก สั่งสามชามยังไม่ถึงร้อย',
    ],
    open: WEEKDAY,
  },
  {
    name: 'Kope Lab',
    cuisine: 'กาแฟ',
    price: '฿฿',
    distance: 'WALK',
    note: 'ที่นั่งน้อย ซื้อกลับดีกว่า เมล็ดเปลี่ยนทุกเดือน',
    lat: 13.7284,
    lng: 100.5256,
    dishes: [
      { name: 'ลาเต้คั่วกลาง', price: 85 },
      { name: 'อเมริกาโน่', price: 70 },
      { name: 'ครัวซองต์เนยสด', price: 95 },
      { name: 'ดริปเมล็ดพิเศษ', price: 140 },
    ],
    stars: [4, 5],
    reviews: [
      'ลาเต้นมหอม ไม่หวานเกิน สั่งทุกเช้าเลย',
      'ครัวซองต์อบใหม่ตอนสิบโมง ไปตอนนั้นได้ร้อน ๆ',
      'ที่นั่งมีสี่โต๊ะเอง ประชุมที่นี่ไม่ไหว',
    ],
    open: { ...WEEKDAY, sat: ['08:00', '17:00'], sun: ['08:00', '17:00'] },
  },
  {
    name: 'ส้มตำนัวนัว',
    cuisine: 'อีสาน',
    price: '฿',
    distance: 'WALK',
    note: 'บอกเผ็ดน้อยได้ ไก่ย่างหมดบ่ายสามทุกวัน',
    lat: 13.7249,
    lng: 100.5263,
    dishes: [
      { name: 'ตำไทยไข่เค็ม', price: 65 },
      { name: 'ไก่ย่างครึ่งตัว', price: 120 },
      { name: 'คอหมูย่าง', price: 90 },
      { name: 'ข้าวเหนียว', price: 10 },
    ],
    stars: [4, 5],
    reviews: [
      'ไก่ย่างหนังกรอบ เนื้อไม่แห้ง สั่งกับข้าวเหนียวจบ',
      'ตำไทยไข่เค็มเค็มกำลังดี ไม่ต้องเติมอะไรเลย',
    ],
    open: WEEKDAY,
  },
  {
    name: 'บะหมี่เกี๊ยวกุ้งเจ๊หมวย',
    cuisine: 'จีน',
    price: '฿',
    distance: 'WALK',
    note: 'หมดเร็ว บ่ายโมงไปก็ไม่เหลือแล้ว',
    lat: 13.7271,
    lng: 100.5203,
    dishes: [
      { name: 'บะหมี่แห้งเกี๊ยวกุ้ง', price: 70 },
      { name: 'บะหมี่น้ำหมูแดง', price: 60 },
      { name: 'เกี๊ยวทอด', price: 40 },
    ],
    stars: [4, 5],
    reviews: [
      'เส้นเหนียวนุ่ม เกี๊ยวกุ้งตัวใหญ่จริง',
      'ไปสิบเอ็ดโมงครึ่งยังไม่ต้องรอ หลังจากนั้นคิวยาว',
    ],
    open: { ...WEEKDAY, mon: ['09:00', '14:00'], tue: ['09:00', '14:00'], wed: ['09:00', '14:00'], thu: ['09:00', '14:00'], fri: ['09:00', '14:00'] },
  },
  {
    name: 'ชาบูบุฟเฟ่ต์ Mo-Mo',
    cuisine: 'ชาบู',
    price: '฿฿',
    distance: 'DRIVE',
    note: 'คนเยอะวันศุกร์ จองก่อนดีกว่า มีน้ำซุปสองรส',
    lat: 13.7221,
    lng: 100.5339,
    dishes: [
      { name: 'บุฟเฟ่ต์หมู 90 นาที', price: 299 },
      { name: 'บุฟเฟ่ต์เนื้อพรีเมียม', price: 459 },
      { name: 'น้ำซุปเพิ่มรส', price: 50 },
    ],
    stars: [3, 5],
    reviews: [
      'หมูสไลด์สดดี น้ำซุปต้มยำเข้มข้น',
      'วันศุกร์รอคิวเกือบครึ่งชั่วโมง ไปวันธรรมดาดีกว่า',
      'ของหวานมีไม่กี่อย่าง แต่เนื้อหลักคุ้มราคา',
    ],
  },
  {
    name: 'ข้าวแกงใต้ร้านเจ๊นิด',
    cuisine: 'ใต้',
    price: '฿',
    distance: 'WALK',
    note: 'เผ็ดจริง บอกเผ็ดน้อยได้ เปิดถึงบ่ายสองเท่านั้น',
    lat: 13.7292,
    lng: 100.5227,
    dishes: [
      { name: 'แกงไตปลา', price: 70 },
      { name: 'คั่วกลิ้งหมู', price: 70 },
      { name: 'ผัดสะตอกุ้ง', price: 90 },
      { name: 'ไข่เจียวชะอม', price: 40 },
    ],
    stars: [4, 5],
    reviews: [
      'คั่วกลิ้งหอมเครื่องแกงมาก เผ็ดแต่หยุดไม่ได้',
      'สั่งสามอย่างกับข้าวสองที่ ไม่ถึงสามร้อย',
    ],
    open: { ...WEEKDAY, mon: ['10:00', '14:00'], tue: ['10:00', '14:00'], wed: ['10:00', '14:00'], thu: ['10:00', '14:00'], fri: ['10:00', '14:00'], sat: null },
  },
  {
    name: 'Pho Saigon',
    cuisine: 'เวียดนาม',
    price: '฿฿',
    distance: 'DRIVE',
    note: 'น้ำซุปดีมาก วันฝนตกเหมาะสุด',
    lat: 13.7205,
    lng: 100.5288,
    dishes: [
      { name: 'เฝอเนื้อตุ๋น', price: 150 },
      { name: 'เฝอไก่', price: 130 },
      { name: 'ปอเปี๊ยะสด', price: 90 },
    ],
    stars: [4, 5],
    reviews: ['น้ำซุปเคี่ยวนานจริง หอมเครื่องเทศ ไม่เค็ม', 'ปอเปี๊ยะสดแป้งบาง กุ้งตัวใหญ่'],
  },
  {
    name: 'หมูกระทะเฮียชัย',
    cuisine: 'ปิ้งย่าง',
    price: '฿฿',
    distance: 'DRIVE',
    note: 'ไว้เลี้ยงปิดโปรเจกต์ จองล่วงหน้าหนึ่งวัน',
    lat: 13.7188,
    lng: 100.5312,
    dishes: [
      { name: 'ชุดหมูกระทะ 199 ไม่อั้น', price: 199 },
      { name: 'ชุดทะเลรวม', price: 349 },
      { name: 'เบียร์ขวดใหญ่', price: 150 },
    ],
    stars: [3, 5],
    reviews: [
      'เลี้ยงทีมสิบคนจบที่สองพันกว่า คุ้มมาก',
      'ควันเยอะหน่อย กลับมาเสื้อมีกลิ่น แต่ของอร่อย',
    ],
  },
  {
    name: 'Pizza Forno',
    cuisine: 'อิตาเลียน',
    price: '฿฿฿',
    distance: 'DELIVERY',
    note: 'สั่งรวมกันเกิน 500 ส่งฟรี เตาฟืนจริง',
    lat: 13.7164,
    lng: 100.5361,
    dishes: [
      { name: 'มาร์เกอริต้าเตาฟืน', price: 320 },
      { name: 'ควอตโตรฟอร์มัจจิ', price: 420 },
      { name: 'สลัดรูค่อลา', price: 180 },
    ],
    stars: [4, 5],
    reviews: ['ขอบแป้งไหม้นิด ๆ แบบที่ควรเป็น ชีสเยิ้มดี', 'สั่งรวมทีมคุ้มกว่าสั่งคนเดียว'],
  },
  {
    name: 'Salad Factory',
    cuisine: 'สุขภาพ',
    price: '฿฿',
    distance: 'DELIVERY',
    note: 'ใช้วันที่รู้สึกผิดกับตัวเอง อกไก่ย่างไม่แห้ง',
    lat: 13.7236,
    lng: 100.5376,
    dishes: [
      { name: 'สลัดอกไก่ย่างน้ำใส', price: 180 },
      { name: 'สลัดแซลมอน', price: 290 },
      { name: 'ซุปข้าวโพด', price: 90 },
    ],
    stars: [3, 5],
    reviews: ['ผักสดจริง น้ำสลัดไม่หวาน', 'ราคาสูงไปนิดสำหรับมื้อกลางวันทุกวัน'],
  },
  {
    name: 'ซูชิกิน',
    cuisine: 'ญี่ปุ่น',
    price: '฿฿',
    distance: 'DRIVE',
    note: 'เซ็ตกลางวันคุ้มสุด หมดบ่ายสอง',
    lat: 13.7243,
    lng: 100.5332,
    dishes: [
      { name: 'เซ็ตซูชิกลางวัน', price: 220 },
      { name: 'ข้าวหน้าปลาไหล', price: 280 },
      { name: 'ซุปมิโสะ', price: 40 },
    ],
    stars: [4, 5],
    reviews: ['ปลาสดกว่าที่คิดสำหรับราคานี้', 'เซ็ตกลางวันมาเร็วมาก สิบนาทีได้แล้ว'],
  },
]

const rnd = (() => {
  /* ★ สุ่มแบบกำหนดเมล็ด — รันซ้ำแล้วได้ข้อมูลหน้าตาเดิม ตรวจสอบง่ายกว่า */
  let x = 20261003
  return () => {
    x = (x * 1103515245 + 12345) % 2147483648
    return x / 2147483648
  }
})()

const pick = <T,>(arr: T[]): T => arr[Math.floor(rnd() * arr.length)]!

/**
 * สร้างรูปของร้าน
 *
 * ★ ไล่สีตามประเภทอาหาร + ไอคอนของประเภทนั้น — ชุดเดียวกับที่หน้าเว็บใช้
 *   ★★ นำเข้า cuisineStyle จริง ไม่ได้ก๊อปสีมาวาง จึงไม่มีทางเพี้ยนจากกัน
 */
async function makePhoto(name: string, cuisine: string, variant: number): Promise<Buffer> {
  const style = cuisineStyle(name, cuisine)
  const [r, g, b] = style.tint.split(' ').map(Number) as [number, number, number]
  const shift = variant * 18
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="rgb(${Math.min(255, r + shift)},${Math.min(255, g + shift)},${Math.min(255, b + shift)})"/>
      <stop offset="100%" stop-color="rgb(${Math.max(0, r - 40)},${Math.max(0, g - 40)},${Math.max(0, b - 40)})"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="800" fill="url(#g)"/>
  <g opacity="0.17" fill="none" stroke="#fff" stroke-width="2">
    ${Array.from({ length: 9 }, (_, i) => `<circle cx="${120 + i * 130}" cy="${160 + ((i * 97) % 480)}" r="${50 + ((i * 37) % 90)}"/>`).join('')}
  </g>
  <g transform="translate(600 400) scale(11) translate(-12 -12)"
     fill="none" stroke="#fff" stroke-opacity="0.9" stroke-width="1.3"
     stroke-linecap="round" stroke-linejoin="round">
    <path d="${style.icon}"/>
  </g>
</svg>`
  return sharp(Buffer.from(svg)).jpeg({ quality: 82 }).toBuffer()
}

async function main() {
  console.log('── ลบข้อมูลร้านเดิม ──────────────────────────────')

  /* ★ เก็บ path ของรูปเก่าไว้ก่อนลบแถว — ลบแถวแล้วไม่มีทางรู้ว่าไฟล์ไหนกำพร้า */
  const { data: oldPhotos } = await db.from('restaurant_photos').select('path')
  const { data: oldShops } = await db.from('restaurants').select('id')
  console.log(`  ร้านเดิม ${oldShops?.length ?? 0} ร้าน · รูปเดิม ${oldPhotos?.length ?? 0} รูป`)

  if ((oldPhotos ?? []).length > 0) {
    await db.storage.from('restaurants').remove((oldPhotos ?? []).map((p) => p.path))
  }
  /*
   * ★★ ลบร้านแล้ว votes/reviews/photos/dishes หายตามด้วย on delete cascade
   *    ★ ส่วน expense_bills.restaurant_id เป็น on delete set null —
   *      บิลเก่ายังอยู่ครบ แค่ไม่ผูกกับร้านอีกต่อไป
   */
  await db.from('restaurants').delete().not('id', 'is', null)
  console.log('  ลบเรียบร้อย')

  /* ── ตั้งพิกัดออฟฟิศ ─────────────────────────────────────── */
  const { data: admin } = await db
    .from('profiles')
    .select('id')
    .eq('is_admin', true)
    .limit(1)
    .maybeSingle()

  if (admin) {
    const { error } = await db.rpc('set_office_latlng', {
      p_actor: admin.id,
      p_lat: OFFICE.lat,
      p_lng: OFFICE.lng,
    })
    console.log(error ? `  ตั้งพิกัดออฟฟิศไม่สำเร็จ: ${error.message}` : '  ตั้งพิกัดออฟฟิศแล้ว')
  }

  /* ── คนในออฟฟิศที่จะใช้เป็นผู้เพิ่ม/โหวต/รีวิว ─────────────── */
  const { data: people } = await db
    .from('profiles')
    .select('id, nickname, display_name')
    .limit(40)
  const users = people ?? []
  if (users.length === 0) throw new Error('ไม่มีผู้ใช้ในระบบ — สร้างข้อมูลไม่ได้')
  console.log(`  ใช้ผู้ใช้ ${users.length} คน`)

  console.log('\n── สร้างร้านใหม่ ────────────────────────────────')

  for (const seed of SHOPS) {
    const owner = pick(users)

    const { data: created, error } = await db.rpc('add_restaurant', {
      p_actor: owner.id,
      p_name: seed.name,
      p_dish: seed.dishes[0]!.name,
      /* ★ p_image อยู่ก่อน p_cuisine ในลายเซ็นจริง — ต้องส่งชื่อพารามิเตอร์
           ไม่ใช่พึ่งลำดับ ไม่งั้นประเภทอาหารจะไปลงช่องรูป */
      p_image: null,
      p_cuisine: seed.cuisine,
      p_price: seed.price,
      p_distance: seed.distance,
      p_map_url: null,
      p_note: seed.note,
    })
    if (error || !created) {
      console.log(`  ✗ ${seed.name}: ${error?.message}`)
      continue
    }

    const id = (created as { id: string }).id

    await db.rpc('set_restaurant_dishes', {
      p_actor: owner.id,
      p_shop: id,
      p_dishes: seed.dishes,
    })
    await db.rpc('set_restaurant_latlng', {
      p_actor: owner.id,
      p_id: id,
      p_lat: seed.lat,
      p_lng: seed.lng,
    })
    if (seed.open) {
      await db.from('restaurants').update({ open_hours: seed.open } as never).eq('id', id)
    }

    /* ── รูป 2–3 ใบต่อร้าน ────────────────────────────────── */
    const shots = 2 + Math.floor(rnd() * 2)
    const paths: string[] = []
    for (let i = 0; i < shots; i++) {
      const buf = await makePhoto(seed.name, seed.cuisine, i)
      const path = `${id}/${i}.jpg`
      const { error: upErr } = await db.storage
        .from('restaurants')
        .upload(path, buf, { contentType: 'image/jpeg', upsert: true })
      if (!upErr) paths.push(path)
    }
    if (paths.length > 0) {
      await db.rpc('add_restaurant_photos', { p_actor: owner.id, p_shop: id, p_paths: paths })
    }

    /* ── หัวใจจากคนสุ่ม ───────────────────────────────────── */
    const voters = [...users].sort(() => rnd() - 0.5).slice(0, 3 + Math.floor(rnd() * 12))
    for (const v of voters) {
      await db.rpc('toggle_restaurant_vote', { p_actor: v.id, p_id: id })
    }

    /* ── รีวิวพร้อมดาว ────────────────────────────────────── */
    const reviewers = [...users].sort(() => rnd() - 0.5)
    for (let i = 0; i < seed.reviews.length; i++) {
      const author = reviewers[i % reviewers.length]!
      const [lo, hi] = seed.stars
      const rating = lo + Math.floor(rnd() * (hi - lo + 1))
      await db.rpc('upsert_restaurant_review', {
        p_actor: author.id,
        p_shop: id,
        p_review: null,
        p_rating: rating,
        p_body: seed.reviews[i]!,
        p_at_shop: rnd() > 0.5,
        p_photos: null,
      })
    }

    const { data: row } = await db
      .from('restaurants')
      .select('vote_count, rating_sum, rating_count, travel_meters, travel_minutes')
      .eq('id', id)
      .maybeSingle()

    const avg = row?.rating_count ? (row.rating_sum / row.rating_count).toFixed(1) : '—'
    console.log(
      `  ✓ ${seed.name.padEnd(28)} เมนู ${String(seed.dishes.length).padStart(2)} · รูป ${paths.length} · ♥ ${String(row?.vote_count ?? 0).padStart(2)} · ★ ${avg} (${row?.rating_count ?? 0}) · ${row?.travel_meters ?? '—'} ม.`,
    )
  }

  console.log('\nเสร็จแล้ว')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
