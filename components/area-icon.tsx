'use client'

import { Menu } from '@/components/menu'
import { areaIcons } from '@/lib/area-icons'
import type { AreaId } from '@/lib/areas'
import { useI18n } from '@/lib/i18n'
import { readAreaIcon, setAreaIcon } from '@/lib/person/goals'
import { usePerson } from '@/lib/person/store'

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

/**
 * One emoji per life area — the one the person chose, or the area's default.
 *
 * **This reads the store**, which is what makes a choice made on one screen true on all of
 * them. It costs the component its purity: it is a client component subscribed to the
 * person, at five call sites, some of them inside lists. That is affordable because every
 * page rendering an area already waits for `status === 'ready'` before rendering anything
 * — so the default is never painted and then swapped for the choice, which would be
 * exactly the first-frame flash `CLAUDE.md` §9 rules out.
 *
 * `aria-hidden` because the area's name is always beside it: a screen reader announcing
 * "person walking" before "Physical Health" adds noise, not meaning. The one place the
 * emoji is *not* hidden is inside the picker below, where it is the whole content of a
 * control and there is nothing else to announce.
 */
export function AreaIcon({ area, size = 'inline' }: { area: AreaId; size?: keyof typeof sizes }) {
  const person = usePerson()
  return (
    <span aria-hidden="true" className={`select-none leading-none ${sizes[size]}`}>
      {readAreaIcon(person, area)}
    </span>
  )
}

/**
 * The same mark, on the area's own page, where tapping it offers the others.
 *
 * Small, and deliberately so — it is a decoration someone can make theirs, not a setting.
 * It writes through `remember()` like everything else, so declining persistence keeps it
 * for the visit and puts nothing on the device.
 *
 * **The trigger carries no border at rest**, which is a considered exception to the rule
 * in `docs/design-system.md` that an icon-only control is bordered because a control edge
 * is what says "this is a control". Here the glyph is *first* the area's mark at display
 * scale, beside its name in an `h1`, and only second a control; boxing it would make the
 * page heading look like a button. The affordance is carried by the pointer cursor, a
 * hover ground, the focus ring every control gets, and a `title` — and, unlike a border,
 * none of those is present when the page is merely being read.
 *
 * `Menu` rather than a second popover: Escape, click-outside, focus-out and returning
 * focus to the trigger are all already built and reviewed there, and a hand-rolled copy
 * would be a second thing to get right.
 */
export function AreaIconPicker({ area }: { area: AreaId }) {
  const { m, t } = useI18n()
  const person = usePerson()
  const chosen = readAreaIcon(person, area)
  const label = t(m.manage.iconChange, { area: m.areas[area] })

  return (
    <Menu
      label={label}
      align="start"
      triggerTitle={label}
      triggerClassName="cursor-pointer rounded-md px-1 leading-none transition-colors hover:bg-surface"
      trigger={
        <span aria-hidden="true" className={`select-none ${sizes.subject}`}>
          {chosen}
        </span>
      }
    >
      {(close) => (
        /**
         * Three columns, always — which is what makes six emoji a 2×3 and nine a 3×3 with
         * no ragged last row. The grid itself is undrawn: no lines, no cell borders,
         * nothing but the emoji and the ring on the one in use.
         */
        <div className="grid grid-cols-3 gap-1" role="group" aria-label={label}>
          {areaIcons[area].map((icon) => (
            <button
              key={icon}
              type="button"
              /**
               * No `aria-label`. The button's only content is the emoji, so its accessible
               * name is computed from that — which assistive tech reads out by the emoji's
               * own Unicode name, at no cost in translated copy.
               */
              aria-current={icon === chosen ? 'true' : undefined}
              // Every option carries a border and only its colour changes, so marking the
              // current one moves nothing — the rule `.btn` and the progress marks follow.
              className={`edge flex size-11 items-center justify-center rounded-md text-2xl leading-none transition-colors ${
                icon === chosen
                  ? 'border-muted bg-ground'
                  : 'border-transparent hover:border-line-strong'
              }`}
              onClick={() => {
                setAreaIcon(person, area, icon)
                close()
              }}
            >
              {icon}
            </button>
          ))}
        </div>
      )}
    </Menu>
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
 *
 * Unlike an area's, a goal's mark is fixed. There is one goal icon and no choosing: goals
 * come and go, and a per-goal decoration would be a setting to maintain on something whose
 * whole life is a few weeks.
 */
export function GoalIcon({ count = 1, className = '' }: { count?: number; className?: string }) {
  if (count < 1) return null
  return (
    <span aria-hidden="true" className={`shrink-0 ${className}`}>
      {'🏁'.repeat(count)}
    </span>
  )
}
