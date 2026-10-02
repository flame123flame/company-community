import type { Metadata } from 'next'
import { getOt } from '@/lib/i18n/office-server'
import { TypingPractice } from '@/components/office/TypingPractice'

export async function generateMetadata(): Promise<Metadata> {
  const { ot } = await getOt()
  return { title: ot('game.typing.title') }
}

export default function TypingPage() {
  return <TypingPractice />
}
