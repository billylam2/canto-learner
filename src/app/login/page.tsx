import { cookies } from 'next/headers'
import { readSessionFromCookieValue, COOKIE_NAME } from '@/lib/auth/session'
import { GuestHome, AuthenticatedHome } from './home-views'

export default async function LoginPage() {
  const cookieStore = await cookies()
  const session = await readSessionFromCookieValue(cookieStore.get(COOKIE_NAME)?.value)

  if (!session) {
    return <GuestHome />
  }

  return <AuthenticatedHome username={session.username} />
}
