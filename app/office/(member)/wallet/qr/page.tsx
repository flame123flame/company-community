import type { Metadata } from 'next'
import { getOt } from '@/lib/i18n/office-server'
import { getOfficeViewer } from '@/lib/office/session'
import { WalletQr } from '@/components/office/WalletQr'
import { FunGuide } from '@/components/office/FunGuide'

/* ★ ชื่อแท็บก็ต้องตามภาษา — generateMetadata อ่าน cookie ได้เหมือน component */
export async function generateMetadata(): Promise<Metadata> {
  const { ot } = await getOt()
  return { title: ot('top.qr') }
}

export default async function WalletQrPage() {
  /* ★ ชื่อและรูปของเจ้าของ QR — โชว์บนบัตรรับเงิน ให้คนจ่ายมั่นใจว่าจ่ายถูกคน */
  const viewer = await getOfficeViewer()
  return (
    <>
      <FunGuide id="walletQr" art="qr" />
      <div className="mt-6">
        <WalletQr
          me={{
            name: viewer ? viewer.nickname || viewer.displayName : '',
            avatarUrl: viewer?.avatarUrl ?? null,
          }}
        />
      </div>
    </>
  )
}
