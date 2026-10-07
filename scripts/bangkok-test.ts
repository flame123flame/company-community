/**
 * ด่านตรวจเวลาไทยฝั่ง server
 *
 * ★★★ ด่านนี้บังคับตัวเองให้รันในเขตเวลา UTC
 *
 *     ★ เครื่องของคนเขียนอยู่เขตเวลาไทยอยู่แล้ว ★★ ถ้าไม่บังคับ ด่านจะผ่าน
 *       ทั้งที่โค้ดยังผิด — เพราะเวลาเครื่องกับเวลาไทยบังเอิญตรงกัน
 *       ★ ซึ่งคือสถานการณ์เดียวกับที่ทำให้บั๊กนี้หลุดไปถึง production
 */
process.env.TZ = 'UTC'

import { bangkokToday, bangkokMonthStart, bangkokWallClock } from '../lib/time/bangkok'
import { isOpenNow } from '../lib/office/geo'

let pass = 0
let fail = 0
const check = (ok: boolean, name: string, detail = '') => {
  ok ? pass++ : fail++
  console.log(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${name}${detail ? ` \x1b[2m${detail}\x1b[0m` : ''}`)
}

console.log('\x1b[1mเขตเวลาของกระบวนการ:\x1b[0m', Intl.DateTimeFormat().resolvedOptions().timeZone)

/* ── วันข้ามเส้น ─────────────────────────────────────────────── */
console.log('\n\x1b[1mวันที่ไทยกับ UTC ต่างกันช่วงหัวค่ำ\x1b[0m')
{
  /* 2026-10-07 18:30 UTC = 2026-10-08 01:30 เวลาไทย */
  const at = new Date('2026-10-07T18:30:00Z')
  check(bangkokToday(at) === '2026-10-08', 'ไทยเป็นวันถัดไปแล้ว', bangkokToday(at))
  check(at.toISOString().slice(0, 10) === '2026-10-07', 'UTC ยังเป็นวันเดิม')
}

/* ── ขอบเดือน ────────────────────────────────────────────────── */
console.log('\n\x1b[1mขอบเดือน\x1b[0m')
{
  /* 2026-10-31 18:00 UTC = 2026-11-01 01:00 เวลาไทย */
  const at = new Date('2026-10-31T18:00:00Z')
  check(bangkokMonthStart(at) === '2026-11-01', 'ขึ้นเดือนใหม่ตามเวลาไทยแล้ว', bangkokMonthStart(at))
  check(at.toISOString().slice(0, 7) === '2026-10', 'UTC ยังเป็นเดือนเก่า')
}

/* ── ตัวกรอง "เปิดอยู่ตอนนี้" ───────────────────────────────── */
console.log('\n\x1b[1mร้านเปิด 10:00–20:00 เวลาไทย\x1b[0m')
{
  const hours = {
    mon: ['10:00', '20:00'], tue: ['10:00', '20:00'], wed: ['10:00', '20:00'],
    thu: ['10:00', '20:00'], fri: ['10:00', '20:00'], sat: ['10:00', '20:00'],
    sun: ['10:00', '20:00'],
  } as Record<string, [string, string]>

  /* บ่ายสามโมงที่กรุงเทพ = 08:00 UTC */
  const at = new Date('2026-10-07T08:00:00Z')

  check(isOpenNow(hours, bangkokWallClock(at)) === true, 'บ่ายสามไทย → เปิด')
  check(isOpenNow(hours, at) === false, 'ถ้าใช้นาฬิกา UTC ตรง ๆ → ปิด (คือบั๊กที่เพิ่งซ่อม)')

  /* ห้าทุ่มที่กรุงเทพ = 16:00 UTC */
  const night = new Date('2026-10-07T16:00:00Z')
  check(isOpenNow(hours, bangkokWallClock(night)) === false, 'ห้าทุ่มไทย → ปิด')
}

/* ── วันในสัปดาห์ ───────────────────────────────────────────── */
console.log('\n\x1b[1mวันในสัปดาห์ต้องเลื่อนตามด้วย\x1b[0m')
{
  /* 2026-10-10 เป็นวันเสาร์ · 17:30 UTC = วันอาทิตย์ 00:30 เวลาไทย */
  const at = new Date('2026-10-10T17:30:00Z')
  check(bangkokWallClock(at).getDay() === 0, 'ไทยเป็นวันอาทิตย์แล้ว', String(bangkokWallClock(at).getDay()))
  check(at.getUTCDay() === 6, 'UTC ยังเป็นวันเสาร์')

  /* ร้านปิดวันอาทิตย์ — ต้องตอบว่าปิด ไม่ใช่เปิดตามตารางวันเสาร์ */
  const hours = { sat: ['10:00', '23:59'], sun: null } as Record<string, [string, string] | null>
  check(isOpenNow(hours, bangkokWallClock(at)) === false, 'ร้านปิดวันอาทิตย์ → ปิดจริง')
}

console.log(`\n\x1b[1mผ่าน ${pass} · ล้ม ${fail}\x1b[0m`)
if (fail > 0) process.exit(1)
