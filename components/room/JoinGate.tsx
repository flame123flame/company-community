'use client'

import { useState, useSyncExternalStore, type FormEvent } from 'react'
import Link from 'next/link'
import { AppHeader } from '@/components/AppHeader'
import { Button } from '@/components/ui/Button'
import { ApiClientError, apiFetch, errorText } from '@/lib/api/client'
import {
  ensureSession,
  profileOnServer,
  recallProfile,
  rememberDisplayName,
  resetSession,
  subscribeProfile,
} from '@/lib/auth/session'
import { Avatar } from '@/components/AppHeader'
import { ProfileDialog } from '@/components/ProfileDialog'
import { SignInDialog } from '@/components/SignInDialog'
import { displayNameSchema } from '@/lib/validation/schemas'
import { useRouter } from 'next/navigation'
import type { RoomPreview } from '@/types/room'
import { useT } from '@/lib/i18n/client'
import type { DictKey } from '@/lib/i18n/dict'

/**
 * หน้าจอก่อนเข้าห้อง
 *
 * ★★ ไม่ใช่แค่ขั้นตอนขอชื่อ — มีเหตุผลทางเทคนิคที่ต้องมีปุ่มให้กด
 *
 *   เบราว์เซอร์ (โดยเฉพาะ iOS Safari และ Chrome บนมือถือ) บล็อกการเล่นสื่อ
 *   ที่มีเสียงถ้าไม่ได้เกิดจากการกระทำของผู้ใช้โดยตรง
 *
 *   ถ้าเข้าห้องแล้วสั่ง playVideo() ทันที player จะถูกบล็อกเงียบ ๆ
 *   ผู้ใช้เห็นวิดีโอค้างอยู่เฉย ๆ โดยไม่รู้ว่าต้องทำอะไร
 *
 *   การกดปุ่มนี้คือ user gesture ที่ปลดล็อกให้เล่นเสียงได้
 *   ออกแบบให้เป็นจังหวะธรรมชาติของการ "เข้าร่วม" แทนที่จะเป็น error ทีหลัง
 */
export function JoinGate({ preview }: { preview: RoomPreview }) {
  const t = useT()
  const router = useRouter()
  const profile = useSyncExternalStore(subscribeProfile, recallProfile, profileOnServer)
  const [editing, setEditing] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const name = profile?.displayName ?? ''

  async function handleJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    // ★ ยังไม่มีโปรไฟล์ = เปิดกล่องตั้งโปรไฟล์แทนการเข้าห้อง
    //   (ด่านบังคับเดียวกับหน้าแรก แต่ที่นี่เข้ามาทางลิงก์ตรงจึงต้องดักเอง)
    if (!profile) return   // ★ SignInDialog คลุมจออยู่แล้ว ไม่มีอะไรให้ทำที่นี่
    setPending(true)
    setError(null)

    try {
      const trimmed = name.trim()
      if (trimmed) {
        const parsed = displayNameSchema.safeParse(trimmed)
        if (!parsed.success) {
          /* ★ zod คืน "กุญแจแปล" ไม่ใช่ข้อความ (ดู lib/validation/schemas.ts) */
        setError(t((parsed.error.issues[0]?.message as DictKey | undefined) ?? 'home.create.errName'))
          setPending(false)
          return
        }
      }

      await ensureSession(trimmed || undefined)
      if (trimmed) rememberDisplayName(trimmed)

      const join = () =>
        apiFetch(`/api/rooms/${preview.code}/join`, {
          method: 'POST',
          body: trimmed ? { displayName: trimmed } : {},
        })

      try {
        await join()
      } catch (err) {
        // ★ ซ่อม session แล้วลองใหม่หนึ่งครั้ง (ดูเหตุผลใน lib/auth/session.ts)
        if (!(err instanceof ApiClientError) || err.code !== 'UNAUTHORIZED') throw err
        await resetSession(trimmed || undefined)
        await join()
      }

      // refresh ไม่ใช่ push — ยังอยู่ URL เดิม แค่ให้ RSC render ใหม่โดยเห็นว่าเราเป็นสมาชิกแล้ว
      router.refresh()
    } catch (err) {
      setError(errorText(err, t, 'join.failed'))
      setPending(false)
    }
  }

  return (
    <>
      {/* ★ หน้านี้เป็น /room/CODE เหมือนกัน — คนที่กดลิงก์เพื่อนมาแล้วไม่อยากเข้า
             ต้องมีทางออกที่เห็นได้ ไม่งั้นก็ตันเหมือนกัน
          ★★ แต่ใช้คำว่า "กลับหน้าแรก" ไม่ใช่ "ออกจากห้อง" — ยังไม่ได้เข้าเลย
             จะให้ออกจากอะไร */}
      <AppHeader center={<span />} exitLabel={t('common.backHome')} />

      {/**
        * ★★★ ปกเพลงเบลอเต็มจอเป็นฉากหลัง
        *
        *     หน้านี้เดิมเป็นกล่องขาว ๆ กลางจอดำ ซึ่งบอกได้แค่ว่า "กำลังจะเข้าห้อง"
        *     ★ แต่สิ่งที่คนอยากรู้ก่อนกดคือ "ห้องนี้กำลังเปิดอะไรอยู่"
        *       — ซึ่งเป็นข้อมูลที่เรามีอยู่แล้วและไม่เคยเอามาใช้เลย
        *
        *     ★★ ฉากหลังต้องเบลอแรงและมืดทับ ไม่ใช่โชว์ปกชัด ๆ
        *        ปกที่ชัดจะแย่งความสนใจจากปุ่มซึ่งเป็นสิ่งเดียวที่ต้องกดในหน้านี้
        *        เบลอแล้วมันทำหน้าที่ "ให้สี" อย่างเดียว ซึ่งคือสิ่งที่ต้องการพอดี
        */}
      {/*
        * ★ z-0 ไม่ใช่ -z-10
        *   ค่าลบทำให้ชั้นนี้ไปอยู่ "หลังพื้นหลังของ body" ซึ่ง bg-page ทึบอยู่
        *   ผลคือฉากหลังถูกทาทับจนมองไม่เห็นเลยสักนิด (วัดจากภาพจริง)
        *   ★ ใช้ 0 แล้วดันเนื้อหาขึ้นเป็น z-10 แทน
        */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        {preview.nowPlaying?.thumbnailUrl ? (
          <>
            <div
              className="absolute inset-0 scale-125 blur-3xl saturate-150"
              style={{
                backgroundImage: `url(${preview.nowPlaying.thumbnailUrl})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                opacity: 0.6,
              }}
            />
            <div className="absolute inset-0 bg-page/65" />
          </>
        ) : (
          <div className="aurora-field">
            <div className="aurora-blob aurora-blob-1" />
            <div className="aurora-blob aurora-blob-2" />
          </div>
        )}
      </div>

      <main className="relative z-10 mx-auto flex w-full max-w-[460px] flex-col px-4 pb-16 pt-8 sm:pt-16">
        <div className="overflow-hidden rounded-3xl border border-line bg-elevated/70 shadow-2xl backdrop-blur-xl">
          {/* ── กำลังเล่นอยู่ ─────────────────────────────────── */}
          {preview.nowPlaying ? (
            <div className="relative aspect-[16/9] overflow-hidden">
              {preview.nowPlaying.thumbnailUrl ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={preview.nowPlaying.thumbnailUrl}
                    alt=""
                    className="size-full scale-105 object-cover"
                  />
                  <span className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-black/5" />
                </>
              ) : (
                <span className="absolute inset-0 bg-surface" />
              )}

              <span className="absolute start-3 top-3 flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 backdrop-blur-sm">
                <span className="flex h-3 items-end gap-[2px]">
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className="eq-bar w-[2px] rounded-full bg-live"
                      style={{
                        height: [6, 11, 8][i],
                        animationDuration: `${[0.7, 0.95, 0.8][i]}s`,
                        animationDelay: `${[0, 0.2, 0.35][i]}s`,
                      }}
                    />
                  ))}
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-white">
                  {t('join.playing')}
                </span>
              </span>

              <div className="absolute inset-x-0 bottom-0 p-4">
                <p dir="auto" className="line-clamp-2 text-[15px] font-medium leading-snug text-white drop-shadow">
                  {preview.nowPlaying.title}
                </p>
                {preview.nowPlaying.channelTitle ? (
                  <p dir="auto" className="mt-0.5 truncate text-xs text-white/70">
                    {preview.nowPlaying.channelTitle}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="p-6 text-center">
            <p className="text-[11px] uppercase tracking-[0.25em] text-ink-faint">{t('join.eyebrow')}</p>
            <h1 dir="auto" className="mt-2 text-2xl font-bold leading-tight">{preview.name}</h1>

            <p className="mt-2 font-mono text-[13px] tracking-[0.35em] text-ink-soft">
              {preview.code}
            </p>

            <p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-xs text-ink-soft">
              <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden="true">
                <path d="M9 13c-2.2 0-6.5 1.1-6.5 3.3V19h13v-2.7C15.5 14.1 11.2 13 9 13zm0-2a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zm7.5 2.2c1.1.8 1.9 1.8 1.9 3.1V19H22v-2.7c0-1.8-2.9-2.8-5.5-3.1zM15 11a3.5 3.5 0 1 0-1.1-6.8 5.5 5.5 0 0 1 0 6.6c.36.13.73.2 1.1.2z" />
              </svg>
              {preview.memberCount > 0
                ? t('join.members', { n: preview.memberCount })
                : t('join.first')}
            </p>

            {/**
              * ★★ ไม่ถามชื่ออีกแล้วถ้าเคยตั้งไว้
              *
              *    ของเดิมมีช่องกรอกชื่อโผล่ทุกครั้งที่กดลิงก์ห้อง แม้จะเติมค่าเก่า
              *    ให้แล้วก็ตาม — ผู้ใช้อ่านช่องกรอกว่า "ต้องกรอก" ไม่ใช่ "ยืนยัน"
              *    จึงรู้สึกเหมือนถูกสร้างเป็นคนใหม่ทุกครั้ง
              *
              *    ★ ตอนนี้แสดง "คุณคือใคร" แทนการถาม และเปลี่ยนได้ถ้าอยากเปลี่ยน
              *      ปุ่มเข้าร่วมยังอยู่เหมือนเดิมเพราะมันมีหน้าที่ปลดล็อกเสียง
              *      ของเบราว์เซอร์ ไม่ใช่แค่ยืนยันชื่อ
              */}
            <form onSubmit={handleJoin} className="mt-6 space-y-3" noValidate>
              <div className="flex items-center gap-3 rounded-2xl border border-line bg-page/50 px-3 py-2.5 text-start">
                <Avatar
                  userId={profile?.displayName ?? 'me'}
                  name={profile?.displayName ?? '?'}
                  avatarUrl={profile?.avatarUrl ?? null}
                  size={38}
                />
                <div className="min-w-0 flex-1">
                  <p dir="auto" className="truncate text-sm font-medium">
                    {profile?.displayName ?? t('join.noName')}
                  </p>
                  <p dir="auto" className="truncate text-[11px] text-ink-faint">
                    {profile?.nickname ?? t('join.asThisName')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  disabled={pending}
                  className="shrink-0 rounded-full border border-line px-2.5 py-1 text-[11px] text-ink-soft transition-colors hover:bg-surface hover:text-ink"
                >
                  {profile ? t('common.change') : t('join.setName')}
                </button>
              </div>

              <Button type="submit" variant="primary" size="lg" block loading={pending}>
                {t('join.submit')}
              </Button>
            </form>

            {error ? (
              <p role="alert" className="mt-3 text-xs text-danger">
                {error}
              </p>
            ) : null}

            <p className="mt-4 text-[11px] leading-relaxed text-ink-faint">
              {t('join.audioHint')}
            </p>
          </div>
        </div>

        <div className="mt-5 text-center">
          <Link href="/" className="text-sm text-ink-soft transition-colors hover:text-ink">
            {t('common.backHome')}
          </Link>
        </div>
      </main>

      {/**
        * ★ ตาข่ายชั้นสอง — ปกติไม่มีทางเห็นหน้านี้ถ้ายังไม่สมัคร
        *   (server ตรวจ getRegisteredUser() ก่อน render อยู่แล้ว)
        *   เหลือไว้เผื่อ session ตายระหว่างที่หน้าเปิดค้างอยู่
        */}
      {!profile ? <SignInDialog onDone={() => setError(null)} /> : null}

      {editing ? (
        <ProfileDialog
          initial={profile}
          title={profile ? t('header.profile') : t('join.setNameFirst')}
          submitLabel={t('common.save')}
          onSaved={() => {
            setEditing(false)
            setError(null)
          }}
          onClose={profile ? () => setEditing(false) : undefined}
        />
      ) : null}
    </>
  )
}

