import { Card } from './card'

interface LockedLevelCardProps {
  name: string
  unlockThreshold?: number
}

export function LockedLevelCard({ name, unlockThreshold }: LockedLevelCardProps) {
  return (
    <Card muted>
      <span className="font-bold text-gray-500">
        🔒 {name} — locked{unlockThreshold !== undefined && <> (unlocks at {unlockThreshold} stars)</>}
      </span>
    </Card>
  )
}
