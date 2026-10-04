import type { Ot } from '@/lib/i18n/office-format'
import type { Translate } from '@/lib/i18n/format'
import type { DictKey } from '@/lib/i18n/dict'
import { pageMetaOf, visibleNav } from './nav'

/**
 * ข้อมูลเมนูหลักที่แปลเสร็จแล้ว — ส่งให้คอมโพเนนต์ฝั่ง client ได้ตรง ๆ
 *
 * ★★ แปลฝั่ง server ที่เดียว
 *    ★ เมนูต้องใช้ป้ายจากหลายหมวดของดิกชันนารี (nav · chat · game · pdesc · cat)
 *      ★★ ส่งทั้งก้อนลงไปให้ client แปลเอง = HTML โตหลายหมื่นไบต์ทุกหน้า
 *         ส่งแค่ข้อความที่แปลแล้วไม่กี่สิบบรรทัดเบากว่ามาก
 *
 * ★ สีประจำโมดูลเป็นชุดเดียวกับการ์ดหน้าแรก (SystemHub / FeatureCatalog)
 */
export type NavLink = { href: string; label: string; desc: string | null; icon: string; group: string | null }
export type NavModule = {
  id: string
  href: string
  label: string
  tag: string
  icon: string
  /** rgb สามตัวเลข เช่น '255 149 0' */
  tint: string
  links: NavLink[]
}

const TINT: Record<string, string> = {
  '/office/food': '255 149 0',
  '/office/wallet': '52 199 123',
  '/office/fun': '175 82 222',
  '/office/market': '10 132 255',
  '/office/chat': '48 209 176',
  '/office/admin': '88 86 214',
}
const TAG: Record<string, DictKey> = {
  '/office/food': 'cat.food.tag',
  '/office/wallet': 'cat.wallet.tag',
  '/office/fun': 'cat.fun.tag',
  '/office/market': 'cat.market.tag',
  '/office/chat': 'cat.chat.tag',
  '/office/admin': 'cat.admin.tag',
}

const MUSIC_ICON = 'M9 18V6l10-2v12M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zm10-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0z'

export function buildNav(ot: Ot, t: Translate, isAdmin: boolean): NavModule[] {
  const office = visibleNav(isAdmin).map<NavModule>((s) => ({
    id: s.href.split('/').pop() ?? s.href,
    /* ★ ร้านเด็ดเป็นแท็บแรกของกินอะไรดี — หมวดที่ไม่มีหน้าของตัวเองชี้ไปลูกตัวแรก */
    href: s.children?.[0]?.href ?? s.href,
    label: ot(s.labelKey),
    tag: TAG[s.href] ? t(TAG[s.href]!) : '',
    icon: s.icon,
    tint: TINT[s.href] ?? '142 142 147',
    links: (s.children ?? [{ href: s.href, labelKey: s.labelKey, icon: s.icon }]).map((c) => {
      const meta = pageMetaOf(c.href)
      return {
        href: c.href,
        label: ot(c.labelKey),
        desc: meta ? ot(meta.descKey) : null,
        icon: c.icon,
        group: 'group' in c && c.group ? ot(c.group) : null,
      }
    }),
  }))

  /* ★ ห้องฟังเพลงอยู่นอก /office แต่เป็นระบบหนึ่งของเว็บ — ต้องอยู่ในเมนูเดียวกัน */
  const music: NavModule = {
    id: 'music',
    href: '/music',
    label: t('hub.music'),
    tag: t('cat.music.tag'),
    icon: MUSIC_ICON,
    tint: '255 0 51',
    links: [{ href: '/music', label: t('hub.music'), desc: t('hub.musicDetail'), icon: MUSIC_ICON, group: null }],
  }

  return [...office.filter((m) => m.id !== 'admin'), music, ...office.filter((m) => m.id === 'admin')]
}
