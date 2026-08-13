'use client'

import { useState } from 'react'
import { AreaFlow } from '@/components/area-flow'
import { AreaIcon } from '@/components/area-icon'
import { Choice } from '@/components/choice'
import { GoalManage } from '@/components/goal-manage'
import { QuestionCard } from '@/components/question-card'
import { TextAnswer } from '@/components/text-answer'
import type { AreaId } from '@/lib/areas'
import { useI18n } from '@/lib/i18n'
import {
  addGoal,
  addStep,
  editStep,
  MAX_GOALS,
  MAX_OPEN_STEPS,
  pinStep,
  readArea,
  setReview,
  unpinStep,
  type Step,
} from '@/lib/person/goals'
import { usePerson } from '@/lib/person/store'

type View =
  | { at: 'reconsider' }
  | { at: 'flow' }
  | { at: 'overview' }
  | { at: 'goalNew' }
  | { at: 'goal'; goalId: string }
  | { at: 'add'; goalId: string }
  | { at: 'editStep'; stepId: string }

/**
 * One life area, opened on purpose rather than walked through.
 *
 * The page is the hierarchy: **the area is the `h1`, each goal is an `h2`, and what
 * is being tried for it is indented underneath.** Two typefaces carry two of those
 * levels for free — the display serif says *what you want*, the sans body says *what
 * you will do* — and the indent rule says the third. No card, no badge, no colour.
 *
 * Until this page had goals in it there was no heading element on it at all: the
 * area name was a `<p>` and the goal was a `<dd>`. The outline now matches what the
 * page looks like.
 *
 * **Order is the priority.** The goals are a real `<ol>`, the one put first is first,
 * and the ordinal is the only marking — three cues (number, position, list
 * semantics), none of them colour, and none of them changing an element's metrics.
 * There is no badge component and this does not want one.
 *
 * The caller must give this a `key` of the area id.
 */
export function AreaManage({ area, onDone }: { area: AreaId; onDone: () => void }) {
  const { m, t } = useI18n()
  const person = usePerson()
  const state = readArea(person, area)

  // An area with nothing current gets the question again rather than an empty page.
  const [view, setView] = useState<View>(
    state.activeGoals.length > 0 ? { at: 'overview' } : { at: 'reconsider' },
  )

  const back = () => setView({ at: 'overview' })

  // Priority first, then oldest — the order `readArea` already derives.
  const goals = state.priority
    ? [state.priority, ...state.activeGoals.filter((goal) => goal.id !== state.priority?.id)]
    : state.activeGoals

  if (view.at === 'flow') return <AreaFlow area={area} onDone={onDone} />

  if (view.at === 'reconsider') {
    return (
      <QuestionCard area={heading()} question={m.manage.reconsiderQuestion}>
        <Choice
          options={[
            {
              label: m.manage.reconsiderYes,
              onSelect: () => {
                // Recorded explicitly, so the newest review answer can never say
                // "not right now" while the area holds a live goal.
                setReview(area, 'yes')
                setView({ at: 'flow' })
              },
            },
            {
              // Nothing written: the previous answer is still the newest one.
              label: m.manage.reconsiderNo,
              tone: 'quiet',
              onSelect: onDone,
            },
          ]}
        />
      </QuestionCard>
    )
  }

  if (view.at === 'goalNew') {
    return (
      <QuestionCard area={heading()} question={m.manage.goalNewQuestion}>
        <TextAnswer
          placeholder={m.goals.goalPlaceholder}
          submitLabel={m.goals.goalSubmit}
          onSubmit={(value) => {
            addGoal(area, value)
            back()
          }}
        />
      </QuestionCard>
    )
  }

  if (view.at === 'goal') {
    const goal = state.activeGoals.find((candidate) => candidate.id === view.goalId)
    // Only reachable through a hand-edited store; degrading beats throwing.
    if (!goal) return <Fallback onDone={back} />
    return <GoalManage area={area} state={state} goal={goal} onDone={back} />
  }

  if (view.at === 'add') {
    const goal = state.activeGoals.find((candidate) => candidate.id === view.goalId)
    if (!goal) return <Fallback onDone={back} />
    return (
      <QuestionCard
        area={<p className="text-sm text-muted">{goal.text}</p>}
        question={m.goals.stepsQuestion}
      >
        <TextAnswer
          placeholder={m.goals.stepsPlaceholder}
          submitLabel={m.home.newStepSubmit}
          onSubmit={(value) => {
            // Not pinned. Nothing here decides what to keep in view — adding
            // something and choosing to look at it are two different intentions,
            // and the second one has its own control.
            addStep(area, value, goal.id)
            back()
          }}
        />
      </QuestionCard>
    )
  }

  if (view.at === 'editStep') {
    const step = state.steps.find((candidate) => candidate.id === view.stepId)
    if (!step) return <Fallback onDone={back} />
    return (
      <QuestionCard area={heading()} question={m.manage.editQuestion}>
        <TextAnswer
          placeholder={m.goals.stepsPlaceholder}
          submitLabel={m.manage.editSubmit}
          initialValue={step.text}
          onSubmit={(value) => {
            editStep(area, step.id, value)
            back()
          }}
        />
      </QuestionCard>
    )
  }

  // The cap is on the **area**, not the goal: three goals holding three each would
  // be nine open entries here, which is the task manager this is not.
  const atCap = state.open.length >= MAX_OPEN_STEPS
  const loose = state.open.filter((step) => step.goalId === undefined)

  return (
    <section className="space-y-10">
      {/* The area owns the `h1`, and it is rendered here rather than inside
          `AreaLabel` for the same reason `components/stored-areas.tsx` does it at the
          call site: that component must not render headings, or it would be wrong at
          its four other call sites. */}
      <h1 className="heading flex items-center gap-x-3">
        <AreaIcon area={area} size="eyebrow" />
        {m.areas[area]}
      </h1>

      <div className="space-y-3">
        <p className="text-sm text-muted">{m.manage.goalsLabel}</p>

        <ol className="space-y-8">
          {goals.map((goal, index) => {
            const trying = state.open.filter((step) => step.goalId === goal.id)

            return (
              <li key={goal.id} className="flex items-start gap-x-3">
                {/* The ordinal is the priority indicator, and `aria-hidden` because
                    the list already conveys position. Hidden entirely with one goal:
                    a lone "1." implies siblings that are not there. */}
                {goals.length > 1 && (
                  <span aria-hidden="true" className="pt-2 text-sm text-muted tabular-nums">
                    {index + 1}.
                  </span>
                )}

                <div className="min-w-0 flex-1 space-y-4">
                  <div className="space-y-2">
                    <h2 className="heading text-2xl leading-snug">{goal.text}</h2>
                    {/* Only when it is there. An absent reason is not an empty one,
                        and nothing invites filling it in from here. */}
                    {goal.why && (
                      <p className="max-w-prose text-sm leading-relaxed text-muted">{goal.why}</p>
                    )}
                  </div>

                  {/* The rule is what says "these belong to the goal above". It stays
                      on `line` because it is decorative rather than a control edge. */}
                  <div className="space-y-4 border-s-2 border-line ps-5">
                    {/* One list, no split. There used to be "Focusing on" above
                        "Also prepared", which claimed a distinction the model no
                        longer draws: entries are peers, and what you want kept in
                        view is a pin rather than a rank. */}
                    {trying.length > 0 ? (
                      <div className="space-y-1">
                        <p className="text-sm text-muted">{m.goals.entriesLabel}</p>
                        <ul className="space-y-1">
                          {trying.map((step) => (
                            <li key={step.id}>
                              <Entry
                                area={area}
                                step={step}
                                onEdit={() => setView({ at: 'editStep', stepId: step.id })}
                              />
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <p className="text-sm text-muted">{m.manage.noStep}</p>
                    )}

                    {/* `.btn-sm` is exactly what that size is for: these are
                        subordinate to the goal beside them, not to the page. Their
                        accessible names name the goal, because three visible "Change
                        this goal" buttons are three identical controls out loud. */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                      {!atCap && (
                        <button
                          type="button"
                          className="btn btn-sm btn-quiet"
                          aria-label={t(m.manage.addStepFor, { goal: goal.text })}
                          onClick={() => setView({ at: 'add', goalId: goal.id })}
                        >
                          {m.manage.addStep}
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn btn-sm btn-quiet"
                        aria-label={t(m.manage.goalChangeOn, { goal: goal.text })}
                        onClick={() => setView({ at: 'goal', goalId: goal.id })}
                      >
                        {m.manage.goalChange}
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            )
          })}
        </ol>

        {/* An entry belonging to no goal must never be invisible. It can only
            happen through a hand-edited store or one written by an older build, but
            "stored and unshowable" is the one state this page cannot have. */}
        {loose.length > 0 && (
          <div className="space-y-1 border-t border-line pt-4">
            <p className="text-sm text-muted">{m.manage.looseLabel}</p>
            <ul className="space-y-1">
              {loose.map((step) => (
                <li key={step.id}>
                  <Entry
                    area={area}
                    step={step}
                    onEdit={() => setView({ at: 'editStep', stepId: step.id })}
                  />
                </li>
              ))}
            </ul>
          </div>
        )}

        {atCap && <p className="text-sm text-muted">{m.goals.stepsFull}</p>}
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-line pt-6">
        {goals.length < MAX_GOALS && (
          <button
            type="button"
            className="btn btn-quiet"
            onClick={() => setView({ at: 'goalNew' })}
          >
            {m.manage.goalAdd}
          </button>
        )}
        <button type="button" className="btn btn-primary" onClick={onDone}>
          {m.manage.done}
        </button>
      </div>
    </section>
  )

  function heading() {
    return <p className="text-sm text-muted">{m.areas[area]}</p>
  }
}

/** The person's own words, and the two controls that act on them. */
function Entry({ area, step, onEdit }: { area: AreaId; step: Step; onEdit: () => void }) {
  const { m, t } = useI18n()
  return (
    <div className="flex items-start gap-x-3">
      {/* Plain text, not a control. Tapping someone's own words used to complete the
          thing they described, with no confirmation and nothing saying it would. */}
      <p className="min-w-0 flex-1 leading-relaxed text-ink">{step.text}</p>
      <span className="mt-0.5 flex shrink-0 items-center gap-x-2">
        <button
          type="button"
          className="btn btn-sm btn-quiet"
          aria-label={t(step.pinned ? m.manage.unpinOn : m.manage.pinOn, { text: step.text })}
          onClick={() => (step.pinned ? unpinStep(area, step.id) : pinStep(area, step.id))}
        >
          {step.pinned ? m.manage.unpin : m.manage.pin}
        </button>
        <button
          type="button"
          className="btn btn-sm btn-quiet"
          aria-label={t(m.goals.stepsEdit, { text: step.text })}
          onClick={onEdit}
        >
          {m.manage.reviewEdit}
        </button>
      </span>
    </div>
  )
}

/** A queue can only go stale through a hand-edited store; skipping degrades rather than throws. */
function Fallback({ onDone }: { onDone: () => void }) {
  const { m } = useI18n()
  return <Choice options={[{ label: m.manage.done, onSelect: onDone }]} />
}
