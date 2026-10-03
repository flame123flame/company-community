import { cn } from '@/lib/cn'

/**
 * แถวดาวของทั้งโมดูลร้านอาหาร
 *
 * ★★★ มีขึ้นเพราะดาวถูกวาดใหม่ในสามที่ด้วยสามวิธี
 *
 *     ★ การ์ดร้านใช้ตัวอักษร "★" ตัวเดียวกับคะแนน · หน้ารายละเอียดวาด SVG
 *       ห้าดวง · รายการรีวิวมี Stars ของตัวเองอีกตัว
 *       ★★ ผลคือดาวสามแบบในหน้าจอเดียว ขนาดต่างกัน สีต่างกัน
 *
 * ★★★ สีเหลืองตายตัว ไม่ใช่ token "warn"
 *
 *     ★ warn เป็นสีของคำเตือน (ค้างเกิน 7 วัน · ร้านอาจปิด) ★★ เอามาใช้
 *       กับดาวด้วย แปลว่าวันที่ใครเปลี่ยนสีคำเตือน ดาวจะเปลี่ยนตามไปด้วย
 *       โดยไม่มีใครตั้งใจ — เป็นการผูกสองเรื่องที่ไม่เกี่ยวกันเข้าด้วยกัน
 *     ★ ดาวคือดาว มันเหลืองเพราะมันเป็นดาว
 *
 * ★★ ดาวครึ่งดวงด้วย clip ไม่ใช่ปัดเป็นจำนวนเต็ม
 *    ★ 4.4 กับ 4.6 ปัดแล้วได้ดาวเท่ากัน ทั้งที่ตัวเลขข้าง ๆ บอกคนละค่า
 *      ★★ คนจะเห็นว่าดาวกับตัวเลขไม่ตรงกัน แล้วเลิกเชื่อทั้งคู่
 */

/** เหลืองของดาว — ไม่ผูกกับ token อื่นของระบบโดยตั้งใจ */
const GOLD = '#f5a524'

export function Stars({
  value,
  size = 16,
  className,
}: {
  /** คะแนนเฉลี่ย 0–5 */
  value: number
  size?: number
  className?: string
}) {
  const clamped = Math.max(0, Math.min(5, value))

  return (
    <span
      className={cn('inline-flex items-center gap-0.5', className)}
      role="img"
      aria-label={`${clamped.toFixed(1)} / 5`}
    >
      {[0, 1, 2, 3, 4].map((i) => {
        /* ส่วนของดวงนี้ที่ถูกเติม: 0 = ว่าง · 1 = เต็ม */
        const fill = Math.max(0, Math.min(1, clamped - i))
        return <Star key={i} fill={fill} size={size} />
      })}
    </span>
  )
}

function Star({ fill, size }: { fill: number; size: number }) {
  const path =
    'm12 3.2 2.6 5.3 5.8.85-4.2 4.1 1 5.8-5.2-2.75L6.8 19.25l1-5.8-4.2-4.1 5.8-.85z'

  return (
    <span className="relative inline-block" style={{ width: size, height: size }}>
      {/* ดวงว่าง — เส้นขอบอย่างเดียว */}
      <svg
        viewBox="0 0 24 24"
        className="absolute inset-0"
        width={size}
        height={size}
        fill="none"
        stroke={GOLD}
        strokeWidth="1.6"
        strokeLinejoin="round"
        aria-hidden="true"
        style={{ opacity: 0.35 }}
      >
        <path d={path} />
      </svg>

      {/* ส่วนที่เติม — ตัดด้วย width ของกล่องครอบ จึงได้ครึ่งดวงจริง */}
      {fill > 0 ? (
        <span
          className="absolute inset-y-0 start-0 overflow-hidden"
          style={{ width: `${fill * 100}%` }}
          aria-hidden="true"
        >
          <svg viewBox="0 0 24 24" width={size} height={size} fill={GOLD} className="block">
            <path d={path} />
          </svg>
        </span>
      ) : null}
    </span>
  )
}

/**
 * ดาวแบบกดให้คะแนนได้
 *
 * ★ แยกจาก Stars เพราะอันนั้นเป็นรูป (role="img") ส่วนอันนี้เป็นปุ่มห้าปุ่ม
 *   ★★ ปนกันแล้วโปรแกรมอ่านหน้าจอจะอ่านคะแนนเฉลี่ยเป็น "ปุ่ม 5 ปุ่ม"
 */
export function StarInput({
  value,
  onChange,
  label,
  size = 22,
}: {
  value: number
  onChange: (n: number) => void
  /** ข้อความของปุ่มแต่ละดวง เช่น (n) => `ให้ ${n} ดาว` */
  label: (n: number) => string
  size?: number
}) {
  return (
    <span className="inline-flex items-center">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          aria-label={label(n)}
          aria-pressed={value >= n}
          className="grid size-11 place-items-center rounded-full transition-transform hover:scale-110"
        >
          <svg
            viewBox="0 0 24 24"
            width={size}
            height={size}
            fill={value >= n ? GOLD : 'none'}
            stroke={GOLD}
            strokeWidth="1.6"
            strokeLinejoin="round"
            style={{ opacity: value >= n ? 1 : 0.4 }}
            aria-hidden="true"
          >
            <path d="m12 3.2 2.6 5.3 5.8.85-4.2 4.1 1 5.8-5.2-2.75L6.8 19.25l1-5.8-4.2-4.1 5.8-.85z" />
          </svg>
        </button>
      ))}
    </span>
  )
}
