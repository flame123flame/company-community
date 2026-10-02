import { redirect, notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getOt } from '@/lib/i18n/office-server'
import { getSupabaseAdminClient } from '@/lib/supabase/admin'
import { getOfficeViewer } from '@/lib/office/session'
import { WalletPay } from '@/components/office/WalletPay'

/* ★ ชื่อแท็บก็ต้องตามภาษา — generateMetadata อ่าน cookie ได้เหมือน component */
export async function generateMetadata(): Promise<Metadata> {
  const { ot } = await getOt()
  return { title: ot('title.pay') }
}

/**
 * ★ โหลดรายการฝั่ง server แล้วตรวจสิทธิ์ที่นี่ด้วย
 *   API ตรวจซ้ำอยู่แล้ว แต่การตรวจที่นี่ทำให้คนที่ไม่เกี่ยวข้องเห็น 404
 *   แทนที่จะเห็นหน้าเปล่าที่ทุกคำขอข้างในตอบ 403
 */
export default async function WalletPayPage(props: PageProps<'/office/wallet/pay/[id]'>) {
  const viewer = await getOfficeViewer()
  if (!viewer) redirect('/')

  const { id } = await props.params

  const admin = getSupabaseAdminClient()
  const { data } = await admin
    .from('debts')
    .select('id, amount, description, creditor_id, debtor_id')
    .eq('id', id)
    .maybeSingle()

  if (!data) notFound()
  if (data.creditor_id !== viewer.id && data.debtor_id !== viewer.id) notFound()

  return (
    <WalletPay
      debtId={data.id}
      amount={data.amount}
      description={data.description}
      isDebtor={data.debtor_id === viewer.id}
    />
  )
}
