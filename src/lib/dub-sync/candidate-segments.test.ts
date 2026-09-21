import { describe, it, expect } from 'vitest'
import { cuesToCandidateSegments } from './candidate-segments'
import type { EpisodeAnchors } from './normalize'
import type { CaptionCue } from './captions'

const anchors: EpisodeAnchors = {
  cantoContentStart: 10,
  cantoContentEnd: 110,
  englishContentStart: 20,
  englishContentEnd: 220,
}

describe('cuesToCandidateSegments', () => {
  it('maps each cue within the anchor range to a candidate segment', () => {
    const cues: CaptionCue[] = [{ start: 10, end: 20, text: '你好' }]
    const result = cuesToCandidateSegments(cues, anchors)
    expect(result).toEqual([{ cantoStart: 10, cantoEnd: 20, englishStart: 20, englishEnd: 40 }])
  })

  it('drops cues that start before the content start anchor', () => {
    const cues: CaptionCue[] = [{ start: 5, end: 9, text: 'intro music' }]
    expect(cuesToCandidateSegments(cues, anchors)).toEqual([])
  })

  it('drops cues that end after the content end anchor', () => {
    const cues: CaptionCue[] = [{ start: 105, end: 115, text: 'outro' }]
    expect(cuesToCandidateSegments(cues, anchors)).toEqual([])
  })

  it('returns an empty array for no cues', () => {
    expect(cuesToCandidateSegments([], anchors)).toEqual([])
  })
})
