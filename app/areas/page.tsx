'use client'

import Link from 'next/link'
import { AreaLabel } from '@/components/area-label'
import { PageShell } from '@/components/page-shell'
import { areas } from '@/lib/areas'
import { useI18n } from '@/lib/i18n'
import { readArea } from '@/lib/person/goals'
import { usePerson } from '@/lib/person/store'

/**
 * The life areas and where each one stands.
 *
 * A list, not a dashboard. No history, no counts, no completed entries —
 * `docs/goals-and-areas.md` is explicit that what is finished is kept and *not*
 * shown, and that older activity should eventually be summarised into a
 * recognisable path rather than listed as rows.
 *
 * Rows are `<a>`, not `<button>`. They navigate, so they are links: the same
 * `.option` styling that means "pick this" elsewhere reads as "open this" here only
 * because the element underneath is honest about which it is. Nothing on this page
 * changes anything.
 *
 * It renders whether or not the introduction is finished. Only the *nav* is gated —
 * gating the route would mean a client-side redirect, which is a flash, which
 * `CLAUDE.md` §9 rules out. An unfinished area simply says so.
 */
export default function AreasPage() {
  const { m, t, status } = useI18n()
  const person = usePerson()

  if (status !== 'ready') return <PageShell>{null}</PageShell>

  const states = areas.map((area) => readArea(person, area))

  return (
    <PageShell>
      <div className="space-y-10">
        <div className="space-y-2">
          <h1 className="heading">{m.manage.pickerTitle}</h1>
          <p className="max-w-prose text-sm leading-relaxed text-muted">{m.manage.pickerNote}</p>
        </div>

        {/**
         * Three levels, and they have to be three: the area's name, then the goal,
         * then where that goal stands. Previously the name was `text-sm text-muted`
         * and the goal was full-size ink — so the row's *subject* was the quietest
         * thing in it, and the rows read as twice as many interchangeable lines.
         *
         * The goal stays `text-ink` and only drops in size. Muting the person's own
         * words to make room for a label the app chose would be the wrong trade, and
         * size alone is enough separation once the name is bigger.
         *
         * Deliberately still not a dashboard: no counts, no dates, no badges, no
         * status. Each row says what the area is, what you want, and one line about
         * where that stands.
         */}
        <ul className="space-y-3">
          {states.map((state) => {
            const top = state.priority ?? state.activeGoals[0]
            return (
            <li key={state.area}>
              <Link href={`/areas/${state.area}`} className="option block space-y-1.5">
                <AreaLabel area={state.area} size="card" />
                {/* The one put first, or the oldest still standing. A row is a door
                    rather than a summary: six areas listing three goals each would be
                    nineteen lines of someone's ambitions on one screen. */}
                {top ? (
                  <span className="block text-sm leading-relaxed text-ink">{top.text}</span>
                ) : (
                  <span className="block text-sm text-muted">
                    {state.review === 'not_now' ? m.manage.notNow : m.manage.noGoal}
                  </span>
                )}
                {/* Only when there is a goal to be working toward: saying what has
                    not been decided under "no goal yet" would be two ways of saying
                    the same absence. */}
                {top && (
                  <span className="block text-sm leading-relaxed text-muted">
                    {state.open.length === 0
                      ? m.manage.noStep
                      : state.open.length === 1
                        ? m.manage.tryingOne
                        : t(m.manage.trying, { count: String(state.open.length) })}
                  </span>
                )}
              </Link>
            </li>
            )
          })}
        </ul>
      </div>
    </PageShell>
  )
}
