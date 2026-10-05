import type { Metadata } from 'next'
import { getOt } from '@/lib/i18n/office-server'
import { MakrukGame } from '@/components/office/MakrukGame'

export async function generateMetadata(): Promise<Metadata> {
  const { ot } = await getOt()
  return { title: ot('game.mk.title') }
}

export default function MakrukPage() {
  return <MakrukGame />
}
