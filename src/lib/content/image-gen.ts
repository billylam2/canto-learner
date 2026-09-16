import { execFileSync } from 'node:child_process'

const MODEL = 'gemini-2.5-flash-image'
const REGION = 'us-central1'
export const DEFAULT_STYLE_SUFFIX =
  'cute flat cartoon illustration, thick black outlines, solid bright colors, simple white background, no text, centered'

export interface ImageGenDeps {
  getAccessToken: () => string
  fetchImpl: typeof fetch
}

export function createImageGenDeps(): ImageGenDeps {
  return {
    getAccessToken: () =>
      execFileSync('gcloud', ['auth', 'application-default', 'print-access-token'], {
        encoding: 'utf-8',
      }).trim(),
    fetchImpl: fetch,
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
