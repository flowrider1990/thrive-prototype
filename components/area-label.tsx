'use client'

import { AreaIcon } from '@/components/area-icon'
import type { AreaId } from '@/lib/areas'
import { useI18n } from '@/lib/i18n'

/**
 * Which life area this is about.
 *
 * The same icon-and-name line appeared verbatim at four call sites, which is what
 * let it drift — and it had already drifted once, to a `text-xs uppercase` variant
 * for no reason anybody had decided.
 *
 * That remaining variant, in `components/you-areas.tsx`, deliberately stays where
 * it is: there the area name is a section `h2` inside a document, not a label
 * beside something. Pulling it in here would mean this component rendering
 * headings, which is what would make it wrong in the other four places.
 *
 * Two sizes, because it does two jobs:
 *
 * - `eyebrow` sits directly above a question and tells the person which area they
 *   are being asked about. It is `text-ink`, not muted — during onboarding this is
 *   the only thing on screen giving the question a subject, and it was previously
 *   quiet enough to be skipped over. It reads as context for the heading rather
 *   than as furniture, which comes from the tight grouping in `QuestionCard`, not
 *   from the size alone.
 * - `row` labels an area inside a list, where the surrounding text already
 *   supplies the context and the label should recede.
 * - `card` titles an area on `/areas/`, where it is the *subject* of the row
 *   rather than a label on one. There the name and its state were within a step
 *   of each other in size and both muted, so a list of five read as ten equally
 *   weighted lines and the eye had nothing to land on. It is the one place the
 *   name has to win.
 *
 * None of them renders a heading element: the eyebrow sits above an `h1` that owns
 * the question, and an `h2` before it would put the outline in the wrong order. On
 * `/areas/` the whole row is a link, and a heading inside a link is worse again.
 */
export function AreaLabel({
  area,
  size = 'row',
}: {
  area: AreaId
  size?: 'eyebrow' | 'row' | 'card'
}) {
  const { m } = useI18n()

  if (size === 'eyebrow') {
    return (
      <p className="flex items-center gap-x-2.5 font-medium text-ink">
        <AreaIcon area={area} size="eyebrow" />
        {m.areas[area]}
      </p>
    )
  }

  if (size === 'card') {
    return (
      <p className="flex items-center gap-x-2.5 text-lg font-medium leading-snug text-ink">
        <AreaIcon area={area} size="eyebrow" />
        {m.areas[area]}
      </p>
    )
  }

  return (
    <p className="flex items-center gap-x-2 text-sm text-muted">
      <AreaIcon area={area} />
      {m.areas[area]}
    </p>
  )
}
