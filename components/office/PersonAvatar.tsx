'use client'

import Image from 'next/image'

/**
 * รูปคนกลม ๆ ขนาดใดก็ได้
 *
 * ★★ มีรูปใช้รูป ไม่มีรูปใช้ตัวอักษรแรกบนพื้นที่สุ่มจากชื่อ
 *    ★ วงเทาเหมือนกันหมดทุกคนทำให้ตารางรูปอ่านไม่ออกเลย
 *      ★★ สีที่มาจากชื่อทำให้คนเดิมมีสีเดิมเสมอ ตาจึงจำตำแหน่งได้
 *
 * ★ แยกออกมาเป็นไฟล์ของตัวเองตอนทำเรียง 4 ออนไลน์ — เดิมซ่อนอยู่ใน
 *   CheckersLobby ★★ ก๊อปไปอีกไฟล์แปลว่าสีของคนเดียวกันจะเริ่มต่างกัน
 *   ระหว่างสองหน้าในวันที่มีคนแก้สูตรข้างเดียว
 */
export function PersonAvatar({
  name,
  url,
  size,
}: {
  name: string
  url: string | null
  size: number
}) {
  if (url) {
    return (
      <Image
        src={url}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
        unoptimized
      />
    )
  }

  /* ★ สุ่มจากชื่อแบบคงที่ — ชื่อเดิมได้สีเดิมทุกครั้ง ไม่ใช่สุ่มใหม่ทุก render */
  let hash = 0
  for (const ch of name) hash = (hash * 31 + ch.codePointAt(0)!) >>> 0
  const hue = hash % 360

  return (
    <span
      aria-hidden="true"
      className="grid shrink-0 place-items-center rounded-full font-medium text-white"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.4,
        background: `linear-gradient(140deg, hsl(${hue} 55% 52%), hsl(${(hue + 40) % 360} 55% 42%))`,
      }}
    >
      {name.slice(0, 1)}
    </span>
  )
}
