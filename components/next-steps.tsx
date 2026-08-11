'use client'

import { useState } from 'react'
import { AreaIcon } from '@/components/area-icon'
import { Choice } from '@/components/choice'
import { OptionList } from '@/components/option-list'
import { TextAnswer } from '@/components/text-answer'
import { areas, type AreaId } from '@/lib/areas'
import { useI18n } from '@/lib/i18n'
import { addStep, chooseStep, completeStep, readArea } from '@/lib/person/goals'
import { usePerson } from '@/lib/person/store'

type Completing = { area: AreaId; phase: 'ask' | 'pick' }

/**
 * The few things worth doing next, one per life area.
 *
 * Only areas with something active appear. Areas without one are not shown as
 * gaps to fill — they are reachable from the list of life areas, and an area
 * nobody is working on right now is not a failure to display.
 *
 * Completing something offers a next step and accepts "Later" as an answer. It
 * never creates one on the person's behalf, and nothing here counts, scores,
 * congratulates or keeps a tally.
 */
export function NextSteps() {
  const { m, t } = useI18n()
  const person = usePerson()
  const [completing, setCompleting] = useState<Completing | null>(null)

  const states = areas.map((area) => readArea(person, area))

  // The area just completed stays on screen after its step stops being active,
  // so the offer appears where the step was rather than after a jump.
  const rows = states.filter((state) => state.active || state.area === completing?.area)

  // A goal with no step ever written down is setup that was interrupted — closing
  // the tab midway through the last area does exactly this. Saying nothing here
  // would leave "that is a fine place to be" claiming everything is settled when
  // it is not. An area paused *on purpose* has steps behind it, so it is excluded:
  // that one is a real answer and pointing at it would be nagging.
  const unfinished = states.some((state) => state.goal && state.steps.length === 0)

  if (rows.length === 0) {
    return (
      <div className="space-y-3">
        <p className="max-w-prose leading-relaxed text-muted">{m.home.empty}</p>
        {unfinished && (
          <p className="max-w-prose text-sm leading-relaxed text-muted">{m.home.unfinished}</p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {unfinished && (
        <p className="max-w-prose text-sm leading-relaxed text-muted">{m.home.unfinished}</p>
      )}
      <ul className="space-y-8">
      {rows.map((state) => {
        const active = state.active
        const busy = completing?.area === state.area ? completing : null

        return (
          <li key={state.area} className="space-y-3">
            <p className="flex items-center gap-x-2 text-sm text-muted">
              <AreaIcon area={state.area} />
              {m.areas[state.area]}
            </p>

            {busy?.phase === 'ask' && (
              <div className="space-y-4">
                <p className="text-sm text-accent">{m.home.done}</p>
                <p className="leading-relaxed text-ink">{m.home.chooseNextQuestion}</p>
                <Choice
                  options={[
                    {
                      label: m.home.chooseNext,
                      onSelect: () => setCompleting({ area: state.area, phase: 'pick' }),
                    },
                    {
                      // Nothing is written: the area simply has no active step,
                      // which is already true and is a fine place to leave it.
                      label: m.home.later,
                      tone: 'quiet',
                      onSelect: () => setCompleting(null),
                    },
                  ]}
                />
              </div>
            )}

            {busy?.phase === 'pick' &&
              (state.open.length > 0 ? (
                <OptionList
                  options={state.open.map((step) => ({ id: step.id, label: step.text }))}
                  onSelect={(id) => {
                    chooseStep(state.area, id)
                    setCompleting(null)
                  }}
                />
              ) : (
                <div className="space-y-4">
                  <p className="leading-relaxed text-ink">{m.home.newStepQuestion}</p>
                  <TextAnswer
                    placeholder={m.home.newStepPlaceholder}
                    submitLabel={m.home.newStepSubmit}
                    onSubmit={(value) => {
                      chooseStep(state.area, addStep(state.area, value))
                      setCompleting(null)
                    }}
                  />
                </div>
              ))}

            {!busy && active && (
              <button
                type="button"
                className="option"
                // Announces the action, not just the content — the same rule as
                // the theme toggle. The visible text is inside the name, so the
                // two do not disagree.
                aria-label={t(m.home.markDone, { step: active.text })}
                onClick={() => {
                  completeStep(state.area, active.id)
                  setCompleting({ area: state.area, phase: 'ask' })
                }}
              >
                {active.text}
              </button>
            )}
          </li>
        )
      })}
      </ul>
    </div>
  )
}
