'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/api/client'
import { cn } from '@/lib/cn'
import { useT } from '@/lib/i18n/client'

type RoomRow = {
  code: string
  name: string
  isLocked: boolean
  listeners: number
  nowPlaying: { title: string; thumbnailUrl: string | null } | null
}

/**
 * สีปกของห้องที่ยังไม่มีเพลง — คำนวณจากรหัสห้อง
 * ★ ต้องให้ผลเดิมเสมอสำหรับรหัสเดิม ไม่งั้นสีจะเปลี่ยนทุกครั้งที่รีเฟรช
 *   ซึ่งทำลายประโยชน์ทั้งหมดของการมีสี (คือการจำห้องได้จากสี)
 */
function coverFor(code: string): string {
  let hash = 0
  for (let i = 0; i < code.length; i += 1) hash = (hash * 31 + code.charCodeAt(i)) % 360
  return `linear-gradient(135deg, hsl(${hash} 45% 32%), hsl(${(hash + 48) % 360} 50% 22%))`
}

/** รีเฟรชรายการทุกกี่มิลลิวินาทีขณะเปิดหน้าอยู่ */
const REFRESH_MS = 20_000

/**
 * ห้องที่เปิดอยู่ตอนนี้
 *
 * ★★ ทำไมหน้านี้ใช้การถามซ้ำเป็นรอบ ทั้งที่ทั้งแอปห้าม polling
 *
 *    กฎ "ห้าม setInterval + fetch" มีไว้สำหรับ **การซิงก์เพลงในห้อง**
 *    ซึ่งต้องแม่นระดับวินาทีและมีคนดูพร้อมกันหลายสิบคน — ที่นั่นใช้ Realtime
 *
 *    ★ หน้านี้ไม่ใช่เรื่องนั้นเลย: ไม่มีห้องให้ subscribe (เรายังไม่ได้อยู่ใน
 *      ห้องไหน) ข้อมูลเป็นภาพรวมทั้งระบบ และช้าไป 20 วินาทีไม่มีใครเดือดร้อน
 *
 *      การจะทำด้วย Realtime ต้อง subscribe ตาราง rooms ทั้งตารางโดยไม่มี
 *      filter ซึ่งแปลว่าทุกคนที่เปิดหน้าแรกค้างไว้จะได้ WAL ของทุกห้องในระบบ
 *      — แพงกว่าการถามซ้ำทุก 20 วินาทีหลายเท่า
 *
 * ★ หยุดถามเมื่อแท็บไม่ได้อยู่ข้างหน้า
 *   แท็บที่เปิดค้างข้ามคืนไม่ควรยิง request 4,000 ครั้งโดยไม่มีใครมอง
 */
/**
 * ★ แสดงเท่านี้ก่อน แล้วค่อยกดดูเพิ่ม
 *
 *   ห้องที่ไม่มีใครอยู่แต่ยังไม่หมดอายุมีเยอะกว่าห้องที่มีชีวิตเสมอ
 *   การเทออกมาทั้ง 30 ห้องทำให้หน้าแรกยาวเป็นหางว่าวด้วยแถวที่หน้าตา
 *   เหมือนกันหมด ซึ่งเป็นภาพแรกที่แย่ที่สุดที่เว็บจะให้ได้
 *
 *   ★ 6 ห้องแรกคือห้องที่ดีที่สุดอยู่แล้ว (API เรียงให้: มีเพลง → คนเยอะ → ใหม่)
 *     คนที่อยากดูมากกว่านั้นกดเองได้ และเป็นคนส่วนน้อย
 */
const PREVIEW_COUNT = 6

export function RoomList() {
  const t = useT()
  const [rooms, setRooms] = useState<RoomRow[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [showAll, setShowAll] = useState(false)

  /**
   * ★ ทั้งก้อนอยู่ใน effect เดียว และ setState อยู่ใน callback ไม่ใช่ในตัว effect
   *
   *   กฎ set-state-in-effect มีไว้กันการเปลี่ยน state "ทันทีที่ effect รัน"
   *   ซึ่งทำให้ render ซ้อนกันโดยเปล่าประโยชน์ — ที่นี่ setState เกิดหลัง
   *   network ตอบกลับมา ซึ่งคือนิยามของ "subscribe ระบบภายนอก" พอดี
   *   แค่ต้องเขียนให้ lint เห็นว่ามันอยู่ใน callback จริง ๆ
   */
  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const data = await apiFetch<{ rooms: RoomRow[] }>('/api/rooms/list')
        if (cancelled) return
        setRooms(data.rooms)
        setFailed(false)
      } catch {
        if (!cancelled) setFailed(true)
      }
    }

    const tick = () => {
      if (document.visibilityState === 'visible') void load()
    }

    tick()
    const timer = setInterval(tick, REFRESH_MS)
    document.addEventListener('visibilitychange', tick)
    return () => {
      cancelled = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [])

  const listeners = (rooms ?? []).reduce((sum, r) => sum + r.listeners, 0)

  return (
    <div>
      {/**
        * ★ หัวรายการบอกตัวเลขจริง ไม่ใช่แค่ชื่อหัวข้อ
        *   "ห้องที่เปิดอยู่" เฉย ๆ ไม่ได้ให้ข้อมูลอะไรที่รายการด้านล่างไม่ได้บอก
        *   ส่วน "3 ห้อง · 7 คนกำลังฟัง" ตอบคำถามว่า "ที่นี่มีคนอยู่ไหม" ทันที
        */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span aria-hidden="true" className="mus-act-icon grid size-11 shrink-0 place-items-center rounded-2xl" style={{ '--tint': '175 82 222' } as React.CSSProperties}>
            <svg viewBox="0 0 24 24" className="size-5" fill="currentColor">
              <path d="M3 5h18v4H3zM3 11h18v8H3zm4 2v4h2v-4zm4 0v4h2v-4z" />
            </svg>
          </span>
        <div className="min-w-0">
          <h2 className="text-xl font-black">{t('rooms.title')}</h2>
          <p className="mt-0.5 text-xs text-ink-soft">
            {rooms === null
              ? t('rooms.loading')
              : rooms.length === 0
                ? t('rooms.none')
                : listeners > 0
                  ? t('rooms.summary', { rooms: rooms.length, listeners })
                  : /* ★ ไม่พูดถึงตัวเลขที่เป็นศูนย์ — เหตุผลเต็มอยู่ใน Hero.tsx */
                    t('rooms.summaryIdle', { rooms: rooms.length })}
          </p>
        </div>
        </div>
        {/**
          * ★ ทางไปลอบบี้อยู่ตรงนี้ด้วย ไม่ใช่แค่บนหัวหน้า
          *   คนที่เลื่อนลงมาดูรายการแล้วไม่เจอห้องที่ถูกใจ คือคนที่อยากเดินดู
          *   มากที่สุด — ปุ่มควรอยู่ตรงที่เขาอยู่ ไม่ใช่ให้เลื่อนกลับขึ้นไป
          */}
        <Link
          href="/lobby"
          className={cn(
            'mus-perk flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3.5',
            'text-xs font-semibold transition-transform hover:-translate-y-0.5',
          )}
        >
          <svg viewBox="0 0 24 24" className="size-3.5" fill="currentColor" aria-hidden="true">
            <path d="M12 2a5 5 0 0 0-5 5c0 3.5 5 11 5 11s5-7.5 5-11a5 5 0 0 0-5-5zm0 7a2 2 0 1 1 0-4 2 2 0 0 1 0 4z" />
          </svg>
          {t('rooms.toLobby')}
        </Link>
      </div>

      {renderBody()}
    </div>
  )

  function renderBody() {
  if (rooms === null) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="aspect-[16/11] animate-pulse rounded-2xl bg-surface" />
        ))}
      </div>
    )
  }

  if (failed && rooms.length === 0) {
    return <p className="text-xs text-ink-faint">{t('rooms.failed')}</p>
  }

  if (rooms.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line px-5 py-8 text-center">
        <p className="text-sm text-ink-soft">{t('rooms.emptyTitle')}</p>
        <p className="mt-1 text-xs text-ink-faint">{t('rooms.emptyDetail')}</p>
      </div>
    )
  }

  const shown = showAll ? rooms : rooms.slice(0, PREVIEW_COUNT)

  return (
    <>
    {/**
      * ★★★ ทุกใบขนาดเท่ากัน ไม่มีใบเด่นกินสองช่อง
      *
      *     รอบก่อนให้ห้องที่มีเพลงเล่นอยู่กินสองช่องเพื่อให้ดูมีลำดับความสำคัญ
      *     ★ ผลจริงคือแถวแรกเหลือรูโหว่ใต้การ์ดใบเล็กข้าง ๆ และการ์ดใบสุดท้าย
      *       ถูกตัดกลางแถว — ทั้งหน้าอ่านเป็น "ของที่จัดวางพลาด" ไม่ใช่ "ของเด่น"
      *
      *     ความสม่ำเสมอชนะการเน้นเสมอในตารางที่จำนวนรายการไม่แน่นอน
      *
      * ★★ พาดหัวคือ "ชื่อห้อง" ส่วนชื่อเพลงเป็นบรรทัดรอง
      *
      *    เคยสลับให้ชื่อเพลงเป็นตัวเอกอยู่พักหนึ่ง ด้วยเหตุผลว่าห้องส่วนใหญ่
      *    ชื่อ "ห้องฟังเพลง" เหมือนกันหมด
      *    ★ แต่พอหลายห้องเปิดเพลงเดียวกัน ตารางก็ซ้ำเหมือนเดิมอยู่ดี —
      *      แค่ย้ายที่ซ้ำจากชื่อห้องไปเป็นชื่อเพลงเท่านั้น
      *
      *    ★★ สิ่งที่ผู้ใช้กำลังเลือกคือ "จะเข้าห้องไหน" ไม่ใช่ "จะฟังเพลงไหน"
      *       ชื่อห้องจึงต้องเป็นตัวเอก ส่วนเพลงเป็นข้อมูลประกอบว่าตอนนี้ในนั้นมีอะไร
      *       (ส่วนเรื่องห้องชื่อซ้ำ แก้ด้วยจุดสีประจำห้อง + รหัสห้องที่แถบล่าง)
      */}
    <ul data-user-content className="reveal-stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {shown.map((room) => (
        <li key={room.code}>
          <Link
            href={`/room/${room.code}`}
            className={cn(
              /*
               * ★★ ไม่ใส่ .lift ที่นี่ — การ์ดห้องมีของมันเองอยู่แล้ว
               *
               *    มันมี hover:-translate-y-1 (4px) กับ group-hover:scale-105
               *    ที่ปกอยู่แล้ว ★ ถ้าใส่ .lift ทับ กฎของเราจะชนะเพราะอยู่ท้ายไฟล์
               *      แล้วระยะยกจะเปลี่ยนจาก 4px เป็น 3px เงียบ ๆ
               *
               *    ★★ ซึ่งนั่นคือ "แก้ดีไซน์เดิม" ทั้งที่โจทย์ห้ามไว้ —
               *       และเป็นชนิดที่ไม่มีใครจับได้จนกว่าจะเอาสองรุ่นมาวางเทียบกัน
               */
              'mus-room group block overflow-hidden rounded-2xl border border-line',
              'bg-elevated/60 backdrop-blur-md transition-all',
              'hover:-translate-y-1 hover:border-line-strong',
              'hover:shadow-[0_18px_40px_-22px] hover:shadow-accent/50',
            )}
          >
            <div className="relative aspect-video overflow-hidden">
              {room.nowPlaying?.thumbnailUrl ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={room.nowPlaying.thumbnailUrl}
                    alt=""
                    loading="lazy"
                    className="size-full object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                  <span className="absolute inset-0 bg-gradient-to-t from-black/92 via-black/45 to-transparent" />
                </>
              ) : (
                <span className="absolute inset-0" style={{ background: coverFor(room.code) }}>
                  <svg
                    viewBox="0 0 24 24"
                    className="absolute -bottom-5 -end-4 size-28 text-white/10"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z" />
                  </svg>
                  <span className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                </span>
              )}

              {room.nowPlaying ? (
                <span className="absolute start-2.5 top-2.5 flex items-center gap-1.5 rounded-full bg-black/60 px-2 py-1 backdrop-blur-sm">
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
                  <span className="text-[9px] font-semibold uppercase tracking-wider text-white">
                    live
                  </span>
                </span>
              ) : null}

              {/**
                * ★★ บอกจำนวนคนเสมอ รวมตอนเป็นศูนย์
                *
                *    ตอนแรกซ่อนป้ายนี้เมื่อไม่มีคน ด้วยเหตุผลว่าเลขศูนย์อ่านเป็น
                *    "ที่นี่ร้าง" ★ แต่การไม่บอกเลยแย่กว่า เพราะคนต้องกดเข้าไป
                *      ถึงจะรู้ว่ามีใครอยู่ไหม ซึ่งเป็นสิ่งเดียวที่เขาอยากรู้ก่อนกด
                *
                *    ★ แก้ด้วยน้ำหนักของสีแทนการซ่อน: มีคน = ตัวขาวเต็ม
                *      ไม่มีคน = ตัวจาง ยังอ่านได้แต่ไม่ตะโกน
                */}
              <span
                className={cn(
                  'absolute end-2.5 top-2.5 flex items-center gap-1 rounded-full px-2 py-1',
                  'text-[11px] backdrop-blur-sm',
                  room.listeners > 0 ? 'bg-black/60 text-white' : 'bg-black/40 text-white/55',
                )}
              >
                <svg viewBox="0 0 24 24" className="size-3.5" fill="currentColor" aria-hidden="true">
                  <path d="M9 13c-2.2 0-6.5 1.1-6.5 3.3V19h13v-2.7C15.5 14.1 11.2 13 9 13zm0-2a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zm7.5 2.2c1.1.8 1.9 1.8 1.9 3.1V19H22v-2.7c0-1.8-2.9-2.8-5.5-3.1zM15 11a3.5 3.5 0 1 0-1.1-6.8 5.5 5.5 0 0 1 0 6.6c.36.13.73.2 1.1.2z" />
                </svg>
                <span className="font-medium tabular-nums">{room.listeners}</span>
              </span>

              {/* ★ ปุ่มเล่นขึ้นตอนชี้เท่านั้น — ไม่ใช่ของประดับที่ค้างอยู่ตลอด */}
              <span
                aria-hidden="true"
                className={cn(
                  'absolute left-1/2 top-1/2 grid size-12 -translate-x-1/2 -translate-y-1/2 scale-75',
                  'place-items-center rounded-full bg-accent text-accent-ink opacity-0',
                  'transition-all duration-300 group-hover:scale-100 group-hover:opacity-100',
                )}
              >
                <svg viewBox="0 0 24 24" className="size-6" fill="currentColor">
                  <path d="M8 5.5v13l11-6.5z" />
                </svg>
              </span>

              <div className="absolute inset-x-0 bottom-0 p-3">
                <p dir="auto" className="truncate text-[17px] font-bold leading-snug text-white drop-shadow">
                  {room.name}
                </p>
                <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-white/75">
                  {room.nowPlaying ? (
                    <>
                      <svg
                        viewBox="0 0 24 24"
                        className="size-3 shrink-0"
                        fill="currentColor"
                        aria-hidden="true"
                      >
                        <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z" />
                      </svg>
                      <span dir="auto" className="truncate">{room.nowPlaying.title}</span>
                    </>
                  ) : (
                    <span className="truncate">{t('rooms.nowPlayingNone')}</span>
                  )}
                </p>
              </div>
            </div>

            {/**
              * ★ แถบล่างสูงคงที่บรรทัดเดียวเสมอ — นี่คือสิ่งที่ทำให้ทุกใบสูงเท่ากัน
              *   ถ้าปล่อยให้ตัดสองบรรทัดได้ การ์ดจะสูงไม่เท่ากันแล้วแถวจะเหลื่อม
              */}
            <div className="flex items-center gap-2 px-3 py-2.5">
              {/* จุดสีประจำห้อง — ห้องชื่อซ้ำกันยังแยกออกด้วยสี */}
              <span
                aria-hidden="true"
                className="size-2 shrink-0 rounded-full"
                style={{ background: coverFor(room.code) }}
              />
              {/**
                * ★ แถบล่างต้องไม่พูดซ้ำกับบนปก
                *   ชื่อห้องกับชื่อเพลงอยู่บนปกครบแล้ว ★ ที่นี่จึงเหลือไว้บอก
                *     "ตอนนี้มีคนอยู่ไหม" ซึ่งเป็นข้อมูลที่ยังไม่มีใครบอก
                */}
              <span className="min-w-0 flex-1 truncate text-xs text-ink-soft">
                {room.listeners > 0 ? t('rooms.inRoom', { n: room.listeners }) : t('rooms.empty')}
                {room.isLocked ? ` · ${t('rooms.locked')}` : ''}
              </span>
              <span className="shrink-0 font-mono text-[10px] tracking-[0.15em] text-ink-faint">
                {room.code}
              </span>
              <svg
                viewBox="0 0 24 24"
                className="size-4 shrink-0 text-ink-faint transition-transform group-hover:translate-x-0.5 group-hover:text-ink"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M10 6 8.6 7.4 13.2 12l-4.6 4.6L10 18l6-6z" />
              </svg>
            </div>
          </Link>
        </li>
      ))}
    </ul>

    {!showAll && rooms.length > PREVIEW_COUNT ? (
      <button
        type="button"
        onClick={() => setShowAll(true)}
        className={cn(
          'mt-2 w-full rounded-2xl border border-dashed border-line py-3',
          'text-xs text-ink-soft transition-colors hover:border-line-strong hover:bg-surface hover:text-ink',
        )}
      >
        {t('rooms.more', { n: rooms.length - PREVIEW_COUNT })}
      </button>
    ) : null}
    </>
  )
  }
}
