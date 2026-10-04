import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getOt } from '@/lib/i18n/office-server'
import { WalletCreate } from '@/components/office/WalletCreate'
import { FunGuide } from '@/components/office/FunGuide'
import { getOfficeViewer } from '@/lib/office/session'

/* ★ ชื่อแท็บก็ต้องตามภาษา — generateMetadata อ่าน cookie ได้เหมือน component */
export async function generateMetadata(): Promise<Metadata> {
  const { ot } = await getOt()
  return { title: ot('nav.wallet.create') }
}

export default async function WalletCreatePage() {
  const viewer = await getOfficeViewer()
  if (!viewer) redirect('/')

  return (
    <>
      <FunGuide id="walletCreate" art="bill" />
      <div className="mt-6">
        <WalletCreate />
      </div>
    </>
  )
}
