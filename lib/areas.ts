/**
 * The life areas, as ids and nothing else.
 *
 * These strings are persisted inside fact keys (`area.body.goal`), so they carry
 * the same rule as `STORAGE_KEY`: renaming one orphans everything stored under it,
 * invisibly. Renaming is a migration, not an edit. **Adding** one is safe for the
 * store — no existing key changes — but see `LEGACY_AREAS` below for the thing it
 * used to break instead.
 *
 * Names live in the message catalogs and emoji in `components/area-icon.tsx`, so
 * how an area looks or reads can change freely while what is stored stays put.
 * `body` therefore reads as "Physical Health" while keeping the id it was given.
 *
 * **Order is presentation, not data.** It drives the sequence the introduction asks
 * in and the order of the progress marks, and nothing else — so `mind` sits beside
 * `body` because the two health areas being adjacent is the only thing the ordering
 * says. Reordering is free; renaming is not.
 */
export const areas = [
  'body',
  'mind',
  'relationships',
  'work',
  'finances',
  'creativity',
] as const

export type AreaId = (typeof areas)[number]

/**
 * The areas that existed before the introduction recorded its own completion.
 *
 * **This list must never grow.** It is not "the important areas" or "the original
 * five" as a matter of taste — it is the only remaining answer to *what did
 * finishing the introduction mean, for a store written before we wrote it down*.
 *
 * `introductionFinished()` reads a real fact first and falls back to this. Adding
 * an area here would re-open the trap the fact exists to close: every store that
 * finished under the old rules would count as unfinished again, dropping people
 * back into onboarding and taking the navigation with it.
 *
 * See `docs/goals-and-areas.md`, "Introduction state".
 */
export const LEGACY_AREAS: readonly AreaId[] = [
  'body',
  'relationships',
  'work',
  'finances',
  'creativity',
]

export function isAreaId(value: unknown): value is AreaId {
  return typeof value === 'string' && (areas as readonly string[]).includes(value)
}
