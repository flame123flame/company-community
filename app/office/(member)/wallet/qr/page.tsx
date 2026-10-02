import type { Metadata } from 'next'
import { getOt } from '@/lib/i18n/office-server'
import { WalletQr } from '@/components/office/WalletQr'

/* ★ ชื่อแท็บก็ต้องตามภาษา — generateMetadata อ่าน cookie ได้เหมือน component */
export async function generateMetadata(): Promise<Metadata> {
  const { ot } = await getOt()
  return { title: ot('top.qr') }
}

export default function WalletQrPage() {
  return <WalletQr />
}
