'use client'

import { useState } from 'react'
import { AreaLabel } from '@/components/area-label'
import { Choice } from '@/components/choice'
import { OptionList } from '@/components/option-list'
import { QuestionCard } from '@/components/question-card'
import { TextAnswer } from '@/components/text-answer'
import type { AreaId } from '@/lib/areas'
import { useI18n } from '@/lib/i18n'
import {
  addStep,
  chooseStep,
  MAX_OPEN_STEPS,
  readArea,
  setGoal,
  setReview,
  type AreaState,
} from '@/lib/person/goals'
import { usePerson } from '@/lib/person/store'

type Sub = 'review' | 'goal' | 'steps' | 'focus'

/**
 * One life area, asked about in four questions at most: is there anything here,
 * what is the goal, what could the next steps be, which one first.
 *
 * Where it resumes is **derived** from what the area already holds rather than
 * remembered, so reloading in the middle picks up at the right question instead of
 * asking again for a goal that is already stored. `chosenSub` only overrides that
 * once the person has answered something.
 *
 * The caller must give this a `key` of the area id: moving to the next area has to
 * remount it, or the previous area's sub-step would carry over.
 */
export function AreaFlow({
  area,
  progress,
  onDone,
}: {
  area: AreaId
  /** The progress marks during the introduction; nothing when managing one area. */
  progress?: React.ReactNode
  onDone: () => void
}) {
  const { m } = useI18n()
  const person = usePerson()
  const state = readArea(person, area)

  const [chosenSub, setSub] = useState<Sub | null>(null)
  const sub = chosenSub ?? resume(state)

  function finishSteps() {
    // One step needs no choosing: asking someone to pick between one thing is
    // noise, so it simply becomes the one being worked on.
    if (state.open.length === 1) {
      chooseStep(area, state.open[0].id)
      onDone()
      return
    }
    setSub('focus')
  }

  // Every question on this screen is about one area, and each `QuestionCard`
  // renders it as an eyebrow on its own heading. Passing the same element to each
  // is what keeps the area tied to the question rather than floating above the
  // whole screen, which is where it used to sit.
  const eyebrow = <AreaLabel area={area} size="eyebrow" />

  return (
    <div className="space-y-10">
      {progress}

      {sub === 'review' && (
        <QuestionCard area={eyebrow} question={m.goals.reviewQuestion}>
          <Choice
            options={[
              {
                label: m.goals.reviewYes,
                onSelect: () => {
                  setReview(area, 'yes')
                  setSub('goal')
                },
              },
              {
                label: m.goals.reviewNo,
                tone: 'quiet',
                onSelect: () => {
                  // A real answer, recorded as one. Nothing about it is a skip.
                  setReview(area, 'not_now')
                  onDone()
                },
              },
            ]}
          />
        </QuestionCard>
      )}

      {sub === 'goal' && (
        <QuestionCard area={eyebrow} question={m.goals.goalQuestion}>
          <TextAnswer
            placeholder={m.goals.goalPlaceholder}
            submitLabel={m.goals.goalSubmit}
            onSubmit={(value) => {
              setGoal(area, value)
              setSub('steps')
            }}
          />
        </QuestionCard>
      )}

      {sub === 'steps' && (
        <QuestionCard area={eyebrow} question={m.goals.stepsQuestion} note={m.goals.stepsNote}>
          <div className="space-y-6">
            {state.open.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm text-muted">{m.goals.stepsSoFar}</p>
                <ul className="space-y-2">
                  {state.open.map((step) => (
                    <li key={step.id} className="border-s-2 border-line ps-4 leading-relaxed">
                      {step.text}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {state.open.length < MAX_OPEN_STEPS ? (
              // Remounted per step so the field clears itself and takes focus
              // again, which is also what makes adding three in a row feel like
              // one action rather than three.
              <TextAnswer
                key={state.open.length}
                placeholder={m.goals.stepsPlaceholder}
                submitLabel={m.goals.stepsAdd}
                skipLabel={state.open.length > 0 ? m.goals.stepsEnough : undefined}
                onSubmit={(value) => {
                  addStep(area, value)
                }}
                onSkip={state.open.length > 0 ? finishSteps : undefined}
              />
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-muted">{m.goals.stepsFull}</p>
                <Choice options={[{ label: m.goals.stepsContinue, onSelect: finishSteps }]} />
              </div>
            )}
          </div>
        </QuestionCard>
      )}

      {sub === 'focus' && (
        <QuestionCard area={eyebrow} question={m.goals.focusQuestion}>
          <OptionList
            options={state.open.map((step) => ({ id: step.id, label: step.text }))}
            onSelect={(id) => {
              chooseStep(area, id)
              onDone()
            }}
          />
        </QuestionCard>
      )}
    </div>
  )
}

/** Where an interrupted pass through this area left off. */
function resume(state: AreaState): Sub {
  if (!state.review || state.review === 'not_now') return 'review'
  if (!state.goal) return 'goal'
  if (state.open.length === 0) return 'steps'
  return 'focus'
}
