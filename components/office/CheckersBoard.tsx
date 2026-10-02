'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/cn'
import { Untranslated, useOt } from '@/lib/i18n/office'
import {
  EMPTY,
  SIZE,
  applyMove,
  initialBoard,
  isDark,
  isKing,
  legalMoves,
  outcome,
  rowOf,
  colOf,
  sideOf,
  type Board,
  type Cell,
  type Move,
  type Side,
} from '@/lib/games/checkers'

export type SeatLabel = { name: string; avatarUrl?: string | null }

/**
 * กระดานหมากฮอส — วาดและรับการแตะ ไม่ตัดสินกติกาเอง
 *
 * ★★★ ทุกคำถามว่า "ตานี้เดินได้ไหม" ถูกส่งไปที่ lib/games/checkers
 *
 *     ★ คอมโพเนนต์นี้ไม่มีความรู้เรื่องกติกาเลยแม้แต่ข้อเดียว
 *       ★★ จึงไม่มีทางที่หน้าจอกับ server จะตัดสินต่างกัน — ทั้งคู่ถาม
 *          โมดูลเดียวกัน ซึ่งเป็นเหตุผลทั้งหมดที่แยกโมดูลออกมา
 *
 * ★★ รับ onCommit ให้ผู้เรียกตัดสินว่าจะทำอะไรกับตาที่เดินเสร็จ
 *    (เล่นในเครื่อง = เดินต่อเลย · ออนไลน์ = ส่งไป server ก่อน)
 */
export function CheckersBoard({
  board,
  turn,
  mySide,
  forceCapture = true,
  onCommit,
  lastMove,
  top,
  bottom,
  disabled = false,
}: {
  board: Board
  turn: Side
  /** ฝั่งที่ผู้ใช้คนนี้เล่น — null = คุมทั้งสองฝั่ง (ส่งเครื่องกันเล่น) */
  mySide: Side | null
  forceCapture?: boolean
  onCommit: (move: Move) => void
  /** ตาเดินล่าสุดของอีกฝ่าย — ไฮไลต์ช่องต้นทาง/ปลายทางตามข้อกำหนด */
  lastMove?: { from: number; to: number } | null
  top: SeatLabel
  bottom: SeatLabel
  disabled?: boolean
}) {
  const ot = useOt()
  const [selected, setSelected] = useState<number | null>(null)

  const canMoveNow = !disabled && (mySide === null || mySide === turn)

  const moves = useMemo(
    () => (canMoveNow ? legalMoves(board, turn, forceCapture) : []),
    [board, turn, forceCapture, canMoveNow],
  )

  /*
   * ★★ ช่องที่ "ต้องกิน" — ไฮไลต์ให้อัตโนมัติตามข้อกำหนด
   *    ★ เมื่อบังคับกิน ตัวที่เดินได้มีไม่กี่ตัว การให้ผู้เล่นไล่แตะหาเอง
   *      ว่าตัวไหนขยับได้ คือการให้เขาทำงานที่ระบบรู้คำตอบอยู่แล้ว
   */
  const mustCapture = moves.length > 0 && moves.every((m) => m.captured.length > 0)
  const movable = useMemo(() => new Set(moves.map((m) => m.from)), [moves])

  /** ตาที่เดินได้จากตัวที่เลือกอยู่ */
  const fromSelected = useMemo(
    () => (selected === null ? [] : moves.filter((m) => m.from === selected)),
    [moves, selected],
  )
  const targets = useMemo(() => new Map(fromSelected.map((m) => [m.to, m])), [fromSelected])

  /* ★ กระดานเปลี่ยน (อีกฝ่ายเดิน / ถอยตา) → ล้างตัวที่เลือกไว้
       ★★ ไม่ล้างแล้วจะเหลือไฮไลต์ชี้ไปยังช่องที่ความหมายเปลี่ยนไปแล้ว */
  useEffect(() => {
    setSelected(null)
  }, [board, turn])

  function tap(i: number) {
    if (!canMoveNow) return

    const hit = targets.get(i)
    if (hit) {
      onCommit(hit)
      setSelected(null)
      return
    }

    if (movable.has(i)) {
      setSelected((s) => (s === i ? null : i))
      return
    }

    /* ★ แตะช่องที่ไม่เกี่ยวข้อง = ยกเลิกการเลือก ไม่ใช่เงียบ */
    setSelected(null)
  }

  const counts = useMemo(() => {
    let b = 0
    let t = 0
    for (const c of board) {
      const s = sideOf(c)
      if (s === 'BOTTOM') b++
      else if (s === 'TOP') t++
    }
    /* ★ แสดง "ถูกกินไปกี่ตัว" ไม่ใช่ "เหลือกี่ตัว" ตามข้อกำหนด */
    return { topLost: 8 - t, bottomLost: 8 - b }
  }, [board])

  return (
    <div className="mx-auto w-full max-w-[min(92vw,520px)]">
      <Seat who={top} lost={counts.topLost} active={turn === 'TOP'} />

      {/*
        * ★ กระดานเป็นสี่เหลี่ยมจัตุรัสเสมอด้วย aspect-square + grid 8 คอลัมน์
        *   ★★ ไม่กำหนดความสูงเป็นพิกเซล — จอแคบ 320px กับ 430px ต้องได้
        *      กระดานที่เต็มความกว้างทั้งคู่ ตามข้อกำหนด "กระดานกว้างเต็มจอ"
        */}
      <div
        role="grid"
        aria-label={ot('game.checkers.board')}
        className="mt-2 grid aspect-square w-full grid-cols-8 overflow-hidden rounded-2xl border border-line"
      >
        {board.map((cell, i) => {
          const isTarget = targets.has(i)
          const isFrom = selected === i
          const isLast = lastMove && (lastMove.from === i || lastMove.to === i)
          const hint = mustCapture && movable.has(i) && selected === null

          return (
            <button
              key={i}
              type="button"
              role="gridcell"
              onClick={() => tap(i)}
              disabled={!canMoveNow}
              aria-label={`${rowOf(i) + 1}-${colOf(i) + 1}`}
              className={cn(
                'relative grid place-items-center transition-colors',
                /* ★ สองโทนจาก token พื้นผิว — กลมกลืนทั้งสองโหมด ไม่ hardcode สี */
/*
             * ★★★ ช่องเข้มใช้ bg-ink/12 ไม่ใช่ bg-surface-hover
             *
             *     ★ surface-hover กับ surface ต่างกันไม่กี่เปอร์เซ็นต์ —
             *       ลายหมากรุกจึงแทบมองไม่เห็นบนจอจริง
             *       ★★ ซึ่งไม่ใช่แค่เรื่องสวย: หมากเดินได้เฉพาะช่องเข้ม
             *          คนที่มองลายไม่ออกจะเล็งช่องปลายทางไม่ถูก
             *     ★ ink คือสีตัวหนังสือ ซึ่งกลับขั้วตามโหมดอยู่แล้ว
             *       ★★ ลายจึงชัดทั้งสองโหมดโดยไม่ต้องเขียนสีแยกสองชุด
             */
            isDark(i) ? 'bg-ink/12' : 'bg-surface',
                isLast && 'ring-2 ring-inset ring-link/50',
                isFrom && 'ring-2 ring-inset ring-accent',
              )}
            >
              {/* ★ จุดบอกช่องปลายทาง — วางเป็นวงกลมกลางช่อง ไม่ใช่เปลี่ยนสีพื้น
                     ★★ เปลี่ยนสีพื้นทำให้แยกไม่ออกจากช่องที่มีหมากอยู่ */}
              {isTarget ? (
                <span
                  aria-hidden="true"
                  className="absolute size-1/3 rounded-full bg-accent/70"
                />
              ) : null}

              {hint ? (
                <span
                  aria-hidden="true"
                  className="absolute inset-1 rounded-full ring-2 ring-warn/70"
                />
              ) : null}

              {cell !== EMPTY ? <Piece cell={cell} /> : null}
            </button>
          )
        })}
      </div>

      <Seat who={bottom} lost={counts.bottomLost} active={turn === 'BOTTOM'} />

      {mustCapture ? (
        <p className="mt-2 text-center text-xs text-warn">
          <Untranslated>{ot('game.checkers.mustCapture')}</Untranslated>
        </p>
      ) : null}
    </div>
  )
}

/** หมากหนึ่งตัว */
function Piece({ cell }: { cell: Cell }) {
  const side = sideOf(cell)
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid size-[78%] place-items-center rounded-full text-[min(3.2vw,16px)] font-bold shadow',
        /*
         * ★★★ สองฝ่ายต้องแยกออกชัดทั้ง light และ dark
         *     ★ ใช้ accent (แดงแบรนด์) กับ ink ซึ่งเป็น token ที่กลับขั้ว
         *       ตามโหมดอยู่แล้ว ★★ ถ้าใช้ขาว/ดำตรง ๆ ฝ่ายหนึ่งจะหายไป
         *       กับพื้นหลังในโหมดใดโหมดหนึ่งเสมอ
         */
        side === 'BOTTOM'
          ? 'bg-accent text-accent-ink'
          : 'border-2 border-line-strong bg-page text-ink',
      )}
    >
      {/* ★ ฮอสมีมงกุฎ ไม่ใช่แค่สีต่าง — คนตาบอดสีต้องแยกออกเหมือนกัน */}
      {isKing(cell) ? '♛' : ''}
    </span>
  )
}

function Seat({ who, lost, active }: { who: SeatLabel; lost: number; active: boolean }) {
  const ot = useOt()
  return (
    <div
      className={cn(
        'flex min-h-11 items-center gap-2 rounded-xl px-2 py-1 transition-colors',
        active && 'bg-accent/10',
      )}
    >
      <span
        aria-hidden="true"
        className="grid size-8 shrink-0 place-items-center rounded-full bg-surface text-xs text-ink-soft"
      >
        {who.name.slice(0, 1)}
      </span>
      <span dir="auto" className={cn('min-w-0 truncate text-sm', active ? 'font-semibold text-ink' : 'text-ink-soft')}>
        {who.name}
      </span>
      {/* ★★ บอกว่าเป็นตาใคร "ด้วยคำ" ไม่ใช่ด้วยสีอย่างเดียว */}
      {active ? (
        <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[11px] text-accent-ink">
          <Untranslated>{ot('game.checkers.yourTurn')}</Untranslated>
        </span>
      ) : null}
      {lost > 0 ? (
        <span className="ms-auto shrink-0 text-xs text-ink-faint">−{lost}</span>
      ) : null}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
 * สถานะเกมในเครื่อง — ใช้กับโหมดบอทและโหมดส่งเครื่องกันเล่น
 * ═══════════════════════════════════════════════════════════════════ */

export type LocalGame = {
  board: Board
  turn: Side
  /** กี่ตาแล้วที่ไม่มีการกิน — ใช้ตัดสินเสมอ */
  quietPlies: number
  lastMove: { from: number; to: number } | null
  history: { board: Board; turn: Side; quietPlies: number }[]
}

export function newLocalGame(): LocalGame {
  return { board: initialBoard(), turn: 'BOTTOM', quietPlies: 0, lastMove: null, history: [] }
}

export function playLocal(g: LocalGame, m: Move): LocalGame {
  return {
    board: applyMove(g.board, m),
    turn: g.turn === 'BOTTOM' ? 'TOP' : 'BOTTOM',
    /* ★ ตัวนับเสมอรีเซ็ตเมื่อมีการกิน ไม่ใช่นับรวมทุกตา */
    quietPlies: m.captured.length > 0 ? 0 : g.quietPlies + 1,
    lastMove: { from: m.from, to: m.to },
    history: [...g.history, { board: g.board, turn: g.turn, quietPlies: g.quietPlies }],
  }
}

/** ผลของเกมในเครื่องตอนนี้ */
export function localOutcome(g: LocalGame, forceCapture: boolean) {
  return outcome(g.board, g.turn, g.quietPlies, forceCapture)
}

/**
 * ★ ตัวช่วยให้บอทเดินแบบไม่ขวางการวาดจอ
 *   ★★ minimax ลึก 6 ใช้เวลาไม่กี่สิบมิลลิวินาที แต่มันกินเธรดเดียวกับ UI
 *      การหน่วงหนึ่งเฟรมก่อนคิด ทำให้หมากของผู้เล่นถูกวาดลงจอก่อน
 *      ★ ไม่งั้นจะเห็นเหมือนทั้งสองฝ่ายเดินพร้อมกันในเฟรมเดียว
 */
export function useBotTurn(run: () => void, active: boolean, delayMs = 420) {
  const runRef = useRef(run)
  runRef.current = run

  const tick = useCallback(() => runRef.current(), [])

  useEffect(() => {
    if (!active) return
    const id = window.setTimeout(tick, delayMs)
    return () => window.clearTimeout(id)
  }, [active, delayMs, tick])
}

export { SIZE }
