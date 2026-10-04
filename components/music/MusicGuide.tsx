'use client'

import { GuideView, type GuideArt } from '@/components/office/FunGuide'
import { useT } from '@/lib/i18n/client'
import { splitList } from '@/lib/i18n/office-format'
import type { DictKey } from '@/lib/i18n/dict'

/**
 * แผงอธิบายของห้องเพลง — หน้าตาเดียวกับ FunGuide ของออฟฟิศ แต่อ่านดิกหลัก
 *
 * ★ กุญแจ `mguide.<id>.*` (badge · title · desc · s1t/s1 · s2t/s2 · s3t/s3 · uses · tips)
 * ★ ซ่อนแล้วจำในเครื่อง ใช้ที่เก็บเดียวกับ FunGuide (คนละ id จึงไม่ชนกัน)
 */
export function MusicGuide({ id, art }: { id: 'music' | 'room'; art: GuideArt }) {
  const t = useT()
  const k = (s: string) => t(`mguide.${id}.${s}` as DictKey)
  return (
    <GuideView
      id={`music-${id}`}
      art={art}
      text={{
        badge: k('badge'),
        title: k('title'),
        desc: k('desc'),
        steps: [
          [k('s1t'), k('s1')],
          [k('s2t'), k('s2')],
          [k('s3t'), k('s3')],
        ],
        uses: splitList(k('uses')),
        tips: splitList(k('tips')),
        show: t('mguide.show', { title: k('title') }),
        hide: t('mguide.hide'),
        usesLabel: t('mguide.usesLabel'),
      }}
    />
  )
}
