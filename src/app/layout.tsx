import { Baloo_2 } from 'next/font/google'
import './globals.css'

const baloo2 = Baloo_2({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
  variable: '--font-baloo',
})

export const metadata = {
  title: 'Canto Learner',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={baloo2.variable}>
      <body>{children}</body>
    </html>
  )
}
