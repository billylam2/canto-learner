import { cookies } from 'next/headers'
import type { SupabaseClient } from '@supabase/supabase-js'
import { readSessionFromCookieValue, COOKIE_NAME } from '@/lib/auth/session'
import { createSupabaseServerClient } from '@/lib/supabase/client'
import { getProgressForKid } from '@/lib/db/progress'
import { getAccessoriesForKid } from '@/lib/db/accessories'
import { computeLifetimeStars } from '@/lib/game/level-status'
import { PET, ACCESSORIES } from '../../../content/rewards'
import { PetShop } from '@/components/pet-shop'
import { GuestPetPage } from '../guest-pet-page'

function resolveImageUrls(supabase: SupabaseClient) {
  return {
    petImageUrl: supabase.storage.from('pet-images').getPublicUrl(`${PET.slug}.png`).data.publicUrl,
    accessories: ACCESSORIES.map((accessory) => ({
      ...accessory,
      imageUrl: supabase.storage.from('accessory-images').getPublicUrl(`${accessory.slug}.png`).data.publicUrl,
    })),
  }
}

export default async function PetPage() {
  const cookieStore = await cookies()
  const session = await readSessionFromCookieValue(cookieStore.get(COOKIE_NAME)?.value)
  const supabase = createSupabaseServerClient()
  const { petImageUrl, accessories } = resolveImageUrls(supabase)

  if (!session) {
    return <GuestPetPage petImageUrl={petImageUrl} accessories={accessories} />
  }

  const [progress, ownedAccessories] = await Promise.all([
    getProgressForKid(supabase, session.kidId),
    getAccessoriesForKid(supabase, session.kidId),
  ])
  const lifetimeStars = computeLifetimeStars(progress)

  return (
    <PetShop
      petName={PET.name}
      petImageUrl={petImageUrl}
      accessories={accessories}
      initialOwnedAccessories={ownedAccessories}
      lifetimeStars={lifetimeStars}
      showLogout
    />
  )
}
