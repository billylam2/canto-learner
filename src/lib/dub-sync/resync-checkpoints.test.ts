import { describe, it, expect } from 'vitest'
import { validateCheckpointOrder } from './resync-checkpoints'
import type { EpisodeAnchors } from './normalize'

const anchors: EpisodeAnchors = {
  cantoContentStart: 10,
  cantoContentEnd: 110,
  englishContentStart: 20,
  englishContentEnd: 220,
}

describe('validateCheckpointOrder', () => {
  it('accepts a checkpoint within the content span with no existing checkpoints', () => {
    expect(validateCheckpointOrder(anchors, [], { cantoTime: 60, englishTime: 100 })).toBeNull()
  })

  it('accepts a checkpoint that does not collide with an existing one', () => {
    const others = [{ cantoTime: 60, englishTime: 100 }]
    expect(validateCheckpointOrder(anchors, others, { cantoTime: 90, englishTime: 150 })).toBeNull()
  })

  it('rejects a checkpoint at or before cantoContentStart', () => {
    expect(validateCheckpointOrder(anchors, [], { cantoTime: 10, englishTime: 20 })).toBe(
      'Checkpoint must fall within the marked content'
    )
    expect(validateCheckpointOrder(anchors, [], { cantoTime: 5, englishTime: 20 })).toBe(
      'Checkpoint must fall within the marked content'
    )
  })

  it('rejects a checkpoint at or after cantoContentEnd', () => {
    expect(validateCheckpointOrder(anchors, [], { cantoTime: 110, englishTime: 200 })).toBe(
      'Checkpoint must fall within the marked content'
    )
  })

  it("rejects a checkpoint colliding with an existing checkpoint's exact cantoTime", () => {
    const others = [{ cantoTime: 60, englishTime: 100 }]
    expect(validateCheckpointOrder(anchors, others, { cantoTime: 60, englishTime: 105 })).toBe(
      'A checkpoint already exists at that Cantonese time'
    )
  })

  it("allows editing a checkpoint back onto its own prior cantoTime (excluded from otherCheckpoints)", () => {
    // Simulates a PATCH: the checkpoint being edited must be excluded from otherCheckpoints by
    // the caller before validating, so re-saving it unchanged doesn't collide with itself.
    const others: Array<{ cantoTime: number; englishTime: number }> = []
    expect(validateCheckpointOrder(anchors, others, { cantoTime: 60, englishTime: 100 })).toBeNull()
  })

  it('does not constrain englishTime relative to other checkpoints (backward corrections allowed)', () => {
    const others = [{ cantoTime: 60, englishTime: 150 }]
    expect(validateCheckpointOrder(anchors, others, { cantoTime: 90, englishTime: 100 })).toBeNull()
  })
})
