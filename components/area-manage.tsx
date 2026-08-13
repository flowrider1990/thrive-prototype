'use client'

import { useState } from 'react'
import { AreaFlow } from '@/components/area-flow'
import { AreaIcon } from '@/components/area-icon'
import { Choice } from '@/components/choice'
import { GoalManage } from '@/components/goal-manage'
import { Pin } from '@/components/icons'
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
      <QuestionCard eyebrow={heading()} question={m.manage.reconsiderQuestion}>
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
      <QuestionCard eyebrow={heading()} question={m.manage.goalNewQuestion}>
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
        eyebrow={<p className="text-sm text-muted">{goal.text}</p>}
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
      <QuestionCard eyebrow={heading()} question={m.manage.editQuestion}>
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
        <ol className="space-y-10">
          {goals.map((goal, index) => {
            /**
             * **Pinning deliberately does not reorder this list**, though it does reorder
             * the start page.
             *
             * The two lists answer different questions. The start page is everything open
             * across six areas with no inherent order, so putting pinned first is the only
             * thing making it a useful order at all. This is one goal's own short list,
             * where the order already means something — the sequence you wrote them in —
             * and a pin is a marker on an item rather than a sort key over the list.
             *
             * Sorting here also made the control move the thing it acts on: tap the pin
             * and the row jumps out from under your finger, with the row you were about
             * to read now somewhere else. On a list this short that is pure disorientation
             * and it buys no visibility, because you can already see all of it.
             *
             * §42d2 asserts the order holds, so this reads as the decision it is rather
             * than as the start page's rule not having been carried over.
             */
            const trying = state.open.filter((step) => step.goalId === goal.id)

            return (
              <li key={goal.id}>
                <div className="min-w-0 space-y-4">
                  {/**
                   * Three lines, and together they *are* the hierarchy: the app's label,
                   * the person's own words, then the question that turns one into the
                   * other.
                   *
                   * The visible numbered label replaces an `aria-hidden` ordinal. That
                   * marker was hidden with a single goal because a lone "1." implied
                   * siblings that were not there; a labelled "Goal #1:" does not, with
                   * "+ Add another goal" directly beneath it saying where #2 comes from.
                   * Position is still the priority, so the number is read off the list
                   * rather than stored anywhere.
                   */}
                  <div className="space-y-1.5">
                    <p className="text-sm text-muted tabular-nums">
                      {t(m.manage.goalNumber, { n: String(index + 1) })}
                    </p>
                    {/* Editing belongs to the goal, so its control sits with the goal —
                        not down among the entry controls, which act on a different level
                        of the hierarchy. `items-baseline` so the small button sits on the
                        serif line rather than floating beside it. */}
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <h2 className="heading text-2xl leading-snug">
                        {t(m.manage.goalQuoted, { text: goal.text })}
                      </h2>
                      <button
                        type="button"
                        className="btn btn-sm btn-quiet"
                        aria-label={t(m.manage.goalChangeOn, { goal: goal.text })}
                        onClick={() => setView({ at: 'goal', goalId: goal.id })}
                      >
                        {m.manage.goalChange}
                      </button>
                    </div>
                    {/* Only when it is there. There is no longer any way to write one,
                        and an absent reason is not an empty one. */}
                    {goal.why && (
                      <p className="max-w-prose text-sm leading-relaxed text-muted">{goal.why}</p>
                    )}
                  </div>

                  {/* The rule is what says "these belong to the goal above". It stays
                      on `line` because it is decorative rather than a control edge. */}
                  <div className="space-y-3 border-s-2 border-line ps-5">
                    {/* A question, where Package B deliberately left no heading at all.
                        That removal was right about the *label*: repeating "What you want
                        to try" once per goal said nothing the indent had not already said.
                        A question earns the line, because it says what the entries are
                        *for* — the step from something you want to something you could
                        actually do this week. */}
                    <p className="max-w-prose text-sm leading-relaxed text-muted">
                      {m.manage.goalHow}
                    </p>
                    {/* One list, no split. There used to be "Focusing on" above
                        "Also prepared", which claimed a distinction the model no
                        longer draws: entries are peers, and what you want kept in
                        view is a pin rather than a rank. */}
                    {trying.length > 0 ? (
                      <div>
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

                    {/* Alone here now. "Add something" and "Change this goal" used to sit
                        side by side as equals, which was the wrong claim: one adds to this
                        goal, the other acts on the goal itself. Editing moved up beside the
                        goal, so everything left in this indent operates on one level. */}
                    {!atCap && (
                      <div>
                        <button
                          type="button"
                          className="btn btn-sm btn-quiet"
                          aria-label={t(m.manage.addStepFor, { goal: goal.text })}
                          onClick={() => setView({ at: 'add', goalId: goal.id })}
                        >
                          {m.manage.addStep}
                        </button>
                      </div>
                    )}
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
    <div className="flex items-start gap-x-2.5">
      {/* The same pin as the start page, so the two screens say it the same way. */}
      <button
        type="button"
        className={`pin-toggle ${step.pinned ? 'pin-toggle-on' : ''}`}
        aria-label={t(step.pinned ? m.manage.unpinOn : m.manage.pinOn, { text: step.text })}
        onClick={() => (step.pinned ? unpinStep(area, step.id) : pinStep(area, step.id))}
      >
        <Pin filled={step.pinned} />
      </button>
      {/* Plain text, not a control. Tapping someone's own words used to complete the
          thing they described, with no confirmation and nothing saying it would. */}
      <p className="min-w-0 flex-1 leading-relaxed text-ink">{step.text}</p>
      <button
        type="button"
        className="btn btn-sm btn-quiet shrink-0"
        aria-label={t(m.goals.stepsEdit, { text: step.text })}
        onClick={onEdit}
      >
        {m.manage.reviewEdit}
      </button>
    </div>
  )
}

/** A queue can only go stale through a hand-edited store; skipping degrades rather than throws. */
function Fallback({ onDone }: { onDone: () => void }) {
  const { m } = useI18n()
  return <Choice options={[{ label: m.manage.done, onSelect: onDone }]} />
}
