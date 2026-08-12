'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { AreaLabel } from '@/components/area-label'
import { Choice } from '@/components/choice'
import { OptionList } from '@/components/option-list'
import { TextAnswer } from '@/components/text-answer'
import { areas, type AreaId } from '@/lib/areas'
import { useI18n } from '@/lib/i18n'
import {
  addStep,
  type AreaState,
  chooseStep,
  completeStep,
  readArea,
  retireStep,
} from '@/lib/person/goals'
import { usePerson } from '@/lib/person/store'

/** What the row is doing: nothing, asking, or offering the next one. */
type Busy = { area: AreaId; phase: 'check' | 'offer' | 'pick' }

/**
 * The few things being worked on, one per life area.
 *
 * Only areas with something active appear. Areas without one are not shown as
 * gaps to fill — an area nobody is working on right now is not a failure to
 * display.
 *
 * **What each row does is stated, and only the control does it.** Previously the
 * whole row was one full-width button whose only content was the person's own
 * words, and tapping anywhere on it completed the thing immediately — no
 * confirmation, no undo, and visually identical to the rows elsewhere that merely
 * select. The words are now plain text. Acting on them takes the explicit control.
 *
 * That control asks "How is it going?" rather than offering "Done", because *done*
 * is only one of the ways this goes. "Eat lower-carb most days" is not finishable,
 * and making completion the single outcome quietly made the product a task list.
 * The four answers cover both kinds, and none of them counts, scores or
 * congratulates.
 */
export function NextSteps() {
  const { m } = useI18n()
  const person = usePerson()
  const [busy, setBusy] = useState<Busy | null>(null)

  const states = areas.map((area) => readArea(person, area))

  // The area being worked on stays on screen after its step stops being active, so
  // what happens next appears where the row was rather than after a jump.
  const rows = states.filter((state) => state.active || state.area === busy?.area)

  // A goal with no entry ever written is setup that was interrupted — closing the
  // tab midway through the last area does exactly this. Saying nothing would leave
  // "that is a fine place to be" claiming everything is settled when it is not. An
  // area paused *on purpose* has entries behind it and is excluded: that is a real
  // answer, and pointing at it would be nagging.
  //
  // The first one rather than all of them, and that is the calm choice: naming every
  // areas at once would be a list of things you have not done. Once this one is
  // finished the next takes its place, so nothing is hidden.
  const unfinished = states.find(
    (state) => state.activeGoals.length > 0 && state.steps.length === 0,
  )

  if (rows.length === 0) {
    return (
      // Both lines are guidance rather than a problem report, and they are weighted
      // like it: `text-sm text-muted`, the same as every other empty state in the app.
      // Nothing is wrong when there is nothing active.
      <div className="space-y-3">
        <p className="max-w-prose text-sm leading-relaxed text-muted">{m.home.empty}</p>
        <UnfinishedNote area={unfinished?.area} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <UnfinishedNote area={unfinished?.area} />
      {/**
       * The live region is here, mounted once and never unmounted, rather than
       * inside the row that has something to say.
       *
       * A `role="status"` element inserted *together with* its text generally
       * announces nothing: assistive technology watches an existing region for
       * changes, so the region has to be there first. Visually hidden, because the
       * rows say the same thing in their own layout.
       */}
      <p role="status" className="sr-only">
        {busy?.phase === 'offer' ? m.home.done : ''}
      </p>

      <ul className="space-y-8">
        {rows.map((state) => (
          <li key={state.area} className="space-y-3">
            {/* The area's name opens the area. It is a sibling of the controls below,
                never a wrapper around them, so nothing inside the row can navigate by
                accident — the entry's own words stay inert and "How is it going?" still
                only opens the answers. `from=home` tells that page where to come back
                to; see `components/area-screen.tsx`. */}
            <AreaLabel area={state.area} href={`/areas/${state.area}?from=home`} />
            <Row state={state} busy={busy?.area === state.area ? busy : null} onBusy={setBusy} />
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * The one line on this page that points somewhere else: an area whose setup was
 * interrupted, named and linked so that finishing it is one tap rather than a hunt
 * through the areas list.
 *
 * The link is the area's own name. That makes it good link text out of context —
 * "Body & Health" says where it goes, where a link on the words "life area" would
 * not — and it is the same name the destination is titled with.
 *
 * It navigates and does nothing else. A `Link`, not a button: nothing here changes
 * any stored state, and this page has already been through one round of a control
 * that looked like navigation and quietly acted instead.
 */
function UnfinishedNote({ area }: { area: AreaId | undefined }) {
  const { m } = useI18n()
  if (!area) return null

  // The catalog owns the sentence and the placeholder marks where the area name
  // goes. A translation that loses `{area}` degrades to plain prose rather than
  // throwing or printing the placeholder — the same rule `t()` follows.
  const [before, after] = m.home.unfinished.split('{area}')

  return (
    <p className="max-w-prose text-sm leading-relaxed text-muted">
      {before}
      {after !== undefined && (
        <>
          <Link href={`/areas/${area}`} className="link-inline">
            {m.areas[area]}
          </Link>
          {after}
        </>
      )}
    </p>
  )
}

function Row({
  state,
  busy,
  onBusy,
}: {
  state: AreaState
  busy: Busy | null
  onBusy: (busy: Busy | null) => void
}) {
  const { m, t } = useI18n()
  const active = state.active
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const opened = useRef(false)

  // Focus follows the interaction in both directions: into the answers when they
  // open, and back to the control that opened them when they close. A keyboard user
  // who cancels should not be dropped back at the top of the page.
  //
  // Both halves have to happen *after* the render that changes the DOM — the
  // answers replace the trigger rather than appearing beside it, so on the way out
  // the button does not exist yet at the moment the decision to close is made.
  // Calling `.focus()` inline would be a no-op on a node React has not created.
  useEffect(() => {
    if (busy?.phase === 'check') {
      opened.current = true
      panel.current?.querySelector('button')?.focus()
      return
    }
    if (!busy && opened.current) {
      opened.current = false
      // Absent when the row itself has gone — nothing is active any more — which
      // is a legitimate outcome rather than a case to handle.
      trigger.current?.focus()
    }
  }, [busy])

  const close = () => onBusy(null)

  if (busy?.phase === 'check') {
    return (
      <div ref={panel} className="space-y-4">
        {/* The answers replace the row, so without this the question is about
            something no longer on screen. The accessible name carries it either
            way; a sighted person was being asked to remember it. */}
        {active && <p className="max-w-prose leading-relaxed text-ink">{active.text}</p>}
        {/**
         * Three answers, not four.
         *
         * "I would rather do something else" and "This does not fit anymore" were two
         * labels for one state — this is not right for me now — and offering both asked
         * the person to classify their own dissatisfaction before the app would act.
         * The single answer sets the entry aside and then offers to choose another,
         * which is what both of the old paths ended up doing anyway.
         */}
        <OptionList
          options={[
            { id: 'done', label: m.home.outcomeDone },
            { id: 'ongoing', label: m.home.outcomeOngoing },
            { id: 'aside', label: m.home.outcomeAside },
          ]}
          onSelect={(id) => {
            if (!active) return close()
            if (id === 'done') {
              completeStep(state.area, active.id)
              onBusy({ area: state.area, phase: 'offer' })
              return
            }
            if (id === 'aside') {
              // Out of current use, still kept — `retireStep` never deletes. The
              // 'offer' phase then asks whether to choose something else, which is the
              // half the old "rather do something else" answer contributed.
              retireStep(state.area, active.id)
              onBusy({ area: state.area, phase: 'offer' })
              return
            }
            // "Still on it" writes nothing. Nothing changed, the active pointer
            // already says so, and a fact with no consumer is clutter. This is a
            // decision about *this* UI, not a rule about the model: once the app
            // checks in periodically, the answer and its timestamp become the
            // signal resurfacing would need. See `docs/goals-and-areas.md`.
            close()
          }}
        />
        <Choice options={[{ label: m.home.cancel, tone: 'quiet', onSelect: close }]} />
      </div>
    )
  }

  if (busy?.phase === 'offer') {
    return (
      <div className="space-y-4">
        {/* Seen here; announced by the persistent region in `NextSteps`. */}
        <p className="text-sm text-accent">{m.home.done}</p>
        <p className="leading-relaxed text-ink">{m.home.chooseNextQuestion}</p>
        <Choice
          options={[
            {
              label: m.home.chooseNext,
              onSelect: () => onBusy({ area: state.area, phase: 'pick' }),
            },
            {
              // Nothing is written: the area simply has no active entry, which is
              // already true and is a fine place to leave it.
              label: m.home.later,
              tone: 'quiet',
              onSelect: () => onBusy(null),
            },
          ]}
        />
      </div>
    )
  }

  if (busy?.phase === 'pick') {
    const others = state.open.filter((step) => step.id !== active?.id)
    // Every branch offers a way out, and taking it writes nothing.
    //
    // Reached from "Choose something" after an entry was finished or set aside. The way
    // out matters because the alternative is a mandatory field with only the page's own
    // navigation to escape through — a dead end this flow shipped once.
    const back = <Choice options={[{ label: m.home.cancel, tone: 'quiet', onSelect: close }]} />

    return others.length > 0 ? (
      <div className="space-y-4">
        <OptionList
          options={others.map((step) => ({ id: step.id, label: step.text }))}
          onSelect={(id) => {
            chooseStep(state.area, id)
            onBusy(null)
          }}
        />
        {back}
      </div>
    ) : (
      <div className="space-y-4">
        <p className="leading-relaxed text-ink">{m.home.newStepQuestion}</p>
        {/* The way out rides in the field's own skip slot rather than below it, so it
            shares a row with Save instead of stacking under it. */}
        <TextAnswer
          placeholder={m.home.newStepPlaceholder}
          submitLabel={m.home.newStepSubmit}
          skipLabel={m.home.cancel}
          onSubmit={(value) => {
            // Linked to the goal this row is about. Without it the entry belongs to
            // nothing, and an entry belonging to nothing is one the area's own page
            // has no goal to list it under — invisible, while still being stored.
            const goalId = (state.priority ?? state.activeGoals[0])?.id
            chooseStep(state.area, addStep(state.area, value, goalId))
            onBusy(null)
          }}
          onSkip={close}
        />
      </div>
    )
  }

  if (!active) return null

  const serves = state.goals.find((goal) => goal.id === active.goalId)

  return (
    <div className="space-y-3">
      {/* The goal *this* entry serves, which is only knowable now that entries
          belong to a goal. It used to be the area's only goal, which happened to be
          the same thing while there could only be one. */}
      {serves && <p className="text-sm leading-relaxed text-muted">{serves.text}</p>}
      {/* Plain text. Not a button, not an option, nothing that acts when touched. */}
      <p className="max-w-prose leading-relaxed text-ink">{active.text}</p>
      <button
        ref={trigger}
        type="button"
        className="btn btn-quiet"
        // Names the thing as well as the question, so the control is unambiguous
        // out loud where several rows each offer the same visible words.
        aria-label={t(m.home.checkOn, { text: active.text })}
        onClick={() => onBusy({ area: state.area, phase: 'check' })}
      >
        {m.home.check}
      </button>
    </div>
  )
}
