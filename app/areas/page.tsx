'use client'

import Link from 'next/link'
import { GoalIcon } from '@/components/area-icon'
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
            const goalCount = state.activeGoals.length
            // Nothing being worked on here yet — whether that is "not now" or simply
            // not yet. The row recedes rather than disappearing: at a glance the page
            // should show where you are working on something, while every area stays
            // readable and one tap away. See `.option-recede`.
            const quiet = goalCount === 0
            return (
            <li key={state.area}>
              <Link
                href={`/areas/${state.area}`}
                className={`option block space-y-1.5 ${quiet ? 'option-recede' : ''}`}
              >
                <AreaLabel area={state.area} size="card" />
                {/**
                 * **Each goal by name, with what is under it.** The row counted them for a
                 * while — "2 Ziele angegeben" — which kept someone's sentences off a screen
                 * that shows six areas at once, but it also meant the only way to learn what
                 * you had written was to open every area in turn. Naming them costs the
                 * privacy of a glance and buys the page its purpose back.
                 *
                 * Numbered only where a number distinguishes something, exactly as on the
                 * area's own page, and the per-goal counts replace the area-wide one: three
                 * goals with their own totals say everything "3 Aktivitäten geplant" said,
                 * and say which goal they belong to.
                 */}
                {goalCount === 0 ? (
                  <span className="block text-sm text-muted">{m.manage.goalsNone}</span>
                ) : (
                  state.activeGoals.map((goal, index) => {
                    const steps = state.open.filter((step) => step.goalId === goal.id).length
                    return (
                      <span key={goal.id} className="block text-sm leading-relaxed text-muted">
                        <GoalIcon />{' '}
                        {goalCount > 1
                          ? t(m.manage.goalNumber, { n: String(index + 1) })
                          : m.manage.goalOnly}{' '}
                        <span className="text-ink">{goal.text}</span>{' '}
                        {steps === 1
                          ? m.manage.stepsOne
                          : t(m.manage.stepsMany, { count: String(steps) })}
                      </span>
                    )
                  })
                )}
                {/* The hint stays: a goal with nothing under it is the one thing on this
                    page worth finding among six rows, and "(0 nächste Schritte)" states it
                    without drawing the eye. Gold, italic, and it says what to do. */}
                {goalCount > 0 && state.open.length === 0 && (
                  <span className="block text-sm font-semibold italic leading-relaxed text-note">
                    {goalCount === 1 ? m.manage.noStepOne : m.manage.noStepMany}
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
