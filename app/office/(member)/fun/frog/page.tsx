import type { Metadata } from 'next'
import { getOt } from '@/lib/i18n/office-server'
import { FrogGame } from '@/components/office/FrogGame'

export async function generateMetadata(): Promise<Metadata> {
  const { ot } = await getOt()
  return { title: ot('game.fg.title') }
}

export default function FrogPage() {
  return <FrogGame />
}
