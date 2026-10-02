'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api/client'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/cn'
import { officeErrorText } from '@/lib/i18n/office-format'
import { Untranslated, useOt } from '@/lib/i18n/office'
import { getSupabaseBrowserClient } from '@/lib/supabase/client'
import type { Board, Move, Side } from '@/lib/games/checkers'
import { CheckersBoard } from './CheckersBoard'

/** เวลาต่อตา (วินาที) — ตามข้อกำหนด */
const TURN_SECONDS = 60

export type OnlineGame = {
  id: string
  board: Board
  turn: Side
  version: number
  status: 'PLAYING' | 'FINISHED'
  forceCapture: boolean
  mySide: Side
  myTurn: boolean
  lastMove: { from: number; to: number } | null
  winnerId: string | null
  endReason: string | null
  drawOfferFromOpponent: boolean
  bottom: { id: string; name: string }
  top: { id: string; name: string }
  updatedAt: string
}

/**
 * หมากฮอสออนไลน์หนึ่งเกม
 *
 * ★★★ หน้าจอไม่เก็บกระดานเป็นของตัวเอง — ความจริงอยู่ที่ server เสมอ
 *
 *     ★ กดเดิน → ยิง API → รับกระดานใหม่กลับมา → วาด
 *       ★★ ไม่วาดล่วงหน้าแล้วค่อยแก้ทีหลัง เพราะถ้า server ปฏิเสธ
 *          ผู้เล่นจะเห็นหมากเด้งกลับ ซึ่งทำให้ไม่เชื่อถือทั้งเกม
 *     ★ แลกมากับการหน่วงหนึ่งรอบคำขอ ซึ่งในเกมผลัดตากันไม่มีใครรู้สึก
 */
export function CheckersOnline({
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
  const [game, setGame] = useState<OnlineGame | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(TURN_SECONDS)

  const load = useCallback(async () => {
    try {
      const res = await apiFetch<{ game: OnlineGame }>(
        `/api/office/games/checkers?id=${encodeURIComponent(gameId)}`,
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
   *    ★ ไม่ใช้ presence เพราะสิ่งที่ต้องรู้คือ "กระดานเปลี่ยนไหม"
   *      ไม่ใช่ "ใครออนไลน์อยู่"
   *    ★★ ได้ event แล้วโหลดใหม่ ไม่ใช่เอา payload มาวาดตรง ๆ
   *       payload เป็นแถวดิบที่ยังไม่ผ่านการคำนวณ mySide/myTurn ของ server
   *       ★ เอามาวาดเองจะต้องเขียนกติกา "ฝั่งไหนของฉัน" ซ้ำที่หน้าจอ
   */
  useEffect(() => {
    const supabase = getSupabaseBrowserClient()
    const channel = supabase
      .channel(`checkers:${gameId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'checkers_games', filter: `id=eq.${gameId}` },
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
   *
   *     ★ เครื่องที่เพิ่งเปิดกลับมาต้องเห็นเวลาที่เหลือ "จริง" ไม่ใช่เริ่มนับ 60 ใหม่
   *       ★★ ข้อกำหนดบอกว่าหลุดแล้วกลับมาต้องเล่นต่อจากเดิมได้
   *          ซึ่งรวมถึงนาฬิกาด้วย
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
      const res = await apiFetch<{ game: OnlineGame }>('/api/office/games/checkers', {
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

  function commit(m: Move) {
    if (!game) return
    void send({ action: 'move', gameId, version: game.version, from: m.from, to: m.to })
  }

  if (!game) {
    return (
      <p className="py-16 text-center text-sm text-ink-faint">
        {error ?? ot('common.loading')}
      </p>
    )
  }

  const over = game.status === 'FINISHED'
  const opponentName = game.mySide === 'BOTTOM' ? game.top.name : game.bottom.name

  return (
    <div className="py-2">
      <CheckersBoard
        board={game.board}
        turn={game.turn}
        mySide={game.mySide}
        forceCapture={game.forceCapture}
        onCommit={commit}
        lastMove={game.lastMove}
        disabled={over || busy || !game.myTurn}
        top={{ name: game.top.name }}
        bottom={{ name: game.bottom.name }}
      />

      {/* ── นาฬิกา ──────────────────────────────────────────────── */}
      {!over ? (
        <p
          className={cn(
            'mt-3 text-center text-sm tabular-nums',
            secondsLeft <= 10 ? 'font-semibold text-danger' : 'text-ink-soft',
          )}
        >
          <Untranslated>
            {game.myTurn
              ? ot('game.checkers.yourTurnIn', { n: secondsLeft })
              : ot('game.checkers.waitingFor', { name: opponentName, n: secondsLeft })}
          </Untranslated>
        </p>
      ) : null}

      {/* ★ หมดเวลาแล้วใครก็กดรายงานได้ — คนที่หมดเวลามักปิดแอปไปแล้ว */}
      {!over && secondsLeft === 0 ? (
        <div className="mt-2 text-center">
          <Button variant="secondary" className="min-h-11" loading={busy} onClick={() => void send({ action: 'end', gameId, kind: 'TIMEOUT' })}>
            <Untranslated>{ot('game.checkers.claimTimeout')}</Untranslated>
          </Button>
        </div>
      ) : null}

      {/* ── อีกฝ่ายขอเสมอ ──────────────────────────────────────── */}
      {!over && game.drawOfferFromOpponent ? (
        <div className="mx-auto mt-3 flex max-w-md flex-wrap items-center justify-center gap-2 rounded-xl bg-surface p-3">
          <span className="text-sm text-ink">
            <Untranslated>{ot('game.checkers.drawOffered', { name: opponentName })}</Untranslated>
          </span>
          <Button variant="primary" className="min-h-11" loading={busy} onClick={() => void send({ action: 'end', gameId, kind: 'ACCEPT_DRAW' })}>
            <Untranslated>{ot('game.checkers.acceptDraw')}</Untranslated>
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
        <div className="mx-auto mt-4 max-w-md rounded-2xl border border-line bg-elevated/60 p-5 text-center">
          <p className="text-lg font-bold text-ink">
            <Untranslated>
              {game.endReason === 'DRAW'
                ? ot('game.checkers.draw')
                : game.winnerId === (game.mySide === 'BOTTOM' ? game.bottom.id : game.top.id)
                  ? ot('game.checkers.youWin')
                  : ot('game.checkers.youLose')}
            </Untranslated>
          </p>
          {game.endReason && game.endReason !== 'WIN' && game.endReason !== 'DRAW' ? (
            <p className="mt-1 text-xs text-ink-faint">
              <Untranslated>
                {game.endReason === 'RESIGN' ? ot('game.checkers.byResign') : ot('game.checkers.byTimeout')}
              </Untranslated>
            </p>
          ) : null}
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {/* ★ ท้าคนเดิมทันที — สลับฝั่งให้ที่ server ไม่งั้นคนเดิมเดินก่อนทุกเกม */}
            <Button
              variant="primary"
              className="min-h-11"
              loading={busy}
              onClick={async () => {
                try {
                  const res = await apiFetch<{ gameId: string }>('/api/office/games/checkers', {
                    method: 'POST',
                    body: { action: 'rematch', gameId },
                  })
                  onRematch?.(res.gameId)
                } catch (e) {
                  setError(officeErrorText(e, ot))
                }
              }}
            >
              <Untranslated>{ot('game.checkers.again')}</Untranslated>
            </Button>
            <Button variant="ghost" className="min-h-11" onClick={onExit}>
              <Untranslated>{ot('game.checkers.backToMenu')}</Untranslated>
            </Button>
          </div>
        </div>
      ) : (
        /* ── เมนู ⋯ : ขอเสมอ · ยอมแพ้ ───────────────────────── */
        <div className="mt-4 flex justify-center">
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-label={ot('game.checkers.more')}
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
                  <Untranslated>{ot('game.checkers.offerDraw')}</Untranslated>
                </button>
                {/* ★★ ยอมแพ้ต้องยืนยัน — กดพลาดแล้วย้อนไม่ได้ */}
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false)
                    if (!window.confirm(ot('game.checkers.resignAsk'))) return
                    void send({ action: 'end', gameId, kind: 'RESIGN' })
                  }}
                  className="flex min-h-11 w-full items-center border-t border-line px-3 text-start text-[13px] text-danger hover:bg-surface"
                >
                  <Untranslated>{ot('game.checkers.resign')}</Untranslated>
                </button>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}
