'use client'

import { AreaIcon } from '@/components/area-icon'
import { areas } from '@/lib/areas'
import { formatWhen, useI18n } from '@/lib/i18n'
import { readAreaDetail, type AreaDetail, type StepDetail } from '@/lib/person/goals'
import { usePerson } from '@/lib/person/store'

/**
 * The life-area part of `/you`.
 *
 * Rendered through the domain layer rather than as raw fact groups, for one
 * reason: a next step is identified internally by an id, and an id is not
 * something to show a person. Everything here resolves to the words they wrote —
 * every goal including the ones it replaced, every step with its state, and every
 * earlier wording of a step that was reworded.
 *
 * It is a record, not a task list: there is nothing to act on here, which is the
 * difference between this page and the start page.
 */
export function YouAreas() {
  const { m, t, locale } = useI18n()
  const person = usePerson()

  const details = areas
    .map((area) => readAreaDetail(person, area))
    .filter((detail) => detail.any)

  if (details.length === 0) return null

  function noted(when: string) {
    return t(m.you.learnedAt, { when: formatWhen(when, locale) })
  }

  function stateWord(detail: AreaDetail, step: StepDetail) {
    if (step.id === detail.activeId) return m.you.areas.active
    if (step.state === 'done') return m.you.areas.done
    if (step.state === 'retired') return m.you.areas.retired
    return m.you.areas.open
  }

  return (
    <div className="space-y-10">
      {details.map((detail) => (
        <section key={detail.area} className="space-y-4">
          <h2 className="flex items-center gap-x-2 text-xs uppercase tracking-wide text-muted">
            <AreaIcon area={detail.area} />
            {m.areas[detail.area]}
          </h2>

          <dl className="space-y-5">
            {detail.reviews.length > 0 && (
              <div className="space-y-2 border-s-2 border-line ps-5">
                <dt className="text-sm text-muted">{m.you.areas.review}</dt>
                {detail.reviews.map((review, index) => (
                  <dd key={index} className="space-y-1">
                    <p className="leading-relaxed text-ink">
                      {review.value === 'yes' ? m.you.areas.yes : m.you.areas.notNow}
                    </p>
                    <p className="text-xs text-muted">{noted(review.at)}</p>
                  </dd>
                ))}
              </div>
            )}

            {detail.goals.length > 0 && (
              <div className="space-y-2 border-s-2 border-line ps-5">
                <dt className="text-sm text-muted">{m.you.areas.goal}</dt>
                {detail.goals.map((goal, index) => (
                  <dd key={index} className="space-y-1">
                    <p className="whitespace-pre-line leading-relaxed text-ink">
                      {index === 0 ? goal.value : t(m.you.areas.earlier, { goal: goal.value })}
                    </p>
                    <p className="text-xs text-muted">{noted(goal.at)}</p>
                  </dd>
                ))}
              </div>
            )}

            {detail.steps.length > 0 && (
              <div className="space-y-2 border-s-2 border-line ps-5">
                <dt className="text-sm text-muted">{m.you.areas.steps}</dt>
                {detail.steps.map((step) => (
                  <dd key={step.id} className="space-y-1">
                    <p className="whitespace-pre-line leading-relaxed text-ink">{step.text}</p>
                    <p className="text-xs text-muted">
                      {stateWord(detail, step)} · {noted(step.stateAt ?? step.createdAt)}
                    </p>
                    {step.previous.map((text, index) => (
                      <p key={index} className="text-xs text-muted">
                        {t(m.you.areas.edited, { text })}
                      </p>
                    ))}
                  </dd>
                ))}
              </div>
            )}
          </dl>
        </section>
      ))}
    </div>
  )
}
