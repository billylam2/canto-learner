import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'

vi.mock('./spawn-process', () => ({
  spawn: vi.fn(),
}))

import { spawn } from './spawn-process'
import { downloadAudio } from './transcribe'

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

vi.mock('./fs-process', () => ({
  readFile: vi.fn(),
  unlink: vi.fn(),
}))

vi.mock('@google-cloud/speech', () => ({
  SpeechClient: vi.fn(),
}))

import { readFile } from './fs-process'
import { SpeechClient } from '@google-cloud/speech'
import { transcribeWithDiarization } from './transcribe'

describe('transcribeWithDiarization', () => {
  beforeEach(() => vi.clearAllMocks())

  it('extracts words with timestamps and speaker tags from the final diarized result', async () => {
    vi.mocked(readFile).mockResolvedValue(Buffer.from('fake-audio'))

    const fakeOperation = {
      promise: vi.fn().mockResolvedValue([
        {
          results: [
            { alternatives: [{ words: [] }] }, // earlier, non-final results are ignored
            {
              alternatives: [
                {
                  words: [
                    {
                      word: '你好',
                      startTime: { seconds: '0', nanos: 0 },
                      endTime: { seconds: '0', nanos: 500000000 },
                      speakerTag: 1,
                    },
                    {
                      word: '喬治',
                      startTime: { seconds: '1', nanos: 0 },
                      endTime: { seconds: '1', nanos: 500000000 },
                      speakerTag: 2,
                    },
                  ],
                },
              ],
            },
          ],
        },
      ]),
    }
    vi.mocked(SpeechClient).mockImplementation(function SpeechClientMock() {
      return { longRunningRecognize: vi.fn().mockResolvedValue([fakeOperation]) } as never
    })

    const words = await transcribeWithDiarization('/tmp/audio.mp3', 'yue-Hant-HK')

    expect(words).toEqual([
      { text: '你好', startTime: 0, endTime: 0.5, speakerTag: 1 },
      { text: '喬治', startTime: 1, endTime: 1.5, speakerTag: 2 },
    ])
  })

  it('returns an empty array when there are no results', async () => {
    vi.mocked(readFile).mockResolvedValue(Buffer.from('fake-audio'))
    const fakeOperation = { promise: vi.fn().mockResolvedValue([{ results: [] }]) }
    vi.mocked(SpeechClient).mockImplementation(function SpeechClientMock() {
      return { longRunningRecognize: vi.fn().mockResolvedValue([fakeOperation]) } as never
    })

    const words = await transcribeWithDiarization('/tmp/audio.mp3', 'en-US')
    expect(words).toEqual([])
  })
})
