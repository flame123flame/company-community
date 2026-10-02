import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { getOt } from '@/lib/i18n/office-server'
import { FoodDetail } from '@/components/office/FoodDetail'
import { getOfficeViewer } from '@/lib/office/session'

export async function generateMetadata(): Promise<Metadata> {
  const { ot } = await getOt()
  return { title: ot('nav.food.picks') }
}

export default async function FoodDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await getOfficeViewer()
  if (!viewer) redirect('/')
  const { id } = await params
  return <FoodDetail id={id} />
}
