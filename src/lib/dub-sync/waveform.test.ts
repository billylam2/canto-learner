import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'

vi.mock('./spawn-process', () => ({
  spawn: vi.fn(),
}))

import { spawn } from './spawn-process'
import { extractWaveformPeaks } from './waveform'

function makeFakeChild() {
  const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter; stderr: EventEmitter }
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  return child
}

// Builds a little-endian s16le PCM buffer from plain sample values (-32768..32767).
function pcmBuffer(samples: number[]): Buffer {
  const buffer = Buffer.alloc(samples.length * 2)
  samples.forEach((sample, i) => buffer.writeInt16LE(sample, i * 2))
  return buffer
}

describe('extractWaveformPeaks', () => {
  beforeEach(() => vi.clearAllMocks())

  it('computes one normalized peak per 50ms bucket at the 8000Hz sample rate', async () => {
    const child = makeFakeChild()
    vi.mocked(spawn).mockReturnValue(child as never)

    // 8000Hz * 0.05s = 400 samples per bucket. Two buckets: first loud (32767 => ~1.0), second silent (0).
    const promise = extractWaveformPeaks('/tmp/audio.mp3')
    child.stdout.emit('data', pcmBuffer([...Array(400).fill(32767), ...Array(400).fill(0)]))
    child.emit('close', 0)

    const peaks = await promise
    expect(peaks).toHaveLength(2)
    expect(peaks[0]).toBeCloseTo(1.0, 2)
    expect(peaks[1]).toBe(0)
  })

  it('requests mono 8000Hz signed 16-bit PCM from ffmpeg', async () => {
    const child = makeFakeChild()
    vi.mocked(spawn).mockReturnValue(child as never)

    const promise = extractWaveformPeaks('/tmp/audio.mp3')
    child.stdout.emit('data', pcmBuffer(Array(400).fill(0)))
    child.emit('close', 0)
    await promise

    const args = vi.mocked(spawn).mock.calls[0][1] as string[]
    expect(args).toEqual(expect.arrayContaining(['-f', 's16le', '-ar', '8000', '-ac', '1']))
  })

  it('rejects with the captured stderr when ffmpeg exits with a non-zero code', async () => {
    const child = makeFakeChild()
    vi.mocked(spawn).mockReturnValue(child as never)

    const promise = extractWaveformPeaks('/tmp/audio.mp3')
    child.stderr.emit('data', Buffer.from('invalid data'))
    child.emit('close', 1)

    await expect(promise).rejects.toThrow('invalid data')
  })

  it('rejects with a clear message when ffmpeg cannot be started', async () => {
    const child = makeFakeChild()
    vi.mocked(spawn).mockReturnValue(child as never)

    const promise = extractWaveformPeaks('/tmp/audio.mp3')
    child.emit('error', new Error('ENOENT'))

    await expect(promise).rejects.toThrow('ffmpeg not found or failed to start')
  })
})
