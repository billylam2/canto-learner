'use client'

import { useState } from 'react'
import { Header } from '@/components/ui/header'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export interface ShopAccessory {
  slug: string
  name: string
  cost: number
  imageUrl: string
  xPercent: number
  yPercent: number
  widthPercent: number
}

export interface OwnedAccessory {
  accessorySlug: string
  equipped: boolean
}

interface PetShopProps {
  petName: string
  petImageUrl: string
  accessories: ShopAccessory[]
  initialOwnedAccessories: OwnedAccessory[]
  lifetimeStars: number
  onPurchase?: (accessorySlug: string) => Promise<{ ok: boolean }>
  onToggleEquip?: (accessorySlug: string, equipped: boolean) => Promise<void>
  showLogout?: boolean
  showResetGuestProgress?: boolean
}

async function defaultPurchase(accessorySlug: string): Promise<{ ok: boolean }> {
  const response = await fetch('/api/accessories/purchase', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ accessorySlug }),
  })
  return { ok: response.ok }
}

async function defaultToggleEquip(accessorySlug: string, equipped: boolean): Promise<void> {
  await fetch('/api/accessories/equip', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ accessorySlug, equipped }),
  })
}

export function PetShop({
  petName,
  petImageUrl,
  accessories,
  initialOwnedAccessories,
  lifetimeStars,
  onPurchase = defaultPurchase,
  onToggleEquip = defaultToggleEquip,
  showLogout = false,
  showResetGuestProgress = false,
}: PetShopProps) {
  const [owned, setOwned] = useState(initialOwnedAccessories)

  const spent = owned.reduce((sum, row) => {
    const accessory = accessories.find((candidate) => candidate.slug === row.accessorySlug)
    return sum + (accessory?.cost ?? 0)
  }, 0)
  const balance = lifetimeStars - spent

  async function handlePurchase(slug: string) {
    const result = await onPurchase(slug)
    if (result.ok) {
      setOwned((current) => [...current, { accessorySlug: slug, equipped: true }])
    }
  }

  async function handleToggleEquip(slug: string, equipped: boolean) {
    await onToggleEquip(slug, equipped)
    setOwned((current) => current.map((row) => (row.accessorySlug === slug ? { ...row, equipped } : row)))
  }

  return (
    <div className="min-h-screen bg-brand-bg">
      <Header showBackLink showLogout={showLogout} showResetGuestProgress={showResetGuestProgress} />
      <main className="max-w-2xl mx-auto p-4">
        <Card className="flex flex-col items-center gap-4">
          <h1 className="text-2xl font-extrabold text-brand-ink">{petName}</h1>
          <p className="bg-brand-secondary text-white font-bold rounded-full px-4 py-1 inline-block">
            ★ {balance} stars to spend
          </p>

          <div className="relative w-full max-w-xs aspect-square">
            {/* eslint-disable-next-line @next/next/no-img-element -- externally-hosted, positioned by percent, not a Next/Image optimization candidate */}
            <img src={petImageUrl} alt={petName} className="absolute inset-0 w-full h-full object-contain" />
            {accessories
              .filter((accessory) => owned.some((row) => row.accessorySlug === accessory.slug && row.equipped))
              .map((accessory) => (
                // eslint-disable-next-line @next/next/no-img-element -- externally-hosted, positioned by percent, not a Next/Image optimization candidate
                <img
                  key={accessory.slug}
                  src={accessory.imageUrl}
                  alt={accessory.name}
                  className="absolute"
                  style={{
                    left: `${accessory.xPercent}%`,
                    top: `${accessory.yPercent}%`,
                    width: `${accessory.widthPercent}%`,
                  }}
                />
              ))}
          </div>

          <ul className="w-full flex flex-col gap-2">
            {accessories.map((accessory) => {
              const ownedRow = owned.find((row) => row.accessorySlug === accessory.slug)
              return (
                <li
                  key={accessory.slug}
                  className="flex items-center justify-between border-4 border-brand-ink rounded-[16px] bg-white p-3"
                >
                  <span className="font-bold text-brand-ink">{accessory.name}</span>
                  {ownedRow ? (
                    <Button variant="secondary" onClick={() => handleToggleEquip(accessory.slug, !ownedRow.equipped)}>
                      {ownedRow.equipped ? 'Unequip' : 'Equip'}
                    </Button>
                  ) : (
                    <Button onClick={() => handlePurchase(accessory.slug)} disabled={balance < accessory.cost}>
                      Buy ★ {accessory.cost}
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        </Card>
      </main>
    </div>
  )
}
