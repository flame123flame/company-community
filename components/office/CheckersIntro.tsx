'use client'

import { cn } from '@/lib/cn'
import { Untranslated } from '@/lib/i18n/office'
import { B_KING, B_MAN, EMPTY, SIZE, W_MAN, isDark, type Cell } from '@/lib/games/checkers'

/**
 * กระดานจิ๋วประดับหน้าเลือกโหมด
 *
 * ★★★ ไม่ใช่ของประดับเปล่า ๆ — มันบอกว่า "เกมนี้หน้าตาแบบนี้"
 *
 *     ★ หน้าเลือกโหมดเดิมเป็นปุ่มสามปุ่มลอยอยู่บนที่ว่าง คนที่ไม่เคยเล่น
 *       ไม่มีทางรู้ว่ากำลังจะเจออะไร
 *       ★★ ภาพกระดานตอบคำถามนั้นก่อนกด ซึ่งถูกกว่าการให้กดเข้าไปดูแล้วกดออก
 *
 * ★★ วาดด้วย grid ของ CSS ไม่ใช่รูป — ใช้ theme token ตัวเดียวกับกระดานจริง
 *    จึงเปลี่ยนตามโหมดสว่าง/มืดเองโดยไม่ต้องมีไฟล์รูปสองชุด
 */
export function MiniBoard({ className }: { className?: string }) {
  /* ฉากกลางเกมที่ดูมีเรื่องราว ไม่ใช่กระดานเริ่มต้นที่เรียงเป็นแถวตรง */
  const cells: Cell[] = Array.from({ length: SIZE * SIZE }, () => EMPTY as Cell)
  const put = (r: number, c: number, v: Cell) => {
    cells[r * SIZE + c] = v
  }
  for (const [r, c] of [[0, 1], [0, 5], [1, 2], [1, 6], [2, 3], [3, 0]] as const) put(r, c, W_MAN)
  for (const [r, c] of [[4, 5], [5, 2], [5, 6], [6, 1], [6, 5], [7, 4]] as const) put(r, c, B_MAN)
  put(7, 0, B_KING)

  return (
    <div
      aria-hidden="true"
      className={cn(
        'grid aspect-square w-full grid-cols-8 overflow-hidden rounded-2xl border border-line',
        className,
      )}
    >
      {cells.map((cell, i) => (
        <span
          key={i}
          className={cn('grid place-items-center', isDark(i) ? 'bg-ink/12' : 'bg-surface')}
        >
          {cell !== EMPTY ? (
            <span
              className={cn(
                'size-[72%] rounded-full',
                cell === B_MAN || cell === B_KING
                  ? 'bg-accent shadow-[0_2px_6px_-2px] shadow-accent'
                  : 'border border-line-strong bg-page',
              )}
            />
          ) : null}
        </span>
      ))}
    </div>
  )
}

/**
 * การ์ดเลือกโหมด
 *
 * ★ แยกออกมาเพราะทั้งสามใบต้องสูงเท่ากันและมีจังหวะเดียวกัน
 *   ★★ เขียนซ้ำสามรอบคือการเปิดช่องให้มันค่อย ๆ ต่างกันทีละนิด
 */
export function ModeCard({
  title,
  detail,
  icon,
  onClick,
  tone = 'plain',
}: {
  title: string
  detail: string
  icon: string
  onClick: () => void
  /** 'primary' = ทางที่คนส่วนใหญ่ควรเลือก */
  tone?: 'primary' | 'plain'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group flex min-h-[7.5rem] w-full flex-col items-start gap-2 rounded-2xl border p-5 text-start',
        'transition-all duration-200',
        tone === 'primary'
          ? 'border-accent/40 bg-accent/10 hover:border-accent hover:bg-accent/15'
          : 'border-line bg-elevated/50 hover:border-line-strong hover:bg-surface',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'grid size-11 place-items-center rounded-xl transition-colors',
          tone === 'primary' ? 'bg-accent text-accent-ink' : 'bg-surface text-ink-soft',
        )}
      >
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d={icon} />
        </svg>
      </span>
      <span className="text-base font-semibold text-ink">
        <Untranslated>{title}</Untranslated>
      </span>
      <span className="text-xs leading-relaxed text-ink-soft">
        <Untranslated>{detail}</Untranslated>
      </span>
    </button>
  )
}

/** หัวข้อย่อยของแต่ละบล็อกในหน้าท้าเพื่อน */
export function SectionTitle({ children, count }: { children: React.ReactNode; count?: number }) {
  return (
    <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-ink">
      {children}
      {count !== undefined && count > 0 ? (
        <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-normal text-ink-soft">
          {count}
        </span>
      ) : null}
    </h2>
  )
}
