'use client'

import { useState, type CSSProperties } from 'react'
import { cn } from '@/lib/cn'
import { Untranslated, useOt } from '@/lib/i18n/office'
import { COLS, ROWS, dropRow, type Board, type Player } from '@/lib/games/connect4'

/**
 * กระดานเรียง 4 · ป้ายผู้เล่น · กระดานตัวอย่าง
 *
 * ★★★ แยกออกมาจาก Connect4Game ตอนทำโหมดออนไลน์
 *
 *     ★ หน้าเล่นในเครื่องกับหน้าเล่นออนไลน์ต้องวาดกระดานใบเดียวกันเป๊ะ
 *       ★★ ก๊อปกระดานไปไฟล์ที่สองแปลว่าทุกการปรับระยะห่าง สี หรือแอนิเมชัน
 *          ต้องทำสองที่ และวันหนึ่งจะมีที่ที่ลืม — ผู้ใช้เห็นเป็น
 *          "เกมเดียวกันแต่หน้าตาไม่เหมือนกันสองโหมด"
 */

/**
 * กระดาน 7×6
 *
 * ★ แต่ละคอลัมน์เป็นปุ่มเดียวทั้งแท่ง — แตะตรงไหนของคอลัมน์ก็หยอดได้ (เป้าใหญ่บนมือถือ)
 * ★ ชี้/โฟกัสคอลัมน์ = เหรียญเงาลอยรอบนหัวคอลัมน์ และวงเงาที่ช่องที่จะตก
 * ★ เหรียญใหม่หล่นจากบนสุดลงมาเด้ง (ระยะหล่นตามแถว) · แถวชนะเรืองแสง ที่เหลือจาง
 */
export function Connect4Board({
  board,
  turn,
  last,
  winCells,
  disabled,
  onDrop,
}: {
  board: Board
  turn: Player
  last: number | null
  winCells: number[]
  disabled: boolean
  onDrop: (col: number) => void
}) {
  const ot = useOt()
  const [hover, setHover] = useState<number | null>(null)
  const won = winCells.length > 0
  const target = hover !== null && !disabled ? dropRow(board, hover) : null

  return (
    <div className="mx-auto w-full max-w-[560px]">
      {/* แถวเหรียญเงาเหนือกระดาน */}
      <div aria-hidden="true" className="grid grid-cols-7 gap-[clamp(4px,1.4vw,10px)] px-[clamp(8px,2.2vw,16px)] pb-2">
        {Array.from({ length: COLS }, (_, c) => (
          <span key={c} className="relative aspect-square">
            {hover === c && !disabled && dropRow(board, c) !== null ? (
              <span className={cn('c4-disc c4-hover absolute inset-[6%]', turn === 1 ? 'c4-red' : 'c4-gold')} />
            ) : null}
          </span>
        ))}
      </div>

      <div className={cn('c4-board relative rounded-[28px] p-[clamp(8px,2.2vw,16px)]', won && 'c4-board-won')}>
        {/* ★ ระยะห่างเป็น px ไม่ใช่ % — gap แนวตั้งแบบ % คิดจากความสูงที่ยังไม่รู้ แถวล่างเลยทะลุกรอบ */}
        <div className="grid grid-cols-7 gap-[clamp(4px,1.4vw,10px)]">
          {Array.from({ length: COLS }, (_, c) => {
            const full = dropRow(board, c) === null
            return (
              <button
                key={c}
                type="button"
                disabled={disabled || full}
                onClick={() => onDrop(c)}
                onPointerEnter={() => setHover(c)}
                onPointerLeave={() => setHover((h) => (h === c ? null : h))}
                onFocus={() => setHover(c)}
                onBlur={() => setHover((h) => (h === c ? null : h))}
                aria-label={ot('game.c4.dropCol', { n: c + 1 })}
                className={cn('c4-col flex flex-col gap-[clamp(4px,1.4vw,10px)] rounded-2xl', hover === c && !disabled && !full && 'c4-col-on')}
              >
                {Array.from({ length: ROWS }, (_, r) => {
                  const i = r * COLS + c
                  const v = board[i]
                  const isWin = winCells.includes(i)
                  return (
                    <span key={r} className="c4-hole relative aspect-square rounded-full">
                      {v ? (
                        <span
                          key={i === last ? `last-${i}` : i}
                          className={cn(
                            'c4-disc absolute inset-[5%]',
                            v === 1 ? 'c4-red' : 'c4-gold',
                            i === last && 'c4-drop',
                            won && (isWin ? 'c4-win' : 'c4-dim'),
                          )}
                          style={{ '--fall': r + 1 } as CSSProperties}
                        />
                      ) : target === r && hover === c ? (
                        <span className={cn('c4-ghost absolute inset-[5%] rounded-full', turn === 1 ? 'c4-ghost-red' : 'c4-ghost-gold')} />
                      ) : null}
                    </span>
                  )
                })}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/**
 * ป้ายผู้เล่นสองฝั่ง — ฝั่งที่ถึงตาเรืองแสง
 *
 * ★★ รับข้อความใต้ชื่อมาจากคนเรียก ไม่คิดเอง
 *    ★ ในเครื่องมันคือ "ตาคุณ" หรือ "บอทกำลังคิด" · ออนไลน์มันคือเวลาที่เหลือ
 *      ★★ ให้คอมโพเนนต์นี้ตัดสินเองแปลว่ามันต้องรู้ว่าอยู่โหมดไหน
 *         ซึ่งเป็นความรู้ที่ไม่ควรลงมาถึงป้ายชื่อ
 */
export function Connect4Seats({
  names,
  turn,
  over,
  sub,
}: {
  names: Record<Player, string>
  turn: Player
  over: boolean
  sub?: (p: Player) => string | null
}) {
  return (
    <div className="mx-auto mb-4 flex max-w-[560px] items-center justify-between gap-3">
      {([1, 2] as Player[]).map((p) => {
        const line = !over && turn === p ? (sub?.(p) ?? null) : null
        return (
          <div
            key={p}
            className={cn('c4-seat flex min-w-0 items-center gap-2.5 rounded-full py-1.5 ps-1.5 pe-4', !over && turn === p && 'c4-seat-on')}
          >
            <span aria-hidden="true" className={cn('c4-disc size-8 shrink-0', p === 1 ? 'c4-red' : 'c4-gold')} />
            <span className="min-w-0">
              <span dir="auto" className="block truncate text-sm font-bold text-ink">
                <Untranslated>{names[p]}</Untranslated>
              </span>
              {line ? (
                <span className="block text-[11px] text-ink-soft">
                  <Untranslated>{line}</Untranslated>
                </span>
              ) : null}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/** กระดานตัวอย่างบนหน้าเลือกโหมด — แถวทแยงชนะเรืองแสง */
export function MiniConnect4() {
  /* แดงเรียงทแยง 4 เหรียญ (แถวล่างซ้ายขึ้นขวา) ปนเหรียญทอง */
  const RED = new Set([35, 29, 23, 17, 36, 30])
  const GOLD = new Set([37, 38, 31, 24, 39, 32])
  const WIN = new Set([35, 29, 23, 17])
  return (
    <div className="c4-board c4-mini rounded-[24px] p-[clamp(8px,2.2vw,16px)]" aria-hidden="true">
      <div className="grid grid-cols-7 gap-[clamp(4px,1.4vw,10px)]">
        {Array.from({ length: COLS * ROWS }, (_, i) => (
          <span key={i} className="c4-hole relative aspect-square rounded-full">
            {RED.has(i) || GOLD.has(i) ? (
              <span
                className={cn('c4-disc c4-drop absolute inset-[5%]', RED.has(i) ? 'c4-red' : 'c4-gold', WIN.has(i) && 'c4-win')}
                style={{ '--fall': Math.floor(i / COLS) + 1, animationDelay: `${(i % COLS) * 0.12}s` } as CSSProperties}
              />
            ) : null}
          </span>
        ))}
      </div>
    </div>
  )
}
