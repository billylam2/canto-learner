import { execFileSync } from 'node:child_process'

const MODEL = 'gemini-2.5-flash-image'
const REGION = 'us-central1'
const MAX_RATE_LIMIT_ATTEMPTS = 5
const RATE_LIMIT_RETRY_DELAY_MS = 5000
export const DEFAULT_STYLE_SUFFIX =
  'in the style of a modern 3D Pixar animated film (like Inside Out), soft rounded character shapes, warm expressive lighting and soft shadows, vibrant but natural colors, smooth clay-like shading, simple softly-lit background, no text, centered'

export interface ImageGenDeps {
  getAccessToken: () => string
  fetchImpl: typeof fetch
  sleep?: (ms: number) => Promise<void>
}

export function createImageGenDeps(): ImageGenDeps {
  return {
    getAccessToken: () =>
      execFileSync('gcloud', ['auth', 'application-default', 'print-access-token'], {
        encoding: 'utf-8',
      }).trim(),
    fetchImpl: fetch,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  }
}

interface GenerateContentResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }>
    }
  }>
}

export async function generateImage(
  projectId: string,
  description: string,
  deps: ImageGenDeps,
  styleSuffix: string = DEFAULT_STYLE_SUFFIX
): Promise<Buffer> {
  const accessToken = deps.getAccessToken()
  const prompt = `${description}, ${styleSuffix}`
  const url = `https://${REGION}-aiplatform.googleapis.com/v1/projects/${projectId}/locations/${REGION}/publishers/google/models/${MODEL}:generateContent`
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))

  for (let attempt = 1; attempt <= MAX_RATE_LIMIT_ATTEMPTS; attempt++) {
    const response = await deps.fetchImpl(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      }),
    })

    if (response.status === 429) {
      if (attempt < MAX_RATE_LIMIT_ATTEMPTS) {
        await sleep(RATE_LIMIT_RETRY_DELAY_MS * attempt)
        continue
      }
      throw new Error(`Rate limited generating "${description}" after ${MAX_RATE_LIMIT_ATTEMPTS} attempts`)
    }

    if (!response.ok) {
      throw new Error(`Image generation failed for "${description}": ${response.status} ${await response.text()}`)
    }

    const data = (await response.json()) as GenerateContentResponse
    const imagePart = data.candidates?.[0]?.content?.parts?.find((part) => part.inlineData)

    if (!imagePart?.inlineData) {
      throw new Error(`No image returned for "${description}"`)
    }

    return Buffer.from(imagePart.inlineData.data, 'base64')
  }

  throw new Error(`Rate limited generating "${description}" after ${MAX_RATE_LIMIT_ATTEMPTS} attempts`)
}
