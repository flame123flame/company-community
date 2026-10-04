'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { signOutCompletely } from '@/lib/auth/session'
import { useT } from '@/lib/i18n/client'
import { useConfirm } from '@/components/ConfirmProvider'
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
  const confirm = useConfirm()
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
          'hdr-user flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full py-1 pe-1 ps-1 transition-colors sm:min-h-0 sm:min-w-0 sm:pe-2.5',
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
            className="hdr-ava size-8 shrink-0 rounded-full object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="hdr-ava grid size-8 shrink-0 place-items-center rounded-full bg-accent text-sm font-bold text-accent-ink"
          >
            <span dir="auto">{initial}</span>
          </span>
        )}

        {/* ★ ชื่อซ่อนเฉพาะจอแคบมาก แต่วงกลมตัวอักษรยังอยู่เสมอ */}
        <span className="hidden max-w-36 truncate text-sm text-ink-soft sm:block">
          <span dir="auto">{displayName}</span>
          {isAdmin ? <span className="ms-1 text-accent">·&nbsp;Admin</span> : null}
        </span>
        <svg viewBox="0 0 24 24" className={cn('hidden size-3.5 shrink-0 text-ink-faint transition-transform sm:block', open && 'rotate-180')} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open ? (
        <div
          role="menu"
          className={cn(
            'absolute end-0 z-50 mt-2 w-[min(calc(100vw-24px),320px)] overflow-hidden',
            /* ★ มือถือ: ลอยเต็มความกว้างใต้แถบหัว เหมือนเมนูภาษา/โทนสี */
            'max-sm:fixed max-sm:left-3 max-sm:right-3 max-sm:top-[calc(var(--spacing-header)+8px)] max-sm:mt-0 max-sm:w-auto',
            'pop-wow rounded-[26px]',
          )}
          style={{ '--pc': '255 0 51', '--pc2': '10 132 255' } as React.CSSProperties}
        >
          {/*
            * ★★ บอกชื่อเต็มในเมนูด้วย ไม่ใช่แค่บนปุ่ม — ปุ่มตัดชื่อยาว และบนมือถือไม่โชว์ชื่อเลย
            *    ที่นี่คือที่เดียวที่อ่านชื่อเต็มได้ทุกขนาดจอ
            */}
          <div className="pop-hero relative overflow-hidden px-4 pb-4 pt-4">
            <span aria-hidden="true" className="pop-blob pop-blob-a" />
            <span aria-hidden="true" className="pop-blob pop-blob-b" />
            <div className="relative flex items-center gap-3">
              {avatarUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={avatarUrl} alt="" className="size-14 shrink-0 rounded-full object-cover ring-[3px] ring-[var(--ck-shine)]" />
              ) : (
                <span aria-hidden="true" className="grid size-14 shrink-0 place-items-center rounded-full bg-[var(--ck-shine)] text-2xl font-black text-accent">
                  <span dir="auto">{initial}</span>
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-medium text-[color-mix(in_srgb,var(--ck-shine)_80%,transparent)]">{t('menu.signedInAs')}</p>
                <p dir="auto" className="truncate text-lg font-black leading-tight text-[var(--ck-shine)]">{displayName}</p>
                {isAdmin ? (
                  <span className="pop-pill mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold">🛡️ Admin</span>
                ) : null}
              </div>
            </div>
          </div>

          {/* ── ทางลัด: ของที่คนเปิดเมนูนี้มาหาบ่อยที่สุด ── */}
          <div className="grid grid-cols-2 gap-2 p-3">
            {(
              [
                [profileHref, '🪪', t('menu.profile')],
                ['/office/wallet/qr', '📱', t('menu.qr')],
                ['/office/wallet/owed', '💸', t('menu.owed')],
                ['/office/profile#prof-notify', '🔔', t('menu.notifySettings')],
              ] as const
            ).map(([href, emoji, label], i) => (
              <Link
                key={href}
                href={href}
                role="menuitem"
                onClick={() => setOpen(false)}
                style={{ '--i': i } as React.CSSProperties}
                className="user-tile flex min-h-[4.25rem] flex-col items-start justify-center gap-1 rounded-2xl px-3 py-2.5"
              >
                <span aria-hidden="true" className="text-xl leading-none">{emoji}</span>
                <span className="text-[12.5px] font-bold leading-tight text-ink">{label}</span>
              </Link>
            ))}
          </div>

          {/*
            * ★★ ทางเข้าหน้าผู้ดูแลระบบอยู่ในเมนูด้วย — เมนูนี้อยู่ทุกหน้า รวมหน้าแรก
            */}
          {isAdmin ? (
            <div className="px-3 pb-2">
              <Link
                href="/office/admin/users"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex min-h-11 items-center gap-2.5 rounded-2xl bg-accent/10 px-3.5 text-sm font-bold text-accent transition-colors hover:bg-accent/15"
              >
                <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6zM9.5 12l2 2 3.5-3.5" />
                </svg>
                {t('menu.admin')}
              </Link>
            </div>
          ) : null}

          <div className="border-t border-line p-2.5">
          <button
            type="button"
            role="menuitem"
            disabled={busy}
            onClick={async () => {
              /* ★ ถามก่อนด้วยกล่อง "ยื้อ" — ปิดเมนูก่อนเพื่อไม่ให้ซ้อนกันสองชั้น */
              setOpen(false)
              if (!(await confirm({ kind: 'logout' }))) return
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
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl text-sm font-bold text-danger transition-colors hover:bg-danger/10 disabled:opacity-50"
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
        </div>
      ) : null}
    </div>
  )
}
