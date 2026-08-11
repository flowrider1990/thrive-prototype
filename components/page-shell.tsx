'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { APP_NAME } from '@/lib/app'
import { useI18n } from '@/lib/i18n'
import { LanguageSwitch } from './language-switch'
import { Check, Menu, menuItemClass } from './menu'
import { ThemeSwitch } from './theme-switch'

/**
 * `trailingSlash: true` means the browser is on `/you/` while the links are
 * written as `/you`, and `basePath` is already stripped from what `usePathname`
 * returns. Comparing normalised forms keeps both ends readable.
 */
function samePath(a: string, b: string): boolean {
  const trim = (path: string) => path.replace(/\/+$/, '') || '/'
  return trim(a) === trim(b)
}

/**
 * The frame every page sits in. Its chrome waits for `status === 'ready'` for
 * the same reason the pages do: the prerendered HTML cannot know the language,
 * and half-translated furniture is worse than none for a frame.
 */
export function PageShell({ children }: { children: ReactNode }) {
  const { m, status } = useI18n()
  const ready = status === 'ready'
  const pathname = usePathname()

  // Defined once and rendered twice — inline on wide screens, inside the dropdown
  // on narrow ones — so a new entry never has to be added in two places.
  const navLinks = [
    { href: '/you', label: m.nav.you },
    { href: '/about', label: m.nav.about },
  ].map((link) => ({ ...link, current: samePath(pathname, link.href) }))

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line">
        {/* No `flex-wrap`: the nav collapsing below `sm` is what keeps this to one
            row now, and wrapping was the thing that looked broken on a phone. */}
        <div className="mx-auto flex w-full max-w-2xl items-center gap-x-4 px-6 py-5 sm:gap-x-6">
          {ready && (
            <>
              <Link
                href="/"
                className="text-sm font-medium tracking-wide text-ink transition-colors hover:text-accent"
              >
                {APP_NAME}
              </Link>

              <nav className="hidden items-center gap-5 text-sm sm:flex">
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    // The state lives in `aria-current`, and `.nav-link` styles
                    // off it: one source of truth for the underline and for a
                    // screen reader, rather than a class saying one thing and
                    // the accessibility tree another.
                    aria-current={link.current ? 'page' : undefined}
                    className="nav-link"
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>

              {/* Same links, collapsed. Future entries land here at no cost to the
                  header's width, which is the point of collapsing rather than
                  shrinking. */}
              <div className="sm:hidden">
                <Menu label={m.nav.menu} align="start" trigger={<MenuIcon />}>
                  {(close) =>
                    navLinks.map((link) => (
                      <Link
                        key={link.href}
                        href={link.href}
                        onClick={close}
                        aria-current={link.current ? 'page' : undefined}
                        // Same tick as the language panel uses, for the same
                        // reason: §17 forbids marking a state by colour alone,
                        // and the slot is always there so nothing shifts.
                        className={`${menuItemClass} ${link.current ? 'text-ink' : ''}`}
                      >
                        <Check checked={link.current} />
                        {link.label}
                      </Link>
                    ))
                  }
                </Menu>
              </div>

              <div className="ms-auto flex items-center gap-2">
                <LanguageSwitch />
                <ThemeSwitch />
              </div>
            </>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-16 sm:py-24">{children}</main>

      <footer className="border-t border-line">
        <div className="mx-auto w-full max-w-2xl px-6 py-6">
          {ready && <p className="text-xs leading-relaxed text-muted">{m.app.description}</p>}
        </div>
      </footer>
    </div>
  )
}

function MenuIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" />
    </svg>
  )
}
