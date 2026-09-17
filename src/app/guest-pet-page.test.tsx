import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

import { GuestPetPage } from './guest-pet-page'
import { saveGuestLevelProgress } from '@/lib/guest/progress'
import type { ShopAccessory } from '@/components/pet-shop'

const ACCESSORIES: ShopAccessory[] = [
  { slug: 'bow', name: 'Bow', cost: 10, imageUrl: 'https://example.com/bow.png', xPercent: 60, yPercent: 15, widthPercent: 18 },
]

describe('GuestPetPage', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('shows the lifetime star balance computed from guest progress', async () => {
    saveGuestLevelProgress(1, 24, 'listen-tap')
    render(<GuestPetPage petImageUrl="https://example.com/fox.png" accessories={ACCESSORIES} />)
    await waitFor(() => expect(screen.getByText('★ 24 stars to spend')).toBeInTheDocument())
  })
})
