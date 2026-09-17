'use client'

import { useEffect, useState } from 'react'
import { getGuestProgress } from '@/lib/guest/progress'
import { getGuestAccessories, purchaseGuestAccessory, setGuestAccessoryEquipped } from '@/lib/guest/accessories'
import { computeLifetimeStars } from '@/lib/game/level-status'
import { PET } from '../../content/rewards'
import { PetShop, type ShopAccessory, type OwnedAccessory } from '@/components/pet-shop'

interface GuestPetPageProps {
  petImageUrl: string
  accessories: ShopAccessory[]
}

export function GuestPetPage({ petImageUrl, accessories }: GuestPetPageProps) {
  const [state, setState] = useState<{ lifetimeStars: number; owned: OwnedAccessory[] } | null>(null)

  useEffect(() => {
    // Reading localStorage can only happen client-side, so this can't be
    // computed during the initial (server-rendered) render without a
    // hydration mismatch — it genuinely needs to run post-mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({
      lifetimeStars: computeLifetimeStars(getGuestProgress()),
      owned: getGuestAccessories(),
    })
  }, [])

  if (!state) {
    return <p>Loading...</p>
  }

  async function handlePurchase(accessorySlug: string) {
    const result = purchaseGuestAccessory(accessorySlug)
    return { ok: result.ok }
  }

  async function handleToggleEquip(accessorySlug: string, equipped: boolean) {
    setGuestAccessoryEquipped(accessorySlug, equipped)
  }

  return (
    <PetShop
      petName={PET.name}
      petImageUrl={petImageUrl}
      accessories={accessories}
      initialOwnedAccessories={state.owned}
      lifetimeStars={state.lifetimeStars}
      onPurchase={handlePurchase}
      onToggleEquip={handleToggleEquip}
      showResetGuestProgress
    />
  )
}
