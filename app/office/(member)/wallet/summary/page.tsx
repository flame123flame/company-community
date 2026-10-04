import type { Metadata } from 'next'
import { getOt } from '@/lib/i18n/office-server'
import { WalletSummary } from '@/components/office/WalletSummary'
import { FunGuide } from '@/components/office/FunGuide'

/* ★ ชื่อแท็บก็ต้องตามภาษา — generateMetadata อ่าน cookie ได้เหมือน component */
export async function generateMetadata(): Promise<Metadata> {
  const { ot } = await getOt()
  return { title: ot('nav.wallet.summary') }
}

export default function WalletSummaryPage() {
  return (
    <>
      <FunGuide id="walletSummary" art="chart" />
      <div className="mt-6">
        <WalletSummary />
      </div>
    </>
  )
}
