import type { ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
  muted?: boolean
}

export function Card({ children, className = '', muted = false }: CardProps) {
  const base = 'border-4 rounded-[20px] p-4 shadow-[4px_4px_0_0_#1A1A1A]'
  const tone = muted ? 'bg-gray-100 border-gray-400 opacity-70' : 'bg-white border-brand-ink'
  return <div className={`${base} ${tone} ${className}`}>{children}</div>
}
