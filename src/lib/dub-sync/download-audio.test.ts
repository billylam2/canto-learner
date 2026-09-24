import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'

vi.mock('./spawn-process', () => ({
  spawn: vi.fn(),
}))
vi.mock('./fs-process', () => ({
  unlink: vi.fn(),
}))

import { spawn } from './spawn-process'
import { unlink } from './fs-process'
import { downloadAudio, deleteAudioFile } from './download-audio'

function makeFakeChild() {
  const child = new EventEmitter() as EventEmitter & { stderr: EventEmitter }
  child.stderr = new EventEmitter()
  return child
}

describe('downloadAudio', () => {
  beforeEach(() => vi.clearAllMocks())

  it('resolves with a temp file path when yt-dlp exits successfully', async () => {
    const child = makeFakeChild()
    vi.mocked(spawn).mockReturnValue(child as never)

    const promise = downloadAudio('video-1')
    child.emit('close', 0)

    const path = await promise
    expect(path).toMatch(/video-1/)
    expect(path.endsWith('.mp3')).toBe(true)
  })

  it('requests 16kHz mono output', async () => {
    const child = makeFakeChild()
    vi.mocked(spawn).mockReturnValue(child as never)

    const promise = downloadAudio('video-1')
    child.emit('close', 0)
    await promise

    const args = vi.mocked(spawn).mock.calls[0][1] as string[]
    expect(args).toEqual(expect.arrayContaining(['--postprocessor-args', 'ExtractAudio:-ar 16000 -ac 1']))
  })

  it('rejects with the captured stderr when yt-dlp exits with a non-zero code', async () => {
    const child = makeFakeChild()
    vi.mocked(spawn).mockReturnValue(child as never)

    const promise = downloadAudio('video-1')
    child.stderr.emit('data', Buffer.from('video unavailable'))
    child.emit('close', 1)

    await expect(promise).rejects.toThrow('video unavailable')
  })

  it('rejects with a clear message when yt-dlp cannot be started', async () => {
    const child = makeFakeChild()
    vi.mocked(spawn).mockReturnValue(child as never)

    const promise = downloadAudio('video-1')
    child.emit('error', new Error('ENOENT'))

    await expect(promise).rejects.toThrow('yt-dlp not found or failed to start')
  })
})

describe('deleteAudioFile', () => {
  beforeEach(() => vi.clearAllMocks())

  it('unlinks the given path', async () => {
    vi.mocked(unlink).mockResolvedValue(undefined)
    await deleteAudioFile('/tmp/foo.mp3')
    expect(unlink).toHaveBeenCalledWith('/tmp/foo.mp3')
  })

  it('does not throw when the file is already gone', async () => {
    vi.mocked(unlink).mockRejectedValue(new Error('ENOENT'))
    await expect(deleteAudioFile('/tmp/foo.mp3')).resolves.toBeUndefined()
  })
})
