export interface EpisodeAnchors {
  cantoContentStart: number
  cantoContentEnd: number
  englishContentStart: number
  englishContentEnd: number
}

export function englishTimeFor(cantoT: number, anchors: EpisodeAnchors): number {
  const { cantoContentStart, cantoContentEnd, englishContentStart, englishContentEnd } = anchors
  const cantoSpan = cantoContentEnd - cantoContentStart

  if (cantoSpan <= 0) {
    throw new Error('Invalid anchors: cantoContentEnd must be after cantoContentStart')
  }

  const ratio = (cantoT - cantoContentStart) / cantoSpan
  return englishContentStart + ratio * (englishContentEnd - englishContentStart)
}
