import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { readSessionFromCookieValue, COOKIE_NAME } from '@/lib/auth/session'
import { createSupabaseServerClient } from '@/lib/supabase/client'
import { getProgressForKid } from '@/lib/db/progress'
import { computeLevelStatus } from '@/lib/game/level-status'
import { LEVELS } from '../../../content/vocab'
import { SCENES } from '../../../content/scenes'
import { Header } from '@/components/ui/header'
import { Card } from '@/components/ui/card'
import { LockedLevelCard } from '@/components/ui/locked-level-card'
import { StarRating } from '@/components/ui/star-rating'
import { LinkButton } from '@/components/ui/button'

const LEVEL_IDS_WITH_SCENES = new Set(SCENES.map((scene) => scene.levelId))

export default async function PlayPage() {
  const cookieStore = await cookies()
  const session = await readSessionFromCookieValue(cookieStore.get(COOKIE_NAME)?.value)

  if (!session) {
    redirect('/login')
  }

  const supabase = createSupabaseServerClient()
  const progress = await getProgressForKid(supabase, session.kidId)
  const levels = computeLevelStatus(LEVELS, progress)

  return (
    <div className="min-h-screen bg-brand-bg">
      <Header />
      <main className="max-w-3xl mx-auto p-4">
        <h1 className="text-3xl font-extrabold text-brand-ink mb-4">Choose a level</h1>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {levels.map((level) => (
            <li key={level.id}>
              {level.unlocked ? (
                <Card className="flex flex-col gap-2">
                  <div className="flex items-center gap-1">
                    <span className="text-xl font-extrabold text-brand-ink">{level.name} —</span>
                    <StarRating stars={level.starsEarned} />
                  </div>
                  <div className="flex flex-wrap gap-2 mt-1">
                    <LinkButton href={`/play/${level.id}`} variant="primary">
                      Listen &amp; Tap
                    </LinkButton>
                    {LEVEL_IDS_WITH_SCENES.has(level.id) && (
                      <LinkButton href={`/play/${level.id}/scene`} variant="secondary">
                        Find in the Scene
                      </LinkButton>
                    )}
                  </div>
                </Card>
              ) : (
                <LockedLevelCard name={level.name} />
              )}
            </li>
          ))}
        </ul>
      </main>
    </div>
  )
}
