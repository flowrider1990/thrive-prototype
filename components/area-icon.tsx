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
  creativity: '🎨',
  // A tree, not a coin or a banknote: the area asks what being provided for makes
  // possible, over years, rather than about money as a quantity.
  finances: '🌳',
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

/**
 * The mark for a goal — a finish line — wherever one is named, counted or asked for.
 *
 * Here rather than in the message catalogs, for the same reason the area emoji are: how a
 * goal is *drawn* is not copy, and the stored model owes nothing to it. It also keeps one
 * place to change if the mark ever does.
 *
 * `aria-hidden`, always. The words beside it already say "goal", so announcing "chequered
 * flag" first would add noise rather than meaning — and where it repeats as a count it
 * would say it once per flag.
 *
 * `count` repeats it, which is how `/areas/` shows how many goals an area holds without
 * the reader having to parse a number first. Bounded by `MAX_GOALS` at the source.
 */
export function GoalIcon({ count = 1, className = '' }: { count?: number; className?: string }) {
  if (count < 1) return null
  return (
    <span aria-hidden="true" className={`shrink-0 ${className}`}>
      {'🏁'.repeat(count)}
    </span>
  )
}
