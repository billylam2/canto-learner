import { renderHook, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const pushMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

import { useGuestLevelGate } from './use-guest-level-gate'
import { saveGuestLevelProgress } from './progress'

describe('useGuestLevelGate', () => {
  beforeEach(() => {
    window.localStorage.clear()
    pushMock.mockClear()
  })

  it('reports unlocked and provides a working save callback when the level is unlocked', async () => {
    // Level 1 (Greetings) is always unlocked — it's first in the chain.
    const { result } = renderHook(() => useGuestLevelGate(1, 'listen-tap'))

    await waitFor(() => expect(result.current.unlocked).toBe(true))

    act(() => {
      result.current.onLevelComplete(12)
    })

    expect(window.localStorage.getItem('canto-guest-progress')).toContain('"levelId":1')
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('redirects to /play when the level is locked', async () => {
    // Level 2 (People & Family) unlocks only once level 1's listen-tap is
    // completed; with no guest progress stored, it's locked.
    const { result } = renderHook(() => useGuestLevelGate(2, 'listen-tap'))

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/play'))
    expect(result.current.unlocked).toBe(false)
  })

  it('redirects to /play for find-scene when the level itself is unlocked but its own listen-tap is not done', async () => {
    // Level 2 has scene content. Unlocking level 2 (via level 1's
    // listen-tap) is not enough for find-scene — level 2's own listen-tap
    // must also be completed first.
    saveGuestLevelProgress(1, 3, 'listen-tap')

    const { result } = renderHook(() => useGuestLevelGate(2, 'find-scene'))

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/play'))
    expect(result.current.unlocked).toBe(false)
  })

  it('reports unlocked for find-scene once the level completes its own listen-tap', async () => {
    saveGuestLevelProgress(1, 3, 'listen-tap')
    saveGuestLevelProgress(2, 3, 'listen-tap')

    const { result } = renderHook(() => useGuestLevelGate(2, 'find-scene'))

    await waitFor(() => expect(result.current.unlocked).toBe(true))
    expect(pushMock).not.toHaveBeenCalled()
  })
})
