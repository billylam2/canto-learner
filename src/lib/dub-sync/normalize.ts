export interface EpisodeAnchors {
  cantoContentStart: number
  cantoContentEnd: number
  englishContentStart: number
  englishContentEnd: number
}

export interface ResyncCheckpoint {
  cantoTime: number
  englishTime: number
}

// The original two-anchor line, unaffected by any checkpoint — used both as englishTimeFor's
// answer before any checkpoint has been reached, and to work out each checkpoint's own shift.
function baseEnglishTime(cantoT: number, anchors: EpisodeAnchors): number {
  const { cantoContentStart, cantoContentEnd, englishContentStart, englishContentEnd } = anchors
  const cantoSpan = cantoContentEnd - cantoContentStart

  if (cantoSpan <= 0) {
    throw new Error('Invalid anchors: cantoContentEnd must be after cantoContentStart')
  }

  const ratio = (cantoT - cantoContentStart) / cantoSpan
  return englishContentStart + ratio * (englishContentEnd - englishContentStart)
}

// The checkpoint with the greatest cantoTime that is still <= cantoT — the last one "encountered"
// by the time playback reaches cantoT — or null if cantoT is before all of them (or there are
// none).
function mostRecentCheckpoint(checkpoints: ResyncCheckpoint[], cantoT: number): ResyncCheckpoint | null {
  let active: ResyncCheckpoint | null = null
  for (const checkpoint of checkpoints) {
    if (checkpoint.cantoTime > cantoT) continue
    if (!active || checkpoint.cantoTime > active.cantoTime) active = checkpoint
  }
  return active
}

export function englishTimeFor(
  cantoT: number,
  anchors: EpisodeAnchors,
  checkpoints: ResyncCheckpoint[] = []
): number {
  const base = baseEnglishTime(cantoT, anchors)
  const active = mostRecentCheckpoint(checkpoints, cantoT)
  if (!active) return base

  const shift = active.englishTime - baseEnglishTime(active.cantoTime, anchors)
  return base + shift
}
