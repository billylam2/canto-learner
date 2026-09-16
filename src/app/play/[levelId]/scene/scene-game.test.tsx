import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SceneGameData } from '@/lib/db/scenes'
import { SceneGame } from './scene-game'

const pushMock = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

function makeScene(id: number, objects: SceneGameData['objects']): SceneGameData {
  return { id, imageUrl: `https://example.com/scene-${id}.png`, objects }
}

const DOG = {
  id: 'dog',
  slug: 'dog',
  audioUrl: 'https://example.com/dog.mp3',
  xPercent: 10,
  yPercent: 10,
  widthPercent: 20,
  heightPercent: 20,
}
const CAT = {
  id: 'cat',
  slug: 'cat',
  audioUrl: 'https://example.com/cat.mp3',
  xPercent: 60,
  yPercent: 60,
  widthPercent: 20,
  heightPercent: 20,
}

describe('SceneGame', () => {
  beforeEach(() => {
    pushMock.mockClear()
    window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) } as Response)
    Element.prototype.getBoundingClientRect = vi.fn(() => ({
      left: 0,
      top: 0,
      width: 200,
      height: 200,
      right: 200,
      bottom: 200,
      x: 0,
      y: 0,
      toJSON: () => {},
    })) as unknown as () => DOMRect
  })

  it('advances to the next question after tapping inside the target hotspot', async () => {
    const scenes = [makeScene(1, [DOG, CAT])]
    render(<SceneGame levelId={3} levelName="Descriptors & Animals" scenes={scenes} />)

    fireEvent.click(screen.getByTestId('scene-image'), { clientX: 30, clientY: 30 })

    await waitFor(() => expect(screen.getByText('Question 2 of 2')).toBeInTheDocument())
  })

  it('shows a retry message when tapping outside the target hotspot', async () => {
    const scenes = [makeScene(1, [DOG, CAT])]
    render(<SceneGame levelId={3} levelName="Descriptors & Animals" scenes={scenes} />)

    fireEvent.click(screen.getByTestId('scene-image'), { clientX: 180, clientY: 180 })

    expect(await screen.findByRole('alert')).toHaveTextContent('Try again!')
    expect(screen.getByText('Question 1 of 2')).toBeInTheDocument()
  })

  it('finishes a single-object level with 3 stars for a first-try correct tap', async () => {
    const scenes = [makeScene(1, [DOG])]
    render(<SceneGame levelId={3} levelName="Descriptors & Animals" scenes={scenes} />)

    fireEvent.click(screen.getByTestId('scene-image'), { clientX: 30, clientY: 30 })

    await waitFor(() => expect(screen.getByText('Level complete!')).toBeInTheDocument())
    expect(screen.getByText('You earned 3 stars.')).toBeInTheDocument()
  })

  it('awards 1 star after a retry', async () => {
    const scenes = [makeScene(1, [DOG])]
    render(<SceneGame levelId={3} levelName="Descriptors & Animals" scenes={scenes} />)

    fireEvent.click(screen.getByTestId('scene-image'), { clientX: 180, clientY: 180 })
    await screen.findByRole('alert')
    fireEvent.click(screen.getByTestId('scene-image'), { clientX: 30, clientY: 30 })

    await waitFor(() => expect(screen.getByText('You earned 1 stars.')).toBeInTheDocument())
  })

  it('advances through multiple scenes in sequence', async () => {
    const scenes = [makeScene(1, [DOG]), makeScene(2, [CAT])]
    render(<SceneGame levelId={2} levelName="People & Family" scenes={scenes} />)

    fireEvent.click(screen.getByTestId('scene-image'), { clientX: 30, clientY: 30 })

    await waitFor(() =>
      expect(screen.getByTestId('scene-image')).toHaveAttribute('src', 'https://example.com/scene-2.png')
    )
    fireEvent.click(screen.getByTestId('scene-image'), { clientX: 140, clientY: 140 })

    await waitFor(() => expect(screen.getByText('Level complete!')).toBeInTheDocument())
  })

  it('saves progress via the API with gameType find-scene', async () => {
    const scenes = [makeScene(1, [DOG])]
    render(<SceneGame levelId={3} levelName="Descriptors & Animals" scenes={scenes} />)

    fireEvent.click(screen.getByTestId('scene-image'), { clientX: 30, clientY: 30 })

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/progress',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ levelId: 3, starsEarned: 3, gameType: 'find-scene' }),
        })
      )
    )
  })

  it('returns to the level list when "Back to levels" is clicked', async () => {
    const scenes = [makeScene(1, [DOG])]
    render(<SceneGame levelId={3} levelName="Descriptors & Animals" scenes={scenes} />)

    fireEvent.click(screen.getByTestId('scene-image'), { clientX: 30, clientY: 30 })
    await screen.findByText('Level complete!')

    fireEvent.click(screen.getByRole('button', { name: 'Back to levels' }))
    expect(pushMock).toHaveBeenCalledWith('/play')
  })

  it('calls onLevelComplete instead of the API when provided', async () => {
    const onLevelComplete = vi.fn()
    const scenes = [makeScene(1, [DOG])]
    render(
      <SceneGame
        levelId={3}
        levelName="Descriptors & Animals"
        scenes={scenes}
        onLevelComplete={onLevelComplete}
      />
    )

    fireEvent.click(screen.getByTestId('scene-image'), { clientX: 30, clientY: 30 })

    await waitFor(() => expect(onLevelComplete).toHaveBeenCalledWith(3))
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
