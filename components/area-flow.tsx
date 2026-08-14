'use client'

import { useState } from 'react'
import { ActionEntry } from '@/components/action-entry'
import { GoalIcon } from '@/components/area-icon'
import { GoalLine } from '@/components/goal-line'
import { Choice } from '@/components/choice'
import { QuestionCard } from '@/components/question-card'
import { TextAnswer } from '@/components/text-answer'
import type { AreaId } from '@/lib/areas'
import { useI18n } from '@/lib/i18n'
import {
  addGoal,
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
  straightToGoal = false,
  guided = false,
  onDone,
}: {
  area: AreaId
  /** The progress marks during the introduction; nothing when managing one area. */
  progress?: React.ReactNode
  /**
   * Skip the review question and open on "What is your goal?".
   *
   * Set when someone **opened this area on purpose** from `/areas/`, where tapping a row
   * that says "No goals yet" already answers "would you like to change something here".
   * Asking again is asking them to confirm the tap.
   *
   * The introduction leaves it off, and that is not an inconsistency: there, the area
   * arrives unbidden — six of them in a row — so whether this one is worth a goal at all
   * is a real question, and "Not right now" is a real answer to it.
   */
  straightToGoal?: boolean
  /**
   * The guided pass: one goal, one action, then the next area.
   *
   * Set only by the introduction. It is the inverse of `straightToGoal` today and still
   * its own prop, because the two say different things — one is about which question opens
   * the flow, the other about when it ends — and collapsing them would make a later
   * "open on the goal, but let them add three" impossible to express without unpicking it.
   */
  guided?: boolean
  onDone: () => void
}) {
  const { m } = useI18n()
  const person = usePerson()
  const state = readArea(person, area)

  const [chosenSub, setSub] = useState<Sub | null>(null)
  const sub = chosenSub ?? resume(state, straightToGoal)

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
          mark={<GoalIcon />}
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
             /**
             * On the area page the way out is always "Zurück", first goal or later one.
             *
             * "Bin noch nicht sicher" and "Das reicht" are both answers to a question that
             * walked up uninvited, which is the introduction's situation and not this one:
             * here the person opened the area, or pressed "+ Weiteres Ziel hinzufügen", so
             * the only thing the quiet control does is undo that. §42j2 asserts both sides.
             */
            skipLabel={
              straightToGoal
                ? m.goals.goalBack
                : state.activeGoals.length === 0
                  ? m.goals.goalSkip
                  : m.goals.stepsEnough
            }
            onSubmit={(value) => {
              /**
               * Writing a goal *is* answering "yes, something here".
               *
               * The review question used to be the only thing that recorded it, so
               * skipping that question would have left an area holding a live goal while
               * its newest review still said "not right now" — the contradiction the
               * explicit write existed to prevent. Recorded here instead: at the act,
               * rather than when a row was tapped, which is not a decision about anything.
               *
               * Guarded, because append-only means an unguarded write would add a
               * duplicate 'yes' on every goal added in the introduction, where the
               * question was already answered.
               */
              if (state.review !== 'yes') setReview(area, 'yes')
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
          /**
           * No note. "One is enough. You can add up to three." used to sit here, so the
           * first thing read on a screen asking what could help was a rule about how
           * many — an answer to a question nobody had asked. `ActionEntry` says it once
           * there is a first entry to add to.
           *
           * The goal, on the other hand, is now **always** shown. It used to appear only
           * with more than one goal in the area, which was right about telling goals
           * apart and wrong about the question: "this goal" needs a *this*, and with a
           * single goal its subject was nowhere on the screen.
           */
          eyebrow={<GoalLine text={goal.text} />}
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
            // In the introduction, saving the first action *is* the way on.
            autoContinue={guided}
          />

        </QuestionCard>
      )}

    </div>
  )
}

/** Where an interrupted pass through this area left off. */
function resume(state: AreaState, straightToGoal = false): Sub {
  /**
   * Opened on purpose: the tap was the answer to the review question, so the first thing on
   * screen is the field. Everything after it behaves identically either way.
   *
   * **Unconditional**, where it used to require the area to hold no goals. All three ways
   * `AreaManage` enters this flow want the goal question — an area with none, `reconsider`
   * answered yes (only reachable with none), and "add another goal", which is the one the
   * guard used to send to the steps screen of a goal it had not asked for yet.
   */
  if (straightToGoal) return 'goal'
  if (!state.review || state.review === 'not_now') return 'review'
  if (state.activeGoals.length === 0) return 'goal'
  return 'steps'
}
