import Link from 'next/link'
import { cn } from '@/lib/cn'
import { getT } from '@/lib/i18n/server'
import type { DictKey } from '@/lib/i18n/dict'

/* ★ ทุกข้อเป็นของที่มีจริงในระบบ — ห้ามใส่คำโฆษณาที่เข้าไปแล้วหาไม่เจอ */
const PERKS: { n: 1 | 2 | 3 | 4 | 5 | 6; emoji: string }[] = [
  { n: 1, emoji: '📱' },
  { n: 2, emoji: '🌐' },
  { n: 3, emoji: '🌗' },
  { n: 4, emoji: '🔔' },
  { n: 5, emoji: '🔐' },
  { n: 6, emoji: '🎲' },
]

/**
 * ส่วนปิดท้ายหน้าแรก — ใช้ได้ทุกที่ · เริ่มใน 3 ขั้น · ปุ่มเริ่มเลย
 *
 * ★ แทน HubFeatures เดิม — แถวฟีเจอร์รายโมดูลย้ายไปเป็นแค็ตตาล็อกเต็ม
 *   (FeatureCatalog) ซึ่งบอกครบทุกฟังก์ชันและกดเข้าได้ทุกข้อ
 */
export async function HomeOutro() {
  const { t } = await getT()

  return (
    <div className="mx-auto w-full max-w-[1120px] px-4">
      {/* ── ใช้ได้ทุกที่ ปลอดภัยทุกเรื่อง ── */}
      <h3 className="text-lg font-bold text-ink">{t('home.perks.title')}</h3>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {PERKS.map((p) => (
          <li key={p.n} className="home-perk flex items-start gap-3.5 rounded-3xl p-5">
            <span aria-hidden="true" className="grid size-12 shrink-0 place-items-center rounded-2xl bg-surface text-2xl">
              {p.emoji}
            </span>
            <span className="min-w-0">
              <span className="block text-[15px] font-bold text-ink">{t(`home.perk.${p.n}.t` as DictKey)}</span>
              <span className="mt-0.5 block text-[13px] leading-relaxed text-ink-soft">{t(`home.perk.${p.n}.d` as DictKey)}</span>
            </span>
          </li>
        ))}
      </ul>

      {/* ── เริ่มใน 3 ขั้น ── */}
      <h3 className="mt-12 text-lg font-bold text-ink">{t('steps.title')}</h3>
      <ol className="mt-4 grid gap-3 sm:grid-cols-3">
        {(['steps.1', 'steps.2', 'steps.3'] as DictKey[]).map((key, index) => (
          <li key={key} className="home-step relative overflow-hidden rounded-3xl p-5">
            <span aria-hidden="true" className="room-step-num grid size-10 place-items-center rounded-2xl text-base font-black">
              {index + 1}
            </span>
            <p className="mt-3 text-[15px] font-semibold leading-relaxed text-ink">{t(key)}</p>
            {index < 2 ? (
              <svg viewBox="0 0 24 24" className="absolute end-4 top-1/2 hidden size-5 -translate-y-1/2 text-ink-faint sm:block rtl:-scale-x-100" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m9 6 6 6-6 6" />
              </svg>
            ) : null}
          </li>
        ))}
      </ol>

      {/* ── ปิดท้าย ── */}
      <div className="conic-ring relative mt-12 overflow-hidden rounded-[32px] border border-line bg-elevated/60 px-6 py-14 text-center backdrop-blur-md sm:py-16">
        <div className="aurora-field" aria-hidden="true">
          <div className="aurora-blob aurora-blob-1" />
          <div className="aurora-blob aurora-blob-3" />
        </div>
        <div className="relative">
          <h3 className="text-[28px] font-black leading-tight tracking-tight text-ink sm:text-[40px]">{t('hubcta.title')}</h3>
          <Link
            /* ★ เลื่อนขึ้นไปที่การ์ดเข้าใช้งานด่วนบนหน้าเดียวกัน */
            href="#systems"
            className={cn(
              'pulse-ring mt-7 inline-flex h-12 items-center gap-2 rounded-full bg-accent px-8',
              'font-medium text-accent-ink transition-all',
              'hover:bg-accent-hover hover:shadow-[0_8px_30px_-8px] hover:shadow-accent/60',
              'active:scale-[0.98]',
            )}
          >
            {t('hubcta.button')}
            <svg viewBox="0 0 24 24" className="size-4 rtl:-scale-x-100" fill="currentColor" aria-hidden="true">
              <path d="M12 4l-1.4 1.4L16.2 11H4v2h12.2l-5.6 5.6L12 20l8-8z" />
            </svg>
          </Link>
        </div>
      </div>
    </div>
  )
}
