import { TextToSpeechClient } from '@google-cloud/text-to-speech'

export function createTtsClient(): TextToSpeechClient {
  return new TextToSpeechClient()
}

export async function synthesizeCantonese(client: TextToSpeechClient, text: string): Promise<Buffer> {
  const [response] = await client.synthesizeSpeech({
    input: { text },
    voice: { languageCode: 'yue-HK', name: 'yue-HK-Standard-A' },
    audioConfig: { audioEncoding: 'MP3' },
  })

  if (!response.audioContent) {
    throw new Error(`No audio returned for text: ${text}`)
  }
  return Buffer.from(response.audioContent)
}
