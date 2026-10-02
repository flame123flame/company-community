import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { AppError } from '@/lib/http/errors'
import { assertSameOrigin, parseJsonBody } from '@/lib/http/guard'
import { ok, withErrorHandling } from '@/lib/http/respond'
import { enforceRateLimit } from '@/lib/ratelimit'
import { requireOfficeUser } from '@/lib/office/guard'
import {
  directionsUrl,
  distanceTag,
  isAllowedMapHost,
  parseLatLngFromMapUrl,
  travelFrom,
} from '@/lib/office/geo'

export const dynamic = 'force-dynamic'

/** ตามลิงก์ได้กี่ชั้น — ตามข้อกำหนด */
const MAX_REDIRECTS = 5
/** รอทั้งหมดได้กี่มิลลิวินาที — ตามข้อกำหนด */
const TIMEOUT_MS = 5_000

const bodySchema = z.object({
  url: z.string().trim().min(1).max(2000),
})

/**
 * POST /api/office/food/resolve-map-link — แกะพิกัดจากลิงก์ Google Maps
 *
 * ★★★ endpoint นี้ให้ server ยิงคำขอไปยัง URL ที่ผู้ใช้พิมพ์มาเอง
 *     ซึ่งคือรูปแบบของ SSRF ตรง ๆ ★ จึงปิดช่องสามชั้นพร้อมกัน:
 *       1 allowlist โดเมน — ตรวจ "ทุก hop" ไม่ใช่แค่ URL แรก
 *       2 จำกัดจำนวน redirect
 *       3 timeout รวมของทั้งการไล่ลิงก์
 *     ★★ ขาดชั้นใดชั้นหนึ่งก็ยังเปิดช่องอยู่ — allowlist อย่างเดียวไม่พอ
 *        เพราะลิงก์ที่โดเมนถูกต้องยังพาไปที่อื่นต่อได้
 *
 * ★★ แกะจาก URL ก่อนเสมอ ยังไม่ยิงเน็ต
 *    ★ ลิงก์เต็มของ Google มีพิกัดอยู่ในตัวอยู่แล้ว การยิงคำขอออกไป
 *      ทั้งที่ตอบได้จากข้อความ คือการเปิดช่องโดยไม่ได้อะไรเพิ่ม
 */
export const POST = withErrorHandling(async (request: NextRequest) => {
  assertSameOrigin(request)

  const actor = await requireOfficeUser()
  await enforceRateLimit('foodMapResolve', actor.id)

  const body = await parseJsonBody(request, bodySchema)

  let url: URL
  try {
    url = new URL(body.url)
  } catch {
    throw new AppError('VALIDATION_FAILED', { messageKey: 'valid.mapLink' })
  }

  if (url.protocol !== 'https:') {
    throw new AppError('VALIDATION_FAILED', { messageKey: 'valid.mapLink' })
  }
  if (!isAllowedMapHost(url.hostname)) {
    throw new AppError('VALIDATION_FAILED', { messageKey: 'valid.mapLink' })
  }

  /* ── 1 · ลองแกะจากข้อความก่อน ─────────────────────────────────── */
  let hit = parseLatLngFromMapUrl(url.toString())

  /* ── 2 · ยังไม่ได้ → ไล่ตาม redirect แบบจำกัด ─────────────────── */
  if (!hit) {
    hit = await followForCoords(url)
  }

  if (!hit) {
    /*
     * ★ 422 ไม่ใช่ 400 — คำขอถูกรูปแบบทุกอย่าง แค่เนื้อหาข้างในไม่มีพิกัด
     *   ★★ และข้อความต้องบอก "ทำอะไรต่อ" ไม่ใช่แค่ "ล้มเหลว"
     */
    throw new AppError('UNPROCESSABLE', { messageKey: 'valid.mapLinkNoCoords' })
  }

  /* ── 3 · คิดระยะจากพิกัดออฟฟิศ ────────────────────────────────── */
  const office = await loadOffice()

  if (!office) {
    /* ★ ไม่มีพิกัดออฟฟิศ = ยังบอกระยะไม่ได้ แต่พิกัดร้านที่แกะได้ยังมีค่า */
    return ok({
      lat: hit.lat,
      lng: hit.lng,
      distance_m: null,
      walk_min: null,
      suggested_distance_tag: null,
      directions_url: null,
    })
  }

  const travel = travelFrom(office.lat, office.lng, hit.lat, hit.lng)

  return ok({
    lat: hit.lat,
    lng: hit.lng,
    distance_m: travel.meters,
    walk_min: travel.minutes,
    suggested_distance_tag: distanceTag(travel.meters),
    directions_url: directionsUrl(office.lat, office.lng, hit.lat, hit.lng, travel.mode),
  })
})

/**
 * ไล่ตาม redirect จนเจอพิกัด
 *
 * ★★★ ใช้ redirect: 'manual' ไม่ใช่ 'follow'
 *     ★ 'follow' ให้ fetch ตามไปเอง ซึ่งแปลว่าเราตรวจโดเมนของ hop
 *       ระหว่างทางไม่ได้เลย ★★ ซึ่งคือทั้งหมดของสิ่งที่ต้องตรวจ
 *
 * ★ ใช้ HEAD ไม่ใช่ GET — เราต้องการแค่ header Location
 *   ★★ ไม่ดึงเนื้อหาหน้า จึงไม่มีทางที่เนื้อหาจากภายนอกจะไหลเข้ามาในระบบ
 */
async function followForCoords(start: URL): Promise<{ lat: number; lng: number } | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    let current = start

    for (let hop = 0; hop < MAX_REDIRECTS; hop++) {
      const res = await fetch(current.toString(), {
        method: 'HEAD',
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'user-agent': 'Mozilla/5.0 (compatible; AWA-ROOM/1.0)' },
      })

      const location = res.headers.get('location')
      if (!location) return parseLatLngFromMapUrl(current.toString())

      let next: URL
      try {
        next = new URL(location, current)
      } catch {
        return null
      }

      /* ★★ ตรวจ allowlist ทุก hop — นี่คือจุดที่ 'follow' ทำแทนไม่ได้ */
      if (next.protocol !== 'https:' || !isAllowedMapHost(next.hostname)) return null

      const found = parseLatLngFromMapUrl(next.toString())
      if (found) return found

      current = next
    }

    return null
  } catch {
    /* ★ timeout · เน็ตล่ม · ปลายทางปฏิเสธ → ตอบเหมือนกันว่า "แกะไม่ได้"
         ★★ แยกสาเหตุให้คนนอกฟัง = บอกเขาว่าเครือข่ายข้างในมีอะไรอยู่บ้าง */
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * พิกัดออฟฟิศ
 *
 * ★★ อ่านจาก app_settings ก่อน แล้วค่อยถอยไปใช้ env
 *    ★ ค่าที่ admin ตั้งจากหน้าเว็บคือค่าที่ "คนในออฟฟิศเป็นคนบอก" และ
 *      เปลี่ยนแล้วระบบคิดระยะทุกร้านใหม่ให้ทันที
 *      ★★ env เป็นค่าตั้งต้นสำหรับระบบที่เพิ่งติดตั้ง ยังไม่มีใครตั้งค่า
 *         — ไม่ใช่แหล่งความจริงที่สอง
 */
async function loadOffice(): Promise<{ lat: number; lng: number } | null> {
  const admin = getSupabaseAdminClient()
  const { data } = await admin
    .from('app_settings')
    .select('value')
    .eq('key', 'office_latlng')
    .maybeSingle()

  const v = data?.value as { lat?: number; lng?: number } | null
  if (v && typeof v.lat === 'number' && typeof v.lng === 'number') {
    return { lat: v.lat, lng: v.lng }
  }

  const lat = Number(process.env.OFFICE_LAT)
  const lng = Number(process.env.OFFICE_LNG)
  if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng }

  return null
}
