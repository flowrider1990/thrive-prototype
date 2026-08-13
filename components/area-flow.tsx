'use client'

import { useState } from 'react'
import { ActionEntry } from '@/components/action-entry'
import { Choice } from '@/components/choice'
import { QuestionCard } from '@/components/question-card'
import { TextAnswer } from '@/components/text-answer'
import type { AreaId } from '@/lib/areas'
import { useI18n } from '@/lib/i18n'
import { addGoal, readArea, setReview, type AreaState } from '@/lib/person/goals'
import { usePerson } from '@/lib/person/store'

type Sub = 'review' | 'goal' | 'steps'

/**
 * One life area, asked about in three questions at most: is there anything here,
 * what is the goal, and what could help.
 *
 * It deliberately does **not** ask which one to start with. That was a fourth screen
 * asking someone to prioritise things they had thought of thirty seconds earlier, and
 * the answer is better made later, from the start page, by pinning.
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

  return (
    <div className="space-y-10">
      {progress}

      {sub === 'review' && (
        <QuestionCard subject={area} question={m.goals.reviewQuestion}>
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
        <QuestionCard subject={area} question={m.goals.goalQuestion}>
          <TextAnswer
            placeholder={m.goals.goalPlaceholder}
            submitLabel={m.goals.goalSubmit}
            /**
             * The way out, for the same reason the next screen has one: wanting
             * something to change here and not yet knowing what it is, is an ordinary
             * place to be. Without this the only way past was to invent a goal, and an
             * invented goal is worse than none — the app would treat it as something
             * the person actually wants.
             *
             * It writes **nothing**. No empty goal, no placeholder. The area keeps its
             * review answer and stays completable from its own page, and nothing on the
             * start page points at it: `unfinished` needs a goal to fire.
             */
            skipLabel={m.goals.goalSkip}
            onSubmit={(value) => {
              // One goal per area during the introduction, on purpose. More is something
              // you discover you want and add from the area's own page — asking for a
              // second here would turn meeting the app into configuring it.
              addGoal(area, value)
              setSub('steps')
            }}
            onSkip={onDone}
          />
        </QuestionCard>
      )}

      {sub === 'steps' && (
        <QuestionCard subject={area} question={m.goals.stepsQuestion} note={m.goals.stepsNote}>
          <ActionEntry
            area={area}
            goalId={state.activeGoals[0].id}
            entries={state.open}
            // Straight out. This used to be `finishSteps`, whose three branches all
            // ended here once nothing is made active — including the "I do not know
            // yet" case, which still writes nothing at all.
            onEnough={onDone}
          />
        </QuestionCard>
      )}

    </div>
  )
}

/** Where an interrupted pass through this area left off. */
function resume(state: AreaState): Sub {
  if (!state.review || state.review === 'not_now') return 'review'
  if (state.activeGoals.length === 0) return 'goal'
  return 'steps'
}
