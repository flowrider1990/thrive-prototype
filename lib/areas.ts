/**
 * The five life areas, as ids and nothing else.
 *
 * These strings are persisted inside fact keys (`area.body.goal`), so they carry
 * the same rule as `STORAGE_KEY`: renaming one orphans everything stored under it,
 * invisibly. Changing this list is a migration, not an edit.
 *
 * Names live in the message catalogs and emoji in `components/area-icon.tsx`, so
 * how an area looks or reads can change freely while what is stored stays put.
 */
export const areas = ['body', 'relationships', 'work', 'finances', 'creativity'] as const

export type AreaId = (typeof areas)[number]

export function isAreaId(value: unknown): value is AreaId {
  return typeof value === 'string' && (areas as readonly string[]).includes(value)
}
