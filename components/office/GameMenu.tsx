'use client'

import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api/client'
import { CardGrid, LinkCard } from '@/components/ui/Card'
import { Untranslated, useOt } from '@/lib/i18n/office'
import type { OfficeKey } from '@/lib/i18n/office-format'
import { FunGuide } from './FunGuide'

type Card = {
  href: string
  titleKey: OfficeKey
  descKey: OfficeKey
  icon: string
}

/**
 * หน้าหมวดเกม — การ์ดเกมทั้งหมด
 *
 * ★★★ ทั้งเฟสนี้หายไปจากงานรอบแรก เพราะผมเพิ่มเกมใหม่เข้า "แถบเมนู"
 *     แล้วถือว่าเข้าถึงได้แล้ว ★ แต่ข้อกำหนดเฟส 1 สั่งเรื่อง "การ์ด"
 *     ซึ่งแสดงคำอธิบาย จำนวนคนที่กำลังเล่น และป้ายคำท้า — สามอย่างที่
 *     แถบเมนูแสดงไม่ได้เลย
 *     ★★ และ /office/fun ไม่เคยมีหน้าของตัวเอง กดเข้าหมวดแล้วเจอ 404
 */
export function GameMenu() {
  const ot = useOt()
  const [challenges, setChallenges] = useState(0)
  const [ongoing, setOngoing] = useState(0)

  useEffect(() => {
    /* ★ ล้มแล้วเงียบ — การ์ดต้องขึ้นเสมอ ตัวเลขเป็นของแถม */
    void apiFetch<{ games: unknown[]; challenges: unknown[] }>('/api/office/games/checkers')
      .then((r) => {
        setChallenges(r.challenges.length)
        setOngoing(r.games.length)
      })
      .catch(() => undefined)
  }, [])

  const cards: Card[] = [
    {
      href: '/office/fun/checkers',
      titleKey: 'game.checkers.title',
      descKey: 'game.checkers.desc',
      icon: 'M4 4h16v16H4zM4 10h16M4 16h16M10 4v16M16 4v16',
    },
    {
      href: '/office/fun/frog',
      titleKey: 'game.fg.title',
      descKey: 'game.fg.desc',
      icon: 'M12 4c-3 0-5 2-5 4 0 1 .5 2 1 2.5C5 12 4 14.5 4 16c0 2.5 3.5 4 8 4s8-1.5 8-4c0-1.5-1-4-4-5.5.5-.5 1-1.5 1-2.5 0-2-2-4-5-4zM9.5 7h.01M14.5 7h.01',
    },
    {
      href: '/office/fun/bubble',
      titleKey: 'game.bb.title',
      descKey: 'game.bb.desc',
      icon: 'M8 8a3 3 0 1 0 0-.01M16 8a3 3 0 1 0 0-.01M12 14a3 3 0 1 0 0-.01M12 21v-4',
    },
    {
      href: '/office/fun/makruk',
      titleKey: 'game.mk.title',
      descKey: 'game.mk.desc',
      icon: 'M8 21h8M9 21l1-6h4l1 6M8 9a4 4 0 0 1 8 0c0 2-1.5 3-1.5 3h-5S8 11 8 9zM12 3v2M10 4h4',
    },
    {
      href: '/office/fun/connect4',
      titleKey: 'game.c4.title',
      descKey: 'game.c4.desc',
      icon: 'M4 5h16v14H4zM8 9h.01M12 9h.01M16 9h.01M8 13h.01M12 13h.01M16 13h.01',
    },
    {
      href: '/office/fun/quiz',
      titleKey: 'game.quiz.title',
      descKey: 'game.quiz.desc',
      icon: 'M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
    },
    {
      href: '/office/fun/typing',
      titleKey: 'game.typing.title',
      descKey: 'game.typing.desc',
      icon: 'M3 7h18v10H3zM7 11h.01M10 11h.01M13 11h.01M16 11h.01M8 14h8',
    },
    { href: '/office/fun/name', titleKey: 'fun.name.title', descKey: 'pdesc.funName', icon: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 5v4l3 2' },
    { href: '/office/fun/team', titleKey: 'fun.team.title', descKey: 'pdesc.funTeam', icon: 'M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 20a7 7 0 0 1 14 0M16 20a6 6 0 0 1 6-6' },
    { href: '/office/fun/lottery', titleKey: 'fun.lottery.title', descKey: 'pdesc.funLottery', icon: 'M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2 2 2 0 0 0 0 4 2 2 0 0 1-2 2H6a2 2 0 0 1-2-2 2 2 0 0 0 0-4zM9 8v8' },
    { href: '/office/fun/cup', titleKey: 'fun.cup.title', descKey: 'pdesc.funCup', icon: 'M8 4h8v5a4 4 0 0 1-8 0zM8 6H5v2a3 3 0 0 0 3 3M16 6h3v2a3 3 0 0 1-3 3M10 17h4l1 3H9z' },
    { href: '/office/fun/room', titleKey: 'room.title', descKey: 'pdesc.funRoom', icon: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8 9h.01M16 9h.01M8 15c1.5 1.3 6.5 1.3 8 0' },
  ]

  return (
    /*
      * ★★ ใช้ CardGrid/LinkCard จากของกลาง ไม่เขียนคลาสการ์ดเอง
      *    ★ หน้านี้เคยเขียน rounded-2xl border border-line bg-elevated/50 backdrop-blur-md เอง
      *      ซึ่งเป็นต้นเหตุที่การ์ดของแต่ละหน้าค่อย ๆ ต่างกัน
      */
    <>
    <FunGuide id="hub" art="hub" />
    <CardGrid cols={3} className="py-2 mt-4">
      {cards.map((c) => {
        const isCheckers = c.href === '/office/fun/checkers'
        return (
          <LinkCard
            key={c.href}
            href={c.href}
            icon={c.icon}
            title={<Untranslated>{ot(c.titleKey)}</Untranslated>}
            detail={<Untranslated>{ot(c.descKey)}</Untranslated>}
            /* ★ การ์ดที่มีเรื่องรออยู่ใช้โทนเน้น — ไม่ใช่แค่ติดป้าย
                 ★★ ป้ายเล็ก ๆ บนการ์ดที่หน้าตาเหมือนใบอื่นหมด ตากวาดผ่านได้ */
            tone={isCheckers && challenges > 0 ? 'accent' : 'plain'}
            badge={
              <>
                {/*
                  * ★★ ป้ายคำท้าอยู่ติดชื่อเกม ไม่ใช่มุมการ์ด
                  *    ★ มันตอบคำถาม "เกมไหนมีเรื่องรอฉันอยู่" ซึ่งเป็นเหตุผล
                  *      เดียวที่คนกวาดตาดูหน้านี้ตอนเปิดเข้ามา
                  */}
                {isCheckers && challenges > 0 ? (
                  <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] text-accent-ink">
                    <Untranslated>{ot('game.menu.invites', { n: challenges })}</Untranslated>
                  </span>
                ) : null}
                {isCheckers && ongoing > 0 ? (
                  <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] text-ink-soft">
                    <Untranslated>{ot('game.menu.ongoing', { n: ongoing })}</Untranslated>
                  </span>
                ) : null}
              </>
            }
          />
        )
      })}
    </CardGrid>
    </>
  )
}
