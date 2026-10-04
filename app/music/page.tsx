import type { Metadata } from 'next'
import { AppHeader } from '@/components/AppHeader'
import { HeaderActions } from '@/components/HeaderActions'
import { getOfficeViewer } from '@/lib/office/session'
import { CreateRoomButton } from '@/components/home/CreateRoomButton'
import { JoinRoomForm } from '@/components/home/JoinRoomForm'
import { SetupNotice } from '@/components/home/SetupNotice'
import { RoomList } from '@/components/home/RoomList'
import { getHomeStats } from '@/lib/home/stats'
import { SignInScreen } from '@/components/SignInScreen'
import { getRegisteredUser } from '@/lib/supabase/server'
import { envStatus } from '@/lib/env'
import { getT } from '@/lib/i18n/server'
import { getOt } from '@/lib/i18n/office-server'
import { buildNav } from '@/lib/office/nav-data'
import { ModuleNav } from '@/components/nav/ModuleNav'
import { MusicGuide } from '@/components/music/MusicGuide'
import { splitList } from '@/lib/i18n/office-format'
import { Untranslated } from '@/lib/i18n/office'

/*
 * ★ absolute เพื่อไม่ให้ template เติมชื่อเว็บต่อท้ายอีกรอบ
 *   ★★ ของเดิมได้ "Frame Room · Frame Room" มาตลอดโดยไม่มีใครสังเกต
 *      เพราะชื่อหน้ากับชื่อเว็บเป็นคำเดียวกัน
 */
/* ★ ชื่อแบรนด์เปลี่ยนเป็น AWA Plaza แล้ว ไม่ชนกับชื่อหน้าอีก — ใช้ template ปกติ
     ได้ "ห้องฟังเพลง · AWA Plaza" ตามภาษาที่เลือก */
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT()
  return { title: t('hub.music') }
}

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
  /* ★ ล้มแล้วเป็น null — หน้าห้องเพลงต้องเปิดได้แม้โมดูลออฟฟิศมีปัญหา */
  const viewer = await getOfficeViewer().catch(() => null)
  if (!me) return <SignInScreen />

  const stats = await getHomeStats()
  const { t } = await getT()
  const { ot } = await getOt()

  const live = stats.listeners > 0

  return (
    <>
      {/*
        * ★★★ แถบบนหน้านี้เคยมีแค่โลโก้ · ภาษา · ธีม
        *
        *     ★ หน้าออฟฟิศมีแชท · แจ้งเตือน · เมนูบัญชีครบ แต่หน้าห้องเพลง
        *       ไม่มีเลย — คนที่เดินจากออฟฟิศมาที่นี่จะรู้สึกว่าของหายไป
        *       และกดแจ้งเตือนไม่ได้ทั้งที่ยังล็อกอินอยู่คนเดิม
        *     ★★ AppHeader มี prop `right` ไว้รับชุดนี้อยู่แล้วตั้งแต่แรก
        *        (คอมเมนต์ในไฟล์นั้นเขียนไว้ตรง ๆ ว่า "มีไว้ให้หน้าที่ล็อกอินแล้ว
        *        ส่ง HeaderActions เข้ามาเป็นชุดเดียว") — หน้านี้แค่ไม่เคยส่ง
        *
        * ★ viewer อาจเป็น null ถ้ายังไม่ได้ผูกรหัสพนักงาน — คนกลุ่มนั้นยังใช้
        *   ห้องเพลงได้ตามเดิม แค่ไม่มีปุ่มของโมดูลออฟฟิศ
        */}
      {/* ★ แถบโมดูลชุดเดียวกับหน้าแรกและออฟฟิศ — เดินจากห้องเพลงไปโมดูลอื่นได้ทันที */}
      <AppHeader
        center={<ModuleNav modules={buildNav(ot, t, viewer?.isAdmin ?? false)} label={ot('nav.modules')} />}
        actions={
          viewer ? (
            <HeaderActions
              userId={viewer.id}
              displayName={viewer.displayName}
              avatarUrl={viewer.avatarUrl}
              isAdmin={viewer.isAdmin}
            />
          ) : undefined
        }
      />

      {/* ── แถบหัว ───────────────────────────────────────────────── */}
      {/**
        * ★★ หัวหน้าเป็น "เวที" — แผ่นเสียงหมุนกับตัวเลขสด บอกว่าที่นี่มีชีวิต
        *    ★ ตัวเลขจริงสามช่อง (ห้อง · คนฟัง · ซิงก์) แทนสโลแกน
        *    ★ ภาพแผ่นเสียงซ่อนบนจอแคบ — มือถือต้องเห็นปุ่มสร้างห้องเร็วที่สุด
        */}
      <section className="music-hero mus-hero px-4 pb-10 pt-8 sm:pb-12 sm:pt-12">
        <div className="mx-auto grid w-full max-w-[1120px] items-center gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0">
            {/* ★ จุดแดงเต้นเฉพาะตอนมีคนฟังอยู่จริง — ไม่งั้นมันคือคำโกหก */}
            <span className="music-stat hero-in">
              {live ? <span className="music-live" aria-hidden="true" /> : null}
              <span>
                {live
                  ? t('rooms.summary', { rooms: stats.rooms, listeners: stats.listeners })
                  : t('rooms.summaryIdle', { rooms: stats.rooms })}
              </span>
            </span>
            <h1
              className="mus-title hero-in mt-4 text-[clamp(34px,7vw,64px)] font-black leading-[1.05] tracking-tight"
              style={{ '--d': '70ms' } as React.CSSProperties}
            >
              {t('hub.music')}
            </h1>
            <p
              className="hero-in mt-3 max-w-[520px] text-[15px] leading-relaxed text-ink-soft sm:text-base"
              style={{ '--d': '140ms' } as React.CSSProperties}
            >
              {t('hub.musicDetail')}
            </p>

            <dl
              className="hero-in mt-6 grid max-w-[520px] grid-cols-3 gap-2 sm:gap-3"
              style={{ '--d': '210ms' } as React.CSSProperties}
            >
              {(
                [
                  [String(stats.rooms), t('music.statRooms'), '255 0 51'],
                  [String(stats.listeners), t('music.statListeners'), '175 82 222'],
                  [t('music.statSyncV'), t('music.statSync'), '10 132 255'],
                ] as const
              ).map(([v, label, tint], i) => (
                <div
                  key={label}
                  className="mus-stat-tile min-w-0 rounded-2xl px-3 py-3 sm:px-4"
                  style={{ '--tint': tint, '--i': i } as React.CSSProperties}
                >
                  <dd className="truncate text-xl font-black tabular-nums text-ink sm:text-2xl">
                    {i === 2 ? <Untranslated>{v}</Untranslated> : v}
                  </dd>
                  <dt className="mt-0.5 truncate text-[11px] text-ink-soft sm:text-xs">
                    <Untranslated>{label}</Untranslated>
                  </dt>
                </div>
              ))}
            </dl>
          </div>

          <div aria-hidden="true" className="relative mx-auto hidden size-[300px] lg:block">
            <span className="mus-halo" />
            <div className="mus-vinyl absolute left-5 top-5 size-[260px]">
              <span className="mus-vinyl-label" />
            </div>
            <span className="mus-arm mus-arm-lg" />
            {(
              [
                ['♪', '-4%', '8%', '0s'],
                ['♫', '86%', '-2%', '0.8s'],
                ['♬', '90%', '74%', '1.6s'],
              ] as const
            ).map(([n, x, y, d]) => (
              <span key={n} className="mus-note absolute grid size-12 place-items-center rounded-2xl text-2xl font-black" style={{ left: x, top: y, '--dl': d } as React.CSSProperties}>
                {n}
              </span>
            ))}
          </div>
        </div>
      </section>

      <main className="mx-auto w-full max-w-[1120px] px-4 pt-7">
        <SetupNotice />

        {/* ★ คำอธิบายแบบเดียวกับทุกหน้าในออฟฟิศ — ยุบได้และจำไว้ในเครื่อง */}
        <div className="mb-7">
          <MusicGuide id="music" art="stage" />
        </div>

        {/* ── สองทางเข้า: เปิดห้องใหม่ / มีรหัสอยู่แล้ว ──────────── */}
        {/**
          * ★★★ วางคู่กันในแถวเดียว ไม่ใช่เรียงลงมาคั่นด้วยคำว่า "หรือ"
          *     สองอันนี้เป็นทางเลือกที่ "แทนกัน" — วางคู่กันบอกความจริงนั้นด้วยรูปทรง
          * ★ ช่องซ้ายกว้างกว่า — "เปิดห้องใหม่" คือสิ่งที่คนส่วนใหญ่มาทำ
          */}
        <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
          {/* ★ id="create" — ลิงก์เดิมจากที่อื่นยังเลื่อนมาที่นี่ได้ */}
          <section
            id="create"
            className="music-act music-act-primary mus-act reveal scroll-mt-20 overflow-hidden p-5 sm:p-7"
            style={{ '--tint': '255 0 51' } as React.CSSProperties}
          >
            <span aria-hidden="true" className="mus-act-glow" />
            <div className="relative flex items-start gap-3.5">
              <span aria-hidden="true" className="mus-act-icon grid size-12 shrink-0 place-items-center rounded-2xl">
                <svg viewBox="0 0 24 24" className="size-6" fill="currentColor">
                  <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z" />
                </svg>
              </span>
              <div className="min-w-0">
                <h2 className="text-xl font-black leading-tight">{t('home.create.title')}</h2>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">
                  {t('home.create.detail')}
                </p>
              </div>
            </div>
            <ul className="relative mt-4 flex flex-wrap gap-1.5">
              {splitList(t('music.createPerk')).map((perk) => (
                <li key={perk} className="mus-perk inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium">
                  <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="m5 12 5 5 9-10" />
                  </svg>
                  <Untranslated>{perk}</Untranslated>
                </li>
              ))}
            </ul>

            <div className="relative mt-5">
              <CreateRoomButton configured={supabaseOk} />
            </div>
          </section>

          <section
            className="music-act mus-act reveal overflow-hidden p-5 sm:p-6"
            style={{ '--tint': '10 132 255' } as React.CSSProperties}
          >
            <span aria-hidden="true" className="mus-act-glow" />
            <div className="relative flex items-start gap-3.5">
              <span aria-hidden="true" className="mus-act-icon grid size-12 shrink-0 place-items-center rounded-2xl font-mono text-xl font-black">
                #
              </span>
              <div className="min-w-0">
                <h2 className="text-xl font-black leading-tight">{t('home.join.title')}</h2>
                <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">
                  <Untranslated>{t('music.joinHint')}</Untranslated>
                </p>
              </div>
            </div>
            <div className="relative mt-5">
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
