'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/cn'
import { splitList } from '@/lib/i18n/office-format'
import { playCelebrate, playSad, vibrate } from '@/lib/office/sound'
import { Confetti } from './Confetti'
import { Untranslated, useOt } from '@/lib/i18n/office'
import {
  B_MAN,
  EMPTY,
  SIZE,
  W_MAN,
  applyMove,
  initialBoard,
  isDark,
  isKing,
  legalMoves,
  outcome,
  rowOf,
  colOf,
  realIndex,
  sideOf,
  type Board,
  type Cell,
  type Move,
  type Side,
} from '@/lib/games/checkers'

export type SeatLabel = { name: string; avatarUrl?: string | null }

/** สิ่งที่เปลี่ยนไปในตาล่าสุด — ใช้เล่นแอนิเมชันอย่างเดียว ไม่ใช่กติกา */
type Fx = {
  key: number
  from: number
  to: number
  captured: { i: number; cell: Cell }[]
  promoted: boolean
}

/**
 * ★★ อ่านตาที่เพิ่งเดินจากความต่างของกระดาน ไม่ใช่จาก lastMove
 *    ★ lastMove ของโหมดออนไลน์ไม่มีรายการตัวที่ถูกกิน
 *    ★ กระดานที่เปลี่ยนเกินหนึ่งตา (เริ่มใหม่ / ถอย / โหลดเกมกลางทาง)
 *      คืน null = ไม่เล่นแอนิเมชัน ดีกว่าเล่นผิด
 */
function diffBoards(prev: Board, next: Board, key: number): Fx | null {
  const filled: number[] = []
  const vacated: number[] = []
  for (let i = 0; i < next.length; i++) {
    if (prev[i] === EMPTY && next[i] !== EMPTY) filled.push(i)
    else if (prev[i] !== EMPTY && next[i] === EMPTY) vacated.push(i)
  }
  if (filled.length !== 1) return null
  const to = filled[0]!
  const side = sideOf(next[to]!)
  const origin = vacated.filter((i) => sideOf(prev[i]!) === side)
  if (origin.length !== 1) return null
  const from = origin[0]!
  return {
    key,
    from,
    to,
    captured: vacated.filter((i) => sideOf(prev[i]!) !== side).map((i) => ({ i, cell: prev[i]! })),
    promoted: !isKing(prev[from]!) && isKing(next[to]!),
  }
}

const sameBoard = (a: Board, b: Board) => a.length === b.length && a.every((c, i) => c === b[i])

const FILES = 'abcdefgh'
/* ★ มุมของประกายตอนกิน — ค่าคงที่ ไม่สุ่มตอน render */
const SPARKS = [0, 60, 120, 180, 240, 300]

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
 *
 * ★ หน้าตา: กรอบหนา หมากนูนสามมิติ หมากไถลไปช่องใหม่ ตัวที่ถูกกินแตกเป็น
 *   ประกาย ได้ฮอสมีมงกุฎทองเด้งขึ้น — สไตล์ทั้งหมดอยู่ใน .ck-* ของ globals.css
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
  finished = false,
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
  /** จบเกมแล้ว — ซ่อนป้าย "ตานี้" */
  finished?: boolean
}) {
  const ot = useOt()
  const [selected, setSelected] = useState<number | null>(null)

  /*
   * ★★ กระดานเปลี่ยน (อีกฝ่ายเดิน / ถอยตา) → ล้างตัวที่เลือก และจำว่าตาไหนเพิ่งเดิน
   *    ★ ทำระหว่าง render ตามแบบ "เก็บค่าก่อนหน้าไว้ใน state" ของ React
   *      ไม่ใช่ใน effect — effect จะวาดหนึ่งเฟรมที่หมากวาร์ปไปก่อนแล้วค่อยไถล
   *    ★ โหมดออนไลน์ได้อาร์เรย์ใหม่ทุกครั้งที่ดึงข้อมูลแม้หมากไม่ขยับ
   *      ★★ เทียบเนื้อหาก่อน ไม่งั้นแอนิเมชันถูกตัดกลางทางและตัวที่เลือกหลุด
   */
  const [seen, setSeen] = useState<{ board: Board; turn: Side; fx: Fx | null }>({
    board,
    turn,
    fx: null,
  })
  if (seen.board !== board || seen.turn !== turn) {
    const changed = !sameBoard(seen.board, board)
    setSeen({
      board,
      turn,
      fx: changed ? diffBoards(seen.board, board, (seen.fx?.key ?? 0) + 1) : seen.fx,
    })
    if (changed || seen.turn !== turn) setSelected(null)
  }
  const fx = seen.fx

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

  /*
   * ★★★ กลับกระดานให้คนที่นั่งฝั่งบน
   *
   *     ★ ของเดิมวาด board.map(i) ตามลำดับดิบเสมอ — ช่อง 0 อยู่ซ้ายบนเสมอ
   *       ★★ คนที่เป็นฝ่าย TOP จึงเห็นหมากตัวเองอยู่ "ข้างบน" แล้วต้องเดินลง
   *          ซึ่งกลับหัวกลับหางกับเกมกระดานทุกเกมในโลก
   *          ★ ผู้ใช้เจอเองแล้วถามว่า "ทำไมตัวเราไม่อยู่ฝั่งเรา"
   *
   * ★★ กลับแค่ "การวาด" ไม่แตะกติกาเลย
   *    ★ ทุกอย่างที่คิดตาเดิน (legalMoves · applyMove · ดัชนีที่ส่งไป server)
   *      ยังใช้ดัชนีจริงเหมือนเดิม ★★ การกลับข้อมูลจะทำให้ฝั่งเซิร์ฟเวอร์
   *      กับฝั่งหน้าจอพูดคนละภาษา ซึ่งเป็นบั๊กที่ไล่ยากที่สุดแบบหนึ่ง
   *
   * ★ โหมดส่งเครื่องกันเล่น (mySide = null) ไม่กลับ — ไม่มี "ฝั่งเรา" ให้ยึด
   */
  const flip = mySide === 'TOP'

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
    <div className="mx-auto w-full max-w-[min(94vw,540px)]">
      {/* ★ แต่ละแถบโชว์หมากของอีกฝ่ายที่คนนั้นกินได้ — เหมือนกองหมากข้างกระดานจริง
             ★★ สลับที่นั่งตามการกลับกระดาน ไม่งั้นชื่อเราไปอยู่บนหัวกระดานที่เป็นของเรา */}
      <Seat
        who={flip ? bottom : top}
        side={flip ? 'BOTTOM' : 'TOP'}
        took={flip ? counts.topLost : counts.bottomLost}
        active={!finished && turn === (flip ? 'BOTTOM' : 'TOP')}
      />

      <div className="ck-stage mt-3 mb-3">
        <div className="ck-frame">
          {/*
            * ★ กระดานเป็นสี่เหลี่ยมจัตุรัสเสมอด้วย aspect-square + grid 8 คอลัมน์
            *   ★★ ไม่กำหนดความสูงเป็นพิกเซล — จอแคบ 320px กับ 430px ต้องได้
            *      กระดานที่เต็มความกว้างทั้งคู่ ตามข้อกำหนด "กระดานกว้างเต็มจอ"
            * ★ dir="ltr" — ภาษาขวาไปซ้ายจะกลับลำดับคอลัมน์ ทำให้กระดานกลับข้าง
            *   และแอนิเมชันไถลไปผิดทาง
            */}
          <div
            role="grid"
            dir="ltr"
            aria-label={ot('game.checkers.board')}
            className="ck-board grid aspect-square w-full grid-cols-8 grid-rows-8 overflow-hidden"
          >
            {Array.from({ length: SIZE * SIZE }, (_, v) => {
              /*
               * ★ v = ตำแหน่งที่ "มองเห็น" · i = ดัชนีจริงบนกระดาน
               *   ★★ ทุกตรรกะข้างล่างใช้ i เสมอ — v ใช้แค่ตัดสินว่าพิกัดตัวเลข
               *      กับตัวอักษรควรไปอยู่ขอบไหนของจอ
               */
              const i = realIndex(v, flip)
              const cell = board[i]!
              const r = rowOf(i)
              const c = colOf(i)
              const vr = Math.floor(v / SIZE)
              const vc = v % SIZE
              const target = targets.get(i)
              const isFrom = selected === i
              const isLast = lastMove && (lastMove.from === i || lastMove.to === i)
              const hint = mustCapture && movable.has(i) && selected === null
              const arriving = fx && fx.to === i && cell !== EMPTY ? fx : null
              const ghost = fx?.captured.find((x) => x.i === i)

              return (
                <button
                  key={i}
                  type="button"
                  role="gridcell"
                  onClick={() => tap(i)}
                  disabled={!canMoveNow}
                  aria-label={`${FILES[c]}${SIZE - r}`}
                  className={cn(
                    'relative grid place-items-center outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-link',
                    isDark(i) ? 'ck-sq-dark' : 'ck-sq-light',
                    isLast && 'ck-last',
                    isFrom && 'ck-sel',
                    movable.has(i) && 'ck-can cursor-pointer',
                    target && 'cursor-pointer',
                    arriving && 'z-10',
                  )}
                >
                  {/* ★ พิกัดเกาะขอบซ้ายและขอบล่างของ "จอ" ไม่ใช่ของกระดานดิบ
                         ★★ ไม่งั้นพอกลับกระดาน ตัวเลขจะไปอยู่ขอบขวาและตัวอักษรไปอยู่ข้างบน */}
                  {vc === 0 ? (
                    <span aria-hidden="true" className="ck-coord start-[7%] top-[7%]">
                      {SIZE - r}
                    </span>
                  ) : null}
                  {vr === SIZE - 1 ? (
                    <span aria-hidden="true" className="ck-coord bottom-[7%] end-[9%]">
                      {FILES[c]}
                    </span>
                  ) : null}

                  {/* ── ตัวที่เพิ่งถูกกิน: ภาพติดตาที่แตกเป็นประกาย ── */}
                  {ghost && fx ? (
                    <span key={`g${fx.key}`} aria-hidden="true" className="ck-poof">
                      <Piece cell={ghost.cell} />
                      {SPARKS.map((a) => (
                        <span key={a} className="ck-spark" style={{ '--a': `${a}deg` } as CSSProperties} />
                      ))}
                    </span>
                  ) : null}

                  {cell !== EMPTY ? (
                    arriving ? (
                      /* ★ key ผูกกับตา — ตาใหม่ = กล่องใหม่ = แอนิเมชันเริ่มใหม่ */
                      <span
                        key={`m${arriving.key}`}
                        className={cn('ck-slide', arriving.captured.length > 0 && 'ck-hop')}
                        style={
                          {
                            /* ★ ระยะเลื่อนคิดในพิกัดของจอ ★★ ตอนกลับกระดาน
                                 ทิศจริงกับทิศที่เห็นตรงข้ามกัน ถ้าใช้ค่าดิบ
                                 หมากจะวิ่งออกจากช่องปลายทางไปทางตรงกันข้าม
                                 แทนที่จะวิ่งเข้ามาจากช่องต้นทาง */
                            '--dx': (colOf(arriving.from) - c) * (flip ? -1 : 1),
                            '--dy': (rowOf(arriving.from) - r) * (flip ? -1 : 1),
                          } as CSSProperties
                        }
                      >
                        <Piece cell={cell} crowned={arriving.promoted} />
                      </span>
                    ) : (
                      <Piece cell={cell} lifted={isFrom} />
                    )
                  ) : null}

                  {/* ★ จุดบอกช่องปลายทาง — วงกลมกลางช่อง ไม่ใช่เปลี่ยนสีพื้น
                         ★★ ปลายทางที่เป็นการกินเป็นวงแหวนใหญ่ ให้รู้ก่อนกดว่าตานี้ได้กิน */}
                  {target ? (
                    <span
                      aria-hidden="true"
                      className={cn('ck-dot', target.captured.length > 0 && 'ck-dot-cap')}
                    />
                  ) : null}

                  {hint ? <span aria-hidden="true" className="ck-must" /> : null}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <Seat
        who={flip ? top : bottom}
        side={flip ? 'TOP' : 'BOTTOM'}
        took={flip ? counts.bottomLost : counts.topLost}
        active={!finished && turn === (flip ? 'TOP' : 'BOTTOM')}
      />

      {mustCapture ? (
        <p className="mt-2 flex items-center justify-center gap-1.5 text-center text-xs font-medium text-warn">
          <span aria-hidden="true" className="ck-live" />
          <Untranslated>{ot('game.checkers.mustCapture')}</Untranslated>
        </p>
      ) : null}
    </div>
  )
}

/**
 * หมากหนึ่งตัว — นูนสามมิติ มีวงแหวนหน้าหมาก ฮอสมีมงกุฎทอง
 *
 * ★★★ สองฝ่ายต้องแยกออกชัดทั้ง light และ dark
 *     ★ แดงแบรนด์ (accent) กับสีพื้นหน้า (page) — งาช้างในโหมดสว่าง ดำเงาในโหมดมืด
 *       ★★ ถ้าใช้ขาว/ดำตรง ๆ ฝ่ายหนึ่งจะจมไปกับพื้นหลังในโหมดใดโหมดหนึ่งเสมอ
 * ★ ฮอสมีมงกุฎ ไม่ใช่แค่สีต่าง — คนตาบอดสีต้องแยกออกเหมือนกัน
 */
export function Piece({
  cell,
  lifted = false,
  crowned = false,
  className,
  style,
}: {
  cell: Cell
  lifted?: boolean
  /** เพิ่งได้ฮอสในตานี้ — เล่นมงกุฎเด้ง */
  crowned?: boolean
  className?: string
  style?: CSSProperties
}) {
  const side = sideOf(cell)
  return (
    <span
      aria-hidden="true"
      style={style}
      className={cn(
        'ck-piece',
        side === 'BOTTOM' ? 'ck-red' : 'ck-pearl',
        lifted && 'ck-lift',
        crowned && 'ck-crowned',
        className,
      )}
    >
      {isKing(cell) ? <Crown /> : null}
    </span>
  )
}

function Crown() {
  return (
    <svg viewBox="0 0 24 24" className="ck-crown" fill="currentColor" aria-hidden="true">
      <path d="M3 8.5 7.5 12 12 5l4.5 7L21 8.5 19 18H5z" />
      <rect x="5" y="19.2" width="14" height="2.3" rx="1" />
      <circle cx="3" cy="7.5" r="1.6" />
      <circle cx="12" cy="4" r="1.6" />
      <circle cx="21" cy="7.5" r="1.6" />
    </svg>
  )
}

/**
 * แถบผู้เล่น
 *
 * ★ อวาตาร์เป็นหมากสีของฝั่งนั้น — ไม่ต้องจำว่าใครแดงใครขาว
 * ★ กองหมากที่กินได้ เรียงซ้อนกันข้างชื่อ + ตัวเลข
 * ★★ บอกว่าเป็นตาใคร "ด้วยคำ" ไม่ใช่ด้วยสีอย่างเดียว
 */
function Seat({
  who,
  side,
  took,
  active,
}: {
  who: SeatLabel
  side: Side
  /** จำนวนหมากของอีกฝ่ายที่คนนี้กินไปแล้ว */
  took: number
  active: boolean
}) {
  const ot = useOt()
  const enemy = side === 'BOTTOM' ? 'ck-pearl' : 'ck-red'
  return (
    <div className={cn('ck-seat flex min-h-14 items-center gap-2.5 rounded-2xl px-2.5 py-2', active && 'ck-seat-on')}>
      <span className="grid size-10 shrink-0 place-items-center">
        <span
          aria-hidden="true"
          className={cn(
            'ck-piece !w-full text-sm font-bold',
            side === 'BOTTOM' ? 'ck-red text-accent-ink' : 'ck-pearl text-ink',
          )}
        >
          <span className="relative">{who.name.trim().slice(0, 1).toUpperCase()}</span>
        </span>
      </span>

      <div className="min-w-0 flex-1">
        <p dir="auto" className={cn('truncate text-sm', active ? 'font-semibold text-ink' : 'font-medium text-ink-soft')}>
          {who.name}
        </p>
        {took > 0 ? (
          <p className="mt-0.5 flex items-center gap-1.5">
            <span className="flex items-center" aria-hidden="true">
              {Array.from({ length: Math.min(took, 8) }, (_, k) => (
                <span key={k} className={cn('ck-chip', enemy)} />
              ))}
            </span>
            <span className="text-[11px] font-semibold tabular-nums text-ink-soft">×{took}</span>
          </p>
        ) : null}
      </div>

      {active ? (
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-accent px-2.5 py-1 text-[11px] font-semibold text-accent-ink shadow-sm">
          <span aria-hidden="true" className="ck-live" />
          <Untranslated>{ot('game.checkers.yourTurn')}</Untranslated>
        </span>
      ) : null}
    </div>
  )
}

/**
 * ป๊อปอัปจบเกม — ใช้ร่วมกันทั้งเล่นกับบอท ส่งเครื่องกันเล่น และออนไลน์
 *
 * ★★ ชนะ = ฉลองเต็มที่ · แพ้ = เศร้าแบบน่ารัก ไม่ใช่ซ้ำเติม
 *    ★ ชนะ: ถ้วยทองลอย แสงหมุน ประกายระยิบ พลุ เสียงอาร์เพจจิโอ
 *    ★ แพ้: เมฆฝน หมากของเราร้องไห้ เสียง "วา–วา–วาาา" แล้วชวนแก้มือ
 * ★ คำโปรยสุ่มจากชุดในดิกชันนารี — เลือกจากหน้ากระดานตอนจบ (ไม่ใช่ Math.random)
 *   ★★ render ซ้ำกี่รอบก็ได้คำเดิม ไม่กระพริบเปลี่ยนคำ
 * ★ ปิดป๊อปอัปเพื่อดูกระดานได้ แล้วเหลือแถบเล็ก ๆ ให้เปิดผลอีกครั้ง
 */
export function CheckersResult({
  tone,
  title,
  board,
  side = 'BOTTOM',
  note,
  stats: statsOverride,
  piece,
  seed: seedOverride,
  lines: linesOverride,
  sub: subOverride,
  children,
}: {
  tone: 'win' | 'lose' | 'draw'
  /** หัวเรื่องสั้น เช่น "คุณชนะ!" / "บอทชนะ" */
  title: string
  /** กระดานหมากฮอส — เกมอื่น (เช่นเรียง 4) ไม่ต้องส่ง แล้วส่ง stats/piece/seed ของตัวเองแทน */
  board?: Board
  /** มุมมองของใคร — ใช้นับ "กินได้กี่ตัว / เหลือกี่ตัว" */
  side?: Side
  /** หมายเหตุเล็ก ๆ เช่น "(อีกฝ่ายยอมแพ้)" */
  note?: string | null
  /** ★ แถวสถิติของเกมอื่น — แทนแถว "กินได้ · เหลือ" ของหมากฮอส */
  stats?: ReactNode
  /** ★ รูปหมากในภาพแพ้/เสมอ — 'mine' = ฝั่งเรา · 'theirs' = อีกฝ่าย */
  piece?: (who: 'mine' | 'theirs') => ReactNode
  /** ★ ตัวเลือกประโยคสุ่ม — ต้องคงที่ต่อเกม (ห้ามสุ่มตอน render) */
  seed?: number
  /** ★ ประโยคสุ่มของเกมอื่น (คั่นด้วย ·) — ของหมากฮอสพูดถึงหมากฮอสตรง ๆ */
  lines?: string
  /** ★ บรรทัดรองของเกมอื่น */
  sub?: string
  children: ReactNode
}) {
  const ot = useOt()
  const [open, setOpen] = useState(true)

  const mine = board ? board.filter((c) => sideOf(c) === side).length : 0
  const theirs = board ? board.filter((c) => sideOf(c) !== null && sideOf(c) !== side).length : 0
  const seed = seedOverride ?? (board ? board.reduce<number>((s, c, i) => s + Math.abs(c) * (i + 1), 0) : 0)
  const lines = splitList(
    linesOverride ??
      ot(tone === 'win' ? 'game.checkers.winLines' : tone === 'lose' ? 'game.checkers.loseLines' : 'game.checkers.drawLines'),
  )
  const headline = lines[seed % Math.max(1, lines.length)] ?? title
  const sub =
    subOverride ?? ot(tone === 'win' ? 'game.checkers.winSub' : tone === 'lose' ? 'game.checkers.loseSub' : 'game.checkers.drawSub')

  /* ★ เสียงเล่นพร้อมจังหวะที่ป๊อปอัปโผล่ ไม่ใช่ทันทีที่ตาสุดท้ายเดิน */
  useEffect(() => {
    const id = window.setTimeout(() => {
      if (tone === 'win') {
        playCelebrate()
        vibrate([30, 40, 60])
      } else if (tone === 'lose') {
        playSad()
        vibrate(120)
      }
    }, 750)
    return () => window.clearTimeout(id)
  }, [tone])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  /* ── ปิดป๊อปอัปแล้ว: แถบสรุปเล็ก ๆ ใต้กระดาน ── */
  if (!open) {
    return (
      <div className="mx-auto mt-5 flex max-w-md flex-wrap items-center justify-center gap-2 rounded-3xl border border-line bg-elevated p-3">
        <p className="w-full text-center text-sm font-semibold text-ink">
          <Untranslated>{title}</Untranslated>
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex min-h-11 items-center rounded-full bg-surface px-4 text-sm text-ink transition-colors hover:bg-surface-hover"
        >
          <Untranslated>{ot('game.checkers.showResult')}</Untranslated>
        </button>
        {children}
      </div>
    )
  }

  const stats = statsOverride !== undefined ? statsOverride : !board ? null : (
    <div className="ckr-rise mt-4 flex flex-wrap justify-center gap-2" style={{ '--d': '1.25s' } as CSSProperties}>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-xs font-medium text-ink">
        <span className={cn('ck-chip', side === 'BOTTOM' ? 'ck-pearl' : 'ck-red')} aria-hidden="true" />
        <Untranslated>{ot('game.checkers.statTook', { n: 8 - theirs })}</Untranslated>
      </span>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-xs font-medium text-ink">
        <span className={cn('ck-chip', side === 'BOTTOM' ? 'ck-red' : 'ck-pearl')} aria-hidden="true" />
        <Untranslated>{ot('game.checkers.statLeft', { n: mine })}</Untranslated>
      </span>
    </div>
  )

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => e.target === e.currentTarget && setOpen(false)}
      className="ckr-veil fixed inset-0 z-[80] grid place-items-center overflow-y-auto p-4"
    >
      {tone === 'win' ? <Confetti pieces={160} durationMs={4200} /> : null}

      <div
        className={cn(
          'ckr-card w-full max-w-sm rounded-[28px] px-6 pb-6 pt-8 text-center',
          tone === 'win' ? 'ckr-win' : tone === 'lose' ? 'ckr-lose' : 'ckr-draw',
        )}
      >
        {/* ── ภาพประกอบ ───────────────────────────────────────── */}
        {tone === 'win' ? (
          <>
            <span aria-hidden="true" className="ckr-rays" />
            {[
              ['14%', '18%', '0s', 18],
              ['82%', '14%', '0.4s', 14],
              ['24%', '44%', '0.8s', 10],
              ['76%', '40%', '1.1s', 16],
              ['50%', '6%', '0.6s', 12],
              ['8%', '34%', '1.4s', 9],
            ].map(([x, y, d, s]) => (
              <svg
                key={`${x}${y}`}
                viewBox="0 0 24 24"
                className="ckr-star"
                style={{ left: x, top: y, width: s, height: s, '--d': d } as CSSProperties}
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M12 0c.8 6.4 5.6 11.2 12 12-6.4.8-11.2 5.6-12 12-.8-6.4-5.6-11.2-12-12C6.4 11.2 11.2 6.4 12 0z" />
              </svg>
            ))}
            <svg viewBox="0 0 64 64" className="ckr-trophy mx-auto size-28" aria-hidden="true">
              <defs>
                <linearGradient id="ckr-gold" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="var(--ck-shine)" />
                  <stop offset="0.25" stopColor="var(--ck-gold)" />
                  <stop offset="1" stopColor="var(--ck-gold-deep)" />
                </linearGradient>
              </defs>
              <path fill="url(#ckr-gold)" d="M18 6h28v6h8v6c0 7-5 12-11.5 12.6A15 15 0 0 1 35 39.4V46h7a3 3 0 0 1 3 3v3H19v-3a3 3 0 0 1 3-3h7v-6.6a15 15 0 0 1-7.5-8.8C15 30 10 25 10 18v-6h8zm0 12v-1h-3v1c0 3.6 2.3 6.6 5.4 7.6A15 15 0 0 1 18 18zm28 0c0 2.7-.9 5.3-2.4 7.6 3.1-1 5.4-4 5.4-7.6v-1h-3z" />
              <rect x="16" y="54" width="32" height="5" rx="2" fill="url(#ckr-gold)" />
              <path fill="var(--ck-shine)" opacity="0.55" d="M24 10h4v14c0 3 1 5.5 2.5 7.5-4-1-6.5-4.6-6.5-9z" />
              <path fill="var(--color-accent)" d="m32 14 2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.6-4.8 2.6.9-5.4-3.9-3.8 5.4-.8z" />
            </svg>
          </>
        ) : tone === 'lose' ? (
          <>
            {Array.from({ length: 16 }, (_, k) => (
              <span
                key={k}
                aria-hidden="true"
                className="ckr-rain"
                style={{ left: `${(k * 41 + 5) % 100}%`, '--d': `${((k * 7) % 11) / 10}s` } as CSSProperties}
              />
            ))}
            <svg viewBox="0 0 64 32" className="ckr-cloud mx-auto -mb-1 h-10 w-24" fill="currentColor" aria-hidden="true">
              <path d="M18 30a12 12 0 0 1-1.6-23.9A16 16 0 0 1 46 10a10 10 0 0 1 2 19.8V30z" />
            </svg>
            <span className="ckr-sad relative mx-auto grid size-24 place-items-center">
              {piece ? piece('mine') : <Piece cell={side === 'BOTTOM' ? B_MAN : W_MAN} className="!w-full" />}
              {/* ★ หน้าเศร้าวาดทับหมาก — ใช้สีตัวหนังสือของฝั่งนั้นให้ตัดกับพื้นหมาก */}
              <svg
                viewBox="0 0 40 40"
                className={cn('absolute size-14', side === 'BOTTOM' ? 'text-accent-ink' : 'text-ink')}
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M10 17l6-3M30 17l-6-3" />
                <path d="M13 21h.01M27 21h.01" strokeWidth="3.6" />
                <path d="M14 31c3.5-4 8.5-4 12 0" />
                <path className="ckr-tear" d="M27 24c1.6 2.4 2.4 3.8 2.4 4.8a2.4 2.4 0 0 1-4.8 0c0-1 .8-2.4 2.4-4.8z" fill="var(--color-link)" stroke="none" />
              </svg>
            </span>
          </>
        ) : (
          <span className="relative mx-auto flex h-24 items-center justify-center">
            <span className="ckr-bump-l grid size-20 place-items-center">
              {piece ? piece('mine') : <Piece cell={B_MAN} className="!w-full" />}
            </span>
            <span className="ckr-bump-r -ms-4 grid size-20 place-items-center">
              {piece ? piece('theirs') : <Piece cell={W_MAN} className="!w-full" />}
            </span>
          </span>
        )}

        {/* ── ข้อความ ────────────────────────────────────────── */}
        <p
          className={cn(
            'ckr-rise mt-5 inline-flex rounded-full px-3 py-1 text-xs font-bold tracking-wide',
            tone === 'win'
              ? 'bg-[color-mix(in_srgb,var(--ck-gold)_22%,transparent)] text-ink'
              : 'bg-surface text-ink-soft',
          )}
          style={{ '--d': '1.05s' } as CSSProperties}
        >
          <Untranslated>{title}</Untranslated>
        </p>
        <h2
          className={cn(
            'ckr-rise mt-2 text-[clamp(1.6rem,7vw,2rem)] font-black leading-tight tracking-tight',
            tone === 'win' ? 'ckr-headline-win' : 'text-ink',
          )}
          style={{ '--d': '1.15s' } as CSSProperties}
        >
          <Untranslated>{headline}</Untranslated>
        </h2>
        <p className="ckr-rise mt-2 text-sm leading-relaxed text-ink-soft" style={{ '--d': '1.2s' } as CSSProperties}>
          <Untranslated>{sub}</Untranslated>
        </p>
        {note ? (
          <p className="ckr-rise mt-1 text-xs text-ink-faint" style={{ '--d': '1.2s' } as CSSProperties}>
            <Untranslated>{note}</Untranslated>
          </p>
        ) : null}

        {tone !== 'draw' ? stats : null}

        <div className="ckr-rise mt-6 flex flex-col gap-2" style={{ '--d': '1.35s' } as CSSProperties}>
          {children}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="inline-flex min-h-11 items-center justify-center rounded-full text-sm text-ink-soft transition-colors hover:text-ink"
          >
            <Untranslated>{ot('game.checkers.viewBoard')}</Untranslated>
          </button>
        </div>
      </div>
    </div>,
    document.body,
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
  useEffect(() => {
    runRef.current = run
  })

  const tick = useCallback(() => runRef.current(), [])

  useEffect(() => {
    if (!active) return
    const id = window.setTimeout(tick, delayMs)
    return () => window.clearTimeout(id)
  }, [active, delayMs, tick])
}

export { SIZE }
