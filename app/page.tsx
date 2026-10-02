import type { Metadata } from 'next'
import { AppHeader } from '@/components/AppHeader'
import { HeaderActions } from '@/components/HeaderActions'
import { PortalHero } from '@/components/home/PortalHero'
import { SystemHub } from '@/components/home/SystemHub'
import { HubFeatures } from '@/components/home/HubFeatures'
import { SetupNotice } from '@/components/home/SetupNotice'
import { getHomeStats } from '@/lib/home/stats'
import { OfficeSummary, type HomeSummaryData } from '@/components/home/OfficeSummary'
import { getOt } from '@/lib/i18n/office-server'
import { getLocale } from '@/lib/i18n/server'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { SignInScreen } from '@/components/SignInScreen'
import { getRegisteredUser } from '@/lib/supabase/server'
import { viewerIsAdmin } from '@/lib/office/session'
import { getT } from '@/lib/i18n/server'

/**
 * หน้าแรก — พอร์ทัลของทั้งบริษัท
 *
 * ★★★ ห้องฟังเพลงเป็นหนึ่งในฟีเจอร์ ไม่ใช่ตัวเว็บ
 *
 *     หน้านี้เคยเป็นหน้าขายของห้องฟังเพลงทั้งหน้า ★ ซึ่งใช้ไม่ได้แล้ว
 *     เมื่อระบบมีอีกสี่โมดูล — คนที่เข้ามาเพื่อหารบิลจะอ่านพาดหัวเรื่องเพลง
 *     แล้วคิดว่ามาผิดที่
 *
 *     ★★ เนื้อหาเดิมทั้งก้อนย้ายไป /music ครบทุกชิ้นในลำดับเดิม
 *        ไม่ได้ตัดทิ้งอะไรเลย — กล่องเปิดห้อง · เข้าด้วยรหัส · รายชื่อห้อง ·
 *        วิธีใช้ · ตัวอย่าง · คำถามที่พบบ่อย ยังอยู่ครบ
 *
 * ★★★ ด่าน "ต้องสมัครก่อน" ยังอยู่ที่เดิมและยังเป็นด่านจริง
 *
 *     ตรวจก่อน render แปลว่า HTML ที่ส่งออกไปไม่มีเนื้อหาของแอปอยู่เลย
 *     สำหรับคนที่ยังไม่สมัคร — ไม่ใช่ซ่อนด้วย overlay ฝั่ง client
 *     ซึ่งข้อมูลยังอยู่ใน DOM ให้เปิด devtools อ่านได้
 */
export async function generateMetadata(): Promise<Metadata> {
  /* ★ ชื่อแท็บตามภาษาเหมือนหน้าอื่น — generateMetadata อ่าน cookie ได้ */
  const { t } = await getT()
  return { title: t('hub.title') }
}

export default async function HomePage() {
  const me = await getRegisteredUser()
  if (!me) return <SignInScreen />

  /*
   * ★ อ่านสิทธิ์ Admin แยกต่างหาก ไม่ไปเพิ่มคอลัมน์ใน getRegisteredUser
   *   ★★ ฟังก์ชันนั้นเป็นด่านเข้าของทั้งเว็บ และมีประวัติว่าเคยพังจนทุกคน
   *      ถูกเด้งออกพร้อมกันเพราะ select คอลัมน์ที่ยังไม่มี (ดูคอมเมนต์ในไฟล์นั้น)
   *   ★ query เล็ก ๆ ที่ล้มได้โดยไม่กระทบอะไรจึงปลอดภัยกว่า — ล้มแล้วแค่
   *     ไม่เห็นปุ่ม Admin ไม่ใช่เข้าเว็บไม่ได้
   */
  const isAdmin = await viewerIsAdmin(me.id)

  const stats = await getHomeStats()
  const { t } = await getT()

  /*
   * ★★ ห่อ try/catch เพราะ RPC นี้มาจาก migration 0036
   *
   *    บทเรียนเดิมของโปรเจกต์นี้: โค้ดที่อ่านของใหม่ก่อน migration ขึ้น
   *    ทำให้หน้าพังทั้งหน้า ★ หน้าแรกพังหมายถึงเข้าเว็บไม่ได้เลย
   *    ★ การ์ดสรุปหายไปเงียบ ๆ ดีกว่าหน้าขาว
   */
  const { ot } = await getOt()
  const locale = await getLocale()
  let summary: HomeSummaryData | null = null
  try {
    const { data } = await getSupabaseAdminClient().rpc('office_home_summary', {
      p_actor: me.id,
    })
    if (data && typeof data === 'object') {
      const d = data as Record<string, unknown>
      summary = {
        iOwe: Number(d.iOwe ?? 0),
        owedToMe: Number(d.owedToMe ?? 0),
        toConfirm: Number(d.toConfirm ?? 0),
        stale: Number(d.stale ?? 0),
        newListings: Number(d.newListings ?? 0),
        topRestaurant: typeof d.topRestaurant === 'string' ? d.topRestaurant : null,
        unread: Number(d.unread ?? 0),
        unreadChat: Number(d.unreadChat ?? 0),
      }
    }
  } catch {
    summary = null
  }

  return (
    <>
      {/* ★ แถบความคืบหน้าการเลื่อน — CSS ล้วนด้วย animation-timeline: scroll()
          ★★ ไม่มี scroll listener จึงไม่มีทางทำให้การเลื่อนกระตุก
             และเบราว์เซอร์ที่ไม่รองรับก็แค่ไม่เห็นแถบ ไม่พังอะไร */}
      <div className="scroll-progress" aria-hidden="true" />

      {/* ★ หน้าแรกก็ต้องบอกว่าใครล็อกอินอยู่ และออกจากระบบได้
          ★★ เดิมแถบบนมีแค่ภาษากับธีม — คนที่เข้ามาหน้านี้จึงไม่มีทางรู้ว่า
             ตัวเองเป็นใครอยู่ และไม่มีทางออก */}
      <AppHeader
        center={<span />}
        /*
         * ★★★ ชุดเดียวกับที่แถบบนของ /office ใช้ — ไม่ใช่ชุดที่หน้านี้ประกอบเอง
         *
         *     ★ เดิมหน้านี้วางกระดิ่งกับเมนูผู้ใช้เอง แล้วแถบบนของออฟฟิศ
         *       วางของตัวเองอีกชุด ★★ ผลคือสองชุดนั้นเพี้ยนจากกัน —
         *       หน้าในออฟฟิศไม่มีปุ่มเปลี่ยนภาษาเลย ซึ่งผู้ใช้ทักมาเอง
         *     ★ ตอนนี้ลำดับปุ่มและรายการปุ่มถูกตัดสินใน HeaderActions ที่เดียว
         *       ★★ ปุ่มใหม่ที่เพิ่มวันหลังจะขึ้นทั้งสองที่พร้อมกันโดยไม่ต้องจำ
         */
        actions={
          <HeaderActions
            userId={me.id}
            displayName={me.displayName}
            avatarUrl={me.avatarUrl}
            isAdmin={isAdmin}
          />
        }
      />

      <PortalHero stats={stats} />

      <main className="mx-auto w-full max-w-[1120px] px-4">
        <SetupNotice />
      </main>

      {/* ★★ ตัวเลขของฉันมาก่อนการ์ดเมนู
          ★ คนที่เปิดหน้านี้ทุกเช้าไม่ได้มาหาเมนู เขามาดูว่ามีอะไรค้างอยู่ไหม
            ★★ การ์ดเมนูอยู่ที่เดิมทุกวัน ส่วนตัวเลขเปลี่ยนทุกวัน —
               ของที่เปลี่ยนควรอยู่บนของที่ไม่เปลี่ยน */}
      {summary ? <OfficeSummary ot={ot} locale={locale} data={summary} /> : null}

      {/* ★ id="systems" — ปุ่มหลักบนหัวหน้าเลื่อนมาที่นี่ */}
      <SystemHub />

      {/* ★ เนื้อหาอธิบายความสามารถอยู่ "ใต้" การ์ด ไม่ใช่เหนือ
          ★★ คนที่เคยใช้แล้วกลับมาคือคนส่วนใหญ่ของหน้านี้ เขาต้องเจอทางเข้า
             ก่อน ส่วนคนใหม่เลื่อนลงอ่านต่อได้ ซึ่งเป็นสิ่งที่คนใหม่ทำอยู่แล้ว */}
      <HubFeatures />

      <footer className="mx-auto w-full max-w-[680px] px-4 pb-20 pt-16">
        {/**
         * ★ สองย่อหน้านี้ทำคนละหน้าที่ อย่ารวมกัน
         *
         *   ย่อหน้าบน = ประกาศความเป็นเจ้าของแบรนด์และงานของเรา
         *   ย่อหน้าล่าง = ปฏิเสธความเกี่ยวข้องกับ YouTube ซึ่งข้อกำหนดของ
         *                 YouTube API กำหนดให้ต้องชัดเจน
         *
         *   ★ ยังต้องมีในหน้านี้แม้เนื้อหาเรื่องเพลงจะย้ายไป /music แล้ว
         *     เพราะการ์ดห้องฟังเพลงบนหน้านี้ก็พาไปหาเนื้อหาที่ใช้ YouTube
         */}
        <p className="text-center text-[11px] leading-relaxed text-ink-faint">
          {t('footer.rights', { year: new Date().getFullYear() })}
          <br />
          {t('footer.owner')}
        </p>

        <p className="mt-3 text-center text-[11px] leading-relaxed text-ink-faint">
          {t('footer.youtube1')}
          <br />
          {t('footer.youtube2')}
          <br />
          {t('footer.youtube3')}
        </p>
      </footer>
    </>
  )
}
