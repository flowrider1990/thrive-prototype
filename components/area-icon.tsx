import type { AreaId } from '@/lib/areas'

/**
 * One emoji per life area, kept here rather than in `lib/areas.ts` so the stored
 * model owes nothing to how an area is drawn.
 *
 * `aria-hidden` because the area's name is always beside it: a screen reader
 * announcing "person walking" before "Body & Health" adds noise, not meaning.
 */
const icons: Record<AreaId, string> = {
  body: '🩺',
  // A face rather than 🧠 or 🧘: the first is anatomical and pulls the area toward the
  // clinical, which the app makes no claim to, and the second prescribes one practice.
  mind: '😌',
  relationships: '🫂',
  work: '💼',
  finances: '💵',
  creativity: '🎨',
}

/**
 * Sized explicitly rather than inheriting. Every call site used to be `text-sm`,
 * which rendered the emoji at body-small — small enough that the area context read
 * as a footnote to its own question.
 */
const sizes = {
  /**
   * Beside a display-scale heading that names the area — the onboarding questions and
   * the area page. Its own key rather than a bigger `eyebrow`, because `eyebrow` is
   * shared with `AreaLabel size="card"`, whose type size check 34a measures.
   */
  subject: 'text-3xl sm:text-4xl',
  eyebrow: 'text-xl',
  inline: 'text-base',
} as const

export function AreaIcon({ area, size = 'inline' }: { area: AreaId; size?: keyof typeof sizes }) {
  return (
    <span aria-hidden="true" className={`select-none leading-none ${sizes[size]}`}>
      {icons[area]}
    </span>
  )
}
