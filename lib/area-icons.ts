import type { AreaId } from '@/lib/areas'

/**
 * The emoji an area may be drawn with, and **the first one is the default** — the mark
 * the area carries until someone picks another.
 *
 * This is in `lib/` rather than beside the component that draws it, which is a change of
 * position worth explaining. It used to live in `components/area-icon.tsx`, under the rule
 * that "the stored model owes nothing to how an area is drawn". That rule held while the
 * emoji was purely presentational. It is not any more: a chosen icon is a stored fact, so
 * `lib/person/goals.ts` has to validate a value read back off the device against this list,
 * and a `lib/` module importing from `components/` would be the layering backwards.
 *
 * What survives of the old rule is the important half — **`lib/areas.ts` still holds ids
 * and nothing else**, so an area's id owes nothing to its appearance, and this list can be
 * reordered or rewritten without touching a single stored key.
 *
 * Changing a list is safe in one direction only. **Adding** an emoji is free. **Removing**
 * one that somebody has already chosen quietly returns that area to its default, because
 * `readAreaIcon` falls back rather than rendering a value it no longer recognises — which
 * is the right failure, but it is a silent one. Reordering is free *except* at index 0:
 * that position is the default, so moving it changes what every area shows for everyone
 * who has never picked anything.
 *
 * Three columns is the whole layout rule, which is why the counts are six and nine rather
 * than anything: they fill 2×3 and 3×3 exactly, with no ragged last row.
 */
export const areaIcons = {
  body: ['🩺', '🏃', '💪', '🥗', '🥵', '🫀'],
  mind: ['😌', '🧠', '🌿', '⚖️', '🧘‍♂️', '💭'],
  relationships: ['🫂', '💬', '❤️', '👥', '🤝', '🥂'],
  // 🛋️ leads, so the area's default is the room rather than the way into it.
  living: ['🛋️', '🔑', '🏠', '🪴', '🧹', '🕯️'],
  work: ['💼', '💻', '📈', '🤑', '🎯', '🧑‍💼'],
  // 📖 leads, so this is the one area whose default *changed* rather than being kept from
  // before — it was 🎨. Decided deliberately: nobody who never picked an icon keeps the old
  // mark here, and there is no migration, because the default is a rendering rule rather
  // than anything stored. Everyone who did pick is untouched, since the glyph is what is
  // saved. This is the index-0 hazard the doc above warns about, taken knowingly.
  creativity: ['📖', '🍳', '⚽', '✈️', '🎮', '🎨', '🎵', '📷', '🌱'],
  finances: ['🌳', '🛡️', '💰', '🔓', '🧭', '🕊️'],
} as const satisfies Record<AreaId, readonly string[]>

/** What the area is drawn with when nobody has chosen — always the head of the list. */
export function defaultAreaIcon(area: AreaId): string {
  return areaIcons[area][0]
}

/**
 * Is this one of the icons this area offers?
 *
 * The guard exists for what comes off the device, not for what the picker sends: a
 * hand-edited or outdated store can hold anything, and an area's heading is not the place
 * to find out. Deliberately scoped **per area** rather than to the union of all of them —
 * `🏠` under Physical Health would be a real bug, and a check that accepted it would hide
 * one.
 */
export function isAreaIcon(area: AreaId, value: string | undefined): value is string {
  return value !== undefined && (areaIcons[area] as readonly string[]).includes(value)
}
