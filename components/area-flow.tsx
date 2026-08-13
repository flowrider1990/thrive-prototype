'use client'

import { useState } from 'react'
import { ActionEntry } from '@/components/action-entry'
import { Choice } from '@/components/choice'
import { QuestionCard } from '@/components/question-card'
import { TextAnswer } from '@/components/text-answer'
import type { AreaId } from '@/lib/areas'
import { useI18n } from '@/lib/i18n'
import {
  addGoal,
  MAX_GOALS,
  MAX_OPEN_STEPS,
  readArea,
  setReview,
  type AreaState,
} from '@/lib/person/goals'
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

  // Which goal the entries screen is filling. There can be up to `MAX_GOALS` in one
  // area now, so "the area's goal" is no longer a thing to point at. After a reload
  // this is null and the newest one is the right guess — it is the one just written.
  const [chosenGoal, setGoalId] = useState<string | null>(null)
  const goal =
    state.activeGoals.find((candidate) => candidate.id === chosenGoal) ??
    state.activeGoals.at(-1)

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
        <QuestionCard
          subject={area}
          // "What else" once there is one, so a second goal reads as an addition rather
          // than a correction of the first.
          question={
            state.activeGoals.length === 0 ? m.goals.goalQuestion : m.manage.goalNewQuestion
          }
        >
          <TextAnswer
            // Remounted per goal, so the field clears itself between them.
            key={state.activeGoals.length}
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
            /**
              * The first goal is optional — "Not sure yet" writes nothing and moves on.
              * A later one is not a thing to be unsure about, so the way out says what it
              * means there: you have what you need.
              */
             skipLabel={state.activeGoals.length === 0 ? m.goals.goalSkip : m.goals.stepsEnough}
            onSubmit={(value) => {
              setGoalId(addGoal(area, value))
              setSub('steps')
            }}
            onSkip={onDone}
          />
        </QuestionCard>
      )}

      {sub === 'steps' && goal && (
        <QuestionCard
          subject={area}
          question={m.goals.stepsQuestion}
          note={m.goals.stepsNote}
          // Which goal these are for. With one it is redundant, with two it is the
          // only thing telling them apart.
          eyebrow={
            state.activeGoals.length > 1 ? (
              <p className="text-sm text-muted">{goal.text}</p>
            ) : undefined
          }
        >
          <ActionEntry
            area={area}
            goalId={goal.id}
            entries={state.open.filter((step) => step.goalId === goal.id)}
            // The cap counts across the area, not this goal.
            atCap={state.open.length >= MAX_OPEN_STEPS}
            // Straight out. This used to be `finishSteps`, whose three branches all
            // ended here once nothing is made active — including the "I do not know
            // yet" case, which still writes nothing at all.
            onEnough={onDone}
          />

          {/**
            * Offered, never pushed. Outside `ActionEntry`'s form on purpose: check 38b
            * measures the form's buttons to prove that adding an entry is the primary
            * action and every way out of it is quiet, and a third button inside would
            * have made that assertion stop covering the screen.
            *
            * Nothing here says how many goals an area should have. It disappears at the
            * cap and says nothing about the ones already written.
            */}
          {state.activeGoals.length < MAX_GOALS && (
            <button
              type="button"
              className="btn btn-sm btn-quiet"
              onClick={() => {
                setGoalId(null)
                setSub('goal')
              }}
            >
              {m.goals.goalAnother}
            </button>
          )}
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
