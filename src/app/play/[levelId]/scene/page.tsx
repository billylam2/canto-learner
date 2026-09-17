import { cookies } from 'next/headers'
import { redirect, notFound } from 'next/navigation'
import { readSessionFromCookieValue, COOKIE_NAME } from '@/lib/auth/session'
import { createSupabaseServerClient } from '@/lib/supabase/client'
import { getProgressForKid } from '@/lib/db/progress'
import { getScenesForLevel } from '@/lib/db/scenes'
import { computeLevelStatus } from '@/lib/game/level-status'
import { LEVELS } from '../../../../../content/vocab'
import { SceneGame } from './scene-game'
import { GuestSceneGame } from './guest-scene-game'

export default async function ScenePage({ params }: { params: Promise<{ levelId: string }> }) {
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
    const scenes = await getScenesForLevel(supabase, levelId)
    if (scenes.length === 0) {
      notFound()
    }
    return <GuestSceneGame levelId={levelId} levelName={level.name} scenes={scenes} />
  }

  const progress = await getProgressForKid(supabase, session.kidId)
  const statuses = computeLevelStatus(LEVELS, progress)
  const status = statuses.find((candidate) => candidate.id === levelId)

  if (!status?.unlocked) {
    redirect('/play')
  }

  const scenes = await getScenesForLevel(supabase, levelId)
  if (scenes.length === 0) {
    notFound()
  }

  return <SceneGame levelId={levelId} levelName={level.name} scenes={scenes} showLogout />
}
