'use client'

import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { apiFetch } from '@/lib/api/client'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import { officeErrorText } from '@/lib/i18n/office-format'
import { Untranslated, useOt } from '@/lib/i18n/office'
import { useConfirm } from '@/components/ConfirmProvider'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import type { Board, Player } from '@/lib/games/connect4'
import { CheckersResult } from './CheckersBoard'
import { Connect4Board, Connect4Seats } from './Connect4Board'
import { TurnBanner } from './TurnBanner'

/** เวลาต่อตา (วินาที) — ตัวเดียวกับหมากฮอส */
const TURN_SECONDS = 60

export type OnlineC4Game = {
  id: string
  board: Board
  turn: Player
  version: number
  status: 'PLAYING' | 'FINISHED'
  myPlayer: Player
  myTurn: boolean
  lastCell: number | null
  winCells: number[]
  winnerId: string | null
  endReason: string | null
  drawOfferFromOpponent: boolean
  red: { id: string; name: string }
  gold: { id: string; name: string }
  opponent: { id: string; name: string }
  updatedAt: string
}

/**
 * เรียง 4 ออนไลน์หนึ่งเกม
 *
 * ★★★ หน้าจอไม่เก็บกระดานเป็นของตัวเอง — ความจริงอยู่ที่ server เสมอ
 *
 *     ★ กดหยอด → ยิง API → รับกระดานใหม่กลับมา → วาด
 *       ★★ ไม่วาดล่วงหน้าแล้วค่อยแก้ทีหลัง เพราะถ้า server ปฏิเสธ ผู้เล่น
 *          จะเห็นเหรียญโผล่มาแล้วหายไป ซึ่งทำให้ไม่เชื่อถือทั้งเกม
 *     ★ แลกมากับการหน่วงหนึ่งรอบคำขอ ซึ่งในเกมผลัดตากันไม่มีใครรู้สึก
 */
export function Connect4Online({
  gameId,
  onExit,
  onRematch,
}: {
  gameId: string
  onExit: () => void
  /** ★ ท้าคนเดิมแล้วได้เกมใหม่ — ผู้เรียกเป็นคนพาไป ไม่ใช่คอมโพเนนต์นี้ */
  onRematch?: (gameId: string) => void
}) {
  const ot = useOt()
  const confirm = useConfirm()
  const [game, setGame] = useState<OnlineC4Game | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(TURN_SECONDS)

  const load = useCallback(async () => {
    try {
      const res = await apiFetch<{ game: OnlineC4Game }>(
        `/api/office/games/connect4?id=${encodeURIComponent(gameId)}`,
      )
      setGame(res.game)
      setError(null)
    } catch (e) {
      setError(officeErrorText(e, ot))
    }
  }, [gameId])

  useEffect(() => {
    void load()
  }, [load])

  /*
   * ★★ ฟังแถวเกมแถวเดียวผ่าน Realtime
   *    ★ ได้ event แล้วโหลดใหม่ ไม่ใช่เอา payload มาวาดตรง ๆ
   *      payload เป็นแถวดิบที่ยังไม่ผ่านการคำนวณ myPlayer/myTurn ของ server
   *      ★★ เอามาวาดเองจะต้องเขียนกติกา "ฉันเป็นเบอร์ไหน" ซ้ำที่หน้าจอ
   */
  useEffect(() => {
    const supabase = getSupabaseBrowserClient()
    const channel = supabase
      .channel(`connect4:${gameId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'connect4_games', filter: `id=eq.${gameId}` },
        () => {
          void load()
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [gameId, load])

  /*
   * ── นาฬิกาต่อตา ──────────────────────────────────────────────
   * ★★★ นับจาก updated_at ของแถว ไม่ใช่นับถอยหลังในเครื่องตัวเอง
   *     ★ เครื่องที่เพิ่งเปิดกลับมาต้องเห็นเวลาที่เหลือ "จริง"
   *       ไม่ใช่เริ่มนับ 60 ใหม่
   */
  useEffect(() => {
    if (!game || game.status !== 'PLAYING') return
    const base = Date.parse(game.updatedAt)
    const tick = () => {
      const used = Math.floor((Date.now() - base) / 1000)
      setSecondsLeft(Math.max(0, TURN_SECONDS - used))
    }
    tick()
    const id = window.setInterval(tick, 500)
    return () => window.clearInterval(id)
  }, [game])

  async function send(body: Record<string, unknown>) {
    setBusy(true)
    setError(null)
    try {
      const res = await apiFetch<{ game: OnlineC4Game }>('/api/office/games/connect4', {
        method: 'POST',
        body,
      })
      setGame(res.game)
    } catch (e) {
      setError(officeErrorText(e, ot))
      /* ★ ล้มแล้วโหลดใหม่ — สถานะจริงอาจเปลี่ยนไปแล้วระหว่างที่เรากำลังคิด */
      void load()
    } finally {
      setBusy(false)
    }
  }

  function drop(col: number) {
    if (!game) return
    void send({ action: 'move', gameId, version: game.version, col })
  }

  if (!game) {
    return <p className="py-16 text-center text-sm text-ink-faint">{error ?? ot('common.loading')}</p>
  }

  const over = game.status === 'FINISHED'
  const opponentName = game.opponent.name
  const iWon = game.winnerId === (game.myPlayer === 1 ? game.red.id : game.gold.id)
  const names: Record<Player, string> = { 1: game.red.name, 2: game.gold.name }

  return (
    <div className="py-2">
      {/* ★ อยู่เหนือทุกอย่าง — คำถามเดียวที่ต้องตอบตลอดเวลาคือ "ตาใคร" */}
      {!over ? <TurnBanner mine={game.myTurn} name={opponentName} seconds={secondsLeft} /> : null}

      {/*
        * ★★ ป้ายชื่อใช้ชื่อคนจริงทั้งสองฝั่ง ไม่ใช่ "คุณ/คู่ต่อสู้"
        *    ★ สีเหรียญบอกว่าใครเป็นใครอยู่แล้ว และชื่อจริงทำให้เห็นว่า
        *      กำลังเล่นกับใครโดยไม่ต้องกลับไปดูรายการเกม
        */}
      <Connect4Seats
        names={names}
        turn={game.turn}
        over={over}
        /*
         * ★★ ขึ้นคำใต้ชื่อเฉพาะตอนเป็นตาเราเอง
         *    ★ ใส่ "รออีกฝ่าย" ไว้ใต้ชื่ออีกฝ่ายอ่านแล้วสับสน — เหมือนบอกว่า
         *      เขากำลังรอ ทั้งที่คนที่รออยู่คือเรา
         *      ★★ ป้ายที่เรืองแสงบอกว่าถึงตาใครอยู่แล้ว และบรรทัดนาฬิกา
         *         ข้างล่างบอกว่ารอใครและเหลือกี่วินาที
         */
        sub={(p) => (p === game.myPlayer ? ot('game.online.yourMove') : null)}
      />

      <Connect4Board
        board={game.board}
        turn={game.turn}
        last={game.lastCell}
        winCells={game.winCells}
        disabled={over || busy || !game.myTurn}
        onDrop={drop}
      />

      {/* ★ หมดเวลาแล้วใครก็กดรายงานได้ — คนที่หมดเวลามักปิดแอปไปแล้ว */}
      {!over && secondsLeft === 0 ? (
        <div className="mt-2 text-center">
          <Button
            variant="secondary"
            className="min-h-11"
            loading={busy}
            onClick={() => void send({ action: 'end', gameId, kind: 'TIMEOUT' })}
          >
            <Untranslated>{ot('game.online.claimTimeout')}</Untranslated>
          </Button>
        </div>
      ) : null}

      {/* ── อีกฝ่ายขอเสมอ ──────────────────────────────────────── */}
      {!over && game.drawOfferFromOpponent ? (
        <div className="mx-auto mt-3 flex max-w-md flex-wrap items-center justify-center gap-2 rounded-xl bg-surface p-3">
          <span className="text-sm text-ink">
            <Untranslated>{ot('game.online.drawOffered', { name: opponentName })}</Untranslated>
          </span>
          <Button
            variant="primary"
            className="min-h-11"
            loading={busy}
            onClick={() => void send({ action: 'end', gameId, kind: 'ACCEPT_DRAW' })}
          >
            <Untranslated>{ot('game.online.acceptDraw')}</Untranslated>
          </Button>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 text-center text-sm text-danger">
          {error}
        </p>
      ) : null}

      {/* ── จบเกม ───────────────────────────────────────────────── */}
      {over ? (
        <CheckersResult
          tone={game.endReason === 'DRAW' ? 'draw' : iWon ? 'win' : 'lose'}
          /* ★ เลขนิ่ง ๆ จากเวอร์ชันเกม — ประโยคฉลองไม่เปลี่ยนทุกครั้งที่โหลดใหม่ */
          seed={game.version}
          lines={ot(
            game.endReason === 'DRAW'
              ? 'game.c4.drawLines'
              : iWon
                ? 'game.c4.winLines'
                : 'game.c4.loseLines',
          )}
          piece={(who) => (
            <span
              aria-hidden="true"
              className={cn(
                'c4-disc block size-full',
                (who === 'mine') === (game.myPlayer === 1) ? 'c4-red' : 'c4-gold',
              )}
            />
          )}
          stats={
            game.winCells.length ? (
              <div
                className="ckr-rise mt-4 flex flex-wrap justify-center gap-2"
                style={{ '--d': '1.25s' } as CSSProperties}
              >
                <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-xs font-medium text-ink">
                  <Untranslated>{ot('game.c4.statLine', { n: game.winCells.length })}</Untranslated>
                </span>
              </div>
            ) : null
          }
          title={
            game.endReason === 'DRAW'
              ? ot('game.checkers.draw')
              : iWon
                ? ot('game.checkers.youWin')
                : ot('game.checkers.youLose')
          }
          note={
            game.endReason && game.endReason !== 'WIN' && game.endReason !== 'DRAW'
              ? game.endReason === 'RESIGN'
                ? ot('game.online.byResign')
                : ot('game.online.byTimeout')
              : null
          }
        >
          {/* ★ ท้าคนเดิมทันที — สลับสีให้ที่ server ไม่งั้นคนเดิมหยอดก่อนทุกเกม */}
          <Button
            variant="primary"
            className="min-h-12 text-base"
            loading={busy}
            onClick={async () => {
              try {
                const res = await apiFetch<{ gameId: string }>('/api/office/games/connect4', {
                  method: 'POST',
                  body: { action: 'rematch', gameId },
                })
                onRematch?.(res.gameId)
              } catch (e) {
                setError(officeErrorText(e, ot))
              }
            }}
          >
            <Untranslated>
              {game.endReason !== 'DRAW' && !iWon ? ot('game.checkers.revenge') : ot('game.checkers.again')}
            </Untranslated>
          </Button>
          <Button variant="secondary" className="min-h-11" onClick={onExit}>
            <Untranslated>{ot('game.checkers.backToMenu')}</Untranslated>
          </Button>
        </CheckersResult>
      ) : (
        /* ── เมนู ⋯ : ขอเสมอ · ยอมแพ้ ───────────────────────── */
        <div className="mt-4 flex justify-center">
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-label={ot('game.online.more')}
              className="grid size-11 place-items-center rounded-full bg-surface text-ink-soft transition-colors hover:bg-surface-hover hover:text-ink"
            >
              <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true">
                <circle cx="5" cy="12" r="1.8" />
                <circle cx="12" cy="12" r="1.8" />
                <circle cx="19" cy="12" r="1.8" />
              </svg>
            </button>

            {menuOpen ? (
              <div className="absolute bottom-12 start-1/2 z-40 w-52 -translate-x-1/2 overflow-hidden rounded-xl border border-line bg-elevated shadow-xl rtl:translate-x-1/2">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    void send({ action: 'end', gameId, kind: 'OFFER_DRAW' })
                  }}
                  className="flex min-h-11 w-full items-center px-3 text-start text-[13px] text-ink hover:bg-surface"
                >
                  <Untranslated>{ot('game.online.offerDraw')}</Untranslated>
                </button>
                {/* ★★ ยอมแพ้ต้องยืนยัน — กดพลาดแล้วย้อนไม่ได้ */}
                <button
                  type="button"
                  onClick={async () => {
                    setMenuOpen(false)
                    if (
                      !(await confirm({
                        kind: 'danger',
                        message: ot('game.online.resignAsk'),
                        confirmLabel: ot('game.online.resign'),
                      }))
                    )
                      return
                    void send({ action: 'end', gameId, kind: 'RESIGN' })
                  }}
                  className="flex min-h-11 w-full items-center border-t border-line px-3 text-start text-[13px] text-danger hover:bg-surface"
                >
                  <Untranslated>{ot('game.online.resign')}</Untranslated>
                </button>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}
