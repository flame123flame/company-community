import type { Metadata } from 'next'
import { getOt } from '@/lib/i18n/office-server'
import { QuizRoom } from '@/components/office/QuizRoom'

export async function generateMetadata(): Promise<Metadata> {
  const { ot } = await getOt()
  return { title: ot('game.quiz.title') }
}

export default async function QuizRoomPage({ params }: PageProps<'/office/fun/quiz/[id]'>) {
  const { id } = await params
  return <QuizRoom roomId={id} />
}
