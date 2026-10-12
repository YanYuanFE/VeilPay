import { Monitor, Moon, Sun } from 'lucide-react'
import { cn } from 'cn'
import { useTheme, type ThemePref } from '@/lib/theme'

const OPTIONS: { pref: ThemePref; label: string; Icon: typeof Sun }[] = [
  { pref: 'system', label: 'System theme', Icon: Monitor },
  { pref: 'light', label: 'Light theme', Icon: Sun },
  { pref: 'dark', label: 'Dark theme', Icon: Moon },
]

export function ThemeToggle({ className }: { className?: string }) {
  const { pref, setPref } = useTheme()
  return (
    <div role="radiogroup" aria-label="Theme" className={cn('inline-flex items-center rounded-full border border-hairline p-0.5', className)}>
      {OPTIONS.map(({ pref: p, label, Icon }) => (
        <button
          key={p}
          type="button"
          role="radio"
          aria-checked={pref === p}
          aria-label={label}
          title={label}
          onClick={() => setPref(p)}
          className={cn(
            'grid size-8 place-items-center rounded-full text-muted-foreground transition-colors hover:text-foreground',
            pref === p && 'bg-secondary text-foreground',
          )}
        >
          <Icon className="size-3.5" />
        </button>
      ))}
    </div>
  )
}
