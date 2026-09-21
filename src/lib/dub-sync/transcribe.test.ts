import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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

  it('requests 16kHz mono output, since Speech-to-Text silently garbles audio at an unexpected sample rate', async () => {
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

vi.mock('./fs-process', () => ({
  readFile: vi.fn(),
  unlink: vi.fn(),
}))

vi.mock('@google-cloud/speech', () => ({
  SpeechClient: vi.fn(),
}))

const mockUpload = vi.fn()
const mockDelete = vi.fn()
const mockFile = vi.fn(() => ({ delete: mockDelete }))
const mockBucket = vi.fn(() => ({ upload: mockUpload, file: mockFile }))

vi.mock('@google-cloud/storage', () => ({
  Storage: vi.fn(),
}))

import { SpeechClient } from '@google-cloud/speech'
import { Storage } from '@google-cloud/storage'
import { transcribeWithDiarization, uploadToGcs, deleteFromGcs } from './transcribe'

describe('uploadToGcs', () => {
  beforeEach(() => vi.clearAllMocks())

  it('uploads the file to the given bucket and returns a gs:// uri', async () => {
    mockUpload.mockResolvedValue(undefined)
    vi.mocked(Storage).mockImplementation(function StorageMock() {
      return { bucket: mockBucket } as never
    })

    const uri = await uploadToGcs('/tmp/audio.mp3', 'my-bucket')

    expect(mockBucket).toHaveBeenCalledWith('my-bucket')
    expect(mockUpload).toHaveBeenCalledWith('/tmp/audio.mp3', expect.objectContaining({ destination: expect.any(String) }))
    expect(uri).toMatch(/^gs:\/\/my-bucket\/.+\.mp3$/)
  })
})

describe('deleteFromGcs', () => {
  beforeEach(() => vi.clearAllMocks())

  it('deletes the object referenced by a gs:// uri', async () => {
    mockDelete.mockResolvedValue(undefined)
    vi.mocked(Storage).mockImplementation(function StorageMock() {
      return { bucket: mockBucket } as never
    })

    await deleteFromGcs('gs://my-bucket/dub-sync/audio-123.mp3')

    expect(mockBucket).toHaveBeenCalledWith('my-bucket')
    expect(mockFile).toHaveBeenCalledWith('dub-sync/audio-123.mp3')
    expect(mockDelete).toHaveBeenCalled()
  })

  it('swallows errors from a failed delete', async () => {
    mockDelete.mockRejectedValue(new Error('not found'))
    vi.mocked(Storage).mockImplementation(function StorageMock() {
      return { bucket: mockBucket } as never
    })

    await expect(deleteFromGcs('gs://my-bucket/dub-sync/audio-123.mp3')).resolves.toBeUndefined()
  })
})

describe('transcribeWithDiarization', () => {
  const originalBucketEnv = process.env.DUB_SYNC_GCS_BUCKET

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.DUB_SYNC_GCS_BUCKET = 'my-bucket'
  })

  afterEach(() => {
    process.env.DUB_SYNC_GCS_BUCKET = originalBucketEnv
  })

  it('extracts words with timestamps and speaker tags from the final diarized result', async () => {
    mockUpload.mockResolvedValue(undefined)
    mockDelete.mockResolvedValue(undefined)
    vi.mocked(Storage).mockImplementation(function StorageMock() {
      return { bucket: mockBucket } as never
    })

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
    const longRunningRecognize = vi.fn().mockResolvedValue([fakeOperation])
    vi.mocked(SpeechClient).mockImplementation(function SpeechClientMock() {
      return { longRunningRecognize } as never
    })

    const words = await transcribeWithDiarization('/tmp/audio.mp3', 'yue-Hant-HK')

    expect(words).toEqual([
      { text: '你好', startTime: 0, endTime: 0.5, speakerTag: 1 },
      { text: '喬治', startTime: 1, endTime: 1.5, speakerTag: 2 },
    ])
    expect(mockUpload).toHaveBeenCalledWith('/tmp/audio.mp3', expect.objectContaining({ destination: expect.any(String) }))
    expect(longRunningRecognize).toHaveBeenCalledWith(
      expect.objectContaining({
        audio: { uri: expect.stringMatching(/^gs:\/\/my-bucket\/.+\.mp3$/) },
        config: expect.objectContaining({ sampleRateHertz: 16000, audioChannelCount: 1 }),
      })
    )
    expect(mockDelete).toHaveBeenCalled()
  })

  it('returns an empty array when there are no results', async () => {
    mockUpload.mockResolvedValue(undefined)
    mockDelete.mockResolvedValue(undefined)
    vi.mocked(Storage).mockImplementation(function StorageMock() {
      return { bucket: mockBucket } as never
    })
    const fakeOperation = { promise: vi.fn().mockResolvedValue([{ results: [] }]) }
    vi.mocked(SpeechClient).mockImplementation(function SpeechClientMock() {
      return { longRunningRecognize: vi.fn().mockResolvedValue([fakeOperation]) } as never
    })

    const words = await transcribeWithDiarization('/tmp/audio.mp3', 'en-US')
    expect(words).toEqual([])
  })

  it('deletes the uploaded gcs object even when recognition fails', async () => {
    mockUpload.mockResolvedValue(undefined)
    mockDelete.mockResolvedValue(undefined)
    vi.mocked(Storage).mockImplementation(function StorageMock() {
      return { bucket: mockBucket } as never
    })
    vi.mocked(SpeechClient).mockImplementation(function SpeechClientMock() {
      return { longRunningRecognize: vi.fn().mockRejectedValue(new Error('recognize failed')) } as never
    })

    await expect(transcribeWithDiarization('/tmp/audio.mp3', 'en-US')).rejects.toThrow('recognize failed')
    expect(mockDelete).toHaveBeenCalled()
  })

  it('throws a clear error when DUB_SYNC_GCS_BUCKET is not set', async () => {
    delete process.env.DUB_SYNC_GCS_BUCKET

    await expect(transcribeWithDiarization('/tmp/audio.mp3', 'en-US')).rejects.toThrow('DUB_SYNC_GCS_BUCKET')
  })
})
