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

/**
 * What this device knows about the cloud copy, and nothing more.
 *
 * It is **bookkeeping, not data**: every value here can be thrown away and rebuilt by
 * reading the account again, which is what makes it safe to store next to real answers.
 *
 * `synced` is the whole loop guard (`docs/supabase-migration.md` §14, and §17 of the
 * cloud-sync brief). A fact that arrived *from* the cloud is written to the device and
 * marked synced in the same commit, so the push that runs on the next change finds
 * nothing new to send. There is no "am I hydrating?" flag to forget to set, because the
 * marker travels with the facts rather than with the moment.
 *
 * Kept as ids rather than as a timestamp high-water mark on purpose: `learnedAt` comes
 * from whichever device wrote it, so one skewed clock would make a mark quietly skip
 * everything after it. Ids cost ~40 bytes each and cannot be wrong.
 */
export type CloudMark = {
  /**
   * The account these markers describe. Ids mean nothing for a different account, so a
   * sign-in as somebody else discards the whole record rather than trusting part of it.
   */
  userId: string
  /**
   * The dataset generation this device is a copy of.
   *
   * **This is what makes "replace" mean replaced.** When somebody chooses one copy over
   * the other, the account mints a new generation; every other device is still marked
   * with the old one, and on reconnecting discovers that its copy is superseded rather
   * than merging it back in. Without it, append-only facts and a set-union merge quietly
   * resurrect a dataset that was deliberately discarded — see `lib/cloud/generations.ts`.
   *
   * Optional only for stores written before generations existed: absent means "no idea",
   * which reconciles as a first contact rather than as a peer. That is the safe reading —
   * it asks rather than assumes — and it is why this is not a `version: 2`.
   */
  generation?: string
  /**
   * Fact ids known to exist in that account's copy **of that generation**.
   *
   * Reset rather than merged whenever the generation changes: ids from a superseded
   * dataset say nothing about what the new one holds, and carrying them over would mean
   * a device believed its facts were uploaded when they had been discarded.
   */
  synced: string[]
  /** When the device last agreed with the server, for the quiet line on `/data/`. */
  at?: string
}

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
  /**
   * What the device knows about the cloud copy. Absent means it has never been signed
   * in — the ordinary state, and the reason this is optional rather than a `version: 2`,
   * exactly as `theme` and `locale` are: a bump would make `parse()` reject every store
   * written before cloud sync existed and silently discard real answers.
   */
  cloud?: CloudMark
  facts: PersonFact[]
}
