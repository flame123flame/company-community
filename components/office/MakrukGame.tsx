'use client'

import { useMemo, useState, type CSSProperties } from 'react'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { Untranslated, useOt } from '@/lib/i18n/office'
import {
  botMove,
  inCheck,
  legalMoves,
  newGame,
  outcome,
  play,
  QUIET_LIMIT,
  type BotLevel,
  type Game,
  type Kind,
  type Move,
  type Piece,
  type Side,
} from '@/lib/games/makruk'
import { ModeCard } from './CheckersIntro'
import { CheckersResult, useBotTurn } from './CheckersBoard'
import { FunGuide } from './FunGuide'
import { MakrukPiece } from './MakrukPiece'

type Mode = 'BOT' | 'PASS'
const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']

/**
 * หมากรุกไทย — เล่นกับบอท 3 ระดับ · 2 คนบนเครื่องเดียว
 *
 * ★ โครงเดียวกับหมากฮอส/เรียง 4 (หน้าเลือกโหมด · ตั้งค่าเพิ่ม · ป๊อปอัปชนะแพ้)
 * ★ ผู้เล่นเป็นฝ่ายขาว (ล่าง เดินก่อน) · บอทเป็นฝ่ายดำ
 * ★ หมากเลื่อนลื่นไปช่องใหม่ (วางด้วย left/top + transition, key ตาม id ของหมาก)
 */
export function MakrukGame() {
  const ot = useOt()
  const [mode, setMode] = useState<Mode | null>(null)
  const [level, setLevel] = useState<BotLevel>('MEDIUM')
  const [showOptions, setShowOptions] = useState(false)
  const [g, setG] = useState<Game>(newGame)
  const [round, setRound] = useState(0)
  const [inspect, setInspect] = useState<Piece | null>(null)
  const [rules, setRules] = useState(false)

  const result = outcome(g)
  const over = result.kind !== 'PLAYING'
  const botTurn = mode === 'BOT' && g.turn === 'B' && !over

  useBotTurn(
    () => {
      const m = botMove(g, level)
      if (m) setG((x) => play(x, m))
    },
    botTurn,
    550,
  )

  function restart() {
    setInspect(null)
    setG(newGame())
    setRound((r) => r + 1)
  }

  const levelName = ot(`game.checkers.level.${level}` as 'game.checkers.level.EASY')

  if (!mode) {
    return (
      <div className="py-2">
        <FunGuide id="makruk" art="makruk" />
        <div className="mt-6 grid items-start gap-8 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
          <div className="mx-auto w-full max-w-[400px]">
            <MakrukBoard game={newGame()} interactive={false} mySide={null} onMove={() => undefined} mini />
          </div>
          <div>
            <p className="text-sm leading-relaxed text-ink-soft">
              <Untranslated>{ot('game.mk.pitch')}</Untranslated>
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
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {(['EASY', 'MEDIUM', 'HARD'] as BotLevel[]).map((l) => (
                      <button
                        key={l}
                        type="button"
                        onClick={() => setLevel(l)}
                        aria-pressed={level === l}
                        className={cn('h-11 rounded-full px-4 text-sm transition-colors', level === l ? 'bg-ink font-medium text-page' : 'bg-surface text-ink-soft hover:bg-surface-hover')}
                      >
                        {ot(`game.checkers.level.${l}` as 'game.checkers.level.EASY')}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-ink-faint">
                    <Untranslated>{ot('game.c4.optionsHint', { level: levelName })}</Untranslated>
                  </p>
                )}
              </div>
            </div>
            <PieceGuide />
          </div>
        </div>
      </div>
    )
  }

  const names: Record<Side, string> =
    mode === 'BOT'
      ? { W: ot('game.checkers.you'), B: `${ot('game.checkers.bot')} · ${levelName}` }
      : { W: ot('game.mk.white'), B: ot('game.mk.black') }
  const winner = result.kind === 'MATE' ? result.winner : null
  const tone: 'win' | 'lose' | 'draw' = !winner ? 'draw' : mode === 'BOT' && winner === 'B' ? 'lose' : 'win'

  return (
    <div className="py-2">
      <Seat side="B" name={names.B} game={g} active={!over && g.turn === 'B'} thinking={botTurn} />
      <MakrukBoard
        game={g}
        interactive={!over && !botTurn}
        mySide={mode === 'BOT' ? 'W' : null}
        onMove={(m) => setG((x) => play(x, m))}
        onInspect={setInspect}
      />
      <Seat side="W" name={names.W} game={g} active={!over && g.turn === 'W'} thinking={false} />
      <PieceInfo piece={inspect} />
      {rules ? <RulesDialog onClose={() => setRules(false)} /> : null}

      {result.kind === 'PLAYING' && result.check ? (
        <p role="status" className="mk-check-banner mx-auto mt-3 w-fit rounded-full px-4 py-1.5 text-sm font-black">
          ⚔️ <Untranslated>{ot('game.mk.check', { side: names[g.turn] })}</Untranslated>
        </p>
      ) : g.quiet >= QUIET_LIMIT - 20 && !over ? (
        <p className="mx-auto mt-3 w-fit rounded-full bg-surface px-4 py-1.5 text-xs font-semibold text-ink-soft">
          <Untranslated>{ot('game.mk.counting', { n: Math.ceil((QUIET_LIMIT - g.quiet) / 2) })}</Untranslated>
        </p>
      ) : null}

      {over ? (
        <CheckersResult
          key={round}
          tone={tone}
          seed={round + g.plies}
          lines={ot(tone === 'win' ? 'game.mk.winLines' : tone === 'lose' ? 'game.mk.loseLines' : 'game.mk.drawLines')}
          sub={ot(tone === 'win' ? 'game.checkers.winSub' : tone === 'lose' ? 'game.checkers.loseSub' : 'game.checkers.drawSub')}
          note={
            result.kind === 'DRAW'
              ? ot(result.reason === 'STALEMATE' ? 'game.mk.drawStalemate' : result.reason === 'BARE_KINGS' ? 'game.mk.drawBare' : 'game.mk.drawCount')
              : null
          }
          piece={(who) => (
            <span className="block size-full">
              <Token piece={{ id: 0, side: (who === 'mine') === (mode === 'BOT' || winner !== 'B') ? 'W' : 'B', kind: 'K' }} />
            </span>
          )}
          stats={
            <div className="ckr-rise mt-4 flex flex-wrap justify-center gap-2" style={{ '--d': '1.25s' } as CSSProperties}>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-xs font-medium text-ink">
                <Untranslated>{ot('game.mk.statMoves', { n: Math.ceil(g.plies / 2) })}</Untranslated>
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-xs font-medium text-ink">
                <Untranslated>{ot('game.mk.statTook', { n: g.lost[winner === 'B' ? 'W' : 'B'].length })}</Untranslated>
              </span>
            </div>
          }
          title={
            !winner
              ? ot('game.checkers.draw')
              : mode === 'BOT'
                ? winner === 'W'
                  ? ot('game.checkers.youWin')
                  : ot('game.checkers.youLose')
                : winner === 'W'
                  ? ot('game.mk.whiteWins')
                  : ot('game.mk.blackWins')
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
        <div className="mx-auto mt-4 grid max-w-[600px] grid-cols-3 gap-2">
          <button type="button" onClick={() => setRules(true)} className="mk-ctl mk-ctl-main flex min-h-14 flex-col items-center justify-center rounded-2xl text-xs font-bold">
            <span aria-hidden="true" className="text-lg leading-none">📖</span>
            <Untranslated>{ot('game.mk.rules')}</Untranslated>
          </button>
          <button type="button" onClick={restart} className="mk-ctl flex min-h-14 flex-col items-center justify-center rounded-2xl text-xs font-bold">
            <span aria-hidden="true" className="text-lg leading-none">🔄</span>
            <Untranslated>{ot('game.checkers.restart')}</Untranslated>
          </button>
          <button type="button" onClick={() => setMode(null)} className="mk-ctl flex min-h-14 flex-col items-center justify-center rounded-2xl text-xs font-bold">
            <span aria-hidden="true" className="text-lg leading-none">🏠</span>
            <Untranslated>{ot('game.checkers.backToMenu')}</Untranslated>
          </button>
        </div>
      )}
    </div>
  )
}

/* ── ป้ายผู้เล่น + หมากที่กินได้ ─────────────────────────────── */
function Seat({ side, name, game, active, thinking }: { side: Side; name: string; game: Game; active: boolean; thinking: boolean }) {
  const ot = useOt()
  /* หมากที่ฝั่งนี้กินได้ = หมากของอีกฝั่งที่เสียไป */
  const took = game.lost[side === 'W' ? 'B' : 'W']
  const left = game.board.filter((p) => p?.side === side).length
  return (
    <div className={cn('mk-seat relative mx-auto my-3 flex max-w-[600px] items-center gap-3 overflow-hidden rounded-[22px] p-2.5 pe-4', active && 'mk-seat-on')}>
      {/* เหรียญประจำฝั่ง — ขุนในกรอบวงกลมขอบทอง */}
      <span className={cn('mk-medal relative grid size-14 shrink-0 place-items-center rounded-full', side === 'W' ? 'mk-medal-w' : 'mk-medal-b')}>
        <span className="size-11">
          <Token piece={{ id: 0, side, kind: 'K' }} />
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-base font-black text-ink">
            <Untranslated>{name}</Untranslated>
          </span>
          {/* ★ โหมด 2 คนชื่อก็คือ "ฝ่ายขาว/ดำ" อยู่แล้ว — ไม่ต้องติดป้ายซ้ำ */}
          {name !== ot(side === 'W' ? 'game.mk.white' : 'game.mk.black') ? (
            <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold', side === 'W' ? 'mk-tag-w' : 'mk-tag-b')}>
              <Untranslated>{ot(side === 'W' ? 'game.mk.white' : 'game.mk.black')}</Untranslated>
            </span>
          ) : null}
        </span>
        {active ? (
          <span className="mk-turn mt-1 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11.5px] font-bold">
            <span aria-hidden="true" className="ck-live" />
            <Untranslated>{thinking ? ot('game.checkers.botThinking') : ot('game.mk.yourTurn')}</Untranslated>
          </span>
        ) : (
          <span className="mt-1 block text-[11.5px] text-ink-faint">
            <Untranslated>{ot('game.mk.piecesLeft', { n: left })}</Untranslated>
          </span>
        )}
      </span>
      {/* หมากที่กินได้ — ซ้อนกันเป็นตับ มีตัวเลขรวม */}
      <span className="flex shrink-0 flex-col items-end gap-1" aria-label={ot('game.mk.tookLabel', { n: took.length })}>
        <span className="text-[10.5px] font-bold text-ink-faint">
          <Untranslated>{ot('game.mk.tookLabel', { n: took.length })}</Untranslated>
        </span>
        {took.length ? (
          <span className="flex -space-x-2.5">
            {took.slice(-8).map((p) => (
              <span key={p.id} className="mk-took size-7">
                <Token piece={p} />
              </span>
            ))}
          </span>
        ) : null}
      </span>
    </div>
  )
}

/* ── แผงข้อมูลหมาก — แตะหมากตัวไหนก็บอกชื่อและวิธีเดิน ─────────── */
function PieceInfo({ piece }: { piece: Piece | null }) {
  const ot = useOt()
  if (!piece) {
    return (
      <p className="mk-info mx-auto mt-3 flex max-w-[600px] items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm text-ink-soft">
        <span aria-hidden="true">👆</span>
        <Untranslated>{ot('game.mk.tapToKnow')}</Untranslated>
      </p>
    )
  }
  const k: Kind = piece.kind === 'P' && piece.promoted ? 'M' : piece.kind
  return (
    <div key={piece.id} className="mk-info mk-info-on mx-auto mt-3 flex max-w-[600px] items-center gap-3 rounded-2xl p-3">
      <span className="size-14 shrink-0">
        <Token piece={piece} />
      </span>
      <MoveGrid k={k} />
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="text-lg font-black text-ink">
            <Untranslated>{ot(`game.mk.p.${k}` as 'game.mk.p.K')}</Untranslated>
          </span>
          <span className={cn('rounded-full px-2 py-0.5 text-[10.5px] font-bold', piece.side === 'W' ? 'mk-tag-w' : 'mk-tag-b')}>
            <Untranslated>{ot(piece.side === 'W' ? 'game.mk.white' : 'game.mk.black')}</Untranslated>
          </span>
          {piece.kind === 'P' && piece.promoted ? (
            <span className="mk-tag-gold rounded-full px-2 py-0.5 text-[10.5px] font-bold">
              <Untranslated>{ot('game.mk.promotedTag')}</Untranslated>
            </span>
          ) : null}
        </span>
        <span className="block text-[12.5px] leading-snug text-ink-soft">
          <Untranslated>{ot(`game.mk.how.${k}` as 'game.mk.how.K')}</Untranslated>
        </span>
      </span>
    </div>
  )
}

/* ── กล่องกติกา ─────────────────────────────────────────────── */
function RulesDialog({ onClose }: { onClose: () => void }) {
  const ot = useOt()
  const rules = ['goal', 'check', 'promote', 'draw', 'count'] as const
  return (
    <div className="cfm-root fixed inset-0 z-[90] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={ot('game.mk.rulesTitle')} onClick={(e) => e.target === e.currentTarget && onClose()} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="cfm-card flex max-h-[90dvh] w-full max-w-[640px] flex-col overflow-hidden rounded-t-[32px] sm:rounded-[32px]" style={{ '--pc': '255 176 32', '--pc2': '175 82 222' } as CSSProperties}>
        <div className="pop-hero relative shrink-0 overflow-hidden px-6 py-5">
          <span aria-hidden="true" className="pop-blob pop-blob-a" />
          <button type="button" onClick={onClose} aria-label={ot('common.close')} className="pop-action absolute end-4 top-4 z-10 grid size-11 place-items-center rounded-full">✕</button>
          <div className="relative flex items-center gap-3 pe-12">
            <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-[var(--ck-shine)] p-1">
              <MakrukPiece kind="K" side="B" />
            </span>
            <div>
              <h2 className="text-xl font-black text-[var(--ck-shine)]">
                <Untranslated>{ot('game.mk.rulesTitle')}</Untranslated>
              </h2>
              <p className="text-xs text-[color-mix(in_srgb,var(--ck-shine)_85%,transparent)]">
                <Untranslated>{ot('game.mk.rulesLead')}</Untranslated>
              </p>
            </div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-5">
          <ol className="flex flex-col gap-2">
            {rules.map((r, i) => (
              <li key={r} className="terms-item flex gap-3 rounded-2xl p-3.5" style={{ '--i': i, '--pc': '255 176 32', '--pc2': '175 82 222' } as CSSProperties}>
                <span className="terms-num relative grid size-7 shrink-0 place-items-center rounded-full text-xs font-black">{i + 1}</span>
                <span className="min-w-0">
                  <span className="block text-sm font-black text-ink">
                    <Untranslated>{ot(`game.mk.rule.${r}` as 'game.mk.rule.goal')}</Untranslated>
                  </span>
                  <span className="mt-0.5 block text-[12.5px] leading-relaxed text-ink-soft">
                    <Untranslated>{ot(`game.mk.rule.${r}.d` as 'game.mk.rule.goal.d')}</Untranslated>
                  </span>
                </span>
              </li>
            ))}
          </ol>
          <PieceGuide />
        </div>
        <div className="shrink-0 border-t border-line p-4">
          <button type="button" onClick={onClose} className="cfm-ok min-h-12 w-full rounded-2xl text-base font-bold">
            <Untranslated>{ot('game.mk.rulesGotIt')}</Untranslated>
          </button>
        </div>
      </div>
    </div>
  )
}

/* ── กระดาน ─────────────────────────────────────────────────── */
function MakrukBoard({
  game,
  interactive,
  mySide,
  onMove,
  onInspect,
  mini = false,
}: {
  game: Game
  interactive: boolean
  /** null = คุมได้ทั้งสองฝั่ง (2 คนบนเครื่องเดียว) */
  mySide: Side | null
  onMove: (m: Move) => void
  /** แตะหมากตัวไหนก็แจ้งออกไป (ใช้แสดงชื่อ/วิธีเดิน) — ได้ทั้งหมากเราและหมากอีกฝ่าย */
  onInspect?: (p: Piece | null) => void
  mini?: boolean
}) {
  const ot = useOt()
  const [sel, setSel] = useState<number | null>(null)
  const moves = useMemo(() => (interactive ? legalMoves(game.board, game.turn) : []), [game, interactive])
  const targets = sel === null ? [] : moves.filter((m) => m.from === sel)
  const canPick = (i: number) => interactive && game.board[i]?.side === game.turn && (mySide === null || mySide === game.turn) && moves.some((m) => m.from === i)
  const checked = inCheck(game.board, game.turn) ? game.board.findIndex((p) => p?.side === game.turn && p.kind === 'K') : -1

  function tap(i: number) {
    const t = targets.find((m) => m.to === i)
    if (t) {
      onMove(t)
      setSel(null)
      onInspect?.(null)
      return
    }
    setSel(canPick(i) && sel !== i ? i : null)
    onInspect?.(game.board[i] ?? null)
  }

  const pieces = game.board.flatMap((p, i) => (p ? [{ p, i }] : []))

  return (
    <div className={cn('mk-frame relative mx-auto w-full rounded-[26px] p-[clamp(10px,2.6vw,20px)]', mini ? 'max-w-[400px] mk-mini' : 'max-w-[600px]')}>
      <div className="mk-board relative aspect-square w-full overflow-hidden rounded-md">
        {/* ช่องกระดาน (ปุ่ม) */}
        <div className="absolute inset-0 grid grid-cols-8 grid-rows-8">
          {Array.from({ length: 64 }, (_, i) => {
            const isTarget = targets.find((m) => m.to === i)
            const lastSq = game.last && (game.last.from === i || game.last.to === i)
            const r = Math.floor(i / 8)
            const c = i % 8
            return (
              <button
                key={i}
                type="button"
                tabIndex={interactive ? 0 : -1}
                disabled={!interactive}
                onClick={() => tap(i)}
                aria-label={`${FILES[c]}${8 - r}${game.board[i] ? ` · ${ot(`game.mk.p.${pieceKind(game.board[i]!)}` as 'game.mk.p.K')}` : ''}`}
                title={game.board[i] ? ot(`game.mk.p.${pieceKind(game.board[i]!)}` as 'game.mk.p.K') : undefined}
                className={cn('mk-sq relative', lastSq && 'mk-sq-last', sel === i && 'mk-sq-sel', i === checked && 'mk-sq-check')}
              >
                {isTarget ? <span aria-hidden="true" className={cn('mk-dot', isTarget.capture && 'mk-dot-cap')} /> : null}
                {!mini && c === 0 ? <span aria-hidden="true" className="mk-coord start-0.5 top-0.5">{8 - r}</span> : null}
                {!mini && r === 7 ? <span aria-hidden="true" className="mk-coord bottom-0.5 end-1">{FILES[c]}</span> : null}
              </button>
            )
          })}
        </div>
        {/* หมาก — ลอยเหนือช่อง เลื่อนลื่นด้วย transition */}
        {pieces.map(({ p, i }) => (
          <span
            key={p.id}
            aria-hidden="true"
            className={cn('mk-piece pointer-events-none absolute p-[1%]', game.last?.to === i && 'mk-piece-moved', sel === i && 'mk-piece-sel')}
            style={{ left: `${(i % 8) * 12.5}%`, top: `${Math.floor(i / 8) * 12.5}%`, width: '12.5%', height: '12.5%' }}
          >
            <Token piece={p} />
          </span>
        ))}
        {/* ประกายตอนกิน */}
        {game.last?.capture ? (
          <span
            key={`cap-${game.plies}`}
            aria-hidden="true"
            className="mk-burst pointer-events-none absolute"
            style={{ left: `${(game.last.to % 8) * 12.5}%`, top: `${Math.floor(game.last.to / 8) * 12.5}%`, width: '12.5%', height: '12.5%' }}
          />
        ) : null}
      </div>
    </div>
  )
}

const pieceKind = (p: Piece): Kind => (p.kind === 'P' && p.promoted ? 'M' : p.kind)

/** ตัวหมาก — ภาพวาดหมากไม้กลึง (ดู MakrukPiece) */
function Token({ piece }: { piece: Piece; tiny?: boolean }) {
  return <MakrukPiece kind={piece.kind} side={piece.side} promoted={piece.kind === 'P' && !!piece.promoted} />
}

/* ── รู้จักหมาก 6 ตัว — แผนภาพการเดินย่อ ───────────────────── */
const MOVES: Record<Kind, [number, number][]> = {
  K: [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]],
  M: [[-1, -1], [-1, 1], [1, -1], [1, 1]],
  S: [[-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 1]],
  N: [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]],
  R: [[-2, 0], [-1, 0], [1, 0], [2, 0], [0, -2], [0, -1], [0, 1], [0, 2]],
  P: [[-1, 0]],
}

function PieceGuide() {
  const ot = useOt()
  return (
    <section className="mt-5 rounded-[24px] border border-line bg-elevated/60 p-4 backdrop-blur-md sm:p-5">
      <h2 className="text-base font-black text-ink">
        <Untranslated>{ot('game.mk.pieceGuide')}</Untranslated>
      </h2>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {(['K', 'M', 'S', 'N', 'R', 'P'] as Kind[]).map((k, i) => (
          <li key={k} className="mk-guide-row flex items-center gap-3 rounded-2xl bg-surface/70 p-2.5" style={{ '--i': i } as CSSProperties}>
            <span className="size-11 shrink-0">
              <Token piece={{ id: 0, side: 'W', kind: k }} />
            </span>
            {/* แผนภาพ 5×5 — จุดคือช่องที่เดินไปได้ (เรือ/ม้าแสดงบางส่วน) */}
            <MoveGrid k={k} />
            <span className="min-w-0">
              <span className="block text-sm font-black text-ink">
                <Untranslated>{ot(`game.mk.p.${k}` as 'game.mk.p.K')}</Untranslated>
              </span>
              <span className="block text-[11.5px] leading-snug text-ink-soft">
                <Untranslated>{ot(`game.mk.how.${k}` as 'game.mk.how.K')}</Untranslated>
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** แผนภาพ 5×5 — ช่องกลางคือตัวหมาก จุดฟ้าคือช่องที่เดินไปได้ (เรือ/ม้าแสดงบางส่วน) */
function MoveGrid({ k }: { k: Kind }) {
  return (
    <span aria-hidden="true" className="mk-mini-grid grid size-12 shrink-0 grid-cols-5 grid-rows-5 gap-px rounded-md p-0.5">
      {Array.from({ length: 25 }, (_, j) => {
        const dr = Math.floor(j / 5) - 2
        const dc = (j % 5) - 2
        const center = dr === 0 && dc === 0
        const on = MOVES[k].some(([a, b]) => a === dr && b === dc)
        return <span key={j} className={cn('rounded-[2px]', center ? 'mk-mg-me' : on ? 'mk-mg-on' : 'mk-mg-off')} />
      })}
    </span>
  )
}
