import Link from 'next/link'
import { ChatMenu } from '@/components/office/ChatMenu'
import { NotificationBell } from '@/components/office/NotificationBell'
import { LanguageToggle } from '@/components/LanguageToggle'
import { ThemeToggle } from '@/components/ThemeToggle'
import { UserMenu } from '@/components/UserMenu'
import { OfficeI18nProvider } from '@/lib/i18n/office'
import { officeDictSubset } from '@/lib/i18n/office-dict'
import { getLocale } from '@/lib/i18n/server'
import { getOt } from '@/lib/i18n/office-server'
import { getT } from '@/lib/i18n/server'
import { buildNav } from '@/lib/office/nav-data'
import { AppLauncher } from '@/components/nav/AppLauncher'

/**
 * กลุ่มปุ่มขวามือของแถบบน — ชุดเดียวใช้ทุกหน้า
 *
 * ★★★ เคยมีสองชุดที่ไม่เหมือนกัน แล้วไม่มีใครรู้จนผู้ใช้ทัก
 *
 *     ★ หน้าแรกใช้ AppHeader ซึ่งมีปุ่มเปลี่ยนภาษา
 *       ★★ แต่หน้าในโมดูลออฟฟิศใช้ OfficeHeader ที่เขียนขึ้นใหม่ต่างหาก
 *          และ "ลืม" ใส่ปุ่มเปลี่ยนภาษาไป
 *     ★ ผลคือคนที่เปลี่ยนภาษาจากหน้าแรกแล้วกดเข้าหน้าใดหน้าหนึ่ง
 *       จะเปลี่ยนกลับไม่ได้เลย ต้องถอยออกมาหน้าแรกก่อน
 *       ★★ ซึ่งอ่านเป็น "ปุ่มหาย" ไม่ใช่ "หน้านี้ไม่มีปุ่ม" — คนจะคิดว่าพัง
 *
 *     ★★ รวมเป็นคอมโพเนนต์เดียวแล้ว การเพิ่มปุ่มใหม่วันหลังจะขึ้นทั้งสองที่
 *        พร้อมกันโดยไม่ต้องจำ ★ ซึ่งเป็นวิธีเดียวที่ทำให้มันไม่หลุดอีก
 *
 * ★ เป็น server component — หยิบภาษาและดิกชันนารีเองได้ ไม่ต้องให้ผู้เรียกส่งมา
 *   ★★ ผู้เรียกจึงเขียนแค่ <HeaderActions me={…} /> แล้วได้ครบทุกปุ่ม
 */
export async function HeaderActions({
  userId,
  displayName,
  avatarUrl,
  isAdmin,
}: {
  userId: string
  displayName: string
  avatarUrl: string | null
  isAdmin: boolean
}) {
  const locale = await getLocale()
  const { ot } = await getOt()
  const { t } = await getT()
  /* ★ เมนูรวมทุกระบบ — แปลฝั่ง server แล้วส่งเป็นข้อความ (ดู lib/office/nav-data) */
  const modules = buildNav(ot, t, isAdmin)

  /*
   * ★★ ส่งเฉพาะกุญแจที่ปุ่มพวกนี้ใช้ ไม่ใช่ดิกชันนารีออฟฟิศทั้ง 779 กุญแจ
   *    ★ วัดไว้แล้วตอนทำหน้าแรก: ก้อนเต็มทำให้ HTML โตขึ้น 34,726 ไบต์
   *      ซึ่งทุกคนต้องโหลดทุกครั้งที่เปิดหน้าไหนก็ได้
   */
  const dict = officeDictSubset(locale, ['notify.', 'time.', 'top.', 'common.', 'chat.', 'nav.', 'wallet.tone.'])

  return (
    <OfficeI18nProvider dict={dict}>
      {/*
        * ★★ "แท่นปุ่ม" แก้วฝ้า — รวมปุ่มขวามือเป็นแคปซูลเดียว มีเส้นคั่นเป็นกลุ่ม
        *    (เมนูทุกระบบ | แชท · แจ้งเตือน | ภาษา · โทนสี | บัญชี)
        *    ★ จอแคบกว่า 640px ไม่มีแคปซูล — ทุกพิกเซลของแถบบนมือถือมีค่า
        */}
      <div className="hdr-dock flex items-center gap-0.5 sm:gap-1">
      <AppLauncher
        modules={modules}
        labels={{ open: ot('top.apps'), title: ot('top.appsTitle'), hint: ot('top.appsHint'), close: ot('common.close'), theme: ot('top.theme') }}
      />
      {/*
        * ★ ปุ่มผู้ดูแลระบบพาไปหน้าจัดการผู้ใช้ตรง ๆ ไม่ใช่แดชบอร์ด
        *   ★★ คนกดปุ่มนี้ส่วนใหญ่มาเพื่อจัดการคน ไม่ได้มาดูกราฟ
        */}
      <span aria-hidden="true" className="hdr-sep" />
      {isAdmin ? (
        <Link
          href="/office/admin/users"
          title={ot('nav.admin')}
          aria-label={ot('nav.admin')}
          style={{ '--hc': '88 86 214' } as React.CSSProperties}
          className="hdr-btn grid size-11 shrink-0 place-items-center rounded-full text-accent transition-colors hover:bg-accent/15 sm:size-9"
        >
          <svg
            viewBox="0 0 24 24"
            className="size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6zM9.5 12l2 2 3.5-3.5" />
          </svg>
        </Link>
      ) : null}

      <ChatMenu meId={userId} />
      <NotificationBell userId={userId} />
      <span aria-hidden="true" className="hdr-sep" />
      <LanguageToggle />
      {/* ★ จอแคบกว่า 360px ปุ่มเจ็ดปุ่มล้นจอ — ย้ายปุ่มโทนสีไปไว้ในเมนูทุกระบบแทน */}
      <div className="max-[359px]:hidden">
        <ThemeToggle />
      </div>
      {/*
        * ★ ชื่อผู้ใช้เป็นตัวยืนยันว่า "กำลังใช้ในนามใคร" ซึ่งสำคัญมากใน
        *   ระบบที่มีเรื่องเงิน — คนต้องเห็นได้ทันทีว่าไม่ได้สวมบัญชีคนอื่นอยู่
        */}
      <span aria-hidden="true" className="hdr-sep" />
      <UserMenu displayName={displayName} isAdmin={isAdmin} avatarUrl={avatarUrl} />
      </div>
    </OfficeI18nProvider>
  )
}
