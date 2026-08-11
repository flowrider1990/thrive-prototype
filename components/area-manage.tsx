'use client'

import { useState } from 'react'
import { AreaFlow } from '@/components/area-flow'
import { AreaIcon } from '@/components/area-icon'
import { Choice } from '@/components/choice'
import { OptionList } from '@/components/option-list'
import { QuestionCard } from '@/components/question-card'
import { TextAnswer } from '@/components/text-answer'
import type { AreaId } from '@/lib/areas'
import { useI18n } from '@/lib/i18n'
import {
  addStep,
  chooseStep,
  editStep,
  MAX_OPEN_STEPS,
  readArea,
  retireStep,
  setGoal,
  setReview,
} from '@/lib/person/goals'
import { usePerson } from '@/lib/person/store'

type View = 'reconsider' | 'flow' | 'overview' | 'goal' | 'review' | 'edit' | 'step' | 'add'

/**
 * One life area, opened on purpose rather than walked through.
 *
 * Deliberately small. It shows the current goal, what is being worked on, and
 * what else is prepared — and nothing else. No dates, no completed steps, no
 * counts, no recurrence, no priorities. Anything historical belongs on `/you`,
 * which is the page for looking, not the page for doing.
 *
 * The caller must give this a `key` of the area id.
 */
export function AreaManage({ area, onDone }: { area: AreaId; onDone: () => void }) {
  const { m } = useI18n()
  const person = usePerson()
  const state = readArea(person, area)

  // An area with no goal gets the question again rather than an empty overview.
  const [view, setView] = useState<View>(state.goal ? 'overview' : 'reconsider')
  // Captured when the goal changes: retiring a step as we go would otherwise
  // shorten the list we are walking through.
  const [queue, setQueue] = useState<string[]>([])

  const others = state.open.filter((step) => step.id !== state.active?.id)

  /** Finish with the step at the head of the review queue. */
  function advance() {
    const rest = queue.slice(1)
    setQueue(rest)
    setView(rest.length === 0 ? 'overview' : 'review')
  }

  const heading = (
    <p className="flex items-center gap-x-2 text-sm text-muted">
      <AreaIcon area={area} />
      {m.areas[area]}
    </p>
  )

  if (view === 'flow') {
    return <AreaFlow area={area} onDone={onDone} />
  }

  if (view === 'reconsider') {
    return (
      <div className="space-y-8">
        {heading}
        <QuestionCard question={m.manage.reconsiderQuestion}>
          <Choice
            options={[
              {
                label: m.manage.reconsiderYes,
                onSelect: () => {
                  // Recorded explicitly, so the newest review answer can never
                  // say "not right now" while the area holds a live goal. The
                  // earlier answer stays in history, which is the point of a log.
                  setReview(area, 'yes')
                  setView('flow')
                },
              },
              {
                // Nothing written: the previous answer is still the newest one,
                // and repeating it would add noise rather than information.
                label: m.manage.reconsiderNo,
                tone: 'quiet',
                onSelect: onDone,
              },
            ]}
          />
        </QuestionCard>
      </div>
    )
  }

  if (view === 'goal') {
    return (
      <div className="space-y-8">
        {heading}
        <QuestionCard question={m.manage.goalQuestion}>
          <TextAnswer
            placeholder={m.goals.goalPlaceholder}
            submitLabel={m.goals.goalSubmit}
            initialValue={state.goal}
            onSubmit={(value) => {
              setGoal(area, value)
              // Open steps are not silently inherited by the new goal, and not
              // silently dropped either. They belong to the area, so they get
              // looked at one by one.
              const open = state.open.map((step) => step.id)
              setQueue(open)
              setView(open.length === 0 ? 'overview' : 'review')
            }}
          />
        </QuestionCard>
      </div>
    )
  }

  if (view === 'review' || view === 'edit') {
    const step = state.steps.find((candidate) => candidate.id === queue[0])
    if (!step) {
      // The queue can only go stale through a hand-edited store; skipping is the
      // degrading-rather-than-throwing behaviour used everywhere else.
      return (
        <div className="space-y-8">
          {heading}
          <Choice options={[{ label: m.manage.done, onSelect: () => setView('overview') }]} />
        </div>
      )
    }

    if (view === 'edit') {
      return (
        <div className="space-y-8">
          {heading}
          <QuestionCard question={m.manage.editQuestion}>
            <TextAnswer
              placeholder={m.goals.stepsPlaceholder}
              submitLabel={m.manage.editSubmit}
              initialValue={step.text}
              onSubmit={(value) => {
                editStep(area, step.id, value)
                advance()
              }}
            />
          </QuestionCard>
        </div>
      )
    }

    return (
      <div className="space-y-8">
        {heading}
        <QuestionCard question={m.manage.reviewQuestion} note={step.text}>
          <Choice
            options={[
              { label: m.manage.reviewKeep, onSelect: advance },
              { label: m.manage.reviewEdit, tone: 'quiet', onSelect: () => setView('edit') },
              {
                label: m.manage.reviewRemove,
                tone: 'quiet',
                onSelect: () => {
                  retireStep(area, step.id)
                  advance()
                },
              },
            ]}
          />
        </QuestionCard>
      </div>
    )
  }

  if (view === 'step') {
    return (
      <div className="space-y-8">
        {heading}
        <QuestionCard question={m.goals.focusQuestion}>
          <OptionList
            options={state.open.map((step) => ({ id: step.id, label: step.text }))}
            onSelect={(id) => {
              chooseStep(area, id)
              setView('overview')
            }}
          />
        </QuestionCard>
      </div>
    )
  }

  if (view === 'add') {
    return (
      <div className="space-y-8">
        {heading}
        <QuestionCard question={m.home.newStepQuestion}>
          <TextAnswer
            placeholder={m.goals.stepsPlaceholder}
            submitLabel={m.home.newStepSubmit}
            onSubmit={(value) => {
              const id = addStep(area, value)
              // Nothing is being worked on, so the new step becomes it — no point
              // asking a question whose answer is the only option.
              if (!state.active) chooseStep(area, id)
              setView('overview')
            }}
          />
        </QuestionCard>
      </div>
    )
  }

  return (
    <section className="space-y-8">
      {heading}

      <dl className="space-y-6">
        <div className="space-y-1">
          <dt className="text-sm text-muted">{m.manage.goalLabel}</dt>
          <dd className="heading text-2xl leading-snug">{state.goal}</dd>
        </div>

        {state.active && (
          <div className="space-y-1">
            <dt className="text-sm text-muted">{m.manage.activeLabel}</dt>
            <dd className="leading-relaxed text-ink">{state.active.text}</dd>
          </div>
        )}

        {others.length > 0 && (
          <div className="space-y-1">
            <dt className="text-sm text-muted">{m.manage.preparedLabel}</dt>
            <dd>
              <ul className="space-y-1">
                {others.map((step) => (
                  <li key={step.id} className="leading-relaxed text-ink">
                    {step.text}
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        )}
      </dl>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-line pt-6">
        <button type="button" className="btn btn-quiet" onClick={() => setView('goal')}>
          {m.manage.changeGoal}
        </button>
        {others.length > 0 && (
          <button type="button" className="btn btn-quiet" onClick={() => setView('step')}>
            {m.manage.changeStep}
          </button>
        )}
        {state.open.length < MAX_OPEN_STEPS && (
          <button type="button" className="btn btn-quiet" onClick={() => setView('add')}>
            {m.manage.addStep}
          </button>
        )}
        <button type="button" className="btn btn-primary" onClick={onDone}>
          {m.manage.done}
        </button>
      </div>
    </section>
  )
}
