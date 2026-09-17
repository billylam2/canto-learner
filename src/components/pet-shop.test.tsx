import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PetShop, type ShopAccessory, type OwnedAccessory } from './pet-shop'

const pushMock = vi.fn()
const refreshMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}))

const ACCESSORIES: ShopAccessory[] = [
  { slug: 'bow', name: 'Bow', cost: 10, imageUrl: 'https://example.com/bow.png', xPercent: 60, yPercent: 15, widthPercent: 18 },
  { slug: 'glasses', name: 'Glasses', cost: 15, imageUrl: 'https://example.com/glasses.png', xPercent: 30, yPercent: 38, widthPercent: 40 },
]

describe('PetShop', () => {
  beforeEach(() => {
    pushMock.mockClear()
    refreshMock.mockClear()
  })

  it('shows the pet name and current star balance', () => {
    render(
      <PetShop
        petName="Fox"
        petImageUrl="https://example.com/fox.png"
        accessories={ACCESSORIES}
        initialOwnedAccessories={[]}
        lifetimeStars={12}
        onPurchase={vi.fn()}
        onToggleEquip={vi.fn()}
      />
    )
    expect(screen.getByText('Fox')).toBeInTheDocument()
    expect(screen.getByText('★ 12 stars to spend')).toBeInTheDocument()
  })

  it('shows a disabled Buy button when the balance is below cost', () => {
    render(
      <PetShop
        petName="Fox"
        petImageUrl="https://example.com/fox.png"
        accessories={ACCESSORIES}
        initialOwnedAccessories={[]}
        lifetimeStars={5}
        onPurchase={vi.fn()}
        onToggleEquip={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: 'Buy ★ 10' })).toBeDisabled()
  })

  it('purchases an accessory and switches it to an equip toggle', async () => {
    const onPurchase = vi.fn().mockResolvedValue({ ok: true })
    render(
      <PetShop
        petName="Fox"
        petImageUrl="https://example.com/fox.png"
        accessories={ACCESSORIES}
        initialOwnedAccessories={[]}
        lifetimeStars={12}
        onPurchase={onPurchase}
        onToggleEquip={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Buy ★ 10' }))

    expect(onPurchase).toHaveBeenCalledWith('bow')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Unequip' })).toBeInTheDocument())
  })

  it('does not change state when the purchase is rejected', async () => {
    const onPurchase = vi.fn().mockResolvedValue({ ok: false })
    render(
      <PetShop
        petName="Fox"
        petImageUrl="https://example.com/fox.png"
        accessories={ACCESSORIES}
        initialOwnedAccessories={[]}
        lifetimeStars={12}
        onPurchase={onPurchase}
        onToggleEquip={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Buy ★ 10' }))

    await waitFor(() => expect(onPurchase).toHaveBeenCalled())
    expect(screen.getByRole('button', { name: 'Buy ★ 10' })).toBeInTheDocument()
  })

  it('shows an equipped accessory image in the stage', () => {
    const owned: OwnedAccessory[] = [{ accessorySlug: 'bow', equipped: true }]
    render(
      <PetShop
        petName="Fox"
        petImageUrl="https://example.com/fox.png"
        accessories={ACCESSORIES}
        initialOwnedAccessories={owned}
        lifetimeStars={12}
        onPurchase={vi.fn()}
        onToggleEquip={vi.fn()}
      />
    )
    expect(screen.getByAltText('Bow')).toBeInTheDocument()
  })

  it('hides an unequipped-but-owned accessory image from the stage', () => {
    const owned: OwnedAccessory[] = [{ accessorySlug: 'bow', equipped: false }]
    render(
      <PetShop
        petName="Fox"
        petImageUrl="https://example.com/fox.png"
        accessories={ACCESSORIES}
        initialOwnedAccessories={owned}
        lifetimeStars={12}
        onPurchase={vi.fn()}
        onToggleEquip={vi.fn()}
      />
    )
    expect(screen.queryByAltText('Bow')).not.toBeInTheDocument()
  })

  it('toggles equip state and calls onToggleEquip', async () => {
    const onToggleEquip = vi.fn().mockResolvedValue(undefined)
    const owned: OwnedAccessory[] = [{ accessorySlug: 'bow', equipped: true }]
    render(
      <PetShop
        petName="Fox"
        petImageUrl="https://example.com/fox.png"
        accessories={ACCESSORIES}
        initialOwnedAccessories={owned}
        lifetimeStars={12}
        onPurchase={vi.fn()}
        onToggleEquip={onToggleEquip}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Unequip' }))

    expect(onToggleEquip).toHaveBeenCalledWith('bow', false)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Equip' })).toBeInTheDocument())
  })

  it('calls the purchase API by default when no onPurchase is provided', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) } as Response)
    render(
      <PetShop
        petName="Fox"
        petImageUrl="https://example.com/fox.png"
        accessories={ACCESSORIES}
        initialOwnedAccessories={[]}
        lifetimeStars={12}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Buy ★ 10' }))

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/accessories/purchase',
        expect.objectContaining({ method: 'POST', body: JSON.stringify({ accessorySlug: 'bow' }) })
      )
    )
  })
})
