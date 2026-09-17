import { cookies } from 'next/headers'
import { readSessionFromCookieValue, COOKIE_NAME } from '@/lib/auth/session'
import { createSupabaseServerClient } from '@/lib/supabase/client'
import { getProgressForKid } from '@/lib/db/progress'
import { computeLevelStatus } from '@/lib/game/level-status'
import { LEVELS } from '../../../content/vocab'
import { SCENES } from '../../../content/scenes'
import { Header } from '@/components/ui/header'
import { LevelList } from '@/components/level-list'
import { GuestPlayPage } from '../guest-play-page'

export default async function PlayPage() {
  const cookieStore = await cookies()
  const session = await readSessionFromCookieValue(cookieStore.get(COOKIE_NAME)?.value)

  if (!session) {
    return <GuestPlayPage />
  }

  const supabase = createSupabaseServerClient()
  const progress = await getProgressForKid(supabase, session.kidId)
  const levelIdsWithScenes = new Set(SCENES.map((scene) => scene.levelId))
  const levels = computeLevelStatus(LEVELS, progress, levelIdsWithScenes)

  return (
    <div className="min-h-screen bg-brand-bg">
      <Header showLogout />
      <main className="max-w-3xl lg:max-w-5xl mx-auto p-4">
        <h1 className="text-3xl font-extrabold text-brand-ink mb-4">Choose a level</h1>
        <LevelList levels={levels} />
      </main>
    </div>
  )
}
