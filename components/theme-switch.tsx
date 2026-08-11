'use client'

import { useEffect, useSyncExternalStore } from 'react'
import { useI18n } from '@/lib/i18n'
import { usePerson } from '@/lib/person/store'

const DARK_QUERY = '(prefers-color-scheme: dark)'

function subscribeSystem(onChange: () => void): () => void {
  const query = window.matchMedia(DARK_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

function getSystemDark(): boolean {
  return window.matchMedia(DARK_QUERY).matches
}

function getServerSystemDark(): boolean {
  // The build cannot know, and says so rather than guessing.
  return false
}

/**
 * Toggles light and dark, and keeps `data-theme` on `<html>` in step.
 *
 * Three states exist even though the button has two: until someone presses it,
 * nothing is stored and the operating system decides. That is why the icon shows
 * the **effective** theme — the OS preference when there is no choice yet — rather
 * than a stored value that usually does not exist. Pressing it stores the
 * opposite, and from then on this app ignores the OS. `Forget everything` is the
 * way back to following it.
 */
export function ThemeSwitch() {
  const { m, t } = useI18n()
  const { theme, setTheme } = usePerson()

  // A media query is external mutable state, like the store: subscribing beats an
  // effect that copies it into React state, and it keeps the OS preference live
  // while no explicit choice exists.
  const systemDark = useSyncExternalStore(subscribeSystem, getSystemDark, getServerSystemDark)

  const effective = theme ?? (systemDark ? 'dark' : 'light')
  const target = effective === 'dark' ? 'light' : 'dark'

  useEffect(() => {
    // The bootstrap script in `app/layout.tsx` already did this before the first
    // paint; this keeps it true afterwards, including when a choice is forgotten.
    const root = document.documentElement

    // Applying the new palette is one attribute change, but it inverts every
    // colour token at once — and anything carrying `transition-colors` would
    // interpolate across that inversion, which is the visible flash. So the
    // whole page gets transitions switched off for exactly the frame that
    // carries the change (see `:root[data-theme-switching]` in globals.css).
    //
    // The order matters: suppress, mutate, then read a layout property to force
    // the style recalculation to happen *now*, while the suppression still
    // applies. Without that read, the browser could batch both changes into one
    // recalc and start the transitions anyway.
    root.dataset.themeSwitching = ''

    if (theme) root.dataset.theme = theme
    else delete root.dataset.theme

    void root.offsetHeight

    const frame = requestAnimationFrame(() => {
      delete root.dataset.themeSwitching
    })
    return () => {
      cancelAnimationFrame(frame)
      // Never leave the page with transitions suppressed, even if the frame
      // never arrives because the theme changed again or this unmounted.
      delete root.dataset.themeSwitching
    }
  }, [theme])

  return (
    <button
      type="button"
      onClick={() => setTheme(target)}
      aria-label={t(m.theme.switchTo, { theme: m.theme[target] })}
      title={t(m.theme.switchTo, { theme: m.theme[target] })}
      className="inline-flex items-center justify-center rounded-full border border-line p-1.5 text-muted transition-colors hover:border-muted hover:text-ink"
    >
      {effective === 'dark' ? <MoonIcon /> : <SunIcon />}
    </button>
  )
}

function SunIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <circle cx="10" cy="10" r="3.5" />
      <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.4 4.4l1.4 1.4M14.2 14.2l1.4 1.4M15.6 4.4l-1.4 1.4M5.8 14.2l-1.4 1.4" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      aria-hidden="true"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M16.5 12.6A7 7 0 0 1 7.4 3.5a7 7 0 1 0 9.1 9.1Z" />
    </svg>
  )
}
