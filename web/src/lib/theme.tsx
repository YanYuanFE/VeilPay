import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type ThemePref = 'system' | 'light' | 'dark'
export type Theme = 'light' | 'dark'

const KEY = 'vp_theme'
const media = () => window.matchMedia('(prefers-color-scheme: light)')

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system' // storage blocked (private mode): follow the OS
  }
}

/** Mirrors the inline script in index.html, which sets the same attributes before first paint. */
function apply(theme: Theme) {
  document.documentElement.dataset.theme = theme
  document.documentElement.classList.toggle('dark', theme === 'dark')
}

type Ctx = { pref: ThemePref; theme: Theme; setPref: (p: ThemePref) => void }
const ThemeContext = createContext<Ctx | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pref, setPrefState] = useState<ThemePref>(readPref)
  const [systemLight, setSystemLight] = useState(() => media().matches)

  useEffect(() => {
    const m = media()
    const onChange = () => setSystemLight(m.matches)
    m.addEventListener('change', onChange)
    return () => m.removeEventListener('change', onChange)
  }, [])

  const theme: Theme = pref === 'system' ? (systemLight ? 'light' : 'dark') : pref
  useEffect(() => apply(theme), [theme])

  const value = useMemo<Ctx>(() => ({
    pref,
    theme,
    setPref: (p) => {
      setPrefState(p)
      try {
        if (p === 'system') localStorage.removeItem(KEY)
        else localStorage.setItem(KEY, p)
      } catch {
        // storage blocked: the choice lasts for this page view only
      }
    },
  }), [pref, theme])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): Ctx {
  const t = useContext(ThemeContext)
  if (!t) throw new Error('useTheme outside ThemeProvider')
  return t
}
