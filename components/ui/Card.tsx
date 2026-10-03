import Link from 'next/link'
import { cn } from '@/lib/cn'

/**
 * การ์ดกลางของทั้งระบบ
 *
 * ★★★ มีขึ้นเพราะทุกหน้าในโมดูลออฟฟิศเขียนการ์ดเองซ้ำ ๆ
 *
 *     `rounded-2xl border border-line bg-elevated/…` ถูกพิมพ์ใหม่อยู่ในสิบกว่าไฟล์
 *     ★ ผลคือมันค่อย ๆ ต่างกันทีละนิด — บางใบ /50 บางใบ /60 บางใบ /40
 *       บางใบมี backdrop-blur บางใบไม่มี ★★ ซึ่งไม่มีใครตั้งใจ และไม่มีใคร
 *       สังเกตจนกว่าจะเอาสองหน้ามาวางข้างกัน
 *
 *     ★★★ การไล่แต่งทีละหน้าโดยไม่มีของกลาง คือการสร้างปัญหาเดิมซ้ำอีกรอบ
 *         ให้ใหญ่ขึ้น — ต้องมีที่เดียวที่ตัดสินว่า "การ์ดหน้าตาแบบไหน" ก่อน
 *
 * ★ ไม่ใช่ client component — การ์ดเป็นแค่กล่อง ไม่มี state
 *   ★★ ทำให้หน้าที่เป็น server component ใช้ได้โดยไม่ต้องแตก boundary
 */

type Tone = 'plain' | 'accent' | 'dashed'

const TONE: Record<Tone, string> = {
  plain: 'border-line bg-elevated/50',
  /* ★ ใช้กับของที่ "ต้องตอบ" หรือ "กำลังเปิดอยู่" — ไม่ใช่เพื่อความสวย */
  accent: 'border-accent/40 bg-accent/10',
  /* ★ เส้นประ = ที่ว่างที่ตั้งใจ ต่างจากกล่องที่ข้อมูลยังโหลดไม่เสร็จ */
  dashed: 'border-dashed border-line bg-transparent',
}

type CardOptions = {
  tone?: Tone
  /** กดได้ไหม — ใส่เฉพาะเมื่อทั้งใบเป็นปุ่ม/ลิงก์จริง */
  interactive?: boolean
  /**
   * ใส่ระยะขอบในให้ไหม
   *
   * ★★ ต้องปิดได้ เพราะ `cn` ของโปรเจกต์นี้เป็นการต่อสตริงเฉย ๆ ไม่ใช่
   *    tailwind-merge ★ ใบที่อยากได้ `p-2` จึงเขียนทับ `p-4` ไม่ได้ —
   *    ลำดับในไฟล์ CSS เป็นคนตัดสิน ไม่ใช่ลำดับใน className
   *    ★★ และการ์ดที่ข้างในเป็นลิสต์ ต้องไม่มีระยะขอบเลยเพื่อให้เส้นคั่นชนขอบ
   */
  pad?: boolean
}

export function Card({
  className,
  children,
  ...opts
}: CardOptions & {
  className?: string
  children: React.ReactNode
}) {
  return <div className={cn(cardClass(opts), className)}>{children}</div>
}

/**
 * คลาสของการ์ด — แยกออกมาให้ `<button>` และ `<Link>` ใช้ตรง ๆ ได้
 *
 * ★★ ไม่ห่อ Card รอบปุ่ม เพราะจะได้กล่องซ้อนกล่องและพื้นที่กดไม่เต็มใบ
 *    ★ คนคาดว่าการ์ดที่กดได้ จะกดโดนทั้งใบ ไม่ใช่เฉพาะตรงกลาง
 */
export function cardClass({ tone = 'plain', interactive = false, pad = true }: CardOptions = {}): string {
  return cn(
    'rounded-2xl border backdrop-blur-md transition-all duration-200',
    pad && 'p-4',
    TONE[tone],
    interactive &&
      (tone === 'accent'
        ? 'hover:border-accent hover:bg-accent/15'
        : 'hover:-translate-y-0.5 hover:border-line-strong hover:bg-surface'),
  )
}

/**
 * ตารางการ์ด
 *
 * ★ คอลัมน์ไล่ตามความกว้างจริง ไม่ใช่ตัวเลขตายตัวต่อหน้า
 *   ★★ หน้าไหนอยากได้คอลัมน์ต่างจากนี้ ให้ส่ง className ทับ — ไม่ใช่เขียน grid เอง
 *      เพราะช่องไฟระหว่างการ์ดต้องเท่ากันทั้งระบบ
 */
export function CardGrid({
  cols = 3,
  className,
  children,
}: {
  cols?: 2 | 3 | 4
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'grid gap-3',
        cols === 2 && 'sm:grid-cols-2',
        cols === 3 && 'sm:grid-cols-2 xl:grid-cols-3',
        cols === 4 && 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
        className,
      )}
    >
      {children}
    </div>
  )
}

/**
 * การ์ดที่กดแล้วไปหน้าอื่น
 *
 * ★ ไอคอน + ชื่อ + คำอธิบายหนึ่งบรรทัด — รูปแบบเดียวกับเมนูหมวด
 *   ★★ คำอธิบายไม่ใช่ของประดับ: ชื่อหน้าอย่างเดียวตอบไม่ได้ว่า
 *      "สายการแข่งขัน" ต่างจาก "ห้องสุ่มกลุ่ม" ตรงไหน
 */
export function LinkCard({
  href,
  title,
  detail,
  icon,
  badge,
  tone = 'plain',
}: {
  href: string
  title: React.ReactNode
  detail?: React.ReactNode
  /** path ของ SVG 24×24 */
  icon?: string
  /** ป้ายมุมขวา เช่น จำนวนที่รออยู่ */
  badge?: React.ReactNode
  tone?: Tone
}) {
  return (
    <Link href={href} className={cn(cardClass({ tone, interactive: true }), 'group flex items-start gap-3')}>
      {icon ? (
        <span
          aria-hidden="true"
          className={cn(
            'grid size-11 shrink-0 place-items-center rounded-xl transition-transform group-hover:scale-110',
            tone === 'accent' ? 'bg-accent text-accent-ink' : 'bg-surface text-ink-soft',
          )}
        >
          <svg
            viewBox="0 0 24 24"
            className="size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d={icon} />
          </svg>
        </span>
      ) : null}

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="font-medium text-ink">{title}</span>
          {badge}
        </span>
        {detail ? (
          <span className="mt-0.5 block text-xs leading-relaxed text-ink-soft">{detail}</span>
        ) : null}
      </span>
    </Link>
  )
}

/**
 * การ์ดตัวเลข
 *
 * ★★ ป้ายเล็กอยู่บน ตัวเลขใหญ่อยู่ล่าง — ตรงข้ามกับที่คนมักเขียน
 *    ★ ตากวาดหาตัวเลขก่อนเสมอ แล้วค่อยย้อนขึ้นไปอ่านว่ามันคืออะไร
 *      ★★ วางตัวเลขไว้บนทำให้ต้องกวาดสองรอบ
 */
export function StatCard({
  label,
  value,
  hint,
  text,
}: {
  label: React.ReactNode
  value: React.ReactNode
  hint?: React.ReactNode
  /** ค่าเป็นข้อความ (เช่นชื่อคน) ไม่ใช่ตัวเลข — ใช้ขนาดเล็กลงและตัดท้าย */
  text?: boolean
}) {
  return (
    <div className={cardClass()}>
      <p className="text-[11px] uppercase tracking-wide text-ink-faint">{label}</p>
      <p
        dir="auto"
        className={cn(
          'mt-0.5 font-bold text-ink',
          text ? 'truncate text-lg' : 'text-2xl tabular-nums',
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-xs text-ink-faint">{hint}</p> : null}
    </div>
  )
}

/**
 * ที่ว่างที่ตั้งใจ
 *
 * ★★★ ต่างจาก "ยังโหลดไม่เสร็จ" — เส้นประบอกว่าระบบตอบแล้วว่าไม่มีอะไร
 *     ★ กล่องเปล่าแบบไม่มีขอบทำให้คนรอต่อไปเรื่อย ๆ โดยไม่รู้ว่ารออะไรอยู่
 */
export function EmptyCard({ children }: { children: React.ReactNode }) {
  return (
    <p className={cn(cardClass({ tone: 'dashed', pad: false }), 'px-4 py-10 text-center text-sm text-ink-faint')}>
      {children}
    </p>
  )
}
