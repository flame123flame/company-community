'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { signOutCompletely } from '@/lib/auth/session'
import { useT } from '@/lib/i18n/client'
import { cn } from '@/lib/cn'

/**
 * เมนูบัญชีบนแถบบน — บอกว่าใครล็อกอินอยู่ และเป็นทางออกจากระบบ
 *
 * ★★★ ก่อนหน้านี้ไม่มีปุ่มออกจากระบบในโมดูลออฟฟิศเลยแม้แต่ที่เดียว
 *
 *     ★ มีแต่ในกล่องโปรไฟล์ของห้องเพลง ซึ่งเข้าถึงได้จากหน้าห้องเพลงเท่านั้น
 *       ★★ คนที่เข้ามาทำงานในโมดูลออฟฟิศจึงไม่มีทางออกจากบัญชีตัวเองได้
 *          นอกจากล้างข้อมูลเบราว์เซอร์ทิ้ง
 *     ★ สำคัญเป็นพิเศษกับเครื่องที่ใช้ร่วมกันในออฟฟิศ — คนถัดไปที่มานั่ง
 *       จะกลายเป็นคนก่อนหน้าทันที และระบบนี้มีเรื่องเงินอยู่ด้วย
 *
 * ★★ ชื่อผู้ใช้ต้องเห็นทุกขนาดจอ ไม่ซ่อนบนมือถือ
 *    ★ ของเดิมใส่ `hidden sm:block` ★★ แปลว่าบนมือถือไม่มีอะไรบอกเลยว่า
 *      กำลังใช้ในนามใคร ซึ่งเป็นข้อมูลที่ต้องตรวจก่อนกดอะไรที่เกี่ยวกับเงิน
 *    ★ บนจอแคบเหลือแค่วงกลมตัวอักษรแรก — ยังกดเข้าไปอ่านชื่อเต็มได้
 */
export function UserMenu({
  displayName,
  isAdmin,
  avatarUrl = null,
  profileHref = '/office/profile',
}: {
  displayName: string
  isAdmin: boolean
  /** ★ รูปเดียวกับที่ตั้งในหน้าโปรไฟล์ — ถ้าไม่มีใช้ตัวอักษรแรกแทน */
  avatarUrl?: string | null
  profileHref?: string
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const boxRef = useRef<HTMLDivElement | null>(null)

  /*
   * ★ ปิดเมื่อคลิกที่อื่นหรือกด Escape
   *   ★★ เมนูที่ปิดไม่ได้นอกจากกดปุ่มเดิมซ้ำคือเมนูที่ค้างอยู่บนจอ
   *      ตอนคนเลื่อนหน้าไปทำอย่างอื่นแล้ว
   */
  useEffect(() => {
    if (!open) return

    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const initial = displayName.trim().charAt(0) || '?'

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t('menu.open')}
        className={cn(
          'flex items-center gap-2 rounded-full py-1 pe-1 ps-1 transition-colors sm:pe-3',
          open ? 'bg-surface' : 'hover:bg-surface',
        )}
      >
        {/* ★★ ถ้าตั้งรูปไว้แล้วต้องเห็นที่นี่ด้วย
            ★ ไม่งั้นหน้าโปรไฟล์โชว์รูป แต่แถบบนยังเป็นตัวอักษร —
              คนจะคิดว่าอัปไม่ติด ทั้งที่ติดแล้ว */}
        {avatarUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={avatarUrl}
            alt=""
            className="size-8 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="grid size-8 shrink-0 place-items-center rounded-full bg-accent text-sm font-bold text-accent-ink"
          >
            <span dir="auto">{initial}</span>
          </span>
        )}

        {/* ★ ชื่อซ่อนเฉพาะจอแคบมาก แต่วงกลมตัวอักษรยังอยู่เสมอ */}
        <span className="hidden max-w-36 truncate text-sm text-ink-soft sm:block">
          <span dir="auto">{displayName}</span>
          {isAdmin ? <span className="ms-1 text-accent">·&nbsp;Admin</span> : null}
        </span>
      </button>

      {open ? (
        <div
          role="menu"
          className={cn(
            'absolute end-0 z-50 mt-2 w-60 overflow-hidden rounded-2xl border border-line',
            'bg-elevated shadow-xl',
          )}
        >
          {/*
            * ★★ บอกชื่อเต็มในเมนูด้วย ไม่ใช่แค่บนปุ่ม
            *    ★ ปุ่มตัดชื่อยาวด้วย truncate และบนมือถือไม่โชว์ชื่อเลย
            *      ★★ ที่นี่คือที่เดียวที่อ่านชื่อเต็มได้ทุกขนาดจอ
            */}
          <div className="border-b border-line px-4 py-3">
            <p className="text-[11px] text-ink-faint">{t('menu.signedInAs')}</p>
            <p className="mt-0.5 truncate text-sm font-medium text-ink">
              <span dir="auto">{displayName}</span>
              {isAdmin ? <span className="ms-1 text-accent">·&nbsp;Admin</span> : null}
            </p>
          </div>

          {/*
            * ★★ ทางเข้าหน้าผู้ดูแลระบบอยู่ในเมนูด้วย ไม่ใช่แค่ปุ่มบนแถบ
            *    ★ ปุ่มบนแถบมีเฉพาะในโมดูลออฟฟิศ ★★ แต่เมนูนี้อยู่ทุกหน้า
            *       รวมหน้าแรก — Admin จึงไม่ต้องกลับไปหน้ารวมก่อนทุกครั้ง
            */}
          {isAdmin ? (
            <Link
              href="/office/admin/users"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 border-b border-line px-4 py-3 text-sm font-medium text-accent transition-colors hover:bg-accent/10"
            >
              <svg
                viewBox="0 0 24 24"
                className="size-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6zM9.5 12l2 2 3.5-3.5" />
              </svg>
              {t('menu.admin')}
            </Link>
          ) : null}

          <Link
            href={profileHref}
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-4 py-3 text-sm text-ink transition-colors hover:bg-surface"
          >
            <svg
              viewBox="0 0 24 24"
              className="size-4 text-ink-soft"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 8a7 7 0 0 1 14 0" />
            </svg>
            {t('menu.profile')}
          </Link>

          <button
            type="button"
            role="menuitem"
            disabled={busy}
            onClick={() => {
              setBusy(true)
              /*
               * ★★ รีโหลดทั้งหน้าหลังออก ไม่ใช่ router.push
               *    ★ หน้าออฟฟิศเป็น Server Component ที่อ่าน session ตอนเรนเดอร์
               *      ★★ การเปลี่ยนหน้าฝั่ง client จะได้ HTML ที่เซิร์ฟเวอร์
               *         เรนเดอร์ไว้ตอนยังล็อกอินอยู่ — เหมือนยังไม่ได้ออก
               */
              void signOutCompletely().then(() => {
                window.location.href = '/'
              })
            }}
            className="flex w-full items-center gap-2.5 px-4 py-3 text-start text-sm text-danger transition-colors hover:bg-danger/10 disabled:opacity-50"
          >
            <svg
              viewBox="0 0 24 24"
              className="size-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M15 17v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v2M10 12h11m0 0-3-3m3 3-3 3" />
            </svg>
            {t('menu.signOut')}
          </button>
        </div>
      ) : null}
    </div>
  )
}
