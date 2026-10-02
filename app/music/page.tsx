import type { Metadata } from 'next'
import { AppHeader } from '@/components/AppHeader'
import { CreateRoomButton } from '@/components/home/CreateRoomButton'
import { JoinRoomForm } from '@/components/home/JoinRoomForm'
import { SetupNotice } from '@/components/home/SetupNotice'
import { RoomList } from '@/components/home/RoomList'
import { getHomeStats } from '@/lib/home/stats'
import { SignInScreen } from '@/components/SignInScreen'
import { getRegisteredUser } from '@/lib/supabase/server'
import { envStatus } from '@/lib/env'
import { getT } from '@/lib/i18n/server'

/*
 * ★ absolute เพื่อไม่ให้ template เติมชื่อเว็บต่อท้ายอีกรอบ
 *   ★★ ของเดิมได้ "Frame Room · Frame Room" มาตลอดโดยไม่มีใครสังเกต
 *      เพราะชื่อหน้ากับชื่อเว็บเป็นคำเดียวกัน
 */
export const metadata: Metadata = { title: { absolute: 'AWA ROOM' } }

/**
 * หน้าห้องฟังเพลง
 *
 * ★★★ เหลือแค่เรื่องห้องเพลงอย่างเดียว — เนื้อหาแนะนำตัวถูกตัดออกทั้งก้อน
 *
 *     ★ เดิมหน้านี้คือหน้าแรกของเว็บทั้งหน้า ย้ายมาทั้งดุ้นตอนทำพอร์ทัล:
 *       พาดหัวโฆษณา · วิธีใช้ 3 ขั้น · ตัวอย่างหน้าจอ · แถบลอบบี้ ·
 *       คำถามที่พบบ่อย · ปุ่มปิดท้าย
 *
 *     ★★ ของพวกนั้นเขียนไว้สำหรับคนที่ยังไม่รู้จักเว็บ แต่คนที่เดินมาถึง
 *        /music คือคนที่กดการ์ด "ห้องฟังเพลง" มาจากพอร์ทัลแล้ว —
 *        เขารู้อยู่แล้วว่ามาทำอะไร
 *        ★ ปล่อยไว้เท่ากับให้เขาเลื่อนผ่านของที่อ่านจบไปแล้วทุกครั้งที่เข้ามา
 *          กว่าจะถึงรายชื่อห้องซึ่งเป็นสิ่งเดียวที่เขามาดู
 *
 *     ★ เนื้อหาแนะนำตัวยังอยู่ครบที่หน้าแรก (/) ซึ่งเป็นที่ของมันจริง ๆ
 *
 * ★★ สามอย่างที่เหลือคือสามอย่างที่คนมาหน้านี้มาทำ:
 *    เปิดห้อง · เข้าห้องด้วยรหัส · เลือกจากห้องที่เปิดอยู่
 */
export default async function MusicHomePage() {
  // ตรวจฝั่ง server แล้วส่งผลลงไป — ปุ่มที่กดแล้วพังแน่ ๆ ไม่ควรกดได้ตั้งแต่แรก
  const { supabaseOk } = envStatus()

  /**
   * ★★★ ด่านจริงของ "ต้องสมัครก่อนใช้งาน" อยู่ตรงนี้
   *
   *     ตรวจก่อน render แปลว่า HTML ที่ส่งออกไปไม่มีเนื้อหาของแอปอยู่เลย
   *     สำหรับคนที่ยังไม่สมัคร — ไม่ใช่ซ่อนด้วย overlay ฝั่ง client
   *     ซึ่งข้อมูลยังอยู่ใน DOM ให้เปิด devtools อ่านได้
   *
   *     ★ คู่กับ requireUser() ที่ปฏิเสธทุก API ของคนที่ไม่มี username
   *       ทั้งหน้าเว็บและ API จึงพูดตรงกัน ไม่มีประตูหลังเหลือ
   */
  const me = await getRegisteredUser()
  if (!me) return <SignInScreen />

  const stats = await getHomeStats()
  const { t } = await getT()

  const live = stats.listeners > 0

  return (
    <>
      <AppHeader center={<span />} />

      {/* ── แถบหัว ───────────────────────────────────────────────── */}
      {/**
        * ★★ เตี้ยและกระชับ ไม่ใช่พาดหัวเต็มจอแบบหน้าขาย
        *
        *    ★ งานของมันคือบอกว่า "นี่คือหน้าห้องเพลง" แล้วหลีกทางให้ของจริง
        *      — ไม่ใช่ขายของให้คนที่ตัดสินใจเข้ามาแล้ว
        *    ★★ ตัวเลขสดทำให้หน้ารู้สึกมีชีวิตตั้งแต่บรรทัดแรก ซึ่งสโลแกนทำไม่ได้
        */}
      <section className="music-hero px-4 pb-8 pt-10 sm:pb-10 sm:pt-14">
        <div className="mx-auto w-full max-w-[1120px]">
          <h1 className="hero-in text-[clamp(26px,4.4vw,38px)] font-bold leading-tight tracking-tight">
            {t('hub.music')}
          </h1>
          <p
            className="hero-in mt-2 max-w-[520px] text-[14.5px] leading-relaxed text-ink-soft"
            style={{ '--d': '70ms' } as React.CSSProperties}
          >
            {t('hub.musicDetail')}
          </p>

          {/* ★ จุดแดงเต้นเฉพาะตอนมีคนฟังอยู่จริง — ถ้าไม่มีใครฟัง
              การเต้นจะกลายเป็นคำโกหกเล็ก ๆ ที่หน้านี้บอกทุกครั้งที่เปิด */}
          <div
            className="hero-in mt-5 flex flex-wrap items-center gap-2.5"
            style={{ '--d': '140ms' } as React.CSSProperties}
          >
            {/* ★★★ ประโยคเดียว ไม่ใช่ตัวเลขแยกกับคำ
                ★ เคยเขียนเป็น <b>{n}</b> แล้วตามด้วย common.listeners
                  ★★ แต่กุญแจนั้นมี {n} อยู่ในตัวแล้ว ผลคือ "1 1 คนกำลังฟัง"
                     เลขซ้ำสองครั้งทุกภาษา — เห็นตอนถ่ายจอ ไม่ใช่ตอนอ่านโค้ด
                ★ rooms.summary เป็นประโยคที่แปลครบ 16 ภาษาอยู่แล้ว และเป็น
                  ประโยคเดียวกับที่หัวรายชื่อห้องใช้ — ทั้งหน้าจึงพูดตรงกัน */}
            <span className="music-stat">
              {live ? <span className="music-live" aria-hidden="true" /> : null}
              <span>
                {live
                  ? t('rooms.summary', { rooms: stats.rooms, listeners: stats.listeners })
                  : t('rooms.summaryIdle', { rooms: stats.rooms })}
              </span>
            </span>
          </div>
        </div>
      </section>

      <main className="mx-auto w-full max-w-[1120px] px-4 pt-7">
        <SetupNotice />

        {/* ── สองทางเข้า: เปิดห้องใหม่ / มีรหัสอยู่แล้ว ──────────── */}
        {/**
          * ★★★ วางคู่กันในแถวเดียว ไม่ใช่เรียงลงมาคั่นด้วยคำว่า "หรือ"
          *
          *     ★ เรียงลงมาทำให้คนอ่านเป็นลำดับ: ทำอันบนก่อน แล้วค่อยอันล่าง
          *       ★★ แต่สองอันนี้เป็นทางเลือกที่ "แทนกัน" — เปิดห้องใหม่
          *          หรือเข้าห้องที่เพื่อนเปิดไว้ ไม่มีใครทำทั้งสองอย่าง
          *     ★ วางคู่กันบอกความจริงนั้นด้วยรูปทรง ไม่ต้องมีคำว่า "หรือ"
          *       มาอธิบาย และประหยัดความสูงไปหนึ่งหน้าจอบนมือถือ
          *
          * ★ ช่องซ้ายกว้างกว่า — "เปิดห้องใหม่" คือสิ่งที่คนส่วนใหญ่มาทำ
          *   ส่วนการพิมพ์รหัส 6 ตัวเป็นกรณีที่เพื่อนส่งรหัสมาให้ตรง ๆ เท่านั้น
          */}
        <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
          {/* ★ id="create" — ลิงก์เดิมจากที่อื่นยังเลื่อนมาที่นี่ได้
              scroll-mt เผื่อความสูงของแถบบนที่ติดอยู่ ไม่งั้นหัวข้อจะโดนบัง */}
          <section
            id="create"
            className="music-act music-act-primary reveal scroll-mt-20 p-5 sm:p-7"
          >
            <div className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className="grid size-11 shrink-0 place-items-center rounded-2xl border border-accent/35 bg-accent/12 text-accent"
              >
                <svg viewBox="0 0 24 24" className="size-5" fill="currentColor">
                  <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z" />
                </svg>
              </span>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold leading-tight">{t('home.create.title')}</h2>
                <p className="mt-1 text-xs leading-relaxed text-ink-soft">
                  {t('home.create.detail')}
                </p>
              </div>
            </div>

            <div className="mt-5">
              <CreateRoomButton configured={supabaseOk} />
            </div>
          </section>

          <section className="music-act reveal p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className="grid size-11 shrink-0 place-items-center rounded-2xl bg-surface font-mono text-base text-ink-soft"
              >
                #
              </span>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold leading-tight">{t('home.join.title')}</h2>
                <p className="mt-1 text-xs leading-relaxed text-ink-soft">
                  {t('home.join.codeLabel')}
                </p>
              </div>
            </div>
            <div className="mt-5">
              <JoinRoomForm />
            </div>
          </section>
        </div>

        {/**
          * ★ รายชื่อห้องอยู่ในคอลัมน์เดียวกับการ์ดด้านบนแล้ว
          *   ★★ เดิมมันหลุดออกไปอยู่คนละความกว้าง ทำให้ขอบซ้ายของหน้า
          *      ขยับตอนเลื่อนลง ซึ่งอ่านเป็น "คนละหน้า" ทั้งที่เป็นหน้าเดียวกัน
          */}
        <section id="rooms" className="scroll-mt-20 pt-10">
          <RoomList />
        </section>
      </main>

      <footer className="mx-auto w-full max-w-[1120px] px-4 pb-20 pt-16">
        {/**
         * ★ สองย่อหน้านี้ทำคนละหน้าที่ อย่ารวมกัน
         *
         *   ย่อหน้าบน = ประกาศความเป็นเจ้าของแบรนด์และงานของเรา
         *   ย่อหน้าล่าง = ปฏิเสธความเกี่ยวข้องกับ YouTube ซึ่งข้อกำหนดของ
         *                 YouTube API กำหนดให้ต้องชัดเจน
         *
         *   ★★ ย่อหน้าล่างตัดทิ้งไม่ได้แม้หน้าจะสั้นลง — มันเป็นเงื่อนไข
         *      ของ YouTube API ไม่ใช่ของประดับหน้าเว็บ
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
