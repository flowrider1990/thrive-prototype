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

/**
 * Keys that last for the visit and must never reach the device.
 *
 * `consent_concern` is what someone said when they declined saving. Keeping it in
 * memory is why `/data/stored/` can show their reason back to them; writing it down
 * would be the single write that proves the objection right.
 *
 * It is a property of the persisted shape, not of a screen, because the mode a fact
 * was written under does not stay fixed: saving can be turned on later from `/data/`,
 * and that hands the store a snapshot gathered while nothing was being written. So
 * `write()` in `store.ts` drops these on the way out — see the note there.
 */
export const MEMORY_ONLY_KEYS: readonly string[] = ['consent_concern']

export type PersonStore = {
  version: 1
  /** Only ever written when consent was given. */
  consentAt: string
  /**
   * Absent means "follow the browser", which is the state until someone uses the
   * language switch. Optional for exactly the reason `theme` is: a `version: 2` would
   * make `parse()` reject every existing store and discard real answers.
   *
   * An existing store always has this field, so anyone already using Thrive keeps the
   * language they have. That reads it as an explicit choice when it was really the
   * detected one, and that is the deliberate direction: it changes nothing for someone
   * mid-use, where the alternative could switch their language under them on an
   * upgrade.
   */
  locale?: Locale
  /**
   * Absent means "follow the operating system", which is the state until someone
   * touches the theme button. Optional rather than a `version: 2` on purpose: a
   * version bump would make `parse()` reject every existing store and silently
   * discard real answers.
   */
  theme?: Theme
  /**
   * Which of the start page's two views to open on. Absent means next steps.
   *
   * Optional for the reason `theme` and `locale` are: a `version: 2` would make `parse()`
   * reject every existing store. Only `'goals'` is ever written — the default leaves no
   * trace, so a person who never touched the toggle has nothing stored about it.
   */
  homeView?: 'goals'
  facts: PersonFact[]
}
