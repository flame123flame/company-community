import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getOfficeViewer } from '@/lib/office/session'
import { HeaderActions } from '@/components/HeaderActions'
import { OfficeI18nProvider, type Ot } from '@/lib/i18n/office'
import { getOt } from '@/lib/i18n/office-server'
import { Logo } from '@/components/Logo'
import { getT } from '@/lib/i18n/server'
import { buildNav, type NavModule } from '@/lib/office/nav-data'
import { ModuleNav } from '@/components/nav/ModuleNav'

/**
 * โครงของทุกหน้าในระบบกิจกรรมออฟฟิศ (FR-X07)
 *
 * ★★★ อยู่ใต้ app/office/ ไม่ใช่ route group ที่ครอบ /
 *
 *     ถ้าใช้ route group แล้วเอา layout นี้ไปครอบหน้าแรก ห้องเพลงจะมีแถบเมนู
 *     ออฟฟิศโผล่ขึ้นมาด้วย — ซึ่งผิดข้อกำหนดที่ว่า "ของเดิมเหมือนเดิมทุกอย่าง"
 *
 *     ★ แยก path กันชัด ๆ ทำให้พิสูจน์ได้ง่ายว่าไม่ได้แตะของเดิม:
 *       / · /lobby · /room/* ไม่มีไฟล์ไหนในนี้เกี่ยวข้องเลยสักบรรทัด
 *
 * ★★ ด่านอยู่ที่ layout ไม่ใช่ที่แต่ละหน้า
 *    หน้าใหม่ที่เพิ่มทีหลังจะได้ด่านนี้ฟรีโดยไม่ต้องจำว่าต้องใส่
 *    ★ การให้แต่ละหน้าเช็คเองคือวิธีที่วันหนึ่งจะมีหน้าหนึ่งลืม แล้วไม่มีใครรู้
 */
export default async function OfficeLayout({ children }: LayoutProps<'/office'>) {
  const viewer = await getOfficeViewer()

  /*
   * ★★★ ภาษาของโมดูลออฟฟิศถูกหยิบที่นี่ที่เดียว แล้วส่งลงไปสองทาง
   *
   *     ★ `ot` ใช้แปลสิ่งที่ layout นี้เรนเดอร์เอง (แถบบน · จอบัญชีถูกระงับ)
   *     ★ `dict` ส่งลงไปให้ลูกที่เป็น client component ทาง provider
   *       ★★ ก้อนเดียวกันทั้งสองทาง — server จึงไม่มีทางเรนเดอร์ภาษาหนึ่ง
   *          แล้วส่งอีกภาษาลงไปให้ browser ซึ่งจะทำให้ hydration ไม่ตรงทั้งหน้า
   *
   *     ★ อยู่ที่ layout ไม่ใช่แต่ละหน้า — หน้าใหม่ที่เพิ่มทีหลังได้ภาษาฟรี
   *       เหตุผลเดียวกับที่ด่านตรวจสิทธิ์อยู่ที่ layout
   */
  const { ot, dict } = await getOt()
  const { t } = await getT()

  /*
   * ★ ยังไม่ได้เข้าระบบ → ส่งไปหน้าแรกของห้องเพลงซึ่งมีฟอร์มตั้งชื่อผู้ใช้อยู่แล้ว
   *   ไม่สร้างหน้า login ใหม่ เพราะตัวตนเป็นชุดเดียวกันทั้งสองระบบ
   */
  if (!viewer) redirect('/')

  if (viewer.accountStatus === 'SUSPENDED') {
    return <SuspendedScreen ot={ot} />
  }

  return (
    /*
     * ★★ ไม่มีแถบเมนูซ้ายและไม่มีแถบล่างแล้ว
     *
     *    ทุกหน้าเต็มความกว้าง เข้ามาจากพอร์ทัลหน้าแรก แล้วกลับด้วยปุ่ม
     *    "หน้ารวม" ที่หัวหน้า (ดู OfficePageChrome)
     *    ★ แถบเมนูตายตัวกิน 240px ตลอดเวลาเพื่อลิงก์ที่คนกดวันละอันเดียว
     *      และเป็นรูปทรงที่ทำให้ระบบดูเหมือนหลังบ้านมากกว่าเว็บที่คนอยากใช้
     *
     * ★ overflow-x-clip ให้แถบแสงกางเต็มจอได้โดยไม่เกิดแถบเลื่อนแนวนอน
     *   ★★ ใช้ clip ไม่ใช่ hidden เพราะ hidden จะทำให้ header ที่ sticky หลุด
     */
    <div className="flex min-h-dvh flex-col overflow-x-clip bg-page text-ink">
      <OfficeHeader
        ot={ot}
        isAdmin={viewer.isAdmin}
        displayName={viewer.displayName}
        userId={viewer.id}
        avatarUrl={viewer.avatarUrl}
        modules={buildNav(ot, t, viewer.isAdmin)}
      />

      {/* ★ ครอบแค่ children — แถบบนแปลเสร็จแล้วฝั่ง server ไม่ต้องใช้ context */}
      <main className="flex-1">
        <OfficeI18nProvider dict={dict}>{children}</OfficeI18nProvider>
      </main>
    </div>
  )
}

/**
 * แถบบน — รูปทรงเดียวกับหน้าแรกเป๊ะ
 *
 * ★★★ กลุ่มปุ่มขวามือมาจาก <HeaderActions /> ตัวเดียวกับที่หน้าแรกใช้
 *
 *     ★ เดิมไฟล์นี้เขียนกลุ่มปุ่มขึ้นเองต่างหาก แล้ว "ลืม" ใส่ปุ่มเปลี่ยนภาษา
 *       ★★ คนที่เปลี่ยนภาษาจากหน้าแรกแล้วกดเข้าหน้าในโมดูลออฟฟิศ จะหา
 *          ปุ่มเปลี่ยนภาษาไม่เจอเลย ต้องถอยออกมาหน้าแรกก่อน
 *          ★ ซึ่งผู้ใช้อ่านเป็น "ปุ่มหาย เว็บพัง" ไม่ใช่ "หน้านี้ไม่มีปุ่ม"
 *     ★ สองชุดที่ต้องเหมือนกันแต่แก้แยกกัน จะเพี้ยนอีกวันหนึ่งแน่นอน —
 *       ★★ รวมเป็นชุดเดียวคือวิธีเดียวที่ทำให้มันไม่หลุดซ้ำ
 */
function OfficeHeader({
  ot,
  isAdmin,
  displayName,
  userId,
  avatarUrl,
  modules,
}: {
  ot: Ot
  isAdmin: boolean
  displayName: string
  userId: string
  avatarUrl: string | null
  modules: NavModule[]
}) {
  return (
    <header className="app-header sticky top-0 z-50 flex h-(--spacing-header) items-center gap-2 px-3 sm:gap-3 sm:px-4">
      {/* ★ โลโก้กลับหน้ารวมของทั้งเว็บ ไม่ใช่หน้าแรกของโมดูล
          คนคาดหวังว่าโลโก้พากลับจุดเริ่มต้นเสมอ
          ★★ aria-label ชุดเดียวกับที่ AppHeader ใช้ ★ เดิมลิงก์นี้ไม่มีชื่อเลย
             — คนใช้ screen reader จะได้ยินแค่ "ลิงก์" แล้วไม่รู้ว่าพาไปไหน
             ★★ จับได้ตอนเทียบรายชื่อปุ่มในแถบบนของสองหน้าจากเบราว์เซอร์จริง */}
      <Link href="/" className="flex min-h-11 min-w-11 shrink-0 items-center gap-2" aria-label={ot('nav.home')}>
        {/* ★ จอแคบกว่า 400px เหลือแค่ตรามาร์ค — "AWA Plaza" + ปุ่ม 5 ปุ่มกว้างเกินจอ
             ★★ วัดได้: ที่ 375px โลโก้ตกเป็นสองบรรทัด · ที่ 320px รูปโปรไฟล์ถูกตัดไป 9px */}
        <Logo wordmarkFrom="400" />
      </Link>

      {/* ★ แถบเมนูโมดูล (จอกว้าง) — ทุกระบบอยู่บนแถบเดียว ชี้แล้วเห็นหน้าย่อย */}
      <div className="flex min-w-0 flex-1 justify-center">
        <ModuleNav modules={modules} label={ot('nav.modules')} />
      </div>

      <div className="ms-auto flex items-center gap-0.5 sm:gap-1">
        <HeaderActions
          userId={userId}
          displayName={displayName}
          avatarUrl={avatarUrl}
          isAdmin={isAdmin}
        />
      </div>
    </header>
  )
}

function SuspendedScreen({ ot }: { ot: Ot }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-page px-6 text-center">
      <div className="max-w-md">
        <h1 className="text-xl font-bold text-ink">{ot('account.suspended')}</h1>
        <p className="mt-2 text-sm text-ink-soft">{ot('account.suspendedBody')}</p>
        <Link
          href="/"
          className="mt-6 inline-flex h-11 sm:h-9 items-center rounded-full bg-surface px-4 text-sm font-medium text-ink hover:bg-surface-hover"
        >
          {ot('nav.music')}
        </Link>
      </div>
    </div>
  )
}
