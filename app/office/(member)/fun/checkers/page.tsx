import type { Metadata } from 'next'
import { getOt } from '@/lib/i18n/office-server'
import { CheckersGame } from '@/components/office/CheckersGame'

export async function generateMetadata(): Promise<Metadata> {
  const { ot } = await getOt()
  return { title: ot('game.checkers.title') }
}

export default function CheckersPage() {
  return <CheckersGame />
}
