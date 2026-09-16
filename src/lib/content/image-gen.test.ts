import { describe, it, expect, vi } from 'vitest'
import { generateImage, DEFAULT_STYLE_SUFFIX, type ImageGenDeps } from './image-gen'

function makeDeps(overrides: { status?: number; body?: unknown; text?: string }): ImageGenDeps {
  const fetchImpl = vi.fn().mockResolvedValue({
    ok: (overrides.status ?? 200) < 300,
    status: overrides.status ?? 200,
    json: async () => overrides.body,
    text: async () => overrides.text ?? '',
  })
  return {
    getAccessToken: () => 'fake-token',
    fetchImpl: fetchImpl as unknown as typeof fetch,
  }
}

describe('generateImage', () => {
  it('returns the decoded image buffer on success', async () => {
    const deps = makeDeps({
      body: {
        candidates: [
          {
            content: {
              parts: [
                { text: 'here you go' },
                { inlineData: { mimeType: 'image/png', data: Buffer.from('fake-image').toString('base64') } },
              ],
            },
          },
        ],
      },
    })
    const result = await generateImage('proj-1', 'a cute cat', deps)
    expect(result.toString()).toBe('fake-image')
  })

  it('includes the shared style suffix and the description in the prompt', async () => {
    const deps = makeDeps({
      body: { candidates: [{ content: { parts: [{ inlineData: { data: Buffer.from('x').toString('base64') } }] } }] },
    })
    await generateImage('proj-1', 'a cute cat', deps)
    const call = vi.mocked(deps.fetchImpl).mock.calls[0]
    const body = JSON.parse((call[1] as RequestInit).body as string)
    const prompt = body.contents[0].parts[0].text as string
    expect(prompt).toContain('a cute cat')
    expect(prompt).toContain('thick black outlines')
  })

  it('sends the request to the given project id', async () => {
    const deps = makeDeps({
      body: { candidates: [{ content: { parts: [{ inlineData: { data: Buffer.from('x').toString('base64') } }] } }] },
    })
    await generateImage('my-project-123', 'a cute cat', deps)
    const url = vi.mocked(deps.fetchImpl).mock.calls[0][0] as string
    expect(url).toContain('my-project-123')
    expect(url).toContain('gemini-2.5-flash-image')
  })

  it('throws when the API call fails', async () => {
    const deps = makeDeps({ status: 500, text: 'server error' })
    await expect(generateImage('proj-1', 'a cute cat', deps)).rejects.toThrow('Image generation failed')
  })

  it('throws when no image is returned', async () => {
    const deps = makeDeps({ body: { candidates: [{ content: { parts: [{ text: 'no image sorry' }] } }] } })
    await expect(generateImage('proj-1', 'a cute cat', deps)).rejects.toThrow('No image returned')
  })

  it('uses a custom style suffix when one is provided, instead of the default', async () => {
    const deps = makeDeps({
      body: { candidates: [{ content: { parts: [{ inlineData: { data: Buffer.from('x').toString('base64') } }] } }] },
    })
    await generateImage('proj-1', 'a big dog and small cat', deps, 'flat cartoon style, no text')
    const call = vi.mocked(deps.fetchImpl).mock.calls[0]
    const body = JSON.parse((call[1] as RequestInit).body as string)
    const prompt = body.contents[0].parts[0].text as string
    expect(prompt).toContain('a big dog and small cat')
    expect(prompt).toContain('flat cartoon style, no text')
    expect(prompt).not.toContain('simple white background')
  })

  it('exports the default style suffix used by vocab-icon generation', () => {
    expect(DEFAULT_STYLE_SUFFIX).toContain('simple white background')
  })
})
