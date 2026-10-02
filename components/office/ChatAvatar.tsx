/**
 * รูปโปรไฟล์ในแชท
 *
 * ★ ไม่มีรูปก็ใช้ตัวอักษรแรกบนพื้นสีที่คงที่ต่อชื่อ
 *   ★★ สีมาจากผลรวมรหัสตัวอักษรของชื่อ ไม่ใช่สุ่มตอน render —
 *      ไม่งั้นคนเดิมจะเปลี่ยนสีทุกครั้งที่หน้าวาดใหม่ แล้วจำสีใครไม่ได้เลย
 *
 * ★ แยกออกมาเป็นไฟล์ของตัวเองเพราะทั้งรายการห้อง ห้องแชท และแผงข้อมูลกลุ่ม
 *   ใช้ตัวเดียวกัน — ถ้าก๊อปไว้สามที่ วันที่เปลี่ยนวิธีคิดสีจะเปลี่ยนไม่ครบ
 */
export function ChatAvatar({
  name,
  url,
  group = false,
  size = 40,
}: {
  name: string
  url: string | null
  group?: boolean
  size?: number
}) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- รูปจาก Storage ที่ไม่ได้ตั้ง remotePatterns
      <img
        src={url}
        alt=""
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    )
  }

  const hue = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360

  return (
    <span
      aria-hidden="true"
      /* ★ ตัวอักษรแรกมาจากชื่อคน ซึ่งเป็นภาษาอะไรก็ได้ ไม่เกี่ยวกับภาษาของหน้า
           ★★ และเป็นรอยที่ด่าน i18n-test ใช้แยกว่าอะไรคือของผู้ใช้ */
      dir="auto"
      className="grid shrink-0 place-items-center rounded-full font-medium text-white"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        background: `linear-gradient(140deg, hsl(${hue} 62% 52%), hsl(${(hue + 40) % 360} 62% 42%))`,
      }}
    >
      {group ? '#' : (name.trim()[0] ?? '?')}
    </span>
  )
}
