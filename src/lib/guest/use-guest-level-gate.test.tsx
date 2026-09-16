import { renderHook, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const pushMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

import { useGuestLevelGate } from './use-guest-level-gate'

describe('useGuestLevelGate', () => {
  beforeEach(() => {
    window.localStorage.clear()
    pushMock.mockClear()
  })

  it('reports unlocked and provides a working save callback when the level is unlocked', async () => {
    // Level 1 (Greetings) has an unlockThreshold of 0, so it's always unlocked.
    const { result } = renderHook(() => useGuestLevelGate(1, 'listen-tap'))

    await waitFor(() => expect(result.current.unlocked).toBe(true))

    act(() => {
      result.current.onLevelComplete(12)
    })

    expect(window.localStorage.getItem('canto-guest-progress')).toContain('"levelId":1')
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('redirects to /play when the level is locked', async () => {
    // Level 2 (People & Family) has an unlockThreshold of 20; with no guest
    // progress stored, total stars is 0, so it's locked.
    const { result } = renderHook(() => useGuestLevelGate(2, 'listen-tap'))

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/play'))
    expect(result.current.unlocked).toBe(false)
  })
})
