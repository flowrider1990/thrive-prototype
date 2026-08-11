'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { APP_NAME } from '@/lib/app'
import { useI18n } from '@/lib/i18n'
import { LanguageSwitch } from './language-switch'

/**
 * The frame every page sits in. Its chrome waits for `status === 'ready'` for
 * the same reason the pages do: the prerendered HTML cannot know the language,
 * and half-translated furniture is worse than none for a frame.
 */
export function PageShell({ children }: { children: ReactNode }) {
  const { m, status } = useI18n()
  const ready = status === 'ready'

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-line">
        <div className="mx-auto flex w-full max-w-2xl flex-wrap items-center gap-x-6 gap-y-3 px-6 py-5">
          {ready && (
            <>
              <Link
                href="/"
                className="text-sm font-medium tracking-wide text-ink transition-colors hover:text-accent"
              >
                {APP_NAME}
              </Link>
              <nav className="flex items-center gap-5 text-sm text-muted">
                <Link href="/you" className="transition-colors hover:text-ink">
                  {m.nav.you}
                </Link>
                <Link href="/about" className="transition-colors hover:text-ink">
                  {m.nav.about}
                </Link>
              </nav>
              <div className="ms-auto">
                <LanguageSwitch />
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
