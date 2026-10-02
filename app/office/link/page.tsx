import { redirect } from 'next/navigation'
import Link from 'next/link'
import type { CSSProperties } from 'react'
import type { Metadata } from 'next'
import { getOfficeViewer } from '@/lib/office/session'
import { LinkCodeForm } from '@/components/office/LinkCodeForm'
import { cn } from '@/lib/cn'
import { type OfficeKey } from '@/lib/i18n/office'
import { getOt } from '@/lib/i18n/office-server'

/* ★ ชื่อแท็บก็ต้องตามภาษา — generateMetadata อ่าน cookie ได้เหมือน component */
export async function generateMetadata(): Promise<Metadata> {
  const { ot } = await getOt()
  return { title: ot('link.title') }
}

/**
 * หน้าผูกรหัสพนักงาน (FR-X02)
 *
 * ★★★ หน้านี้คือ "ประตูบานแรก" ของระบบออฟฟิศ
 *
 *     ทุกคนในบริษัทจะเห็นหน้านี้หนึ่งครั้งในชีวิต และเป็นครั้งแรกที่เขาตัดสินว่า
 *     ระบบนี้น่าใช้หรือเป็นภาระ ★ ฟอร์มลอยอยู่กลางหน้าว่าง ๆ อ่านว่า
 *     "กรอกข้อมูลให้ฝ่ายไอที" ส่วนหน้าที่บอกว่าจะได้อะไรอ่านว่า "เริ่มใช้กันเถอะ"
 *
 *     ★★ ฝั่งซ้ายจึงตอบคำถามที่คนถามจริง ๆ ตอนเห็นหน้านี้:
 *        ผูกแล้วได้อะไร · ของเดิมหายไหม · ไม่มีรหัสทำยังไง
 *
 * ★ คนที่ผูกแล้วเข้าหน้านี้ไม่ได้ — เด้งกลับหน้าแรกของออฟฟิศ
 *   ไม่ใช่เพื่อความปลอดภัย (RPC ปฏิเสธอยู่แล้วด้วย ALREADY_LINKED)
 *   แต่เพราะหน้าที่ทำอะไรไม่ได้เลยคือหน้าที่ไม่ควรมีอยู่ให้เห็น
 */
export default async function LinkCodePage() {
  const { ot } = await getOt()
  const viewer = await getOfficeViewer()
  if (!viewer) redirect('/')
  if (viewer.employeeCode) redirect('/')

  const perks: { key: OfficeKey; icon: string }[] = [
    { key: 'link.perk.food', icon: 'M7 3v8a3 3 0 0 0 3 3v7M7 3v5M10 3v5M17 3c-1.5 2-2 4-2 6s.5 3 2 3v9' },
    {
      key: 'link.perk.wallet',
      icon: 'M3 8a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v2M3 8v9a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-3M3 8h1m17 3h-4a2 2 0 0 0 0 4h4a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1z',
    },
    { key: 'link.perk.fun', icon: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 4v5l3 3' },
    { key: 'link.perk.market', icon: 'M4 7h16l-1 12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2zM9 7V5a3 3 0 0 1 6 0v2' },
  ]

  return (
    /* ★ แถบแสงเต็มจอเหมือนหัวหน้าอื่น ๆ — หน้านี้อยู่นอกกลุ่ม (member)
       จึงไม่มี OfficePageChrome มาให้ ต้องกางเอง */
    <div className="relative left-1/2 isolate w-screen -translate-x-1/2">
      <div className="aurora-field" aria-hidden="true">
        <div className="aurora-blob aurora-blob-1" />
        <div className="aurora-blob aurora-blob-2" />
        <div className="aurora-blob aurora-blob-3" />
      </div>

      <div className="relative mx-auto grid w-full max-w-[1040px] gap-8 px-4 pb-20 pt-10 sm:pt-16 lg:grid-cols-[1fr_minmax(0,420px)] lg:gap-12">
        {/* ── ซ้าย: ผูกแล้วได้อะไร ──────────────────────────────── */}
        <div>
          <p
            className={cn(
              'hero-in inline-flex items-center gap-2 rounded-full border border-line',
              'bg-page/60 px-3.5 py-1.5 text-xs text-ink-soft backdrop-blur-md',
            )}
          >
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-2 animate-ping rounded-full bg-live opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-live" />
            </span>
            {ot('link.badge')}
          </p>

          <h1 className="mt-5 text-[32px] font-bold leading-[1.12] tracking-tight sm:text-[46px]">
            <span className="curtain block [overflow-clip-margin:0.16em] [overflow:clip]">
              <span style={{ '--d': '120ms' } as CSSProperties}>
                {ot('link.h1a')}
                <span className="text-aurora">{ot('link.h1b')}</span>
              </span>
            </span>
            <span className="curtain block [overflow-clip-margin:0.16em] [overflow:clip]">
              <span style={{ '--d': '270ms' } as CSSProperties}>{ot('link.h1c')}</span>
            </span>
          </h1>

          <p
            className="hero-in mt-5 max-w-[520px] text-[15px] leading-relaxed text-ink-soft"
            style={{ '--d': '450ms' } as CSSProperties}
          >
            {ot('link.lead')}
          </p>

          {/* ★ คำถามแรกของทุกคนคือ "ของเดิมหายไหม" — ตอบก่อนถูกถาม */}
          <p
            className="hero-in mt-4 flex max-w-[520px] items-start gap-2.5 rounded-2xl border border-line bg-elevated/40 p-3.5 text-sm leading-relaxed text-ink-soft backdrop-blur-md"
            style={{ '--d': '560ms' } as CSSProperties}
          >
            <svg
              viewBox="0 0 24 24"
              className="mt-0.5 size-4 shrink-0 text-accent"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M12 2 4 5v6c0 4.5 3.4 8.7 8 9.9 4.6-1.2 8-5.4 8-9.9V5zm-1.2 13.2L7 11.4l1.4-1.4 2.4 2.4 4.8-4.8L17 9z" />
            </svg>
            {ot('link.keep')}
          </p>

          <p className="mt-8 text-sm font-medium text-ink">{ot('link.perkTitle')}</p>
          <ul className="hero-stagger mt-3 grid max-w-[520px] gap-2.5 sm:grid-cols-2">
            {perks.map((perk) => (
              <li
                key={perk.key}
                className="flex items-center gap-3 rounded-2xl border border-line bg-page/40 p-3 backdrop-blur-md"
              >
                <span
                  aria-hidden="true"
                  className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface text-ink"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="size-4.5"
                  >
                    <path d={perk.icon} />
                  </svg>
                </span>
                <span className="text-xs leading-relaxed text-ink-soft">{ot(perk.key)}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* ── ขวา: ฟอร์ม ───────────────────────────────────────── */}
        <div className="lg:pt-14">
          <div
            className={cn(
              'glow-border relative rounded-3xl border border-line bg-elevated/70 p-5 sm:p-6',
              'backdrop-blur-xl shadow-[0_24px_60px_-30px] shadow-black/60',
            )}
          >
            <LinkCodeForm
              defaultDisplayName={viewer.displayName}
              defaultNickname={viewer.nickname}
              defaultDepartment={viewer.department}
            />

            <p className="mt-4 flex items-start gap-2 text-[11px] leading-relaxed text-ink-faint">
              <svg
                viewBox="0 0 24 24"
                className="mt-px size-3.5 shrink-0"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M17 9V7a5 5 0 0 0-10 0v2H5v12h14V9zM9 7a3 3 0 0 1 6 0v2H9z" />
              </svg>
              {ot('link.safe')}
            </p>
          </div>

          {/* ★ ทางออกสำหรับคนที่ยังไม่มีรหัส — ไม่งั้นหน้านี้กลายเป็นทางตัน
              คนที่ไม่มีรหัสยังใช้ห้องฟังเพลงได้เหมือนเดิมทุกอย่าง */}
          <p className="mt-5 text-center text-xs text-ink-faint">{ot('link.noCode')}</p>
          <div className="mt-2 text-center">
            <Link
              href="/music"
              className="inline-flex h-10 items-center gap-2 rounded-full border border-line bg-page/50 px-5 text-sm text-ink-soft backdrop-blur-md transition-colors hover:border-line-strong hover:text-ink"
            >
              <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden="true">
                <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3z" />
              </svg>
              {ot('link.backMusic')}
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
