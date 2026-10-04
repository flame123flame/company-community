'use client'

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import Link from 'next/link'
import { Logo } from './Logo'
import { IconButton } from './ui/Button'
import { useSearchSuggestions } from '@/hooks/useSearchSuggestions'
import { useVoiceSearch } from '@/hooks/useVoiceSearch'
import { VoiceSearchDialog } from '@/components/VoiceSearchDialog'
import { ThemeToggle } from '@/components/ThemeToggle'
import { LanguageToggle } from '@/components/LanguageToggle'
import { useT } from '@/lib/i18n/client'
import { cn } from '@/lib/cn'

/**
 * แถบบนแบบ YouTube
 *
 * ★ สัดส่วนที่ทำให้ดูเป็น YouTube จริง ๆ (ค่าจากของจริง):
 *   • สูง 56px เป๊ะ ติดบนตลอด พื้นหลังทึบ #0f0f0f
 *   • โลโก้ชิดซ้ายสุด ไม่มีระยะห่างเยอะ
 *   • ★ ช่องค้นหาอยู่ "กึ่งกลางจอ" ไม่ใช่ชิดโลโก้ — นี่คือลายเซ็นของ YouTube
 *     กว้างสูงสุด 640px และหดตามจอ
 *   • ช่องค้นหาเป็นแคปซูล มีปุ่มแว่นขยายกว้าง 64px ต่อท้ายพร้อมเส้นคั่น
 *   • ไอคอน/อวาตาร์ชิดขวาสุด
 */
export function AppHeader({
  onSearch,
  searchValue,
  onSearchChange,
  searchPlaceholder,
  right,
  actions,
  center,
  exitLabel,
}: {
  onSearch?: (query: string) => void
  searchValue?: string
  onSearchChange?: (value: string) => void
  searchPlaceholder?: string
  right?: ReactNode
  /**
   * แทนกลุ่มปุ่มขวามือทั้งชุด รวมปุ่มภาษาและปุ่มธีม
   *
   * ★★★ มีไว้ให้หน้าที่ล็อกอินแล้วส่ง <HeaderActions /> เข้ามาเป็นชุดเดียว
   *
   *     ★ ใช้ `right` ไม่ได้ เพราะ `right` ต่อท้ายปุ่มภาษา/ธีมที่ไฟล์นี้
   *       วางไว้แล้ว ★★ ผลคือได้ปุ่มภาษาสองอันติดกัน ซึ่งนอกจากจะดูพัง
   *       แล้วยังทำให้ตัวทดสอบที่เลือกปุ่มด้วย aria-haspopup นับตำแหน่งผิด
   *     ★ ลำดับปุ่มจึงถูกตัดสินที่ HeaderActions ที่เดียว — ไม่ใช่สองที่
   *       ที่ต้องเดาว่าอีกที่วางอะไรไว้แล้ว
   */
  actions?: ReactNode
  /** แทนที่ช่องค้นหาทั้งหมด (ใช้ตอนไม่ต้องการค้นหา) */
  center?: ReactNode
  /**
   * ป้ายปุ่มออก — ใส่เมื่ออยู่ใน "ที่ที่ต้องออก" เช่นในห้อง
   *
   * ★★★ โลโก้เป็นลิงก์กลับหน้าแรกมาตลอด แต่ไม่มีอะไรบอกว่ามันกดได้
   *
   *     ผู้ใช้รายงานตรง ๆ ว่า "หน้านี้หาปุ่มกลับไปหน้าหลักไม่เจอ"
   *     ★ ทั้งที่ลิงก์อยู่ตรงนั้นและมี aria-label ถูกต้อง — แต่ aria-label
   *       ช่วยเฉพาะคนที่ใช้ screen reader ส่วนคนที่ใช้ตาไม่เห็นสัญญาณอะไรเลย
   *
   *     ★★ บนหน้าแรกไม่เป็นปัญหา เพราะไม่มีใครต้อง "ออก" จากหน้าแรก
   *        ★ แต่ในห้องคือทางออกทางเดียว การซ่อนมันไว้หลังโลโก้
   *          แปลว่าคนที่อยากเปลี่ยนห้องต้องกดปุ่ม back ของเบราว์เซอร์
   *          หรือแก้ URL เอง — ซึ่งบนมือถือที่ไม่มีปุ่ม back คือทางตัน
   */
  exitLabel?: string
}) {
  const t = useT()
  /* ★ ค่าเริ่มต้นย้ายมาอยู่ในตัวคอมโพเนนต์ เพราะมันต้องแปลตามภาษา
       ค่า default ใน parameter list เรียก hook ไม่ได้ */
  const placeholder = searchPlaceholder ?? t('header.search')
  const [focused, setFocused] = useState(false)
  const [open, setOpen] = useState(false)
  /** แถวที่ถูกเลือกด้วยคีย์บอร์ด — -1 = ยังไม่ได้เลือกแถวไหน */
  const [active, setActive] = useState(-1)
  /** มือถือ: กางช่องค้นหาเต็มแถบอยู่หรือไม่ */
  const [mobileSearch, setMobileSearch] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // กางแล้วต้องโฟกัสให้เลย ไม่ใช่บังคับให้ผู้ใช้กดอีกทีเพื่อเรียกคีย์บอร์ด
  useEffect(() => {
    if (mobileSearch) inputRef.current?.focus()
  }, [mobileSearch])

  const { suggestions, remember, forget } = useSearchSuggestions(
    searchValue ?? '',
    Boolean(onSearch),
  )

  /**
   * ★★ ค้นหาด้วยเสียง — กดไมค์แล้วเด้งหน้าต่างเต็มจอ (แบบ YouTube)
   *
   *    หน้าต่างกับการฟังต้องเปิด/ปิดพร้อมกันเสมอ ห้ามหลุดจากกัน:
   *      เปิดหน้าต่างแต่ไม่ฟัง = ผู้ใช้พูดใส่ที่ว่าง
   *      ฟังแต่ไม่มีหน้าต่าง   = ไมค์เปิดอยู่โดยไม่มีอะไรบอก ซึ่งแย่กว่ามาก
   *
   *    จึงมีทางเปิดทางเดียว (openVoice) และทางปิดทางเดียว (closeVoice)
   *    ที่สั่งทั้งสองอย่างในฟังก์ชันเดียว — ไม่มีที่ไหนแตะ setVoiceOpen ตรง ๆ
   */
  const [voiceOpen, setVoiceOpen] = useState(false)

  const voice = useVoiceSearch({
    onInterim: (text) => {
      // ★ ยัดลงช่องค้นหาไปด้วยทั้งที่หน้าต่างบังอยู่ — เผื่อผู้ใช้กดปิดกลางคัน
      //   จะได้เจอสิ่งที่พูดไปแล้วค้างอยู่ในช่อง แก้ต่อด้วยคีย์บอร์ดได้เลย
      onSearchChange?.(text)
      setOpen(false)
    },
    onResult: (text) => {
      onSearchChange?.(text)
      // ★ พูดจบ → ปิดหน้าต่างแล้วค้นเลย ไม่ต้องให้กด Enter อีกที
      //   นั่นคือเหตุผลทั้งหมดที่ใช้เสียง ถ้ายังต้องกดต่อก็พิมพ์เองเร็วกว่า
      setVoiceOpen(false)
      remember(text)
      onSearch?.(text)
    },
  })

  const openVoice = () => {
    setOpen(false)
    setVoiceOpen(true)
    voice.start()
  }

  const closeVoice = () => {
    setVoiceOpen(false)
    voice.cancel()
  }

  const submit = (text: string) => {
    const value = text.trim()
    if (!value) return
    remember(value)
    setOpen(false)
    setActive(-1)
    onSearchChange?.(value)
    onSearch?.(value)
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    // เลือกแถวไว้ด้วยลูกศรอยู่ → ใช้แถวนั้น ไม่ใช่สิ่งที่พิมพ์ค้างไว้
    submit(active >= 0 && suggestions[active] ? suggestions[active].text : (searchValue ?? ''))
  }

  /**
   * ★ ปิด dropdown เมื่อคลิกนอกช่องค้นหา
   *   ใช้ mousedown ไม่ใช่ click เพราะ blur ของ input มาก่อน click เสมอ
   *   ถ้าผูกกับ blur ตรง ๆ การคลิกแถวคำแนะนำจะปิดเมนูก่อนที่ onClick จะทำงาน
   *
   * ★★ ต้องดักใน capture phase — ไม่ใช่ bubble
   *
   *    บั๊กที่เจอ: กดปุ่ม × ลบประวัติ แล้วเมนูปิดทั้งอัน ทั้งที่ควรเหลือแถวอื่น
   *
   *    สาเหตุ: React ของ App Router hydrate ทั้ง document ตัว listener ของ
   *    React จึงอยู่บน document เหมือนกับตัวนี้ — stopPropagation() ใน handler
   *    ของ React หยุด listener อื่นที่อยู่บน "node เดียวกัน" ไม่ได้
   *
   *    พอ handler ของ React ทำงานก่อน แถวนั้นถูกถอดออกจาก DOM ทันที
   *    ตัวนี้จึงมาเช็ค `form.contains(target)` กับปุ่มที่หลุดจาก DOM ไปแล้ว
   *    ได้ false → เข้าใจว่าเป็นการคลิกข้างนอก → ปิดเมนูทิ้ง
   *
   *    capture phase วิ่งจากบนลงล่างก่อน handler ของ React เสมอ
   *    ตอนนั้นปุ่มยังอยู่ใน DOM คำตอบจึงถูกต้อง
   */
  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent | TouchEvent) => {
      if (!formRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown, true)
    document.addEventListener('touchstart', onDown, true)
    return () => {
      document.removeEventListener('mousedown', onDown, true)
      document.removeEventListener('touchstart', onDown, true)
    }
  }, [open])

  /**
   * คำค้นเปลี่ยน → ล้างแถวที่เลือกไว้ ไม่งั้นลูกศรจะชี้ผิดแถว
   *
   * ★ ปรับตอน render ไม่ใช่ใน useEffect
   *   ถ้าใช้ effect จะมีอยู่หนึ่งเฟรมที่ผู้ใช้เห็นแถวเก่าถูกไฮไลต์อยู่
   *   ทั้งที่รายการเปลี่ยนไปแล้ว — React รองรับรูปแบบนี้โดยตรง
   */
  const [lastQuery, setLastQuery] = useState(searchValue)
  if (lastQuery !== searchValue) {
    setLastQuery(searchValue)
    setActive(-1)
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      /**
       * ★★ ต้อง preventDefault เมื่อเมนูเปิดอยู่
       *
       *   `<input type="search">` ของ Chrome/Safari ผูก Escape ไว้กับ
       *   "ล้างข้อความในช่อง" มาแต่เดิม ถ้าไม่ห้ามไว้ การกด Escape เพื่อปิด
       *   คำแนะนำจะลบคำที่ผู้ใช้อุตส่าห์พิมพ์ทิ้งไปด้วย ซึ่งไม่มีใครตั้งใจ
       *
       *   ★ พฤติกรรมที่ได้: Escape ครั้งแรกปิดเมนู · ครั้งที่สอง (เมนูปิดแล้ว)
       *     ปล่อยให้เบราว์เซอร์ล้างช่องตามปกติ — ยังใช้ทางลัดเดิมได้อยู่
       *
       *   (เจอตอนทดสอบ ไม่ใช่ตอนอ่านโค้ด — เทสต์กด Escape แล้วคำหายไปเฉย ๆ)
       */
      if (open) {
        event.preventDefault()
        setOpen(false)
      }
      setActive(-1)
      return
    }
    if (!open || suggestions.length === 0) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((i) => (i + 1) % suggestions.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1))
    }
  }

  return (
    <header className="app-header sticky top-0 z-50 h-header">
      {/**
       * ★ เขียนไว้ตรงนี้เพื่อให้ state ของการค้นหาทั้งหมดอยู่ที่เดียวกัน
       *   (ช่องค้นหา · ประวัติ · dropdown · เสียง) แต่ตัวมันเอง portal ออกไป
       *   แขวนใต้ body — ไม่งั้นโดน z-30 ของ header ขังไว้ แล้วกล่องเพลง
       *   มุมล่างจะทับหน้าต่างทั้งอัน (ดูเหตุผลเต็มใน VoiceSearchDialog)
       */}
      {voiceOpen ? (
        <VoiceSearchDialog
          state={voice.state}
          transcript={voice.transcript}
          onClose={closeVoice}
          onRetry={voice.start}
        />
      ) : null}
      <div className="flex h-header items-center gap-2 px-2 sm:gap-4 sm:px-4">
        {/* ── ซ้าย: โลโก้ (หรือปุ่มย้อนกลับตอนค้นหาบนมือถือ) ──── */}
        {mobileSearch ? (
          <IconButton
            label={t('header.closeSearch')}
            onClick={() => setMobileSearch(false)}
            className="sm:hidden"
          >
            <svg viewBox="0 0 24 24" className="size-6" fill="currentColor" aria-hidden="true">
              <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
            </svg>
          </IconButton>
        ) : exitLabel ? (
          /**
            * ★★ ลูกศร + คำว่า "ออกจากห้อง" รวมอยู่ในลิงก์เดียวกับโลโก้
            *
            *    เคยคิดจะทำเป็นปุ่มแยกวางข้างโลโก้ ★ แต่บนมือถือแถบบนสูง 56px
            *      มีของอยู่แล้ว 4 อย่าง การเพิ่มปุ่มที่ 5 ทำให้ที่ 320px ล้น
            *
            *    ★ รวมเป็นอันเดียวจึงได้ทั้งสองอย่าง: ลูกศรทำให้เห็นว่ากดได้
            *      และไม่กินที่เพิ่มเลยนอกจากตัวลูกศรเอง
            */
          <Link
            href="/"
            aria-label={exitLabel}
            title={exitLabel}
            className={cn(
              /* ★ h-10 ไม่ใช่ py-1 — บนมือถือที่เหลือแค่ลูกศรกับตรามาร์ค
                    เป้ากดจะสูงแค่ 34px ซึ่งเตี้ยกว่านิ้วคน ปุ่มอื่นในแถบนี้สูง 40px กันหมด */
              'group -ms-1 flex h-10 shrink-0 items-center gap-1 rounded-full pe-2 ps-1',
              'transition-colors hover:bg-surface',
            )}
          >
            {/* ★ rtl:-scale-x-100 — ในภาษาอาหรับ "ย้อนกลับ" คือลูกศรชี้ขวา */}
            <svg
              viewBox="0 0 24 24"
              className="size-5 shrink-0 text-ink-soft rtl:-scale-x-100"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
            </svg>
            {/**
              * ★★★ ในห้องบนมือถือ เหลือแค่ตรามาร์ค ไม่เอาคำว่า "FrameRoom"
              *
              *     วัดแล้วแถบบนของหน้าห้องที่ 390px กว้าง 409px — ★ ล้นอยู่แล้ว
              *       ตั้งแต่ก่อนเพิ่มลูกศรนี้ (วัดจากตัวที่ขึ้นโปรดักชันอยู่)
              *       ใส่ลูกศรเข้าไปเลยกลายเป็น 441px
              *
              *     ★★ ตัวหนังสือ "FrameRoom" กิน 115px ซึ่งมากที่สุดในแถบ
              *        และเป็นของที่ "รู้อยู่แล้ว" — คนที่อยู่ในห้องไม่ต้องการ
              *        ให้ใครบอกว่าเว็บนี้ชื่ออะไร เขาต้องการทางออก
              *
              *     ★ ตัดทิ้งแล้วเหลือ 326px — พอดีแม้บนจอ 320px
              */}
            <Logo compact />
            {/**
              * ★ คำอธิบายโผล่เฉพาะจอกว้าง — ลูกศรอย่างเดียวคนเข้าใจอยู่แล้ว
              *   ★★ แต่ "ออกจากห้อง" บอกชัดกว่าว่าออกไปแล้วเจออะไร
              *      ซึ่งคือสิ่งที่ผู้ใช้ถามหา: ที่ที่ไว้เลือกห้องใหม่
              */}
            <span className="ms-1 hidden whitespace-nowrap border-s border-line ps-2.5 text-[13px] text-ink-soft xl:block">
              {exitLabel}
            </span>
          </Link>
        ) : (
          <Link href="/" className="flex min-h-11 min-w-11 shrink-0 items-center" aria-label={t('common.backHome')}>
            {/* ★ จอแคบกว่า 400px ซ่อนตัวอักษร เหลือไอคอน — ไม่งั้นรูปโปรไฟล์ขวาสุดถูกตัด
                 (ชุดเดียวกับแถบบนของ /office) */}
            <Logo wordmarkFrom="400" />
          </Link>
        )}

        {/* ── กลาง: ช่องค้นหา ─────────────────────────────────── */}
        <div className="flex flex-1 justify-center">
          {center ?? (
            onSearch ? (
              <form
                ref={formRef}
                onSubmit={handleSubmit}
                className={cn(
                  'relative w-full max-w-[640px] items-center',
                  /**
                   * ★★ มือถือ: ซ่อนช่องค้นหาไว้ก่อน แล้วกางเต็มแถบเมื่อกดแว่นขยาย
                   *
                   *   ที่ 320px แถบบนต้องใส่ โลโก้ + ช่องค้นหา + จำนวนคน + อวาตาร์
                   *   ให้ได้ใน 56px สูง — ช่องค้นหาถูกบีบจนเหลือความกว้างเกือบศูนย์
                   *   จนกดไม่ติด (Playwright รายงานว่า "element is not visible")
                   *
                   *   YouTube แก้ด้วยวิธีเดียวกันนี้: บนมือถือแถบบนมีแค่ไอคอนแว่นขยาย
                   *   กดแล้วช่องค้นหาถึงกางเต็มแถบทับทุกอย่าง
                   */
                  mobileSearch ? 'flex' : 'hidden sm:flex',
                )}
                role="search"
              >
                <div
                  className={cn(
                    'flex h-10 flex-1 items-center rounded-s-full border bg-input ps-4',
                    /**
                     * ★ เว้นขอบขวาให้ปุ่ม × ของเบราว์เซอร์หายใจ
                     *
                     *   ปุ่มล้างช่องเป็นของ `<input type="search">` เอง
                     *   (::-webkit-search-cancel-button) เราย้ายมันตรง ๆ ไม่ได้
                     *   แต่มันเกาะขอบขวาของ input เสมอ — ดัน input ให้สั้นลง
                     *   ปุ่มก็ขยับตามมาเอง ไม่ต้องไปยุ่งกับ pseudo-element
                     *
                     *   เดิมไม่มี padding ขวาเลย × เลยไปชนเส้นคั่นปุ่มแว่นขยาย
                     */
                    'pe-3',
                    // YouTube ขยับ padding ซ้ายตอนโฟกัสเพื่อให้ที่กับไอคอนแว่นขยาย
                    focused ? 'border-link ps-3' : 'border-line',
                  )}
                >
                  {focused ? (
                    <SearchIcon className="me-2 size-5 shrink-0 text-ink-soft" />
                  ) : null}
                  <input
                    ref={inputRef}
                    value={searchValue ?? ''}
                    onChange={(e) => {
                      onSearchChange?.(e.target.value)
                      setOpen(true)
                    }}
                    onFocus={() => {
                      setFocused(true)
                      setOpen(true)
                    }}
                    /**
                     * ★ ต้องมี onClick ด้วย ไม่ใช่แค่ onFocus
                     *
                     *   กด Escape ปิดเมนูแล้วคลิกช่องเดิมซ้ำ — ช่องยังโฟกัสอยู่
                     *   onFocus จึงไม่ยิงอีก เมนูเลยไม่กลับมาจนกว่าจะพิมพ์ต่อ
                     *   หรือคลิกที่อื่นแล้วคลิกกลับมา ซึ่งรู้สึกเหมือนเว็บค้าง
                     */
                    onClick={() => setOpen(true)}
                    onBlur={() => setFocused(false)}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    aria-label={t('header.searchYouTube')}
                    type="search"
                    enterKeyHint="search"
                    autoComplete="off"
                    maxLength={100}
                    role="combobox"
                    aria-expanded={open && suggestions.length > 0}
                    aria-controls="search-suggestions"
                    aria-autocomplete="list"
                    aria-activedescendant={active >= 0 ? `suggestion-${active}` : undefined}
                    className={cn(
                      'w-full bg-transparent outline-none',
                      'placeholder:text-ink-faint',
                      // >= 16px กัน iOS ซูมเองตอนโฟกัส
                      'text-[16px] sm:text-[15px]',
                    )}
                  />
                </div>

                {open && suggestions.length > 0 ? (
                  <ul
                    id="search-suggestions"
                    role="listbox"
                    aria-label={t('header.suggestions')}
                    className={cn(
                      /**
                       * ★ การ์ดลอย เต็มความกว้างของแคปซูล ไม่ใช่กล่องที่พยายาม
                       *   "ต่อ" กับช่องค้นหา
                       *
                       *   เวอร์ชันแรกทำมุมบนตัดตรงแล้วเชื่อมกับช่องค้นหา
                       *   แต่ช่องค้นหามีขอบสีฟ้าตอนโฟกัส ส่วนเมนูขอบสีเทา
                       *   รอยต่อจึงเห็นเป็นเส้นสะดุดตา ดูเหมือนวางผิดตำแหน่ง
                       *
                       *   แยกเป็นการ์ดลอยที่มีระยะห่างชัดเจนดูตั้งใจกว่ามาก
                       *   และไม่ต้องไปสู้กับสีขอบที่เปลี่ยนตามสถานะโฟกัส
                       */
                      'absolute inset-x-0 top-[calc(100%+8px)] z-50',
                      'max-h-[min(70vh,480px)] overflow-y-auto overscroll-contain',
                      'rounded-xl border border-line bg-elevated py-2',
                      'shadow-[0_4px_32px_rgba(0,0,0,0.5)]',
                    )}
                  >
                    {suggestions.map((item, index) => (
                      <li
                        key={`${item.fromHistory ? 'h' : 'r'}:${item.text}`}
                        // ★ ทั้งแถวเป็น li ที่มีสองปุ่มซ้อนกันอยู่ (เลือก + ลบ)
                        //   ปุ่มลบซ้อนใน <button> ไม่ได้ — HTML ไม่อนุญาต
                        //   จึงวาง <button> เลือกให้กินพื้นที่แล้ววางปุ่มลบเป็นพี่น้อง
                        className={cn(
                          'relative flex items-center',
                          index === active ? 'bg-surface' : 'hover:bg-surface/60',
                        )}
                        onMouseEnter={() => setActive(index)}
                      >
                        <button
                          type="button"
                          id={`suggestion-${index}`}
                          role="option"
                          aria-selected={index === active}
                          // ★ mousedown ไม่ใช่ click — input จะ blur ก่อน click เสมอ
                          //   ถ้ารอ click เมนูอาจถูกปิดไปก่อนแล้ว
                          onMouseDown={(e) => {
                            e.preventDefault()
                            submit(item.text)
                          }}
                          className="flex min-w-0 flex-1 items-center gap-3.5 py-1.5 ps-4 text-start"
                        >
                          {item.fromHistory ? (
                            <ClockIcon className="size-4.5 shrink-0 text-ink-faint" />
                          ) : (
                            <SearchIcon className="size-4.5 shrink-0 text-ink-faint" />
                          )}
                          <span dir="auto" className="min-w-0 flex-1 truncate text-[15px] leading-6">
                            <Highlight text={item.text} query={searchValue ?? ''} />
                          </span>

                          {/**
                           * ★ รูปประกอบท้ายแถว 44×26 (สัดส่วน 16:9 ย่อส่วน)
                           *   ใช้ <img> ธรรมดา ไม่ใช่ next/image เพราะรูปมาจาก
                           *   โดเมนของ YouTube ที่เปลี่ยนไปเรื่อย ๆ และเป็นรูป
                           *   เล็กมากจนการ optimize ไม่คุ้มกับ round trip ที่เพิ่ม
                           */}
                          {item.thumbnailUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={item.thumbnailUrl}
                              alt=""
                              aria-hidden="true"
                              loading="lazy"
                              className="ms-2 h-6.5 w-11 shrink-0 rounded-sm object-cover"
                            />
                          ) : null}
                        </button>

                        {/* ★ ลบประวัติทีละรายการ — มีเฉพาะแถวที่มาจากประวัติ */}
                        {item.fromHistory ? (
                          <button
                            type="button"
                            onMouseDown={(e) => {
                              // กัน mousedown ทะลุไปสั่งค้นหา และกัน input เสียโฟกัส
                              e.preventDefault()
                              e.stopPropagation()
                              forget(item.text)
                            }}
                            aria-label={t('header.removeHistoryOf', { text: item.text })}
                            title={t('header.removeHistory')}
                            className={cn(
                              'me-2 grid size-8 shrink-0 place-items-center rounded-full',
                              'text-ink-soft transition-colors hover:bg-surface-hover hover:text-ink',
                            )}
                          >
                            <svg
                              viewBox="0 0 24 24"
                              className="size-4"
                              fill="currentColor"
                              aria-hidden="true"
                            >
                              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z" />
                            </svg>
                          </button>
                        ) : (
                          // เว้นที่เท่ากันให้แถวที่ไม่มีปุ่มลบ ข้อความจะได้ไม่เหลื่อมกัน
                          <span className="me-2 size-8 shrink-0" aria-hidden="true" />
                        )}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <button
                  type="submit"
                  aria-label={t('header.search')}
                  className={cn(
                    'grid h-10 w-16 shrink-0 place-items-center',
                    'rounded-e-full border border-s-0 border-line bg-control',
                    'transition-colors hover:bg-control-hover',
                  )}
                >
                  <SearchIcon className="size-5" />
                </button>

                {/**
                 * ★★ ปุ่มไมค์เป็นวงกลมแยก ไม่ใช่ไอคอนในช่องค้นหา
                 *
                 *   YouTube วางแบบนี้และมีเหตุผล: การพูดกับการพิมพ์เป็นคนละ
                 *   การกระทำที่ไม่เกี่ยวกัน — ถ้าเอาไมค์ไปอยู่ในช่องเดียวกัน
                 *   ผู้ใช้จะเผลอกดโดนตอนจะกดล้างข้อความหรือกดค้นหา
                 *
                 *   ★ ซ่อนไปเลยถ้าเบราว์เซอร์ไม่รองรับ (Firefox) —
                 *     ปุ่มที่กดแล้วไม่เกิดอะไรแย่กว่าไม่มีปุ่ม
                 */}
                {voice.supported ? (
                  <button
                    type="button"
                    onClick={openVoice}
                    aria-label={t('header.voiceSearch')}
                    aria-haspopup="dialog"
                    aria-expanded={voiceOpen}
                    title={t('header.voiceSearch')}
                    className={cn(
                      'ms-2 grid size-10 shrink-0 place-items-center rounded-full',
                      'bg-surface text-ink transition-colors hover:bg-surface-hover',
                    )}
                  >
                    {/**
                     * ★ ไม่มีสถานะ "กำลังฟัง" บนปุ่มนี้แล้ว
                     *   ตอนฟังอยู่ หน้าต่างเต็มจอบังปุ่มนี้ทั้งอัน การทาสีมันไว้
                     *   จึงเป็นงานที่ไม่มีใครเห็น — ย้ายไปอยู่ในหน้าต่างหมดแล้ว
                     */}
                    <MicIcon className="size-5" />
                  </button>
                ) : null}
              </form>
            ) : null
          )}
        </div>

        {/* ── ขวา ─────────────────────────────────────────────── */}
        {/* ★ ตอนกางช่องค้นหาบนมือถือ ต้องซ่อนของฝั่งขวาทั้งหมด
              ไม่งั้นช่องค้นหาจะถูกบีบเหมือนเดิม — ได้พื้นที่คืนไม่ถึงครึ่ง */}
        {!mobileSearch ? (
          <div className="flex shrink-0 items-center gap-1">
            {/*
              ★ ชื่อต้องไม่ซ้ำกับปุ่ม submit ในฟอร์ม (ซึ่งชื่อ "ค้นหา")
                ไม่งั้นผู้ใช้ screen reader จะเจอสองปุ่มชื่อเดียวกันที่ทำคนละอย่าง
                — อันนี้ "เปิดช่อง" อันนั้น "ส่งคำค้น"
            */}
            {onSearch ? (
              <IconButton
                label={t('header.openSearch')}
                onClick={() => setMobileSearch(true)}
                className="sm:hidden"
              >
                <SearchIcon className="size-6" />
              </IconButton>
            ) : null}
            {actions ?? (
              <>
                <LanguageToggle />
                <ThemeToggle />
                {right}
              </>
            )}
          </div>
        ) : null}
      </div>
    </header>
  )
}

/**
 * ★ ตัวหนาเฉพาะ "ส่วนที่ยังไม่ได้พิมพ์" — กลับด้านกับที่คนส่วนใหญ่ทำ
 *
 *   YouTube ทำแบบนี้และมีเหตุผล: ส่วนที่ผู้ใช้พิมพ์เองเขารู้อยู่แล้ว
 *   สิ่งที่เขากำลังสแกนหาด้วยตาคือ "แล้วมันต่อว่าอะไร"
 *   การเน้นส่วนที่พิมพ์ไปแล้วจึงเน้นผิดจุด
 */
function Highlight({ text, query }: { text: string; query: string }) {
  const needle = query.trim().toLowerCase()
  if (!needle) return <span className="font-medium">{text}</span>

  const at = text.toLowerCase().indexOf(needle)
  if (at === -1) return <span className="font-medium">{text}</span>

  return (
    <>
      {text.slice(0, at) ? <span className="font-medium">{text.slice(0, at)}</span> : null}
      <span className="font-normal text-ink-soft">{text.slice(at, at + needle.length)}</span>
      <span className="font-medium">{text.slice(at + needle.length)}</span>
    </>
  )
}

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 16a7 7 0 1 1 0-14 7 7 0 0 1 0 14zm.5-11H11v5.25l4.5 2.67.75-1.23-3.75-2.22V8z" />
    </svg>
  )
}

function MicIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z" />
      <path d="M17.9 11a5.9 5.9 0 0 1-11.8 0H4.5a7.5 7.5 0 0 0 6.7 7.44V22h1.6v-3.56A7.5 7.5 0 0 0 19.5 11h-1.6z" />
    </svg>
  )
}

export function SearchIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M20.87 20.17l-5.59-5.59C16.35 13.35 17 11.75 17 10c0-3.87-3.13-7-7-7s-7 3.13-7 7 3.13 7 7 7c1.75 0 3.35-.65 4.58-1.71l5.59 5.59.7-.71zM10 16c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6z" />
    </svg>
  )
}

/**
 * อวาตาร์กลมแบบ YouTube
 *
 * ★ ไม่มีรูป → ตัวอักษรบนพื้นสีที่คำนวณจาก id
 *   สีจึงคงที่ทุกเครื่องโดยไม่ต้องเก็บลง DB และคนเดิมได้สีเดิมเสมอ
 *   ซึ่งทำให้จำหน้ากันได้ในรายชื่อแม้ยังไม่มีใครใส่รูป
 *
 * ★★ ใช้ <img> ธรรมดา ไม่ใช่ next/image
 *
 *    อวาตาร์มาจาก Supabase Storage ซึ่งเป็นโดเมนภายนอก การให้ next/image
 *    ดูแลแปลว่าต้องประกาศ remotePatterns แล้วทุกรูปจะวิ่งผ่าน optimizer
 *    ของ Vercel — ซึ่งคิดเงินตามจำนวนรูปต้นทาง
 *
 *    ★ อวาตาร์ถูกย่อเหลือ 256px ตั้งแต่ก่อนอัปแล้ว (lib/image/shrink.ts)
 *      ไม่มีอะไรให้ optimizer ทำต่อ นอกจากคิดเงิน
 */
/**
 * สีประจำตัวของคน — องศาสีเดียวกับที่อวาตาร์ใช้
 *
 * ★ แยกออกมาเป็นฟังก์ชันเพราะมีที่อื่นอยากได้สีเดียวกันนี้ด้วย
 *   (ปกกล่องโปรไฟล์ย้อมตามสีของเจ้าของ) ★★ ถ้าต่างคนต่างคำนวณ
 *     วันที่ใครแก้สูตรข้างใน สองที่จะเพี้ยนออกจากกันเงียบ ๆ
 */
export function avatarHue(userId: string): number {
  let hash = 0
  for (let i = 0; i < userId.length; i += 1) hash = (hash * 31 + userId.charCodeAt(i)) % 360
  return hash
}

export function Avatar({
  userId,
  name,
  avatarUrl = null,
  size = 32,
}: {
  userId: string
  name: string
  avatarUrl?: string | null
  size?: number
}) {
  const hash = avatarHue(userId)

  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
        title={name}
      />
    )
  }

  return (
    <span
      className="grid shrink-0 place-items-center rounded-full font-medium text-white"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        backgroundColor: `hsl(${hash} 55% 42%)`,
      }}
      title={name}
    >
      <span dir="auto">{name.trim().charAt(0).toUpperCase() || '?'}</span>
    </span>
  )
}

export { IconButton }
