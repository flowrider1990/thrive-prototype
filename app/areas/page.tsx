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
                {/* The one put first, or the oldest still standing. A row is a door
                    rather than a summary: six areas listing three goals each would be
                    nineteen lines of someone's ambitions on one screen. */}
                {/**
                 * How many, not which.
                 *
                 * This line held the goal itself until it held a status before that. Both
                 * turned a row into a summary of the area; a row is a door. It says which
                 * area and how much is behind it, and the sentences someone wrote live on
                 * the other side of it — which also keeps six areas of somebody's
                 * ambitions off a single screen. 34b asserts the words stay off this page.
                 */}
                <span className="block text-sm text-muted">
                  {goalCount === 0
                    ? m.manage.goalsNone
                    : goalCount === 1
                      ? m.manage.goalsOne
                      : t(m.manage.goalsMany, { count: String(goalCount) })}
                </span>
                {/* Only where there is a goal to be working toward: saying what has
                    not been decided beneath "no goals set" would be two ways of
                    saying the same absence. */}
                {goalCount > 0 && (
                  /**
                   * A goal standing with nothing to try is the one thing on this page
                   * worth finding among six rows, so it is drawn as a hint: gold, italic,
                   * and prefixed "Note:".
                   *
                   * Three cues, and the colour is the least of them — the words say it is
                   * a hint, and the slant says it again, so nothing depends on seeing the
                   * hue. Gold rather than red because it is **not** a warning: nothing is
                   * wrong, there is just something left to decide.
                   *
                   * The other states of this line stay muted. A hint that is always on is
                   * not a hint.
                   */
                  <span
                    className={`block text-sm leading-relaxed ${
                      state.open.length === 0 ? 'italic text-note' : 'text-muted'
                    }`}
                  >
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
