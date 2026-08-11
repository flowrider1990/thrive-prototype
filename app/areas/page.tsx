'use client'

import Link from 'next/link'
import { AreaLabel } from '@/components/area-label'
import { PageShell } from '@/components/page-shell'
import { areas } from '@/lib/areas'
import { useI18n } from '@/lib/i18n'
import { readArea } from '@/lib/person/goals'
import { usePerson } from '@/lib/person/store'

/**
 * The five life areas and where each one stands.
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
  const { m, status } = useI18n()
  const person = usePerson()

  if (status !== 'ready') return <PageShell>{null}</PageShell>

  const states = areas.map((area) => readArea(person, area))

  return (
    <PageShell>
      <div className="space-y-8">
        <div className="space-y-2">
          <h1 className="heading">{m.manage.pickerTitle}</h1>
          <p className="max-w-prose text-sm leading-relaxed text-muted">{m.manage.pickerNote}</p>
        </div>

        <ul className="space-y-3">
          {states.map((state) => (
            <li key={state.area}>
              <Link href={`/areas/${state.area}`} className="option block space-y-1">
                <AreaLabel area={state.area} />
                {state.goal ? (
                  <span className="block leading-relaxed text-ink">{state.goal}</span>
                ) : (
                  <span className="block text-sm text-muted">
                    {state.review === 'not_now' ? m.manage.notNow : m.manage.noGoal}
                  </span>
                )}
                {/* Only when there is a goal to be working toward: "nothing to try
                    yet" under "no goal yet" would be two ways of saying the same
                    absence. */}
                {state.goal && (
                  <span className="block text-sm text-muted">
                    {state.active ? state.active.text : m.manage.noStep}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </PageShell>
  )
}
