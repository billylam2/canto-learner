import { Baloo_2 } from 'next/font/google'
import { ThemeToggle } from '@/components/theme-toggle'
import './globals.css'

const baloo2 = Baloo_2({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
  variable: '--font-baloo',
})

export const metadata = {
  title: 'Canto Learner',
}

// Applies a persisted theme choice before first paint, so there's no flash of the other theme
// while React hydrates. Reads directly from localStorage rather than importing the toggle's own
// constant, since this has to run as a plain inline script, before any of our JS bundles load.
const noFlashThemeScript = `
(function () {
  try {
    if (localStorage.getItem('theme') === 'dark') {
      document.documentElement.classList.add('dark')
    }
  } catch (e) {}
})()
`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The no-flash script above mutates this element's class before React hydrates, so the
    // server-rendered class attribute (never "dark") legitimately won't match the client's —
    // suppressHydrationWarning tells React that's expected instead of logging a mismatch.
    <html lang="en" className={baloo2.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: noFlashThemeScript }} />
      </head>
      <body>
        <ThemeToggle />
        {children}
      </body>
    </html>
  )
}
