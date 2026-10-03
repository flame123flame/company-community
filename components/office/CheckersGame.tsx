'use client'

import { useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { Untranslated, useOt } from '@/lib/i18n/office'
import { botMove, type BotLevel, type Move } from '@/lib/games/checkers'
import { CheckersOnline } from './CheckersOnline'
import { CheckersLobby } from './CheckersLobby'
import { MiniBoard, ModeCard } from './CheckersIntro'
import {
  CheckersBoard,
  localOutcome,
  newLocalGame,
  playLocal,
  useBotTurn,
  type LocalGame,
} from './CheckersBoard'

type Mode = 'BOT' | 'PASS' | 'ONLINE'

/**
 * หมากฮอส — โหมดเล่นในเครื่อง (กับบอท และส่งเครื่องกันเล่น)
 *
 * ★★★ เริ่มเล่นได้ใน 2 แตะจากหน้าเมนูเกม ตามข้อกำหนด
 *
 *     ★ แตะ 1 = การ์ด "หมากฮอส" ในเมนู → มาถึงหน้านี้
 *       แตะ 2 = ปุ่ม "เล่นกับบอท" → กระดานขึ้นทันที
 *     ★★ ระดับความยากมีค่าเริ่มต้นเป็น "กลาง" และอยู่ใต้ "ตั้งค่าเพิ่ม"
 *        ซึ่งยุบไว้ — ข้อกำหนดห้ามมีขั้นตอนตั้งค่าก่อนเล่น
 */
export function CheckersGame() {
  const ot = useOt()
  const [mode, setMode] = useState<Mode | null>(null)
  const [level, setLevel] = useState<BotLevel>('MEDIUM')
  const [forceCapture, setForceCapture] = useState(true)
  const [showOptions, setShowOptions] = useState(false)
  const [game, setGame] = useState<LocalGame>(newLocalGame)
  /* ★ เกมออนไลน์ที่กำลังเล่นอยู่ — null = ยังอยู่หน้าเลือกคู่ */
  const [onlineId, setOnlineId] = useState<string | null>(null)

  const result = localOutcome(game, forceCapture)
  const over = result.kind !== 'PLAYING'

  /*
   * ★ ผู้เล่นเป็นฝ่ายล่างเสมอในโหมดบอท — กระดานจึงไม่ต้องหมุน
   *   ★★ โหมดส่งเครื่องกันเล่นคุมทั้งสองฝั่ง (mySide = null)
   *      ไม่หมุนกระดานตามตา เพราะการหมุนทำให้คนที่เพิ่งเดินเสร็จ
   *      งงว่าหมากตัวเองหายไปไหน
   */
  const mySide = mode === 'BOT' ? 'BOTTOM' : null
  const botTurn = mode === 'BOT' && game.turn === 'TOP' && !over

  useBotTurn(() => {
    const m = botMove(game.board, 'TOP', level, forceCapture)
    if (m) setGame((g) => playLocal(g, m))
  }, botTurn)

  function commit(m: Move) {
    setGame((g) => playLocal(g, m))
  }

  function restart() {
    setGame(newLocalGame())
  }

  /* ── หน้าเลือกโหมด ─────────────────────────────────────────── */
  if (!mode) {
    return (
      <div className="py-2">
        {/*
          * ★★★ สองคอลัมน์บนจอกว้าง — กระดานตัวอย่างซ้าย ตัวเลือกขวา
          *
          *     ★ ของเดิมเป็นปุ่มสามปุ่มเรียงลงมาในคอลัมน์แคบกลางจอ
          *       ★★ บนจอ 1900px ที่ว่างสองข้างกว้างกว่าเนื้อหาสามเท่า
          *          และคนที่ไม่เคยเล่นไม่มีทางรู้ว่ากำลังจะเจออะไร
          */}
        <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          <div className="mx-auto w-full max-w-[380px]">
            <MiniBoard />
          </div>

          <div>
            <p className="text-sm leading-relaxed text-ink-soft">
              <Untranslated>{ot('game.checkers.pitch')}</Untranslated>
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <ModeCard
                tone="primary"
                title={ot('game.checkers.vsBot')}
                detail={ot('game.checkers.vsBotDetail')}
                icon="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8 10h.01M16 10h.01M8 15c1.5 1.3 6.5 1.3 8 0"
                onClick={() => {
                  setGame(newLocalGame())
                  setMode('BOT')
                }}
              />
              <ModeCard
                title={ot('game.checkers.challengeFriend')}
                detail={ot('game.checkers.onlineDetail')}
                icon="M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 20a7 7 0 0 1 14 0M16 20a6 6 0 0 1 6-6"
                onClick={() => {
                  setOnlineId(null)
                  setMode('ONLINE')
                }}
              />
              <ModeCard
                title={ot('game.checkers.passPlay')}
                detail={ot('game.checkers.passPlayDetail')}
                icon="M5 7h14v10H5zM12 7v10"
                onClick={() => {
                  setGame(newLocalGame())
                  setMode('PASS')
                }}
              />

              {/* ── ตั้งค่าเพิ่ม ─────────────────────────────────── */}
              <div className="rounded-2xl border border-line bg-elevated/50 backdrop-blur-md p-5">
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
                            level === l
                              ? 'bg-ink font-medium text-page'
                              : 'bg-surface text-ink-soft hover:bg-surface-hover',
                          )}
                        >
                          {ot(`game.checkers.level.${l}` as 'game.checkers.level.EASY')}
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={forceCapture}
                      onClick={() => setForceCapture((v) => !v)}
                      className="mt-3 flex min-h-11 w-full items-center justify-between gap-3 text-start"
                    >
                      <span className="text-sm text-ink">
                        <Untranslated>{ot('game.checkers.forceCapture')}</Untranslated>
                      </span>
                      <span
                        aria-hidden="true"
                        className={cn(
                          'relative h-6 w-11 shrink-0 rounded-full transition-colors',
                          forceCapture ? 'bg-accent' : 'bg-surface-hover',
                        )}
                      >
                        <span
                          className={cn(
                            'absolute top-0.5 size-5 rounded-full bg-page shadow transition-all',
                            forceCapture ? 'start-[1.375rem]' : 'start-0.5',
                          )}
                        />
                      </span>
                    </button>
                  </>
                ) : (
                  <p className="mt-2 text-xs text-ink-faint">
                    <Untranslated>
                      {ot('game.checkers.optionsHint', {
                        level: ot(`game.checkers.level.${level}` as 'game.checkers.level.EASY'),
                      })}
                    </Untranslated>
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  /* ── ออนไลน์ ───────────────────────────────────────────────── */
  if (mode === 'ONLINE') {
    return onlineId ? (
      <CheckersOnline gameId={onlineId} onExit={() => setOnlineId(null)} onRematch={setOnlineId} />
    ) : (
      <div>
        <CheckersLobby onEnter={setOnlineId} />
        <div className="mt-4 text-center">
          <Button variant="ghost" className="min-h-11" onClick={() => setMode(null)}>
            <Untranslated>{ot('game.checkers.backToMenu')}</Untranslated>
          </Button>
        </div>
      </div>
    )
  }

  /* ── กระดาน ────────────────────────────────────────────────── */
  const botName = ot(`game.checkers.level.${level}` as 'game.checkers.level.EASY')

  return (
    <div className="py-2">
      <CheckersBoard
        board={game.board}
        turn={game.turn}
        mySide={mySide}
        forceCapture={forceCapture}
        onCommit={commit}
        lastMove={game.lastMove}
        disabled={over || botTurn}
        top={{ name: mode === 'BOT' ? `${ot('game.checkers.bot')} · ${botName}` : ot('game.checkers.playerTop') }}
        bottom={{ name: mode === 'BOT' ? ot('game.checkers.you') : ot('game.checkers.playerBottom') }}
      />

      {botTurn ? (
        <p className="mt-3 text-center text-sm text-ink-soft">
          <Untranslated>{ot('game.checkers.botThinking')}</Untranslated>
        </p>
      ) : null}

      {over ? (
        <div className="mx-auto mt-4 max-w-md rounded-2xl border border-line bg-elevated/50 backdrop-blur-md p-5 text-center">
          <p className="text-lg font-bold text-ink">
            <Untranslated>
              {result.kind === 'DRAW'
                ? ot('game.checkers.draw')
                : mode === 'BOT'
                  ? result.side === 'BOTTOM'
                    ? ot('game.checkers.youWin')
                    : ot('game.checkers.youLose')
                  : result.side === 'BOTTOM'
                    ? ot('game.checkers.bottomWins')
                    : ot('game.checkers.topWins')}
            </Untranslated>
          </p>

          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button variant="primary" className="min-h-11" onClick={restart}>
              <Untranslated>{ot('game.checkers.again')}</Untranslated>
            </Button>
            <Button variant="ghost" className="min-h-11" onClick={() => setMode(null)}>
              <Untranslated>{ot('game.checkers.backToMenu')}</Untranslated>
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Button variant="ghost" className="min-h-11" onClick={restart}>
            <Untranslated>{ot('game.checkers.restart')}</Untranslated>
          </Button>
          <Link
            href="/office/fun"
            className="inline-flex min-h-11 items-center rounded-full px-4 text-sm text-ink-soft transition-colors hover:text-ink"
            onClick={(e) => {
              e.preventDefault()
              setMode(null)
            }}
          >
            <Untranslated>{ot('game.checkers.backToMenu')}</Untranslated>
          </Link>
        </div>
      )}
    </div>
  )
}
