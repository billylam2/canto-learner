import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { VocabGameItem } from '@/lib/game/round'

const pushMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

import { GuestListenTapGame } from './guest-listen-tap-game'

function makeItem(id: string): VocabGameItem {
  return {
    id,
    slug: id,
    audioUrl: `https://example.com/${id}.mp3`,
    imageUrl: `https://example.com/${id}.svg`,
    homophoneGroup: null,
  }
}

describe('GuestListenTapGame', () => {
  beforeEach(() => {
    window.localStorage.clear()
    pushMock.mockClear()
    window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
  })

  it('renders the game once the level is confirmed unlocked', async () => {
    const items = [makeItem('a')]
    render(<GuestListenTapGame levelId={1} levelName="Greetings" vocabItems={items} />)
    await waitFor(() => expect(screen.getByText('Greetings')).toBeInTheDocument())
  })

  it('redirects to /play when the level is locked', async () => {
    const items = [makeItem('a')]
    render(<GuestListenTapGame levelId={2} levelName="People & Family" vocabItems={items} />)
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/play'))
  })

  it('shows a reset-progress button', async () => {
    const items = [makeItem('a')]
    render(<GuestListenTapGame levelId={1} levelName="Greetings" vocabItems={items} />)
    await waitFor(() => expect(screen.getByRole('button', { name: /reset progress/i })).toBeInTheDocument())
  })
})
