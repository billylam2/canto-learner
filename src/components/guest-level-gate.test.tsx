import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const pushMock = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}))

import { GuestLevelGate } from './guest-level-gate'

describe('GuestLevelGate', () => {
  beforeEach(() => {
    window.localStorage.clear()
    pushMock.mockClear()
  })

  it('renders children with a working save callback when the level is unlocked', async () => {
    // Level 1 (Greetings) has an unlockThreshold of 0, so it's always unlocked.
    render(
      <GuestLevelGate levelId={1} gameType="listen-tap">
        {(onLevelComplete) => <button onClick={() => onLevelComplete(12)}>Finish</button>}
      </GuestLevelGate>
    )

    await waitFor(() => expect(screen.getByText('Finish')).toBeInTheDocument())
    fireEvent.click(screen.getByText('Finish'))

    expect(window.localStorage.getItem('canto-guest-progress')).toContain('"levelId":1')
    expect(pushMock).not.toHaveBeenCalled()
  })

  it('redirects to /play when the level is locked', async () => {
    // Level 2 (People & Family) has an unlockThreshold of 20; with no guest
    // progress stored, total stars is 0, so it's locked.
    render(
      <GuestLevelGate levelId={2} gameType="listen-tap">
        {() => <p>Should not render</p>}
      </GuestLevelGate>
    )

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/play'))
    expect(screen.queryByText('Should not render')).not.toBeInTheDocument()
  })
})
