'use client'

import { useState, type CSSProperties } from 'react'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { Untranslated, useOt } from '@/lib/i18n/office'
import {
  COLS,
  ROWS,
  botMove,
  dropRow,
  emptyBoard,
  other,
  outcome,
  play,
  type Board,
  type BotLevel,
  type Player,
} from '@/lib/games/connect4'
import { ModeCard } from './CheckersIntro'
import { CheckersResult, useBotTurn } from './CheckersBoard'
import { FunGuide } from './FunGuide'

type Mode = 'BOT' | 'PASS'
type Game = { board: Board; turn: Player; last: number | null; moves: number }

const newGame = (): Game => ({ board: emptyBoard(), turn: 1, last: null, moves: 0 })

/**
 * เรียง 4 (Connect Four) — เล่นในเครื่อง: กับบอท 3 ระดับ · 2 คนบนเครื่องเดียว
 *
 * ★★ โครงเดียวกับหมากฮอส (หน้าเลือกโหมด · ตั้งค่าเพิ่ม · ป๊อปอัปชนะ/แพ้) — คนที่เล่นหมากฮอส
 *    แล้วมาเล่นเกมนี้ไม่ต้องเรียนวิธีใช้ใหม่
 * ★ ผู้เล่นเป็นสีแดง (ตาแรกเสมอ) · บอทเป็นสีทอง
 */
export function Connect4Game() {
  const ot = useOt()
  const [mode, setMode] = useState<Mode | null>(null)
  const [level, setLevel] = useState<BotLevel>('MEDIUM')
  const [showOptions, setShowOptions] = useState(false)
  const [game, setGame] = useState<Game>(newGame)
  /* ★ เลขเกม — ใช้เลือกประโยคฉลอง/ปลอบให้ต่างกันแต่ละเกมโดยไม่สุ่มตอน render */
  const [round, setRound] = useState(0)

  const result = outcome(game.board)
  const over = result.kind !== 'PLAYING'
  const botTurn = mode === 'BOT' && game.turn === 2 && !over

  useBotTurn(
    () => {
      const c = botMove(game.board, 2, level)
      if (c !== null) drop(c)
    },
    botTurn,
    650,
  )

  function drop(col: number) {
    setGame((g) => {
      if (outcome(g.board).kind !== 'PLAYING') return g
      const n = play(g.board, col, g.turn)
      if (!n) return g
      return { board: n.board, turn: other(g.turn), last: n.index, moves: g.moves + 1 }
    })
  }

  function restart() {
    setGame(newGame())
    setRound((r) => r + 1)
  }

  const levelName = ot(`game.checkers.level.${level}` as 'game.checkers.level.EASY')

  /* ── หน้าเลือกโหมด ─────────────────────────────────────────── */
  if (!mode) {
    return (
      <div className="py-2">
        <FunGuide id="connect4" art="connect4" />
        <div className="mt-6 grid items-center gap-8 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          <div className="mx-auto w-full max-w-[380px]">
            <MiniConnect4 />
          </div>

          <div>
            <p className="text-sm leading-relaxed text-ink-soft">
              <Untranslated>{ot('game.c4.pitch')}</Untranslated>
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <ModeCard
                tone="primary"
                title={ot('game.checkers.vsBot')}
                detail={ot('game.checkers.vsBotDetail')}
                icon="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8 10h.01M16 10h.01M8 15c1.5 1.3 6.5 1.3 8 0"
                onClick={() => {
                  restart()
                  setMode('BOT')
                }}
              />
              <ModeCard
                title={ot('game.checkers.passPlay')}
                detail={ot('game.checkers.passPlayDetail')}
                icon="M5 7h14v10H5zM12 7v10"
                onClick={() => {
                  restart()
                  setMode('PASS')
                }}
              />

              {/* ── ตั้งค่าเพิ่ม ─────────────────────────────────── */}
              <div className="rounded-2xl border border-line bg-elevated/50 p-5 backdrop-blur-md sm:col-span-2">
                <button
                  type="button"
                  onClick={() => setShowOptions((v) => !v)}
                  aria-expanded={showOptions}
                  className="flex min-h-11 w-full items-center justify-between text-sm text-ink-soft transition-colors hover:text-ink"
                >
                  <Untranslated>{ot('game.checkers.options')}</Untranslated>
                  <span aria-hidden="true">{showOptions ? '▲' : '▼'}</span>
                </button>
                {showOptions ? (
                  <>
                    <p className="mb-2 mt-3 text-[11px] uppercase tracking-wide text-ink-faint">
                      <Untranslated>{ot('game.checkers.level')}</Untranslated>
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {(['EASY', 'MEDIUM', 'HARD'] as BotLevel[]).map((l) => (
                        <button
                          key={l}
                          type="button"
                          onClick={() => setLevel(l)}
                          aria-pressed={level === l}
                          className={cn(
                            'h-11 rounded-full px-4 text-sm transition-colors',
                            level === l ? 'bg-ink font-medium text-page' : 'bg-surface text-ink-soft hover:bg-surface-hover',
                          )}
                        >
                          {ot(`game.checkers.level.${l}` as 'game.checkers.level.EASY')}
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="mt-2 text-xs text-ink-faint">
                    <Untranslated>{ot('game.c4.optionsHint', { level: levelName })}</Untranslated>
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  /* ── กระดาน ────────────────────────────────────────────────── */
  const names: Record<Player, string> =
    mode === 'BOT'
      ? { 1: ot('game.checkers.you'), 2: `${ot('game.checkers.bot')} · ${levelName}` }
      : { 1: ot('game.c4.red'), 2: ot('game.c4.gold') }
  const winCells = result.kind === 'WIN' ? result.cells : []
  const tone: 'win' | 'lose' | 'draw' =
    result.kind === 'DRAW' ? 'draw' : result.kind === 'WIN' && mode === 'BOT' && result.player === 2 ? 'lose' : 'win'
  const winnerPlayer = result.kind === 'WIN' ? result.player : 1

  return (
    <div className="py-2">
      {/* ── ป้ายผู้เล่นสองฝั่ง: ฝั่งที่ถึงตาเรืองแสง ── */}
      <div className="mx-auto mb-4 flex max-w-[560px] items-center justify-between gap-3">
        {([1, 2] as Player[]).map((p) => (
          <div
            key={p}
            className={cn('c4-seat flex min-w-0 items-center gap-2.5 rounded-full py-1.5 ps-1.5 pe-4', !over && game.turn === p && 'c4-seat-on')}
          >
            <span aria-hidden="true" className={cn('c4-disc size-8 shrink-0', p === 1 ? 'c4-red' : 'c4-gold')} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-bold text-ink">
                <Untranslated>{names[p]}</Untranslated>
              </span>
              {!over && game.turn === p ? (
                <span className="block text-[11px] text-ink-soft">
                  <Untranslated>{botTurn ? ot('game.checkers.botThinking') : ot('game.c4.yourTurn')}</Untranslated>
                </span>
              ) : null}
            </span>
          </div>
        ))}
      </div>

      <Connect4Board
        board={game.board}
        turn={game.turn}
        last={game.last}
        winCells={winCells}
        disabled={over || botTurn}
        onDrop={drop}
      />

      {over ? (
        <CheckersResult
          key={round}
          tone={tone}
          seed={round + game.moves}
          lines={ot(tone === 'win' ? 'game.c4.winLines' : tone === 'lose' ? 'game.c4.loseLines' : 'game.c4.drawLines')}
          sub={ot(tone === 'win' ? 'game.checkers.winSub' : tone === 'lose' ? 'game.checkers.loseSub' : 'game.checkers.drawSub')}
          piece={(who) => (
            <span
              aria-hidden="true"
              className={cn(
                'c4-disc block size-full',
                (who === 'mine') === (mode === 'BOT' || winnerPlayer === 1) ? 'c4-red' : 'c4-gold',
              )}
            />
          )}
          stats={
            <div className="ckr-rise mt-4 flex flex-wrap justify-center gap-2" style={{ '--d': '1.25s' } as CSSProperties}>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-xs font-medium text-ink">
                <Untranslated>{ot('game.c4.statMoves', { n: game.moves })}</Untranslated>
              </span>
              {winCells.length ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-xs font-medium text-ink">
                  <span aria-hidden="true" className={cn('c4-disc size-3.5', winnerPlayer === 1 ? 'c4-red' : 'c4-gold')} />
                  <Untranslated>{ot('game.c4.statLine', { n: winCells.length })}</Untranslated>
                </span>
              ) : null}
            </div>
          }
          title={
            result.kind === 'DRAW'
              ? ot('game.checkers.draw')
              : mode === 'BOT'
                ? winnerPlayer === 1
                  ? ot('game.checkers.youWin')
                  : ot('game.checkers.youLose')
                : winnerPlayer === 1
                  ? ot('game.c4.redWins')
                  : ot('game.c4.goldWins')
          }
        >
          <Button variant="primary" className="min-h-12 text-base" onClick={restart}>
            <Untranslated>{tone === 'lose' ? ot('game.checkers.revenge') : ot('game.checkers.again')}</Untranslated>
          </Button>
          <Button variant="secondary" className="min-h-11" onClick={() => setMode(null)}>
            <Untranslated>{ot('game.checkers.backToMenu')}</Untranslated>
          </Button>
        </CheckersResult>
      ) : (
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Button variant="ghost" className="min-h-11" onClick={restart}>
            <Untranslated>{ot('game.checkers.restart')}</Untranslated>
          </Button>
          <Button variant="ghost" className="min-h-11" onClick={() => setMode(null)}>
            <Untranslated>{ot('game.checkers.backToMenu')}</Untranslated>
          </Button>
        </div>
      )}
    </div>
  )
}

/**
 * กระดาน 7×6
 *
 * ★ แต่ละคอลัมน์เป็นปุ่มเดียวทั้งแท่ง — แตะตรงไหนของคอลัมน์ก็หยอดได้ (เป้าใหญ่บนมือถือ)
 * ★ ชี้/โฟกัสคอลัมน์ = เหรียญเงาลอยรอบนหัวคอลัมน์ และวงเงาที่ช่องที่จะตก
 * ★ เหรียญใหม่หล่นจากบนสุดลงมาเด้ง (ระยะหล่นตามแถว) · แถวชนะเรืองแสง ที่เหลือจาง
 */
function Connect4Board({
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

/** กระดานตัวอย่างบนหน้าเลือกโหมด — แถวทแยงชนะเรืองแสง */
function MiniConnect4() {
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
