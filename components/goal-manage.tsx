'use client'

import { useState } from 'react'
import { Choice } from '@/components/choice'
import { QuestionCard } from '@/components/question-card'
import { TextAnswer } from '@/components/text-answer'
import type { AreaId } from '@/lib/areas'
import { useI18n } from '@/lib/i18n'
import {
  completeGoal,
  editGoal,
  prioritiseGoal,
  retireGoal,
  type AreaState,
  type Goal,
} from '@/lib/person/goals'

/** The field, or the one question that closing a goal still has to ask. */
type View = 'edit' | 'closing'

/**
 * One goal, opened from its area to be changed.
 *
 * Split out of `AreaManage` for the reason `/areas/` was split out of the home
 * screen: that component was a seven-state machine, and everything a goal can have
 * done to it would have made it thirteen. The area owns the list and what is being
 * tried; this owns one goal.
 *
 * **This opens on the field, not on a menu.** It used to present five equally weighted
 * `.option` cards — reword, reason, put first, reached, remove — so changing a word
 * meant answering "what would you like to change?" first. Five peers with none
 * emphasised is the right shape for a *decision*; renaming is not a decision, it is an
 * edit, and the menu made the commonest thing the slowest.
 *
 * So the rename is the screen. What is left of the other actions sits under it as quiet
 * `.btn-sm` controls, subordinate to the field rather than competing with it:
 *
 * - **Remove from your current goals** — the other thing basic management means.
 * - **I have reached this** — kept because it is semantically *not* removal, and the
 *   record distinguishes them (`done` versus `retired`). It is one quiet control here
 *   rather than a peer card, which is what stops that distinction from turning basic
 *   editing back into a four-option workflow.
 * - **Move this to the top** — only where there is something to be first among.
 *
 * **Writing a reason is gone from the flow**, and the read path stays. `goal.why` still
 * renders under its goal on the area page and on `/data/stored/`, so a reason someone
 * already wrote is still theirs and still visible; there is simply no longer a way to
 * add one. It was a fifth peer on the commonest management screen, which is exactly the
 * weight it should not have had. `setGoalWhy` went with the flow rather than being left
 * uncalled — reads never write, the same rule the legacy area pointers follow.
 */
export function GoalManage({
  area,
  state,
  goal,
  onDone,
}: {
  area: AreaId
  state: AreaState
  goal: Goal
  onDone: () => void
}) {
  const { m } = useI18n()
  const [view, setView] = useState<View>('edit')
  /** Which of the two ways of closing a goal is being confirmed. */
  const [closing, setClosing] = useState<'reached' | 'dropped'>('reached')

  const heading = <p className="text-sm text-muted">{goal.text}</p>
  /** What closing this goal would take with it. */
  const trying = state.open.filter((step) => step.goalId === goal.id)

  function close(how: 'reached' | 'dropped') {
    // Only worth confirming when it costs something. With nothing being tried for
    // this goal there is no consequence to state, and a confirmation with nothing
    // to say is a step that teaches people to tap through steps.
    if (trying.length === 0) {
      if (how === 'reached') completeGoal(area, goal.id)
      else retireGoal(area, goal.id)
      onDone()
      return
    }
    setClosing(how)
    setView('closing')
  }

  if (view === 'closing') {
    return (
      <QuestionCard
        eyebrow={heading}
        question={closing === 'reached' ? m.manage.goalReachedQuestion : m.manage.goalDropQuestion}
        note={m.manage.goalCloseNote}
      >
        <Choice
          options={[
            {
              label: closing === 'reached' ? m.manage.goalReached : m.manage.goalDrop,
              onSelect: () => {
                if (closing === 'reached') completeGoal(area, goal.id)
                else retireGoal(area, goal.id)
                onDone()
              },
            },
            { label: m.manage.goalCloseCancel, tone: 'quiet', onSelect: () => setView('edit') },
          ]}
        />
      </QuestionCard>
    )
  }

  // The eyebrow stays even though the field is prefilled with the same words: a form
  // control's value is not text on the page, so without it the goal being edited would
  // be unreadable to anything that reads the page rather than the DOM — including the
  // person, once there are three goals that all open the same screen.
  return (
    <QuestionCard eyebrow={heading} question={m.manage.editQuestion}>
      <TextAnswer
        placeholder={m.goals.goalPlaceholder}
        submitLabel={m.goals.stepsEditSubmit}
        initialValue={goal.text}
        onSubmit={(value) => {
          // The same goal said differently — same id, so everything being tried for it
          // stays attached and nothing has to be asked about.
          editGoal(area, goal.id, value)
          onDone()
        }}
      />

      {/* Under the field and quieter than it, on a rule: these act on the goal as a
          whole, while the field above acts on its wording. `.btn-sm btn-quiet` is what
          that size is for — subordinate to the thing beside them, not to the page. */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-line pt-5">
        {/* Only where there is something to be first among. One goal put first is a
            statement about nothing. */}
        {state.activeGoals.length > 1 && state.priority?.id !== goal.id && (
          <button
            type="button"
            className="btn btn-sm btn-quiet"
            onClick={() => {
              prioritiseGoal(area, goal.id)
              onDone()
            }}
          >
            {m.manage.goalTop}
          </button>
        )}
        <button type="button" className="btn btn-sm btn-quiet" onClick={() => close('reached')}>
          {m.manage.goalReached}
        </button>
        <button type="button" className="btn btn-sm btn-quiet" onClick={() => close('dropped')}>
          {m.manage.goalDrop}
        </button>
      </div>
    </QuestionCard>
  )
}
