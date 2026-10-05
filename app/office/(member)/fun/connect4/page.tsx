import type { Metadata } from 'next'
import { getOt } from '@/lib/i18n/office-server'
import { Connect4Game } from '@/components/office/Connect4Game'

export async function generateMetadata(): Promise<Metadata> {
  const { ot } = await getOt()
  return { title: ot('game.c4.title') }
}

export default function Connect4Page() {
  return <Connect4Game />
}
