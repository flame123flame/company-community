import type { Metadata } from 'next'
import { getOt } from '@/lib/i18n/office-server'
import { QuizHub } from '@/components/office/QuizHub'

export async function generateMetadata(): Promise<Metadata> {
  const { ot } = await getOt()
  return { title: ot('game.quiz.title') }
}

export default function QuizPage() {
  return <QuizHub />
}
