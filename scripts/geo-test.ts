/**
 * ด่านตรวจเลขคณิตของระยะทาง เวลาเปิด-ปิด และการถอดพิกัดจากลิงก์
 *
 * รันด้วย:  npx tsx scripts/geo-test.ts
 *
 * ★★ ของพวกนี้ทดสอบบนเบราว์เซอร์ไม่คุ้ม — มันเป็นฟังก์ชันล้วนที่รับค่าเข้า
 *    คืนค่าออก ★ การเปิดเบราว์เซอร์เพื่อตรวจว่า 1+1=2 คือการจ่ายเวลา
 *    สามสิบวินาทีเพื่อคำตอบที่ได้ในสามมิลลิวินาที
 */
import {
  haversineMeters,
  travelFrom,
  parseLatLngFromMapUrl,
  isOpenNow,
  directionsUrl,
  searchUrl,
  type OpenHours,
} from '../lib/office/geo'
import { pickWeighted, slotsForWheel, type Restaurant } from '../lib/office/food'

let pass = 0
let fail = 0

function check(ok: boolean, name: string, detail = '') {
  ok ? pass++ : fail++
  console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${name}${detail ? ` \x1b[2m${detail}\x1b[0m` : ''}`)
}
const head = (s: string) => console.log(`\n\x1b[1m${s}\x1b[0m`)

/* ═══════════════════════════════════════════════════════════════════ */
head('ระยะทาง')

/* ★ จุดเดียวกัน = 0 เป๊ะ — ไม่ใช่ค่าเล็ก ๆ ที่เกิดจากความคลาดเคลื่อน */
check(haversineMeters(13.7563, 100.5018, 13.7563, 100.5018) === 0, 'จุดเดียวกันได้ 0')

/*
 * ★ 1 องศาละติจูด ≈ 111.19 กม. เป็นค่าที่ตรวจสอบได้จากนิยามของเมตรเอง
 *   ★★ ใช้ค่าที่รู้ล่วงหน้าเป็นหลักยึด ไม่ใช่เอาผลที่โค้ดคืนมาตั้งเป็นคำตอบ
 */
const oneDeg = haversineMeters(0, 0, 1, 0)
check(Math.abs(oneDeg - 111_195) < 60, '1 องศาละติจูด ≈ 111.2 กม.', `${Math.round(oneDeg)} ม.`)

/* ★ สลับต้นทาง-ปลายทางต้องได้เท่าเดิม */
check(
  Math.abs(haversineMeters(13.75, 100.5, 13.8, 100.56) - haversineMeters(13.8, 100.56, 13.75, 100.5)) < 1e-6,
  'สลับทิศแล้วระยะเท่าเดิม',
)

head('แปลงเป็นเวลาเดินทาง')

/* 400 ม.เส้นตรง × 1.3 = 520 ม. → เดิน (≤800) → ceil(520/80) = 7 นาที */
const near = travelFrom(13.7563, 100.5018, 13.7563, 100.50549)
check(near.mode === 'walking', 'ระยะใกล้ = เดิน', `${near.meters} ม.`)
check(near.minutes === Math.ceil(near.meters / 80), 'นาทีเดิน = ปัดขึ้นจาก 80 ม./นาที', `${near.minutes} นาที`)

/* ไกล → ขับ */
const far = travelFrom(13.7563, 100.5018, 13.85, 100.60)
check(far.mode === 'driving', 'ระยะไกล = ขับ', `${far.meters} ม.`)
check(far.minutes === Math.ceil(far.meters / 400), 'นาทีขับ = ปัดขึ้นจาก 400 ม./นาที', `${far.minutes} นาที`)

/* ★★ ขั้นต่ำ 1 นาที — ร้านในตึกเดียวกันต้องไม่ได้ "0 นาที" */
const same = travelFrom(13.7563, 100.5018, 13.7563, 100.5018)
check(same.minutes === 1, 'ร้านติดออฟฟิศยังได้อย่างน้อย 1 นาที', `${same.minutes} นาที`)

/* ★ ตัวคูณถนน 1.3 ต้องถูกใช้จริง ไม่ใช่เขียนไว้เฉย ๆ */
const straight = haversineMeters(13.7563, 100.5018, 13.78, 100.52)
const road = travelFrom(13.7563, 100.5018, 13.78, 100.52).meters
check(Math.abs(road - straight * 1.3) < 1, 'ระยะตามถนน = เส้นตรง × 1.3', `${Math.round(straight)} → ${road}`)

head('ถอดพิกัดจากลิงก์ Google Maps')

check(
  parseLatLngFromMapUrl('https://www.google.com/maps/@13.7563,100.5018,17z')?.lat === 13.7563,
  'รูปแบบ @lat,lng',
)
check(
  parseLatLngFromMapUrl('https://maps.google.com/?q=13.7563,100.5018')?.lng === 100.5018,
  'รูปแบบ ?q=lat,lng',
)

/*
 * ★★★ ข้อที่สำคัญที่สุดในไฟล์นี้
 *
 *     ลิงก์จริงมีทั้ง @ (กล้องมองตรงไหน) และ !3d/!4d (หมุดปักตรงไหน)
 *     ★ ต้องเอา !3d/!4d — สองค่านี้ต่างกันได้หลายร้อยเมตรเมื่อคนเลื่อน
 *       แผนที่ก่อนก๊อปลิงก์ ซึ่งเกินเกณฑ์ 200 ม. ของป้าย "รีวิวที่ร้าน"
 */
const both = parseLatLngFromMapUrl(
  'https://www.google.com/maps/place/Shop/@13.7000,100.4000,17z/data=!3m1!4b1!4m5!3m4!1s0x0:0x0!8m2!3d13.7563!4d100.5018',
)
check(both?.lat === 13.7563 && both?.lng === 100.5018, 'มีทั้ง @ และ !3d/!4d → เอาหมุด ไม่เอากล้อง', JSON.stringify(both))

/* ★ ลิงก์ย่อถอดไม่ได้ ต้องคืน null ให้ UI บอกว่า "ลากหมุดแทน" */
check(parseLatLngFromMapUrl('https://maps.app.goo.gl/abcd1234') === null, 'ลิงก์ย่อ → null')
check(parseLatLngFromMapUrl('') === null, 'ข้อความว่าง → null')
check(parseLatLngFromMapUrl('ไม่ใช่ลิงก์') === null, 'ข้อความมั่ว → null')

/* ★ ค่าที่เกินช่วงพิกัดต้องถูกปฏิเสธ ไม่ใช่รับไปแล้วเก็บลงฐานข้อมูล */
check(parseLatLngFromMapUrl('https://x/?q=913.7563,100.5018') === null, 'ละติจูดเกิน 90 → null')

head('ลิงก์ Google Maps')

const dir = directionsUrl(13.75, 100.5, 13.8, 100.56, 'walking')
check(dir.includes('api=1') && dir.includes('travelmode=walking'), 'ลิงก์เส้นทางมีพารามิเตอร์ครบ')
check(!dir.includes('key='), 'ไม่มี API key ในลิงก์')
check(searchUrl('ร้าน ข้าว').includes(encodeURIComponent('ร้าน ข้าว')), 'ชื่อร้านภาษาไทยถูก encode')

head('เปิด-ปิด')

/* 2026-10-05 เป็นวันจันทร์ */
const mon = (h: number, m = 0) => new Date(2026, 9, 5, h, m)
const biz: OpenHours = { mon: ['09:00', '18:00'] }

check(isOpenNow(biz, mon(12)) === true, 'เที่ยงวันจันทร์ = เปิด')
check(isOpenNow(biz, mon(8)) === false, 'แปดโมง = ปิด')
check(isOpenNow(biz, mon(18)) === false, 'หกโมงเย็นตรง = ปิด (ไม่รวมเวลาปิด)')
check(isOpenNow(biz, mon(9)) === true, 'เก้าโมงตรง = เปิด (รวมเวลาเปิด)')

/* ★★ ไม่มีข้อมูล ≠ ปิด */
check(isOpenNow(null, mon(12)) === null, 'ไม่ได้กรอกเลย → null')
check(isOpenNow({}, mon(12)) === null, 'กรอกเป็นก้อนว่าง → null')
check(isOpenNow({ tue: ['09:00', '18:00'] }, mon(12)) === null, 'กรอกแต่วันอังคาร ถามวันจันทร์ → null')
check(isOpenNow({ mon: null }, mon(12)) === false, 'ระบุว่าวันจันทร์ปิด → false')

/*
 * ★★★ ช่วงข้ามเที่ยงคืน — ร้านข้าวต้มรอบดึก
 *     ★ ถ้าเทียบตรง ๆ ว่า now >= open && now < close ร้านพวกนี้จะ "ปิด"
 *       ตลอด 24 ชม. เพราะ 02:00 < 18:00 เสมอ
 */
const late: OpenHours = { mon: ['18:00', '02:00'], sun: ['18:00', '02:00'] }
check(isOpenNow(late, mon(20)) === true, 'สองทุ่มวันจันทร์ = เปิด (ช่วงข้ามคืน)')
check(isOpenNow(late, mon(1)) === true, 'ตีหนึ่งวันจันทร์ = เปิด (ต่อจากคืนวันอาทิตย์)')
check(isOpenNow(late, mon(10)) === false, 'สิบโมงวันจันทร์ = ปิด')

/* ★ เวลารูปแบบผิดต้องไม่ทำให้พัง */
check(isOpenNow({ mon: ['ไม่ใช่เวลา', '18:00'] }, mon(12)) === false, 'เวลารูปแบบผิด → ไม่พัง')


/* ═══════════════════════════════════════════════════════════════════
 * วงล้อสุ่มอาหาร
 * ═══════════════════════════════════════════════════════════════════ */
head('สุ่มร้านแบบถ่วงน้ำหนัก')

const shop = (id: string): Restaurant =>
  ({
    id,
    name: id,
    signatureDish: '',
    imagePath: null,
    cuisine: null,
    priceRange: null,
    distance: null,
    mapUrl: null,
    note: null,
    addedBy: null,
    addedByName: null,
    voteCount: 0,
    maybeClosed: false,
    voted: false,
    canManage: false,
    createdAt: '2026-01-01T00:00:00Z',
    rating: null,
    ratingCount: 0,
    coverUrl: null,
    lat: null,
    lng: null,
    travelMeters: null,
    travelMinutes: null,
    travelMode: null,
    openHours: null,
  }) as Restaurant

check(pickWeighted([], new Set()) === null, 'ไม่มีร้าน → null')

/* น้ำหนัก: a=3 (ไม่เพิ่งไป) · b=1 (เพิ่งไป) · รวม 4 */
const two = [shop('a'), shop('b')]
const recentB = new Set(['b'])
check(pickWeighted(two, recentB, () => 0)?.id === 'a', 'rnd=0 → ตัวแรก')
check(pickWeighted(two, recentB, () => 0.74)?.id === 'a', 'rnd=0.74 (<3/4) → a')
check(pickWeighted(two, recentB, () => 0.76)?.id === 'b', 'rnd=0.76 (>3/4) → b')
check(pickWeighted(two, recentB, () => 0.999)?.id === 'b', 'rnd เกือบ 1 → ตัวสุดท้าย')

/* ★★ ไม่มีร้านไหนเพิ่งไป = น้ำหนักเท่ากันหมด */
check(pickWeighted(two, new Set(), () => 0.49)?.id === 'a', 'น้ำหนักเท่ากัน ครึ่งแรก → a')
check(pickWeighted(two, new Set(), () => 0.51)?.id === 'b', 'น้ำหนักเท่ากัน ครึ่งหลัง → b')

/* ★ "ลดโอกาส" ไม่ใช่ "ตัดออก" — ร้านที่เพิ่งไปต้องยังถูกเลือกได้ */
const all = [shop('x')]
check(pickWeighted(all, new Set(['x']), () => 0.5)?.id === 'x', 'ร้านที่เพิ่งไปยังถูกเลือกได้')

head('เลือกช่องบนวงล้อ')

const many = Array.from({ length: 20 }, (_, i) => shop(`s${i}`))

check(slotsForWheel(many.slice(0, 8), many[3]!).length === 8, 'ร้านน้อยกว่า 12 → แสดงหมด')

const slots = slotsForWheel(many, many[17]!)
check(slots.length === 12, 'ร้าน 20 แห่ง → เหลือ 12 ช่อง', `${slots.length}`)

/*
 * ★★★ ข้อที่สำคัญที่สุด: ผู้ชนะต้องอยู่บนวงล้อเสมอ
 *     ★ ถ้าไม่อยู่ วงล้อจะไม่มีช่องให้ไปหยุด แล้วต้องหยุดที่ช่องอื่น
 *       แต่ประกาศผลอีกอย่าง — โกหกที่ผู้ใช้จับได้ทันที
 */
check(slots.some((r) => r.id === 's17'), 'ผู้ชนะอยู่บนวงล้อเสมอ')
check(new Set(slots.map((r) => r.id)).size === slots.length, 'ไม่มีร้านซ้ำช่อง')

/* ★ ผู้ชนะต้องไม่ถูกดันไปช่องแรกทุกครั้ง — คนจับได้ในสามรอบ */
const firstPositions = new Set(
  [2, 5, 9, 14, 19].map((i) => slotsForWheel(many, many[i]!).findIndex((r) => r.id === `s${i}`)),
)
check(firstPositions.size > 1, 'ตำแหน่งผู้ชนะไม่คงที่', `ตำแหน่งที่พบ: ${[...firstPositions].join(',')}`)

console.log(`\n\x1b[1mผ่าน ${pass} · ล้ม ${fail}\x1b[0m`)
process.exit(fail ? 1 : 0)
