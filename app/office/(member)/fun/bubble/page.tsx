import type { Metadata } from 'next'
import { getOt } from '@/lib/i18n/office-server'
import { BubbleGame } from '@/components/office/BubbleGame'

export async function generateMetadata(): Promise<Metadata> {
  const { ot } = await getOt()
  return { title: ot('game.bb.title') }
}

export default function BubblePage() {
  return <BubbleGame />
}
