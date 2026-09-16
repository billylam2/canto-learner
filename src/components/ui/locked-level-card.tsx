import { Card } from './card'

interface LockedLevelCardProps {
  name: string
}

export function LockedLevelCard({ name }: LockedLevelCardProps) {
  return (
    <Card muted>
      <span className="font-bold text-gray-500">🔒 {name} — locked</span>
    </Card>
  )
}
