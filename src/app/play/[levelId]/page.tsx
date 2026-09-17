import { cookies } from 'next/headers'
import { redirect, notFound } from 'next/navigation'
import { readSessionFromCookieValue, COOKIE_NAME } from '@/lib/auth/session'
import { createSupabaseServerClient } from '@/lib/supabase/client'
import { getProgressForKid } from '@/lib/db/progress'
import { getVocabItemsForLevel } from '@/lib/db/content'
import { computeLevelStatus } from '@/lib/game/level-status'
import { LEVELS } from '../../../../content/vocab'
import { ListenTapGame } from './listen-tap-game'
import { GuestListenTapGame } from './guest-listen-tap-game'

export default async function LevelPage({ params }: { params: Promise<{ levelId: string }> }) {
  const { levelId: levelIdParam } = await params
  const levelId = Number(levelIdParam)

  const level = LEVELS.find((candidate) => candidate.id === levelId)
  if (!level) {
    notFound()
  }

  const cookieStore = await cookies()
  const session = await readSessionFromCookieValue(cookieStore.get(COOKIE_NAME)?.value)
  const supabase = createSupabaseServerClient()

  if (!session) {
    const vocabItems = await getVocabItemsForLevel(supabase, levelId)
    return <GuestListenTapGame levelId={levelId} levelName={level.name} vocabItems={vocabItems} />
  }

  const progress = await getProgressForKid(supabase, session.kidId)
  const statuses = computeLevelStatus(LEVELS, progress)
  const status = statuses.find((candidate) => candidate.id === levelId)

  if (!status?.unlocked) {
    redirect('/play')
  }

  const vocabItems = await getVocabItemsForLevel(supabase, levelId)

  return <ListenTapGame levelId={levelId} levelName={level.name} vocabItems={vocabItems} showLogout />
}
