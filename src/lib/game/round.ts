export interface VocabGameItem {
  id: string
  slug: string
  audioUrl: string
  imageUrl: string
  homophoneGroup: string | null
}

export function buildRounds(items: VocabGameItem[], maxRoundSize = 4): VocabGameItem[][] {
  const roundCount = Math.ceil(items.length / maxRoundSize)
  const baseSize = Math.floor(items.length / roundCount)
  const remainder = items.length % roundCount

  const rounds: VocabGameItem[][] = []
  let cursor = 0
  for (let i = 0; i < roundCount; i++) {
    const size = baseSize + (i < remainder ? 1 : 0)
    rounds.push(items.slice(cursor, cursor + size))
    cursor += size
  }
  return rounds
}

export function pickDistractors(
  pool: VocabGameItem[],
  target: VocabGameItem,
  count: number,
  random: () => number = Math.random
): VocabGameItem[] {
  const candidates = pool.filter(
    (item) => item.id !== target.id && !(target.homophoneGroup && item.homophoneGroup === target.homophoneGroup)
  )

  const shuffled = [...candidates].sort(() => random() - 0.5)
  return shuffled.slice(0, count)
}
