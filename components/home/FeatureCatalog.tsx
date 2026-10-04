import type { CSSProperties } from 'react'
import Link from 'next/link'
import { getT } from '@/lib/i18n/server'
import type { DictKey } from '@/lib/i18n/dict'

/** href ว่าง = ฟังก์ชันที่อยู่บนแถบบนของทุกหน้า (กระดิ่ง ภาษา ธีม) ไม่มีหน้าของตัวเอง */
type Item = { emoji: string; href: string; key: string }
type Module = {
  id: string
  titleKey: DictKey
  tagKey: DictKey
  href: string
  icon: string
  /* ★ สีประจำโมดูล — ชุดเดียวกับการ์ดใน SystemHub (rgb เป็นสามตัวเลข) */
  tint: string
  items: Item[]
}

/**
 * แค็ตตาล็อก "ทุกฟังก์ชันในระบบ" บนหน้าแรก
 *
 * ★★★ ทุกฟังก์ชันชี้ไปหน้าที่ทำสิ่งนั้นได้จริง — ไม่มีรายการโฆษณาลอย ๆ
 *     ★ คนอ่านแล้วกดได้ทันที ไม่ต้องไปเดาว่าอยู่เมนูไหน
 *     ★★ เพิ่มฟังก์ชันใหม่วันหลัง: เติมแถวในอาร์เรย์ + กุญแจ cat.<โมดูล>.<n>.t/.d
 *
 * ★ ส่วนผู้ดูแลระบบโชว์เฉพาะคนที่เป็นผู้ดูแล — คนอื่นกดเข้าไปก็เข้าไม่ได้อยู่ดี
 */
const MODULES: Module[] = [
  {
    id: 'cat-music',
    titleKey: 'hub.music',
    tagKey: 'cat.music.tag',
    href: '/music',
    icon: 'M9 18V6l10-2v12M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zm10-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
    tint: '255 0 51',
    items: [
      { emoji: '🎧', href: '/music', key: 'cat.music.1' },
      { emoji: '🎙️', href: '/music', key: 'cat.music.2' },
      { emoji: '📜', href: '/music', key: 'cat.music.3' },
      { emoji: '💬', href: '/music', key: 'cat.music.4' },
      { emoji: '🧑‍🎨', href: '/music', key: 'cat.music.5' },
    ],
  },
  {
    id: 'cat-food',
    titleKey: 'hub.food',
    tagKey: 'cat.food.tag',
    href: '/office/food/picks',
    icon: 'M7 3v8a3 3 0 0 0 3 3v7M7 3v5M10 3v5M17 3c-1.5 2-2 4-2 6s.5 3 2 3v9',
    tint: '255 149 0',
    items: [
      { emoji: '⭐', href: '/office/food/picks', key: 'cat.food.2' },
      { emoji: '🎡', href: '/office/food/random', key: 'cat.food.1' },
      { emoji: '📸', href: '/office/food/picks', key: 'cat.food.3' },
      { emoji: '📍', href: '/office/food/picks', key: 'cat.food.4' },
      { emoji: '🧾', href: '/office/wallet/create', key: 'cat.food.5' },
    ],
  },
  {
    id: 'cat-wallet',
    titleKey: 'hub.wallet',
    tagKey: 'cat.wallet.tag',
    href: '/office/wallet/owed',
    icon: 'M3 8a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v2M3 8v9a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-3M3 8h1m17 3h-4a2 2 0 0 0 0 4h4a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1z',
    tint: '52 199 123',
    items: [
      { emoji: '💸', href: '/office/wallet/owed', key: 'cat.wallet.1' },
      { emoji: '🧮', href: '/office/wallet/create', key: 'cat.wallet.2' },
      { emoji: '📱', href: '/office/wallet/owed', key: 'cat.wallet.3' },
      { emoji: '📎', href: '/office/wallet/owed', key: 'cat.wallet.4' },
      { emoji: '🔔', href: '/office/wallet/owed', key: 'cat.wallet.5' },
      { emoji: '📊', href: '/office/wallet/summary', key: 'cat.wallet.6' },
      { emoji: '🪪', href: '/office/wallet/qr', key: 'cat.wallet.7' },
    ],
  },
  {
    id: 'cat-fun',
    titleKey: 'hub.fun',
    tagKey: 'cat.fun.tag',
    href: '/office/fun',
    icon: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 4v5l3 3',
    tint: '175 82 222',
    items: [
      { emoji: '🎡', href: '/office/fun/name', key: 'cat.fun.1' },
      { emoji: '👥', href: '/office/fun/team', key: 'cat.fun.2' },
      { emoji: '🎰', href: '/office/fun/lottery', key: 'cat.fun.3' },
      { emoji: '📡', href: '/office/fun/room', key: 'cat.fun.4' },
      { emoji: '🏆', href: '/office/fun/cup', key: 'cat.fun.5' },
      { emoji: '♟️', href: '/office/fun/checkers', key: 'cat.fun.6' },
      { emoji: '⌨️', href: '/office/fun/typing', key: 'cat.fun.7' },
    ],
  },
  {
    id: 'cat-market',
    titleKey: 'hub.market',
    tagKey: 'cat.market.tag',
    href: '/office/market',
    icon: 'M4 7h16l-1 12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2zM9 7V5a3 3 0 0 1 6 0v2',
    tint: '10 132 255',
    items: [
      { emoji: '🛍️', href: '/office/market', key: 'cat.market.1' },
      { emoji: '📷', href: '/office/market/post', key: 'cat.market.2' },
      { emoji: '🙋', href: '/office/market', key: 'cat.market.3' },
      { emoji: '💬', href: '/office/market/chat', key: 'cat.market.4' },
      { emoji: '🔍', href: '/office/market/chat', key: 'cat.market.5' },
      { emoji: '📦', href: '/office/market/mine', key: 'cat.market.6' },
    ],
  },
  {
    id: 'cat-chat',
    titleKey: 'hub.chat',
    tagKey: 'cat.chat.tag',
    href: '/office/chat',
    icon: 'M20 4H4a1 1 0 0 0-1 1v12l4-3h13a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1z',
    tint: '48 209 176',
    items: [
      { emoji: '👨‍👩‍👧', href: '/office/chat', key: 'cat.chat.1' },
      { emoji: '🖼️', href: '/office/chat', key: 'cat.chat.2' },
      { emoji: '😀', href: '/office/chat', key: 'cat.chat.3' },
      { emoji: '👀', href: '/office/chat', key: 'cat.chat.4' },
      { emoji: '🔕', href: '/office/chat', key: 'cat.chat.5' },
    ],
  },
  {
    id: 'cat-account',
    titleKey: 'cat.account.title',
    tagKey: 'cat.account.tag',
    href: '/office/profile',
    icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 8a7 7 0 0 1 14 0',
    tint: '142 142 147',
    items: [
      { emoji: '🪪', href: '/office/profile', key: 'cat.account.1' },
      { emoji: '🎚️', href: '/office/profile', key: 'cat.account.2' },
      { emoji: '🔔', href: '', key: 'cat.account.3' },
      { emoji: '🌐', href: '', key: 'cat.account.4' },
    ],
  },
]

const ADMIN: Module = {
  id: 'cat-admin',
  titleKey: 'cat.admin.title',
  tagKey: 'cat.admin.tag',
  href: '/office/admin/dashboard',
  icon: 'M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6z',
  tint: '88 86 214',
  items: [
    { emoji: '📈', href: '/office/admin/dashboard', key: 'cat.admin.1' },
    { emoji: '🔑', href: '/office/admin/codes', key: 'cat.admin.2' },
    { emoji: '🛡️', href: '/office/admin/users', key: 'cat.admin.3' },
    { emoji: '⚙️', href: '/office/admin/settings', key: 'cat.admin.4' },
  ],
}

export function catalogModules(isAdmin: boolean): Module[] {
  return isAdmin ? [...MODULES, ADMIN] : MODULES
}

export async function FeatureCatalog({ isAdmin }: { isAdmin: boolean }) {
  const { t } = await getT()
  const modules = catalogModules(isAdmin)

  return (
    <div className="mx-auto w-full max-w-[1120px] px-4">
      {/* ── ทางลัดไปแต่ละระบบ ── */}
      <div className="flex flex-wrap gap-2">
        {modules.map((m) => (
          <a
            key={m.id}
            href={`#${m.id}`}
            style={{ '--tint': m.tint } as CSSProperties}
            className="cat-jump inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-[13px] font-semibold text-ink sm:min-h-9"
          >
            <span aria-hidden="true" className="size-2.5 rounded-full bg-[rgb(var(--tint))]" />
            {t(m.titleKey)}
            <span className="tabular-nums text-ink-faint">{m.items.length}</span>
          </a>
        ))}
      </div>

      <div className="mt-8 flex flex-col gap-6">
        {modules.map((m) => (
          <article
            key={m.id}
            id={m.id}
            style={{ '--tint': m.tint } as CSSProperties}
            className="cat-module scroll-mt-[calc(var(--spacing-header)+72px)] grid gap-6 rounded-[32px] p-5 sm:p-7 lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-8"
          >
            {/* ── หัวโมดูล ── */}
            <div className="flex flex-col lg:sticky lg:top-[calc(var(--spacing-header)+80px)] lg:self-start">
              <span aria-hidden="true" className="cat-icon grid size-16 place-items-center rounded-[22px]">
                <svg viewBox="0 0 24 24" className="size-8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d={m.icon} />
                </svg>
              </span>
              <h3 className="mt-4 text-[26px] font-black leading-tight tracking-tight text-ink">{t(m.titleKey)}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{t(m.tagKey)}</p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="cat-count rounded-full px-3 py-1 text-xs font-bold">
                  {t('cat.count', { n: m.items.length })}
                </span>
                <Link
                  href={m.href}
                  className="cat-open inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-[13px] font-bold sm:min-h-9"
                >
                  {t('cat.open', { name: t(m.titleKey) })}
                  <svg viewBox="0 0 24 24" className="size-4 rtl:-scale-x-100" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M5 12h14M13 6l6 6-6 6" />
                  </svg>
                </Link>
              </div>
            </div>

            {/* ── ฟังก์ชัน ── */}
            <ul className="grid gap-2.5 sm:grid-cols-2">
              {m.items.map((it) => (
                <li key={it.key}>
                  {it.href ? (
                    <Link href={it.href} className="cat-item group flex h-full items-start gap-3.5 rounded-2xl p-4">
                      <ItemBody emoji={it.emoji} title={t(`${it.key}.t` as DictKey)} detail={t(`${it.key}.d` as DictKey)} arrow />
                    </Link>
                  ) : (
                    <div className="cat-item cat-item-static flex h-full items-start gap-3.5 rounded-2xl p-4">
                      <ItemBody emoji={it.emoji} title={t(`${it.key}.t` as DictKey)} detail={t(`${it.key}.d` as DictKey)} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </div>
  )
}

function ItemBody({ emoji, title, detail, arrow = false }: { emoji: string; title: string; detail: string; arrow?: boolean }) {
  return (
    <>
      <span aria-hidden="true" className="cat-emoji grid size-12 shrink-0 place-items-center rounded-2xl text-2xl">
        {emoji}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-bold text-ink">{title}</span>
        <span className="mt-0.5 block text-[13px] leading-relaxed text-ink-soft">{detail}</span>
      </span>
      {arrow ? (
        <svg viewBox="0 0 24 24" className="cat-arrow mt-1 size-4 shrink-0 text-ink-faint rtl:-scale-x-100" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m9 6 6 6-6 6" />
        </svg>
      ) : null}
    </>
  )
}
