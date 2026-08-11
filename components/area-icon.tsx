import type { AreaId } from '@/lib/areas'

/**
 * One emoji per life area, kept here rather than in `lib/areas.ts` so the stored
 * model owes nothing to how an area is drawn.
 *
 * `aria-hidden` because the area's name is always beside it: a screen reader
 * announcing "person walking" before "Body & Health" adds noise, not meaning.
 */
const icons: Record<AreaId, string> = {
  body: '🚶',
  relationships: '🤝',
  work: '💼',
  finances: '🪙',
  creativity: '🎨',
}

export function AreaIcon({ area }: { area: AreaId }) {
  return (
    <span aria-hidden="true" className="select-none">
      {icons[area]}
    </span>
  )
}
