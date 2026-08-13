'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { AreaIcon } from '@/components/area-icon'
import { Choice } from '@/components/choice'
import { OptionList } from '@/components/option-list'
import { TextAnswer } from '@/components/text-answer'
import { areas, type AreaId } from '@/lib/areas'
import { useI18n } from '@/lib/i18n'
import {
  addStep,
  type AreaState,
  completeStep,
  type Goal,
  pinStep,
  readArea,
  retireStep,
  type Step,
  unpinStep,
} from '@/lib/person/goals'
import { usePerson } from '@/lib/person/store'

/** One entry, with the context needed to show and act on it. */
type Row = { step: Step; state: AreaState; goal: Goal | undefined }

/**
 * What one entry is doing: nothing, being asked about, or being replaced.
 *
 * Keyed by **entry**, not by area. It used to be by area, because only one entry per
 * area was ever on screen; now every open entry is, so the row is the unit.
 */
type Busy = { stepId: string; phase: 'check' | 'add' }

/**
 * Everything open, across every life area — the answer to "what am I working on".
 *
 * This replaced a block per area that showed only that area's one *active* entry with
 * its own full-size "How is it going?" button. That shape answered "what is the state
 * of each area", which is the area pages' job; six blocks of chrome for at most six
 * lines of content is also how a start page becomes a dashboard.
 *
 * **Pinned entries come first**, and only when both groups exist do the two labels
 * appear — with everything pinned, or nothing, one clean list says more. Pinning is
 * not a ranking and not a limit: it is what you want to see first.
 *
 * **What each row does is stated, and only the control does it.** The words are plain
 * text; the row is not a button. Earlier the whole row *was* one, whose only content
 * was the person's own words, and tapping anywhere completed the thing immediately —
 * no confirmation, no undo, and visually identical to rows elsewhere that merely
 * select. Acting on an entry takes the explicit control beside it.
 *
 * That control asks "How is it going?" rather than offering "Done", because *done* is
 * only one of the ways this goes. "Eat lower-carb most days" is not finishable, and
 * making completion the single outcome quietly made the product a task list. The three
 * answers cover both kinds, and none of them counts, scores or congratulates.
 */
export function NextSteps() {
  const { m } = useI18n()
  const person = usePerson()
  const [busy, setBusy] = useState<Busy | null>(null)

  const states = areas.map((area) => readArea(person, area))

  // Flat, in area order then the model's own deterministic order within an area.
  // Grouping is a view concern, so `readArea` is left alone: pinned first, and each
  // group keeps that ordering rather than inventing a second one.
  const rows: Row[] = states.flatMap((state) => {
    const shown = [...state.open]
    // The entry being asked about stays in place after it leaves the open set, so the
    // follow-up appears where the row was rather than at the end of the list — or, if
    // it were dropped outright, nowhere at all.
    if (busy && !shown.some((step) => step.id === busy.stepId)) {
      const closing = state.steps.find((step) => step.id === busy.stepId)
      if (closing) shown.push(closing)
    }
    return shown.map((step) => ({
      step,
      state,
      goal: state.goals.find((candidate) => candidate.id === step.goalId),
    }))
  })
  const pinned = rows.filter((row) => row.step.pinned)
  const rest = rows.filter((row) => !row.step.pinned)
  const grouped = pinned.length > 0 && rest.length > 0

  // An area holding a goal that never got a single entry — interrupted setup, not a
  // pause someone chose. The first one only: naming every area at once would be a
  // list of things you have not done.
  const unfinished = states.find(
    (state) => state.activeGoals.length > 0 && state.steps.length === 0,
  )

  return (
    <div className="space-y-6">
      {/*
       * Mounted once, above the list, and never unmounted — with up to eighteen rows
       * that placement matters more, not less. A `role="status"` element inserted
       * *together with* its text generally announces nothing: assistive technology
       * watches an existing region for changes, so the region has to be there first.
       * One per row would be both wasteful and silent.
       */}
      <p role="status" className="sr-only">
        {busy?.phase === 'add' ? m.home.done : ''}
      </p>

      {rows.length === 0 && (
        <p className="max-w-prose text-sm leading-relaxed text-muted">{m.home.empty}</p>
      )}

      <UnfinishedNote area={unfinished?.area} />

      {[pinned, rest].map((group, index) =>
        group.length === 0 ? null : (
          <div key={index} className="space-y-3">
            {/* Only when there is a distinction to draw. */}
            {grouped && (
              <p className="text-sm text-muted">
                {index === 0 ? m.home.pinnedLabel : m.home.restLabel}
              </p>
            )}
            <ul className="space-y-6">
              {group.map((row) => (
                <li key={row.step.id}>
                  <EntryRow
                    row={row}
                    busy={busy?.stepId === row.step.id ? busy : null}
                    onBusy={setBusy}
                  />
                </li>
              ))}
            </ul>
          </div>
        ),
      )}
    </div>
  )
}

/**
 * One area holds a goal and nothing to try. Said once, quietly, with the area named
 * as a link so the sentence points at the place it is about.
 *
 * A `Link`, never a button: this page has already been through one round of a control
 * that looked like navigation and quietly acted instead.
 */
function UnfinishedNote({ area }: { area: AreaId | undefined }) {
  const { m } = useI18n()
  if (!area) return null

  // The placeholder has to survive translation: without it this falls back to plain
  // text rather than breaking the screen.
  const [before, after] = m.home.unfinished.split('{area}')
  if (after === undefined) {
    return <p className="max-w-prose text-sm leading-relaxed text-muted">{m.home.unfinished}</p>
  }

  return (
    <p className="max-w-prose text-sm leading-relaxed text-muted">
      {before}
      <Link href={`/areas/${area}`} className="link-inline">
        {m.areas[area]}
      </Link>
      {after}
    </p>
  )
}

function EntryRow({
  row,
  busy,
  onBusy,
}: {
  row: Row
  busy: Busy | null
  onBusy: (busy: Busy | null) => void
}) {
  const { m, t } = useI18n()
  const { step, state, goal } = row
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const opened = useRef(false)

  // Both directions, and both after the render: the panel *replaces* the trigger, so
  // an inline `.focus()` would land on a node React has not made yet. The `opened`
  // latch keeps an unrelated change from stealing focus, and the optional chain
  // matters because the row may be gone entirely by the time focus comes back.
  useEffect(() => {
    if (busy?.phase === 'check') {
      opened.current = true
      panel.current?.querySelector('button')?.focus()
      return
    }
    if (!busy && opened.current) {
      opened.current = false
      trigger.current?.focus()
    }
  }, [busy])

  const close = () => onBusy(null)

  /**
   * After an outcome: ask what could help, but only if that area now has nothing
   * open. Anything else still open is already on this page, so there is nothing to
   * choose between and nothing to offer.
   */
  function finish() {
    const remaining = state.open.filter((candidate) => candidate.id !== step.id)
    if (remaining.length === 0) onBusy({ stepId: step.id, phase: 'add' })
    else close()
  }

  if (busy?.phase === 'check') {
    return (
      <div ref={panel} className="space-y-4">
        <p className="max-w-prose leading-relaxed text-ink">{step.text}</p>
        <OptionList
          options={[
            { id: 'done', label: m.home.outcomeDone },
            { id: 'ongoing', label: m.home.outcomeOngoing },
            { id: 'aside', label: m.home.outcomeAside },
          ]}
          onSelect={(id) => {
            if (id === 'done') {
              completeStep(state.area, step.id)
              finish()
            } else if (id === 'aside') {
              retireStep(state.area, step.id)
              finish()
            } else {
              // Nothing to write. The person confirmed that nothing changed, and a
              // fact with no consumer is clutter.
              close()
            }
          }}
        />
        <Choice options={[{ label: m.home.cancel, tone: 'quiet', onSelect: close }]} />
      </div>
    )
  }

  if (busy?.phase === 'add') {
    return (
      <div className="space-y-4">
        {/* Seen here; announced by the persistent region in `NextSteps`. */}
        <p className="text-sm text-accent">{m.home.done}</p>
        <p className="max-w-prose leading-relaxed text-ink">{m.home.newStepQuestion}</p>
        <TextAnswer
          placeholder={m.home.newStepPlaceholder}
          submitLabel={m.home.newStepSubmit}
          skipLabel={m.home.cancel}
          onSubmit={(value) => {
            addStep(state.area, value, goal?.id)
            close()
          }}
          onSkip={close}
        />
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      {/* Plain text. Not a button, not an option, nothing that acts when touched. */}
      <p className="max-w-prose leading-relaxed text-ink">{step.text}</p>

      {/* One secondary line: what this is for, and where it lives. The area is a
          sibling of the controls and never wraps them — a link containing "How is it
          going?" would navigate on every answer. */}
      <p className="flex flex-wrap items-center gap-x-2 text-sm leading-relaxed text-muted">
        {goal && <span className="min-w-0">{goal.text}</span>}
        {goal && <span aria-hidden="true">·</span>}
        <Link
          href={`/areas/${state.area}?from=home`}
          className="flex items-center gap-x-1.5"
        >
          <AreaIcon area={state.area} />
          <span className="link-inline">{m.areas[state.area]}</span>
        </Link>
      </p>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pt-1">
        <button
          ref={trigger}
          type="button"
          className="btn btn-sm btn-quiet"
          // Names the thing it is about: several of these on one page all reading
          // "How is it going?" are identical controls out loud.
          aria-label={t(m.home.checkOn, { text: step.text })}
          onClick={() => onBusy({ stepId: step.id, phase: 'check' })}
        >
          {m.home.check}
        </button>
        <button
          type="button"
          className="btn btn-sm btn-quiet"
          aria-label={t(step.pinned ? m.manage.unpinOn : m.manage.pinOn, { text: step.text })}
          onClick={() =>
            step.pinned ? unpinStep(state.area, step.id) : pinStep(state.area, step.id)
          }
        >
          {step.pinned ? m.manage.unpin : m.manage.pin}
        </button>
      </div>
    </div>
  )
}
