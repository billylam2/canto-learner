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

export function cantoTimeFor(englishT: number, anchors: EpisodeAnchors): number {
  const { cantoContentStart, cantoContentEnd, englishContentStart, englishContentEnd } = anchors
  const englishSpan = englishContentEnd - englishContentStart

  if (englishSpan <= 0) {
    throw new Error('Invalid anchors: englishContentEnd must be after englishContentStart')
  }

  const ratio = (englishT - englishContentStart) / englishSpan
  return cantoContentStart + ratio * (cantoContentEnd - cantoContentStart)
}
