'use client'

import { useEffect, useRef, useState } from 'react'
import type { AreaId } from '@/lib/areas'
import { useI18n } from '@/lib/i18n'
import { completeGoal, setGoalProgress, type Goal, type Progress } from '@/lib/person/goals'
import { usePerson } from '@/lib/person/store'

/**
 * An optional check-in on one goal: how close does it feel, on five points.
 *
 * The first thing in this app that asks how something is *going* rather than what someone
 * wants to do, which is why the scope is drawn tightly: it is never asked for, never
 * reminded about, never scored, and a goal works exactly as well with no answer as with one.
 *
 * Two places show goals — the area page and the start page — and both mount this same
 * component. That is the whole reason it exists as its own file: the two used to be the kind
 * of pair that drifts, and a goal rated in one place has to mean the same thing in the other.
 *
 * ### Nothing is saved by touching a dot
 *
 * A radio holds a selection; the button commits it. Picking is a thought and saving is an
 * act, and on a question about your own life those should not be the same gesture. It is
 * also why `OptionList` — the app's other multi-option control — is wrong here: it fires on
 * tap and cannot express a choice waiting to be confirmed.
 *
 * ### The fifth point is a door
 *
 * Reaching a goal closes it, so choosing *Reached* turns the save into "Mark this goal as
 * reached?" rather than quietly setting a flag. The scale stays on screen while it asks, so
 * picking a different dot takes it straight back to an ordinary save — a confirmation screen
 * of its own would have hidden the one control that undoes the choice.
 *
 * An active goal therefore never rests at 5.
 */

const POINTS = [1, 2, 3, 4, 5] as const

const CHEERS = ['🎉', '🎯', '👏', '💯', '🤩']

/**
 * One of five marks for a goal that was reached, picked from the goal's own words.
 *
 * The variation is the point: a fixed mark becomes furniture after the third goal, where a
 * different one reads as a reaction rather than a template. It is the *only* flourish here —
 * no animation, no sound, no score — and it is `aria-hidden`, because the sentence beside it
 * already says what happened and "party popper" adds nothing to it.
 *
 * **Derived rather than random**, and both of the obvious alternatives are wrong. A
 * `Math.random()` in the render body makes a component draw differently for no reason the
 * app can explain, and is the classic hydration mismatch; picking one in an effect trips
 * `react-hooks/set-state-in-effect`, which exists because it costs a second render pass.
 * This is pure, and from the reader's side it is just as unguessable — which is all "random"
 * was ever asking for.
 */
function cheerFor(text: string): string {
  let sum = 0
  for (const character of text) sum += character.codePointAt(0) ?? 0
  return CHEERS[sum % CHEERS.length] ?? CHEERS[0]
}

/** The five words, in order, so a point can be looked up by index. */
function useScale() {
  const { m } = useI18n()
  return [
    m.manage.progress1,
    m.manage.progress2,
    m.manage.progress3,
    m.manage.progress4,
    m.manage.progress5,
  ] as const
}

/**
 * One mark.
 *
 * The same vocabulary as `components/progress-marks.tsx`, deliberately: filled is
 * `border-2 border-accent bg-accent`, empty is `border border-line-strong`. Twelve pixels in
 * both, so changing the value reflows nothing, and the two differ in fill *and* border width
 * as well as colour — `CLAUDE.md` §17 forbids carrying meaning by colour alone.
 *
 * `ProgressMarks` itself is not reused. It is a `role="progressbar"` with three states, and
 * `scripts/verify.mjs` reads *the* progressbar on a page — a second one inside a button would
 * break §31 quietly rather than loudly.
 */
function Dot({ filled }: { filled: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`h-3 w-3 rounded-full transition-colors ${
        filled ? 'border-2 border-accent bg-accent' : 'border border-line-strong bg-transparent'
      }`}
    />
  )
}

export function GoalProgress({
  area,
  goal,
  open,
  hasEntries,
  className = '',
  panelClassName = '',
  onOpen,
  onClose,
  onReached,
}: {
  area: AreaId
  goal: Goal
  open: boolean
  /**
   * Whether anything is being tried for this goal, which decides whether the reached
   * confirmation states a consequence. The host knows; a `Goal` does not carry its entries.
   */
  hasEntries: boolean
  /** Placement is the host's business — the area page pushes it to the end of a row. */
  className?: string
  /**
   * Placement for the open panel, which is a different problem from placing the trigger:
   * the start page indents it to line up under the goal's words, past the bullet and the
   * flag, where the trigger sits at the far end of the same row.
   */
  panelClassName?: string
  onOpen: () => void
  onClose: () => void
  /**
   * Confirmed *Reached*. The host shows the congratulation, because this component is
   * about to unmount: the goal leaves `activeGoals` in the same render.
   */
  onReached: (goalText: string) => void
}) {
  const { m, t } = useI18n()
  const scale = useScale()
  const trigger = useRef<HTMLButtonElement>(null)
  const opened = useRef(false)

  // Focus goes into the panel on open and comes back here when it closes without a result.
  // The `opened` guard keeps the returning branch from firing on mount — the same trap
  // `app/data/stored/page.tsx` documents, where without it every goal on the page would grab
  // focus as it rendered.
  useEffect(() => {
    if (open) {
      opened.current = true
      return
    }
    if (opened.current) {
      opened.current = false
      trigger.current?.focus()
    }
  }, [open])

  if (open) {
    // Mounting *is* the reset: the panel only exists while it is open, so its held selection
    // starts from what is stored every time, with no effect to keep them in step.
    return (
      <Panel
        area={area}
        goal={goal}
        hasEntries={hasEntries}
        className={panelClassName}
        onClose={onClose}
        onReached={onReached}
      />
    )
  }

  return (
    <button
      ref={trigger}
      type="button"
      className={`scale-toggle ${className}`}
      // The glyphs are the whole content, so the *button* is named and they stay hidden —
      // the rule `.pin-toggle` already follows. It names the goal because a page can hold
      // three, and three controls asking "how close are you?" are identical out loud.
      aria-label={t(m.manage.progressOn, {
        goal: t(m.manage.goalQuoted, { text: goal.text }),
        value: goal.progress === undefined ? m.manage.progressNone : scale[goal.progress - 1],
      })}
      onClick={onOpen}
    >
      {POINTS.map((point) => (
        <Dot key={point} filled={goal.progress !== undefined && point <= goal.progress} />
      ))}
    </button>
  )
}

function Panel({
  area,
  goal,
  hasEntries,
  className,
  onClose,
  onReached,
}: {
  area: AreaId
  goal: Goal
  hasEntries: boolean
  className: string
  onClose: () => void
  onReached: (goalText: string) => void
}) {
  const { m } = useI18n()
  const person = usePerson()
  const scale = useScale()
  const [picked, setPicked] = useState<Progress | undefined>(goal.progress)
  const start = useRef<HTMLInputElement>(null)

  useEffect(() => {
    start.current?.focus()
  }, [])

  // Where the caret lands: on what is already stored, so arrowing away from it is a change
  // rather than a first choice. With nothing stored it lands on the first point.
  const initial = goal.progress ?? 1
  const reaching = picked === 5

  function save() {
    if (picked === undefined) return
    setGoalProgress(person, area, goal.id, picked)
    if (picked === 5) {
      // Two facts in causal order — "I got there", then "so this is done". `completeGoal`
      // is the same writer the "I have reached this" control uses, so everything downstream
      // (the entry cascade, `activeGoals`, `/data/stored/`) behaves identically.
      completeGoal(area, goal.id)
      onReached(goal.text)
    }
    onClose()
  }

  return (
    <form
      className={`w-full space-y-4 ${className}`}
      onSubmit={(event) => {
        event.preventDefault()
        save()
      }}
    >
      <fieldset className="space-y-2">
        <legend className="max-w-prose text-sm leading-relaxed text-muted">
          {m.manage.progressQuestion}
        </legend>

        {/**
         * **The two ends are not labelled**, and the scale is better for it.
         *
         * "Feels far away" and "Reached" sat under the first and last dot as anchors — the
         * conventional questionnaire layout, and here it added a line of small print to a
         * control that is meant to take a moment. Left-to-right already says which way the
         * scale runs, and the line below names whatever is currently picked, so the words
         * arrive when they are useful rather than sitting there permanently.
         *
         * Every point still carries its full name for anyone listening; the removal is
         * visual only.
         *
         * `-ms-2` pulls the row back level with the text above it: each option carries
         * padding so it is big enough to hit, which would otherwise indent the first dot.
         */}
        <div className="-ms-2 flex flex-wrap items-center">
          {POINTS.map((point) => (
            <label key={point} className="scale-option">
              <input
                ref={point === initial ? start : undefined}
                type="radio"
                name={`progress-${goal.id}`}
                value={point}
                checked={picked === point}
                onChange={() => setPicked(point)}
                className="sr-only"
              />
              {/* Each option named in full, so it is "Getting closer, 3 of 5" out loud
                  rather than one nameless dot among five. */}
              <span className="sr-only">{scale[point - 1]}</span>
              <Dot filled={picked !== undefined && point <= picked} />
            </label>
          ))}
        </div>
      </fieldset>

      {reaching ? (
        <div className="space-y-1">
          <p className="max-w-prose leading-relaxed text-ink">{m.manage.reachedQuestion}</p>
          {/* Only when there is something to set aside. With nothing being tried for the
              goal there is no consequence to state — the rule the other closing path
              already follows, and a confirmation with nothing to say is the step that
              teaches people to tap through steps. */}
          {hasEntries && (
            <p className="max-w-prose text-sm leading-relaxed text-muted">
              {m.manage.goalCloseNote}
            </p>
          )}
        </div>
      ) : (
        /**
         * What the current pick means, in words — the only label the scale has now that the
         * ends are unlabelled, and the reason a middle point is legible at all.
         *
         * The line is **always** rendered, holding a space when nothing is picked. Letting it
         * appear on the first tap would move the two buttons down by its height, so choosing
         * would shift the control you are about to press — the layout-stability rule this
         * project applies to indicator states, for the same reason.
         */
        <p className="text-sm text-ink">
          {picked === undefined ? ' ' : scale[picked - 1]}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <button type="submit" className="btn btn-primary" disabled={picked === undefined}>
          {reaching ? m.manage.reachedYes : m.manage.progressSave}
        </button>
        {/* No extra emphasis on the safe choice here, unlike the deletion confirmation.
            Reaching a goal is the good outcome, and dressing it as a hazard would be the
            wrong tone. */}
        <button type="button" className="btn btn-quiet" onClick={onClose}>
          {reaching ? m.manage.goalCloseCancel : m.goals.stepsEditCancel}
        </button>
      </div>
    </form>
  )
}

/**
 * The congratulation, and the live region that announces it.
 *
 * Always mounted, with empty text when there is nothing to say. That is not tidiness: a
 * `role="status"` inserted *together with* its text announces nothing, because the region has
 * to already exist for the change to be a change — the same trap `app/data/stored/page.tsx`
 * documents.
 *
 * It lives in the host rather than inside the card because confirming removes the goal from
 * `activeGoals` in the same render — there is no card left to render into.
 *
 * The goal's words still come in, and are deliberately **not shown**: they seed the mark, so
 * two goals in a row do not get the same one. The sentence itself stays generic, which is the
 * honest version — quoting a half-typed goal back at someone is slightly absurd, and the
 * moment does not need the app to prove it was paying attention.
 *
 * One sentence, and a way on. No confetti, no sound, no points — reaching something you set
 * out to do is worth marking, and then the app should get out of the way. Dismissed by a
 * button rather than a timer, because a message that removes itself takes the reading of it
 * out of the person's hands.
 *
 * **While it is on screen the host shows nothing else.** It is the one moment on these pages
 * that is not a question, and putting "there is nothing to see here yet" underneath it —
 * which is what an emptied area says — answers a celebration with a shrug.
 */
export function GoalReached({ goalText, onClose }: { goalText: string | null; onClose: () => void }) {
  const { m } = useI18n()
  const close = useRef<HTMLButtonElement>(null)

  // Focus follows the outcome. Without this, confirming drops a keyboard user on `<body>`,
  // because the control they were using unmounted with the goal.
  useEffect(() => {
    if (goalText !== null) close.current?.focus()
  }, [goalText])

  const said = goalText === null ? '' : `${m.manage.congrats} ${m.manage.congratsAny}`

  return (
    <>
      <p role="status" className="sr-only">
        {said}
      </p>
      {goalText !== null && (
        <div className="card space-y-4">
          <p className="max-w-prose leading-relaxed text-ink">
            <span aria-hidden="true">{cheerFor(goalText)}</span>{' '}
            <span className="font-medium">{m.manage.congrats}</span> {m.manage.congratsAny}
          </p>
          {/* Under the sentence and full weight: with the rest of the page hidden this is the
              only thing to do, so anything quieter would be a control pretending to be
              optional. Beside the text it read as a dismiss-and-forget. */}
          <div>
            <button ref={close} type="button" className="btn btn-primary" onClick={onClose}>
              {m.manage.congratsClose}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
