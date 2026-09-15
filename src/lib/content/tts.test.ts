import { describe, it, expect, vi } from 'vitest'
import type { TextToSpeechClient } from '@google-cloud/text-to-speech'
import { synthesizeCantonese } from './tts'

function makeClientMock(audioContent: Uint8Array | null) {
  return {
    synthesizeSpeech: vi.fn().mockResolvedValue([{ audioContent }]),
  } as unknown as TextToSpeechClient
}

describe('synthesizeCantonese', () => {
  it('returns audio content as a Buffer', async () => {
    const client = makeClientMock(new Uint8Array([1, 2, 3]))
    const buffer = await synthesizeCantonese(client, '你好')
    expect(buffer).toBeInstanceOf(Buffer)
    expect(Array.from(buffer)).toEqual([1, 2, 3])
  })

  it('calls synthesizeSpeech with the Cantonese voice config', async () => {
    const client = makeClientMock(new Uint8Array([1]))
    await synthesizeCantonese(client, '你好')
    expect(client.synthesizeSpeech).toHaveBeenCalledWith({
      input: { text: '你好' },
      voice: { languageCode: 'yue-HK', name: 'yue-HK-Standard-A' },
      audioConfig: { audioEncoding: 'MP3' },
    })
  })

  it('throws when no audio content is returned', async () => {
    const client = makeClientMock(null)
    await expect(synthesizeCantonese(client, '你好')).rejects.toThrow('No audio returned for text: 你好')
  })
})
