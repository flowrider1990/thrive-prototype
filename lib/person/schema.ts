import type { Locale } from '@/lib/i18n/locale'
import type { Theme } from '@/lib/theme'

/**
 * The persisted shape and its key, in a leaf module with no React and no
 * `'use client'`.
 *
 * Kept separate from `store.ts` so server code can import the key: the theme
 * bootstrap script in `app/layout.tsx` needs it, and importing a value from a
 * client module into a server component is a build error in the App Router. The
 * alternative — writing the key literally into the layout — would create a
 * second copy of the one string `docs/renaming.md` says must never drift.
 *
 * `store.ts` re-exports everything here, so callers can keep importing from the
 * store as the single storage boundary.
 */

/**
 * The key tracks neither the product name nor the package name, so renaming
 * either never orphans someone's saved answers. A rename must leave this string
 * exactly as it is — see `lib/app.ts` and `docs/renaming.md`. Changing it is a
 * migration with a version bump, never a find-and-replace.
 */
export const STORAGE_KEY = 'thrive.person.v1'

export type PersonFact = {
  id: string
  key: string
  /** The person's own words, verbatim and unparsed. */
  value: string
  /** How it came up — 'onboarding' for now. */
  source: string
  learnedAt: string
}

export type PersonStore = {
  version: 1
  /** Only ever written when consent was given. */
  consentAt: string
  locale: Locale
  /**
   * Absent means "follow the operating system", which is the state until someone
   * touches the theme button. Optional rather than a `version: 2` on purpose: a
   * version bump would make `parse()` reject every existing store and silently
   * discard real answers.
   */
  theme?: Theme
  facts: PersonFact[]
}
