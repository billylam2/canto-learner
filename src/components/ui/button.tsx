import Link from 'next/link'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

const BASE =
  'inline-block font-bold border-[3px] border-brand-ink rounded-[14px] px-5 py-2.5 shadow-[3px_3px_0_0_#1A1A1A] active:translate-x-[2px] active:translate-y-[2px] active:shadow-[1px_1px_0_0_#1A1A1A] transition-transform disabled:opacity-50 disabled:cursor-not-allowed text-center'

const VARIANTS = {
  primary: 'bg-brand-primary text-white',
  secondary: 'bg-white text-brand-ink',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary'
  children: ReactNode
}

export function Button({ variant = 'primary', className = '', children, ...rest }: ButtonProps) {
  return (
    <button className={`${BASE} ${VARIANTS[variant]} ${className}`} {...rest}>
      {children}
    </button>
  )
}

interface LinkButtonProps {
  href: string
  variant?: 'primary' | 'secondary'
  children: ReactNode
  className?: string
}

export function LinkButton({ href, variant = 'primary', children, className = '' }: LinkButtonProps) {
  return (
    <Link href={href} className={`${BASE} ${VARIANTS[variant]} ${className}`}>
      {children}
    </Link>
  )
}
