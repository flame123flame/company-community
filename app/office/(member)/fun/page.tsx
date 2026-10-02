import type { Metadata } from 'next'
import { getOt } from '@/lib/i18n/office-server'
import { GameMenu } from '@/components/office/GameMenu'

export async function generateMetadata(): Promise<Metadata> {
  const { ot } = await getOt()
  return { title: ot('nav.fun') }
}

export default function FunHubPage() {
  return <GameMenu />
}
