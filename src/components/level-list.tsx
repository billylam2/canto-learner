import type { LevelStatus } from '@/lib/game/level-status'
import { Card } from '@/components/ui/card'
import { LockedLevelCard } from '@/components/ui/locked-level-card'
import { StarRating } from '@/components/ui/star-rating'
import { LinkButton, Button } from '@/components/ui/button'
import { VOCAB_ITEMS } from '../../content/vocab'
import { SCENES } from '../../content/scenes'

const STARS_PER_ITEM = 3

const LEVEL_IDS_WITH_SCENES = new Set(SCENES.map((scene) => scene.levelId))

const MAX_STARS_BY_LEVEL = new Map<number, number>()
for (const item of VOCAB_ITEMS) {
  MAX_STARS_BY_LEVEL.set(item.level, (MAX_STARS_BY_LEVEL.get(item.level) ?? 0) + STARS_PER_ITEM)
}

interface LevelListProps {
  levels: LevelStatus[]
}

export function LevelList({ levels }: LevelListProps) {
  return (
    <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {levels.map((level) => (
        <li key={level.id}>
          {level.unlocked ? (
            <Card className="flex flex-col gap-2">
              <div className="flex items-center gap-1">
                <span className="text-xl font-extrabold text-brand-ink">{level.name} —</span>
                <StarRating stars={level.starsEarned} maxStars={MAX_STARS_BY_LEVEL.get(level.id)} />
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <LinkButton href={`/play/${level.id}`} variant="primary">
                  Listen &amp; Tap
                </LinkButton>
                {LEVEL_IDS_WITH_SCENES.has(level.id) &&
                  (level.sceneUnlocked ? (
                    <LinkButton href={`/play/${level.id}/scene`} variant="secondary">
                      Find in the Scene
                    </LinkButton>
                  ) : (
                    <span className="flex items-center gap-2">
                      <Button variant="secondary" disabled>
                        Find in the Scene
                      </Button>
                      <span className="text-sm text-gray-500">Finish Listen &amp; Tap first</span>
                    </span>
                  ))}
              </div>
            </Card>
          ) : (
            <LockedLevelCard name={level.name} />
          )}
        </li>
      ))}
    </ul>
  )
}
