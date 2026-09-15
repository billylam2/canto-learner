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

// A deterministic pseudo-random generator seeded by a string, so the same
// seed always produces the same sequence. `ListenTapGame` seeds this with
// the current question's item id: since this component is server-rendered
// then hydrated on the client, a true Math.random() call inside its render
// would produce different results on the server pass vs. the client pass,
// causing a hydration mismatch where the displayed choice order doesn't
// match which choice each click handler is actually bound to.
export function createSeededRandom(seed: string): () => number {
  let state = 0
  for (let i = 0; i < seed.length; i++) {
    state = (state * 31 + seed.charCodeAt(i)) >>> 0
  }
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0xffffffff
  }
}

// Fisher-Yates: makes exactly items.length - 1 calls to `random`, in a fixed
// order, regardless of JS engine — unlike `.sort(() => random() - 0.5)`,
// whose comparator call count/order is engine-defined and can differ
// between Node (server) and a browser (client), breaking determinism even
// with a seeded `random`.
export function shuffleItems<T>(items: T[], random: () => number = Math.random): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
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

  return shuffleItems(candidates, random).slice(0, count)
}
