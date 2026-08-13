'use client'

import { useState } from 'react'
import { Choice } from '@/components/choice'
import { OptionList } from '@/components/option-list'
import { QuestionCard } from '@/components/question-card'
import { TextAnswer } from '@/components/text-answer'
import type { AreaId } from '@/lib/areas'
import { useI18n } from '@/lib/i18n'
import {
  completeGoal,
  editGoal,
  prioritiseGoal,
  retireGoal,
  setGoalWhy,
  type AreaState,
  type Goal,
} from '@/lib/person/goals'

type View = 'menu' | 'reword' | 'why' | 'closing'

/**
 * One goal, opened from its area to be changed.
 *
 * Split out of `AreaManage` for the reason `/areas/` was split out of the home
 * screen: that component was a seven-state machine, and everything a goal can have
 * done to it would have made it thirteen. The area owns the list and what is being
 * tried; this owns one goal.
 *
 * Every option here is a peer in an `OptionList`, so none of them is emphasised —
 * there is no recommended thing to do to a goal you opened on purpose.
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
  const [view, setView] = useState<View>('menu')
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

  if (view === 'reword') {
    return (
      <QuestionCard eyebrow={heading} question={m.manage.editQuestion}>
        <TextAnswer
          placeholder={m.goals.goalPlaceholder}
          submitLabel={m.goals.stepsEditSubmit}
          initialValue={goal.text}
          onSubmit={(value) => {
            // The same goal said differently — same id, so everything being tried
            // for it stays attached and nothing has to be asked about.
            editGoal(area, goal.id, value)
            onDone()
          }}
        />
      </QuestionCard>
    )
  }

  if (view === 'why') {
    return (
      <QuestionCard eyebrow={heading} question={m.manage.goalWhyQuestion} note={m.manage.goalWhyNote}>
        <TextAnswer
          multiline
          // Load-bearing: submitting empty is how a reason is taken back. An
          // append-only log has no delete, so clearing means saying nothing, and
          // nothing reads as absent. The earlier wording stays in the history.
          allowEmpty
          maxLength={600}
          placeholder={m.goals.goalPlaceholder}
          submitLabel={m.goals.stepsEditSubmit}
          initialValue={goal.why ?? ''}
          onSubmit={(value) => {
            setGoalWhy(area, goal.id, value)
            onDone()
          }}
        />
      </QuestionCard>
    )
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
            { label: m.manage.goalCloseCancel, tone: 'quiet', onSelect: () => setView('menu') },
          ]}
        />
      </QuestionCard>
    )
  }

  return (
    <QuestionCard eyebrow={heading} question={m.manage.goalMenuQuestion}>
      <OptionList
        options={[
          { id: 'reword', label: m.manage.goalReword },
          {
            id: 'why',
            label: goal.why ? m.manage.goalWhyEdit : m.manage.goalWhy,
            // The invitation, and the reason for it, only where it is being offered
            // — not as a standing suggestion on the area's own page.
            note: goal.why ? undefined : m.manage.goalWhyInvite,
          },
          // Only where there is something to be first among. One goal put first is a
          // statement about nothing.
          ...(state.activeGoals.length > 1 && state.priority?.id !== goal.id
            ? [{ id: 'top', label: m.manage.goalTop, note: m.manage.goalTopNote }]
            : []),
          { id: 'reached', label: m.manage.goalReached },
          { id: 'drop', label: m.manage.goalDrop },
        ]}
        onSelect={(id) => {
          if (id === 'reword') setView('reword')
          else if (id === 'why') setView('why')
          else if (id === 'top') {
            prioritiseGoal(area, goal.id)
            onDone()
          } else if (id === 'reached') close('reached')
          else close('dropped')
        }}
      />
    </QuestionCard>
  )
}
