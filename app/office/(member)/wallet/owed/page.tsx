import type { Metadata } from 'next'
import { getOt } from '@/lib/i18n/office-server'
import { WalletOwed } from '@/components/office/WalletOwed'
import { FunGuide } from '@/components/office/FunGuide'

/* ★ ชื่อแท็บก็ต้องตามภาษา — generateMetadata อ่าน cookie ได้เหมือน component */
export async function generateMetadata(): Promise<Metadata> {
  const { ot } = await getOt()
  return { title: ot('nav.wallet.owed') }
}

export default function WalletOwedPage() {
  return (
    <>
      <FunGuide id="walletOwed" art="owed" />
      <div className="mt-6">
        <WalletOwed />
      </div>
    </>
  )
}
