'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { APP_NAME } from '@/lib/app'
import { openSignIn, stopSync, useSync } from '@/lib/cloud/sync'
import { useI18n } from '@/lib/i18n'
import { introductionFinished } from '@/lib/person/goals'
import { usePerson } from '@/lib/person/store'
import { LanguageSwitch } from './language-switch'
import { Check, Menu, menuItemClass } from './menu'
import { SignInDialog } from './sign-in-dialog'
import { ThemeSwitch } from './theme-switch'

const trim = (path: string) => path.replace(/\/+$/, '') || '/'

/**
 * `trailingSlash: true` means the browser is on `/you/` while the links are
 * written as `/you`, and `basePath` is already stripped from what `usePathname`
 * returns. Comparing normalised forms keeps both ends readable.
 */
function samePath(a: string, b: string): boolean {
  return trim(a) === trim(b)
}

/**
 * Anywhere at or under this path.
 *
 * `/areas` has children, and an exact match would drop its underline the moment you
 * opened an area — the nav would claim you were nowhere. Declared per link rather
 * than applied globally, because a naive prefix test matches every path against `/`
 * and would mark Home current on every page in the app.
 */
function inSection(pathname: string, href: string): boolean {
  const here = trim(pathname)
  const section = trim(href)
  return here === section || here.startsWith(`${section}/`)
}

/**
 * The frame every page sits in. Its chrome waits for `status === 'ready'` for
 * the same reason the pages do: the prerendered HTML cannot know the language,
 * and half-translated furniture is worse than none for a frame.
 */
export function PageShell({ children }: { children: ReactNode }) {
  const { m, status } = useI18n()
  const person = usePerson()
  const sync = useSync()
  const ready = status === 'ready'
  const pathname = usePathname()

  // Nothing to navigate *to* until the introduction is over: the destinations exist
  // but are empty, and offering a half-filled Life Areas page mid-introduction is a
  // worse first impression than offering nothing.
  //
  // Derived from the person, not from `localStorage`, so it holds in memory mode
  // too — someone who declined saving still finishes the introduction and still
  // gets the navigation.
  //
  // The routes themselves are **not** gated. Gating one would mean a client-side
  // redirect, which is a flash, which `CLAUDE.md` §9 rules out.
  const navigable = ready && introductionFinished(person)

  // Defined once and rendered twice — inline on wide screens, inside the dropdown
  // on narrow ones — so a new entry never has to be added in two places.
  // About is not here. It is read once and then never again, so it does not earn a
  // permanent slot next to the three places someone actually returns to — it lives
  // in the footer instead, where it is also reachable *during* the introduction.
  const navLinks = navigable
    ? [
        // Exact, or it would match everything.
        { href: '/', label: m.nav.home, current: samePath(pathname, '/') },
        { href: '/areas', label: m.nav.areas, current: inSection(pathname, '/areas') },
        { href: '/data', label: m.nav.data, current: inSection(pathname, '/data') },
      ]
    : []

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

              {navLinks.length > 0 && (
                <>
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
                </>
              )}

              {/* Never gated. The copy rules require the language switch on every
                  screen — nobody should have to agree to something in a language
                  they did not choose — and the theme toggle keeps it company so the
                  header does not restructure when the nav appears. Checks 22 and 23
                  select the toggle by name and would fail confusingly if it were
                  ever conditional. */}
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
        {/* About sits here rather than in the nav, and unlike the nav it is never
            gated: during the introduction the header has no links at all, and the
            one page explaining what this is should not be the thing you cannot
            reach while deciding whether to trust it. */}
        <div className="mx-auto flex w-full max-w-2xl flex-wrap items-baseline justify-between gap-x-6 gap-y-2 px-6 py-6">
          {ready && (
            <>
              <p className="max-w-prose text-xs leading-relaxed text-muted">{m.app.description}</p>
              <div className="flex items-baseline gap-x-5">
                {/* The one item in the app that changes what it says rather than whether
                    it is there. Two words for two states: somebody checking whether they
                    are signed in can read the answer instead of clicking to find out.

                    Shown only where an account is possible at all — a build with no
                    project attached, or somebody who asked for nothing to be written to
                    this device, is offered nothing rather than a control that can only
                    explain itself. The switch on `/data/` is where that explanation
                    lives, next to the setting it belongs to.

                    Both this and that switch call `stopSync()`, which is what makes the
                    two doors end in the same state rather than in two states that look
                    alike. */}
                {sync.available && (sync.syncing || person.mode === 'local') && (
                  <button
                    type="button"
                    className="nav-link text-xs"
                    disabled={sync.busy !== null}
                    onClick={() => (sync.syncing ? void stopSync() : openSignIn())}
                  >
                    {sync.syncing ? m.nav.signOut : m.nav.signIn}
                  </button>
                )}
                <Link
                  href="/about"
                  aria-current={samePath(pathname, '/about') ? 'page' : undefined}
                  className="nav-link text-xs"
                >
                  {m.nav.about}
                </Link>
              </div>
            </>
          )}
        </div>
      </footer>

      {/* Mounted once for the whole app, and inert until something opens it: two copies
          would be two answers to "is the sign-in open". It renders nothing at all until
          `showModal()` is called on it. */}
      {ready && sync.available && <SignInDialog />}
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
