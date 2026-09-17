import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { VocabGameItem } from '@/lib/game/round'
import { ListenTapGame } from './listen-tap-game'

const pushMock = vi.fn()
const refreshMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
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
    refreshMock.mockClear()
    window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) } as Response)
  })

  it('does not show a log out button by default', () => {
    const items = [makeItem('a')]
    render(<ListenTapGame levelId={1} levelName="Greetings" vocabItems={items} />)
    expect(screen.queryByRole('button', { name: /log out/i })).not.toBeInTheDocument()
  })

  it('shows a log out button when showLogout is true', () => {
    const items = [makeItem('a')]
    render(<ListenTapGame levelId={1} levelName="Greetings" vocabItems={items} showLogout />)
    expect(screen.getByRole('button', { name: /log out/i })).toBeInTheDocument()
  })

  it('shows a reset-progress button when showResetGuestProgress is true', () => {
    const items = [makeItem('a')]
    render(<ListenTapGame levelId={1} levelName="Greetings" vocabItems={items} showResetGuestProgress />)
    expect(screen.getByRole('button', { name: /reset progress/i })).toBeInTheDocument()
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

  it('ignores a duplicate click on the last answer while progress is saving', async () => {
    let resolveFetch: (() => void) | undefined
    global.fetch = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = () => resolve({ ok: true, json: async () => ({ ok: true }) } as Response)
        })
    )

    const items = [makeItem('a')]
    render(<ListenTapGame levelId={1} levelName="Greetings" vocabItems={items} />)

    fireEvent.click(screen.getByTestId('a'))
    fireEvent.click(screen.getByTestId('a'))

    resolveFetch?.()

    await waitFor(() => expect(screen.getByText('Level complete!')).toBeInTheDocument())
    expect(screen.getByText('You earned 3 stars.')).toBeInTheDocument()
    expect(global.fetch).toHaveBeenCalledTimes(1)
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

  it('calls onLevelComplete instead of the API when provided', async () => {
    const onLevelComplete = vi.fn()
    const items = [makeItem('a')]
    render(
      <ListenTapGame levelId={1} levelName="Greetings" vocabItems={items} onLevelComplete={onLevelComplete} />
    )

    fireEvent.click(screen.getByTestId('a'))

    await waitFor(() => expect(onLevelComplete).toHaveBeenCalledWith(3))
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
