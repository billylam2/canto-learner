import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SceneGameData } from '@/lib/db/scenes'

const pushMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

import { GuestSceneGame } from './guest-scene-game'

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

describe('GuestSceneGame', () => {
  beforeEach(() => {
    window.localStorage.clear()
    pushMock.mockClear()
    window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined)
  })

  it('renders the game once the level is confirmed unlocked', async () => {
    const scenes = [makeScene(1, [DOG])]
    render(<GuestSceneGame levelId={1} levelName="Greetings" scenes={scenes} />)
    await waitFor(() => expect(screen.getByText('Greetings')).toBeInTheDocument())
  })

  it('redirects to /play when the level is locked', async () => {
    const scenes = [makeScene(1, [DOG])]
    render(<GuestSceneGame levelId={2} levelName="People & Family" scenes={scenes} />)
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/play'))
  })
})
