'use client'

import { useState, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import { apiFetch } from '@/lib/api/client'
import { cn } from '@/lib/cn'
import { officeErrorText } from '@/lib/i18n/office-format'
import { Untranslated, useOt } from '@/lib/i18n/office'
import { useConfirm } from '@/components/ConfirmProvider'
import { CHOICE_STYLE, QUIZ_SECONDS, SAMPLE_QUESTIONS, type QuizDraftQuestion, type QuizSeconds } from '@/lib/office/quiz'

const blank = (): QuizDraftQuestion => ({ body: '', choices: ['', '', '', ''], correct: 0, seconds: 20 })

/**
 * ตัวสร้างควิซ — ตั้งชื่อ · เพิ่มคำถาม · แตะรูปทรงเพื่อเลือกข้อถูก · ตั้งเวลา
 *
 * ★ ปุ่ม "ใช้ชุดคำถามตัวอย่าง" — เริ่มเล่นได้ภายในวินาทีเดียว ไม่ต้องคิดคำถามเอง
 * ★ ตัวเลือกที่เว้นว่างถูกตัดทิ้งตอนส่ง (ต้องมีอย่างน้อย 2) — ข้อถูกต้องไม่ใช่ช่องว่าง
 */
export function QuizBuilder({ onCancel }: { onCancel: () => void }) {
  const ot = useOt()
  const router = useRouter()
  const confirm = useConfirm()
  const [title, setTitle] = useState('')
  const [qs, setQs] = useState<QuizDraftQuestion[]>([blank()])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const patch = (i: number, p: Partial<QuizDraftQuestion>) => setQs((all) => all.map((q, k) => (k === i ? { ...q, ...p } : q)))

  async function applySample() {
    const dirty = title.trim() !== '' || qs.some((q) => q.body.trim() || q.choices.some((c) => c.trim()))
    if (dirty && !(await confirm({ kind: 'danger', message: ot('game.quiz.sampleReplace') }))) return
    setTitle(ot('game.quiz.sampleTitle'))
    setQs(SAMPLE_QUESTIONS.map((q) => ({ ...q, choices: [...q.choices, '', '', ''].slice(0, 4) })))
    setError(null)
  }

  async function submit() {
    if (!title.trim()) return setError(ot('game.quiz.errTitle'))
    const cleaned: QuizDraftQuestion[] = []
    for (let i = 0; i < qs.length; i++) {
      const q = qs[i]!
      const kept = q.choices.map((c, k) => ({ c: c.trim(), k })).filter((x) => x.c)
      if (!q.body.trim()) return setError(ot('game.quiz.errBody', { n: i + 1 }))
      if (kept.length < 2) return setError(ot('game.quiz.errChoices', { n: i + 1 }))
      const correct = kept.findIndex((x) => x.k === q.correct)
      if (correct < 0) return setError(ot('game.quiz.errCorrect', { n: i + 1 }))
      cleaned.push({ body: q.body.trim(), choices: kept.map((x) => x.c), correct, seconds: q.seconds })
    }
    setError(null)
    if (!(await confirm({ kind: 'create', subject: title.trim() }))) return
    setBusy(true)
    try {
      const r = await apiFetch<{ id: string }>('/api/office/games/quiz', { method: 'POST', body: { title: title.trim(), questions: cleaned } })
      router.push(`/office/fun/quiz/${r.id}`)
    } catch (e) {
      setError(officeErrorText(e, ot))
      setBusy(false)
    }
  }

  return (
    <section className="quiz-builder mt-6 rounded-[28px] p-5 sm:p-7">
      <div className="flex flex-wrap items-center gap-3">
        <span aria-hidden="true" className="quiz-badge grid size-12 shrink-0 place-items-center rounded-2xl text-2xl">📝</span>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-black text-ink">
            <Untranslated>{ot('game.quiz.buildTitle')}</Untranslated>
          </h2>
          <p className="text-xs text-ink-soft">
            <Untranslated>{ot('game.quiz.buildHint')}</Untranslated>
          </p>
        </div>
        <button type="button" onClick={() => void applySample()} className="quiz-sample inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-bold">
          ✨ <Untranslated>{ot('game.quiz.useSample')}</Untranslated>
        </button>
      </div>

      <label className="mt-5 block">
        <span className="mb-1.5 block text-sm font-semibold text-ink">
          <Untranslated>{ot('game.quiz.titleLabel')}</Untranslated>
        </span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={80}
          placeholder={ot('game.quiz.titlePh')}
          className="h-12 w-full rounded-2xl border border-line bg-elevated px-4 text-[15px] text-ink outline-none focus:border-accent"
        />
      </label>

      <ol className="mt-5 flex flex-col gap-4">
        {qs.map((q, i) => (
          <li key={i} className="quiz-qcard rounded-[22px] p-4 sm:p-5" style={{ '--i': i } as CSSProperties}>
            <div className="flex items-center gap-2">
              <span className="quiz-qnum grid size-8 shrink-0 place-items-center rounded-xl text-sm font-black">{i + 1}</span>
              <div className="ms-auto flex gap-1" role="group" aria-label={ot('game.quiz.seconds')}>
                {QUIZ_SECONDS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => patch(i, { seconds: s as QuizSeconds })}
                    aria-pressed={q.seconds === s}
                    className={cn('min-h-11 rounded-full px-3 text-xs font-bold tabular-nums transition-colors', q.seconds === s ? 'bg-ink text-page' : 'bg-surface text-ink-soft hover:text-ink')}
                  >
                    ⏱ {s}s
                  </button>
                ))}
              </div>
              {qs.length > 1 ? (
                <button
                  type="button"
                  onClick={() => setQs((all) => all.filter((_, k) => k !== i))}
                  aria-label={ot('game.quiz.removeQ', { n: i + 1 })}
                  className="grid size-11 place-items-center rounded-full text-ink-faint transition-colors hover:bg-danger/10 hover:text-danger"
                >
                  <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
                  </svg>
                </button>
              ) : null}
            </div>
            <textarea
              value={q.body}
              onChange={(e) => patch(i, { body: e.target.value })}
              maxLength={200}
              rows={2}
              placeholder={ot('game.quiz.bodyPh')}
              aria-label={ot('game.quiz.bodyLabel', { n: i + 1 })}
              className="mt-3 w-full resize-none rounded-2xl border border-line bg-elevated px-4 py-3 text-base font-semibold text-ink outline-none focus:border-accent"
            />
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {q.choices.map((c, k) => {
                const st = CHOICE_STYLE[k]!
                return (
                  <div key={k} className={cn('quiz-edit-choice flex items-center gap-2 rounded-2xl p-1.5', `quiz-tone-${st.tone}`, q.correct === k && 'quiz-edit-correct')}>
                    {/* ★ แตะรูปทรงเพื่อเลือกข้อถูก — ปุ่มเดียวทำสองหน้าที่: บอกสีและเลือกเฉลย */}
                    <button
                      type="button"
                      onClick={() => patch(i, { correct: k })}
                      aria-pressed={q.correct === k}
                      aria-label={ot('game.quiz.markCorrect', { n: k + 1 })}
                      className="quiz-shape grid size-11 shrink-0 place-items-center rounded-xl text-lg font-black"
                    >
                      {q.correct === k ? '✓' : st.shape}
                    </button>
                    <input
                      value={c}
                      onChange={(e) => patch(i, { choices: q.choices.map((x, kk) => (kk === k ? e.target.value : x)) })}
                      maxLength={80}
                      placeholder={ot(k < 2 ? 'game.quiz.choicePh' : 'game.quiz.choiceOptPh', { n: k + 1 })}
                      className="h-11 min-w-0 flex-1 rounded-xl bg-[color-mix(in_srgb,var(--color-elevated)_85%,transparent)] px-3 text-sm text-ink outline-none"
                    />
                  </div>
                )
              })}
            </div>
          </li>
        ))}
      </ol>

      {qs.length < 30 ? (
        <button
          type="button"
          onClick={() => setQs((all) => [...all, blank()])}
          className="mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line text-sm font-bold text-ink-soft transition-colors hover:border-accent hover:text-accent"
        >
          ＋ <Untranslated>{ot('game.quiz.addQ')}</Untranslated>
        </button>
      ) : null}

      {error ? (
        <p role="alert" className="mt-4 rounded-2xl bg-danger/10 px-4 py-3 text-sm font-medium text-danger">
          <Untranslated>{error}</Untranslated>
        </p>
      ) : null}

      <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancel} className="min-h-12 rounded-2xl px-5 text-sm font-semibold text-ink-soft hover:bg-surface hover:text-ink">
          <Untranslated>{ot('game.quiz.cancel')}</Untranslated>
        </button>
        <button type="button" disabled={busy} onClick={() => void submit()} className="cfm-ok min-h-13 rounded-2xl px-6 text-base font-bold disabled:opacity-60" style={{ '--pc': '255 0 51', '--pc2': '175 82 222' } as CSSProperties}>
          🚀 <Untranslated>{ot('game.quiz.create', { n: qs.length })}</Untranslated>
        </button>
      </div>
    </section>
  )
}
