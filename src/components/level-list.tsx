import type { LevelStatus } from '@/lib/game/level-status'
import { Card } from '@/components/ui/card'
import { LockedLevelCard } from '@/components/ui/locked-level-card'
import { StarRating } from '@/components/ui/star-rating'
import { LinkButton } from '@/components/ui/button'
import { SCENES } from '../../content/scenes'

const LEVEL_IDS_WITH_SCENES = new Set(SCENES.map((scene) => scene.levelId))

interface LevelListProps {
  levels: LevelStatus[]
}

export function LevelList({ levels }: LevelListProps) {
  return (
    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {levels.map((level) => (
        <li key={level.id}>
          {level.unlocked ? (
            <Card className="flex flex-col gap-2">
              <div className="flex items-center gap-1">
                <span className="text-xl font-extrabold text-brand-ink">{level.name} —</span>
                <StarRating stars={level.starsEarned} />
              </div>
              <div className="flex flex-wrap gap-2 mt-1">
                <LinkButton href={`/play/${level.id}`} variant="primary">
                  Listen &amp; Tap
                </LinkButton>
                {LEVEL_IDS_WITH_SCENES.has(level.id) && (
                  <LinkButton href={`/play/${level.id}/scene`} variant="secondary">
                    Find in the Scene
                  </LinkButton>
                )}
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
