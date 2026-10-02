import type { Metadata, Viewport } from 'next'
import { Noto_Sans_Thai, Roboto, Roboto_Mono } from 'next/font/google'
import './globals.css'
import { InlineScript } from '@/components/InlineScript'
import { THEME_BOOT_SCRIPT } from '@/lib/theme'
import { REVEAL_BOOT_SCRIPT } from '@/lib/reveal'
import { ScrollReveal } from '@/components/ScrollReveal'
import { I18nProvider } from '@/lib/i18n/client'
import { getLocale, getT } from '@/lib/i18n/server'
import { isRtl } from '@/lib/i18n/config'
import { clientDict } from '@/lib/i18n/dict'

/**
 * ★ Roboto คือฟอนต์ของ YouTube
 *   น้ำหนักที่ YouTube ใช้จริง: 400 ข้อความทั่วไป · 500 ชื่อวิดีโอ/ปุ่ม · 700 หัวข้อ
 */
const roboto = Roboto({
  variable: '--font-roboto',
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  display: 'swap',
})

/**
 * ★ Roboto ไม่มีตัวอักษรไทย
 *   YouTube ภาษาไทยจึงปล่อยให้เบราว์เซอร์ fallback ไปฟอนต์ระบบ
 *   ซึ่งหน้าตาต่างกันไปทุกเครื่อง — เราใส่ Noto Sans Thai กำกับไว้เอง
 *   ได้ความสม่ำเสมอและน้ำหนักตัวอักษรที่เข้ากับ Roboto พอดี
 */
const notoThai = Noto_Sans_Thai({
  variable: '--font-noto-thai',
  subsets: ['thai'],
  weight: ['400', '500', '700'],
  display: 'swap',
})

const robotoMono = Roboto_Mono({
  variable: '--font-roboto-mono',
  subsets: ['latin'],
  display: 'swap',
})

/* ★ คำอธิบายเว็บต้องตามภาษาด้วย — มันคือข้อความที่โผล่ตอนแชร์ลิงก์ */
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT()
  return {
    title: { default: 'AWA ROOM', template: '%s · AWA ROOM' },
    description: t('meta.description'),
    applicationName: 'AWA ROOM',
    robots: { index: false, follow: false },
  }
}

export const viewport: Viewport = {
  /*
   * ★ สองค่า — แถบบนของเบราว์เซอร์บนมือถือจะได้เปลี่ยนตามโทนด้วย
   *   ถ้าปล่อยค่าเดียวเป็นสีดำ คนที่ใช้โทนสว่างจะเห็นแถบดำคาดอยู่เหนือหน้าขาว
   */
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0f0f0f' },
  ],
  initialScale: 1,
  width: 'device-width',
  maximumScale: 5,
}

export default async function RootLayout({ children }: LayoutProps<'/'>) {
  /*
   * ★★ อ่านภาษาตรงนี้ที่เดียว แล้วส่งลงไปทั้งต้นไม้
   *    ทุกหน้าอยู่ใต้ layout นี้ ★ จึงไม่มีหน้าไหนที่ลืมใส่ provider ได้เลย
   *    และ lang ของ <html> ก็ถูกต้องตั้งแต่ไบต์แรกด้วยค่าเดียวกัน —
   *    ซึ่งเป็นสิ่งที่โปรแกรมอ่านหน้าจอกับการตัดคำของเบราว์เซอร์ใช้จริง
   */
  const locale = await getLocale()

  return (
    <html
      lang={locale}
      /*
       * ★★ dir ต้องมากับ HTML ตั้งแต่ไบต์แรก เหมือน lang
       *    ถ้าใส่ทีหลังด้วย JS หน้าจะกระพริบจากซ้าย-ขวาเป็นขวา-ซ้ายต่อหน้าคนอ่าน
       *    และ React จะเห็นว่ามี attribute งอกใหม่ที่มันไม่ได้สร้าง
       */
      dir={isRtl(locale) ? 'rtl' : 'ltr'}
      /**
       * ★★ ต้องมี data-theme ติดมากับ HTML ที่ server ส่ง ห้ามปล่อยว่าง
       *
       *    นี่คือจุดที่พลาดตอนแรกจนหน้าแรกพังทั้งหน้า: ถ้า server ไม่ใส่
       *    attribute นี้เลย แล้วสคริปต์ไปเพิ่มมันก่อน hydrate React จะเห็น
       *    ว่า "มีของที่ฉันไม่ได้สร้าง" แล้วตัดสินใจทิ้งต้นไม้ทั้งหน้าไปวาดใหม่
       *
       *    ★ ผลที่เกิดจริง (จับได้ตอนรันในเครื่อง): portal ของกล่องตั้งโปรไฟล์
       *      ถูกสร้างสองรอบ อันแรกค้างอยู่ใน body เพราะอยู่นอก root ที่ React
       *      เก็บกวาด ผู้ใช้จึงเห็นกล่องซ้อนกันและปิดไม่หาย
       *
       *    มีค่าเริ่มต้นแล้ว งานของสคริปต์เหลือแค่ "แก้ค่า" ไม่ใช่ "เพิ่มของใหม่"
       *    ซึ่ง suppressHydrationWarning ครอบให้ได้ตรง ๆ
       */
      data-theme="dark"
      /* ★ ค่าเริ่มต้น 'css' — สคริปต์ใน head แก้เป็น 'js'/'off' ตามเบราว์เซอร์จริง
           มีค่าติดมากับ HTML ตั้งแต่แรก React จึงไม่เห็นว่ามี attribute งอกใหม่
           (บทเรียนเดียวกับ data-theme ที่เคยทำหน้าแรกพังทั้งหน้า) */
      data-reveal="css"
      suppressHydrationWarning
      className={`${roboto.variable} ${notoThai.variable} ${robotoMono.variable} h-full antialiased`}
    >
      <head>
        {/*
          ★ อยู่ใน <head> ตามคู่มือของ Next เวอร์ชันนี้
            เบราว์เซอร์รันทันทีที่แปลถึงบรรทัดนี้ = ก่อนวาดอะไรสักพิกเซล
            จึงไม่มีเฟรมสีผิดให้เห็นแม้บนเน็ตช้า

            เนื้อสคริปต์เป็นค่าคงที่ของเราเอง ไม่มีอะไรจากผู้ใช้ปนเข้ามา
        */}
        <InlineScript html={THEME_BOOT_SCRIPT} />
        {/*
          ★ ตัดสินโหมดอนิเมชันก่อนวาดเฟรมแรก ด้วยเหตุผลเดียวกับสคริปต์โทนสี
            โหมด JS ต้องซ่อนของก่อนแล้วค่อยเผย ถ้าติดธงช้ากว่าเฟรมแรก
            คนจะเห็นเนื้อหาโผล่เต็มแล้วกระพริบหายไปซ่อน
        */}
        <InlineScript html={REVEAL_BOOT_SCRIPT} />
      </head>
      <body className="min-h-full bg-page text-ink">
        {/**
         * ★ ชั้นเกรนคลุมทั้งเว็บ — เหตุผลเต็มอยู่ใน globals.css
         *   โดยย่อ: ไล่สีขนาดใหญ่ที่เรียบสนิทเกิด banding บนจอ 8-bit
         *   เม็ดเกรนละเอียดทำลายขอบของชั้นสีพวกนั้นทิ้ง
         *
         *   pointer-events: none จึงไม่ขวางการกดอะไรเลยสักจุด
         */}
        <div className="grain-layer" aria-hidden="true" />
        <ScrollReveal />
        <I18nProvider locale={locale} dict={clientDict(locale)}>
          {children}
        </I18nProvider>
      </body>
    </html>
  )
}
