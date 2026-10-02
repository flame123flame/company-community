import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

/**
 * Proxy = ชื่อใหม่ของ Middleware ตั้งแต่ Next.js 16 (ความสามารถเหมือนเดิม)
 *
 * หน้าที่เดียว: รีเฟรช session cookie ของ Supabase ให้ทุก request
 *
 * ทำไมจำเป็น: access token ของ Supabase อายุสั้น (ราว 1 ชม.) ถ้าไม่มีใครรีเฟรช
 * Server Component จะเห็นว่าผู้ใช้ logged out ทั้งที่ยังเปิดเว็บอยู่ ผู้ฟังจะหลุดออกจากห้อง
 * กลางเพลง — ซึ่งเป็นอาการที่ debug ยากมากถ้าไม่ได้วางตรงนี้ไว้ตั้งแต่แรก
 *
 * ★ ห้ามใช้ที่นี่ตัดสินใจเรื่องสิทธิ์ (authorization)
 *   Next.js ระบุชัดว่า Proxy ไม่ใช่ที่สำหรับ session management/authorization แบบเต็ม
 *   สิทธิ์จริงตรวจใน Route Handler + RLS เท่านั้น
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  /**
   * ★★★ ต้องรับชื่อคีย์ทั้งสองยุคเหมือน lib/env.ts
   *
   *     เดิมอ่านแต่ NEXT_PUBLIC_SUPABASE_ANON_KEY ซึ่งเป็นชื่อยุคเก่า
   *     project ที่สร้างใหม่ได้คีย์ชื่อ NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
   *     → ตัวแปรเป็น undefined → ฟังก์ชันนี้ return ตั้งแต่บรรทัดถัดไป
   *
   *     ★ อาการที่เกิด: ไม่มี error ให้เห็นเลยสักบรรทัด แต่ session
   *       ไม่เคยถูกรีเฟรช พอ access token หมดอายุ (~1 ชม.) Server Component
   *       จะเห็นว่าผู้ใช้ logged out ทั้งที่ยังเปิดเว็บค้างอยู่ —
   *       ซึ่งคืออาการที่คอมเมนต์ด้านบนของไฟล์นี้เตือนไว้เป๊ะ ๆ
   *
   *     ★★ เขียน process.env.X เต็ม ๆ ทั้งสองตัว ห้ามใช้ process.env[key]
   *        Next.js แทนค่า NEXT_PUBLIC_* ตอน build ด้วยการ match ข้อความตรง ๆ
   *        (เหตุผลเดียวกับที่ lib/env.ts อธิบายไว้)
   */
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

  // ยังไม่ได้ตั้งค่า env → ปล่อยผ่าน ไม่ทำให้ทั้งเว็บล่ม
  // (หน้าเว็บจะแสดง setup notice ให้เองว่าต้องตั้งค่าอะไรบ้าง)
  if (!url || !anonKey) return response

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value)
        }
        response = NextResponse.next({ request })
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options)
        }
      },
    },
  })

  // ★ ต้องเรียก getUser() ไม่ใช่ getSession()
  //   getUser() ไป verify JWT กับ Supabase จริง ๆ และเป็นตัวที่ trigger การรีเฟรช token
  //   getSession() แค่อ่าน cookie มาเฉย ๆ ซึ่งผู้ใช้ปลอมได้
  await supabase.auth.getUser()

  return response
}

export const config = {
  matcher: [
    /*
     * รันทุก path ยกเว้นไฟล์ static — ไม่มีประโยชน์ที่จะรีเฟรช session
     * ตอนโหลดรูปหรือ font และเปลืองเวลา request
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)',
  ],
}
