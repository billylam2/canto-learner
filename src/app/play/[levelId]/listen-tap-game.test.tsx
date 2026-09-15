import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { VocabGameItem } from '@/lib/game/round'
import { ListenTapGame } from './listen-tap-game'

const pushMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

function makeItem(id: string): VocabGameItem {
  return {
    id,
    slug: id,
    audioUrl: `https://example.com/${id}.mp3`,
    imageUrl: `https://example.com/${id}.svg`,
    homophoneGroup: null,
  }
}

describe('ListenTapGame', () => {
  beforeEach(() => {
    pushMock.mockClear()
    window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) } as Response)
  })

  it('advances to the next item after a correct first-try answer', async () => {
    const items = [makeItem('a'), makeItem('b'), makeItem('c')]
    render(<ListenTapGame levelId={1} levelName="Greetings" vocabItems={items} />)

    fireEvent.click(screen.getByTestId('a'))

    await waitFor(() => expect(screen.getByTestId('b')).toBeInTheDocument())
  })

  it('shows a retry message on a wrong answer and keeps the same item', async () => {
    const items = [makeItem('a'), makeItem('b')]
    render(<ListenTapGame levelId={1} levelName="Greetings" vocabItems={items} />)

    fireEvent.click(screen.getByTestId('b'))

    expect(await screen.findByRole('alert')).toHaveTextContent('Try again!')
    expect(screen.getByTestId('a')).toBeInTheDocument()
  })

  it('finishes a single-item level with 3 stars for a first-try correct answer', async () => {
    const items = [makeItem('a')]
    render(<ListenTapGame levelId={1} levelName="Greetings" vocabItems={items} />)

    fireEvent.click(screen.getByTestId('a'))

    await waitFor(() => expect(screen.getByText('Level complete!')).toBeInTheDocument())
    expect(screen.getByText('You earned 3 stars.')).toBeInTheDocument()
  })

  it('awards 1 star after a retry and sums correctly across items', async () => {
    const items = [makeItem('a'), makeItem('b')]
    render(<ListenTapGame levelId={1} levelName="Greetings" vocabItems={items} />)

    fireEvent.click(screen.getByTestId('b'))
    await screen.findByRole('alert')
    fireEvent.click(screen.getByTestId('a'))

    await waitFor(() => expect(screen.getByTestId('b')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('b'))

    await waitFor(() => expect(screen.getByText('You earned 4 stars.')).toBeInTheDocument())
  })

  it('saves progress via the API when the level finishes', async () => {
    const items = [makeItem('a')]
    render(<ListenTapGame levelId={1} levelName="Greetings" vocabItems={items} />)

    fireEvent.click(screen.getByTestId('a'))

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/progress',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ levelId: 1, starsEarned: 3, gameType: 'listen-tap' }),
        })
      )
    )
  })

  it('returns to the level list when "Back to levels" is clicked', async () => {
    const items = [makeItem('a')]
    render(<ListenTapGame levelId={1} levelName="Greetings" vocabItems={items} />)

    fireEvent.click(screen.getByTestId('a'))
    await screen.findByText('Level complete!')

    fireEvent.click(screen.getByRole('button', { name: 'Back to levels' }))
    expect(pushMock).toHaveBeenCalledWith('/play')
  })
})
