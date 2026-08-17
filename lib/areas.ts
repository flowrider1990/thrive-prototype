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
 * in and the order of the progress marks, and nothing else. It runs roughly outward
 * from the person — the two health areas adjacent, then the people around them, then the
 * place those people are shared with, then what they spend their days on — and ends on
 * `finances`, which reads as "Absicherung & Freiheit" and asks about the longest horizon
 * of them all. Reordering is free; renaming is not.
 *
 * `finances` is the clearest case of why ids and names are separate. Its label no longer
 * mentions money at all, because the area is about what money is *for*; the id stays
 * because thousands of stored keys begin with it. `living` is the same decision taken in
 * advance: it reads as "Apartment & Living" today, and the id says nothing about renting,
 * owning, or a home being an apartment.
 */
export const areas = [
  'body',
  'mind',
  'relationships',
  // After the people rather than before them: a place is mostly lived in with someone, or
  // noticed for who is not there, so it reads as the setting those relationships sit in.
  // Not `home` as an id — the start page, the `home` message group and `homeView` already
  // hold that word, and a fact key reading `area.home.goal` would be ambiguous in every
  // conversation about this code.
  'living',
  'work',
  'creativity',
  'finances',
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
