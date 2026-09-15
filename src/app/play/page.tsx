import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { readSessionFromCookieValue, COOKIE_NAME } from '@/lib/auth/session'
import { createSupabaseServerClient } from '@/lib/supabase/client'
import { getProgressForKid } from '@/lib/db/progress'
import { computeLevelStatus } from '@/lib/game/level-status'
import { LEVELS } from '../../../content/vocab'

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
    <main>
      <h1>Choose a level</h1>
      <ul>
        {levels.map((level) => (
          <li key={level.id}>
            {level.unlocked ? (
              <Link href={`/play/${level.id}`}>
                {level.name} — {level.starsEarned} stars
              </Link>
            ) : (
              <span>{level.name} — locked</span>
            )}
          </li>
        ))}
      </ul>
    </main>
  )
}
