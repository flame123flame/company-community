'use client'

import { useState, type CSSProperties } from 'react'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { Untranslated, useOt } from '@/lib/i18n/office'
import {
  botMove,
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
import { Connect4Board, Connect4Seats, MiniConnect4 } from './Connect4Board'
import { Connect4Online } from './Connect4Online'
import { GameLobby } from './GameLobby'
import { FunGuide } from './FunGuide'

type Mode = 'BOT' | 'PASS' | 'ONLINE'
type Game = { board: Board; turn: Player; last: number | null; moves: number }

const newGame = (): Game => ({ board: emptyBoard(), turn: 1, last: null, moves: 0 })

/**
 * เรียง 4 (Connect Four) — กับบอท 3 ระดับ · ส่งเครื่องกันเล่น · ท้าเพื่อนออนไลน์
 *
 * ★★ โครงเดียวกับหมากฮอสทุกจุด (หน้าเลือกโหมด · ตั้งค่าเพิ่ม · ลอบบี้ท้าเพื่อน ·
 *    ป๊อปอัปชนะ/แพ้) — คนที่เล่นหมากฮอสแล้วมาเล่นเกมนี้ไม่ต้องเรียนวิธีใช้ใหม่
 * ★ ผู้เล่นเป็นสีแดง (ตาแรกเสมอ) · บอทเป็นสีทอง
 *
 * ★★★ โหมดออนไลน์อยู่ที่ Connect4Online และลอบบี้ใช้ GameLobby ร่วมกับหมากฮอส
 *     ★ ไฟล์นี้ถือแต่เกมในเครื่อง ซึ่งเป็นเกมที่ "ความจริงอยู่ใน useState"
 *       ★★ ออนไลน์คือเกมที่ความจริงอยู่ที่ server — สองเรื่องนี้ปนกันในไฟล์เดียว
 *          จะมีสถานะที่ไม่มีใครรู้ว่าอันไหนเป็นของจริง
 */
export function Connect4Game() {
  const ot = useOt()
  const [mode, setMode] = useState<Mode | null>(null)
  const [level, setLevel] = useState<BotLevel>('MEDIUM')
  const [showOptions, setShowOptions] = useState(false)
  const [game, setGame] = useState<Game>(newGame)
  /* ★ เลขเกม — ใช้เลือกประโยคฉลอง/ปลอบให้ต่างกันแต่ละเกมโดยไม่สุ่มตอน render */
  const [round, setRound] = useState(0)
  /* ★ null = ยังอยู่ในลอบบี้ ยังไม่ได้เข้าเกมไหน */
  const [onlineId, setOnlineId] = useState<string | null>(null)

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
              {/* ★ ไอคอนและคำเหมือนหมากฮอสเป๊ะ — มันคือของเดียวกัน คนละเกม */}
              <ModeCard
                title={ot('game.online.challengeFriend')}
                detail={ot('game.online.onlineDetail')}
                icon="M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20a6 6 0 0 1 12 0M16 11h6M19 8v6"
                onClick={() => {
                  setOnlineId(null)
                  setMode('ONLINE')
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

  /* ── ออนไลน์: ลอบบี้ก่อน แล้วค่อยเข้าเกม ───────────────────── */
  if (mode === 'ONLINE') {
    return onlineId ? (
      <Connect4Online gameId={onlineId} onExit={() => setOnlineId(null)} onRematch={setOnlineId} />
    ) : (
      <div>
        <GameLobby game="connect4" onEnter={setOnlineId} />
        <div className="mt-4 text-center">
          <Button variant="ghost" className="min-h-11" onClick={() => setMode(null)}>
            <Untranslated>{ot('game.checkers.backToMenu')}</Untranslated>
          </Button>
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
      <Connect4Seats
        names={names}
        turn={game.turn}
        over={over}
        sub={() => (botTurn ? ot('game.checkers.botThinking') : ot('game.c4.yourTurn'))}
      />

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
