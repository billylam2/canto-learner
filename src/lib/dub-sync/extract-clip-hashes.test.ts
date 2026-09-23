import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'

vi.mock('node:child_process', () => {
  const spawn = vi.fn()
  return { spawn, default: { spawn } }
})

vi.mock('node:fs/promises', () => {
  const mkdtemp = vi.fn(async () => '/tmp/fake-dub-sync-align-dir')
  const rm = vi.fn(async () => {})
  return { mkdtemp, rm, default: { mkdtemp, rm } }
})

import { spawn } from 'node:child_process'
import { extractClipHashes } from './extract-clip-hashes'

function makeFakeChild() {
  const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter }
  child.stdout = Object.assign(new EventEmitter(), { resume: vi.fn() })
  child.stderr = Object.assign(new EventEmitter(), { resume: vi.fn() })
  return child
}

describe('extractClipHashes', () => {
  beforeEach(() => vi.clearAllMocks())

  it('gives a clear, actionable error when the binary is not installed (ENOENT)', async () => {
    const fakeChild = makeFakeChild()
    vi.mocked(spawn).mockReturnValue(fakeChild as never)

    const promise = extractClipHashes({ videoId: 'abc', centerSeconds: 10, windowSeconds: 3, fps: 10 })

    // extractClipHashes awaits mkdtemp() before spawning, so the 'error' listener isn't
    // attached until that microtask resolves — wait for spawn to actually be called first.
    await vi.waitFor(() => expect(spawn).toHaveBeenCalled())
    const enoent = Object.assign(new Error('spawn yt-dlp ENOENT'), { code: 'ENOENT' })
    fakeChild.emit('error', enoent)

    await expect(promise).rejects.toThrow(/yt-dlp is not installed \(or not on PATH\)/)
    await expect(promise).rejects.toThrow(/Vercel/)
  })

  it('still reports a plain exit-code failure as before for other errors', async () => {
    const fakeChild = makeFakeChild()
    vi.mocked(spawn).mockReturnValue(fakeChild as never)

    const promise = extractClipHashes({ videoId: 'abc', centerSeconds: 10, windowSeconds: 3, fps: 10 })

    await vi.waitFor(() => expect(spawn).toHaveBeenCalled())
    fakeChild.emit('close', 1)

    await expect(promise).rejects.toThrow('yt-dlp exited with code 1')
  })
})
