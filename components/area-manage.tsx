'use client'

import { useState } from 'react'
import { AreaFlow } from '@/components/area-flow'
import { AreaIcon, GoalIcon } from '@/components/area-icon'
import { GoalProgress, GoalReached } from '@/components/goal-progress'
import { Cross, Pencil, Star } from '@/components/icons'
import { TextAnswer } from '@/components/text-answer'
import type { AreaId } from '@/lib/areas'
import { useI18n } from '@/lib/i18n'
import {
  addStep,
  editGoal,
  editStep,
  MAX_GOALS,
  MAX_OPEN_STEPS,
  pinStep,
  prioritiseGoal,
  readArea,
  retireGoal,
  retireStep,
  unpinStep,
  type Step,
} from '@/lib/person/goals'
import { usePerson } from '@/lib/person/store'

type View =
  | { at: 'flow' }
  | { at: 'overview' }
  /**
   * `goalNew` is gone too, and with it the last duplicated screen. It asked the same
   * question as `AreaFlow`'s goal step, with the same placeholder, label and `addGoal`
   * call — and differed in one line, returning to the overview where the flow goes on to
   * ask for a next step. That divergence *was* the duplication, so adding a goal now
   * enters the flow like the first one does.
   *
   * `goal`, `add` and `editStep` went earlier with `GoalManage`: managing something used
   * to mean leaving the page that draws the hierarchy and coming back.
   */

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

  /**
   * Always the overview, empty or not.
   *
   * Opening an area with no goals used to go straight to "Was ist dein Ziel?" — asked for
   * once, then reconsidered: a tap on a row is a request to *see* the area, and answering
   * it with a text field skips past the one screen that says what state the area is in. The
   * overview draws its own empty state now, and "Ziel erstellen" there is what starts the
   * flow.
   *
   * That leaves `reconsider` with no way in, so it is gone. Its question — "Would you like
   * to change or explore something here now?" — is what the empty state replaced, and the
   * `setReview(area, 'yes')` it used to record now happens where a goal is actually written
   * (`AreaFlow`'s goal submit), so the invariant survives without it.
   */
  const [view, setView] = useState<View>({ at: 'overview' })

  /**
   * The four inline modes, each keyed by the id it acts on.
   *
   * Separate pieces of state rather than one union, because they are genuinely
   * independent: a goal being edited does not constrain which entry is. What *is*
   * coordinated is that opening one closes the others — two fields on screen at once is
   * two places the next keystroke could go.
   */
  const [editingGoal, setEditingGoal] = useState<string | null>(null)
  const [deletingGoal, setDeletingGoal] = useState<string | null>(null)
  const [editingStep, setEditingStep] = useState<string | null>(null)
  const [addingTo, setAddingTo] = useState<string | null>(null)
  const [evaluating, setEvaluating] = useState<string | null>(null)

  /**
   * The goal that was just reached, held by its **words** rather than by its id.
   *
   * Confirming removes it from `activeGoals` in the same render, so by the time the
   * congratulation is read there is no goal left to look up. Keeping the text is what lets
   * the message name what was achieved instead of saying "done".
   */
  const [reached, setReached] = useState<string | null>(null)

  const back = () => setView({ at: 'overview' })

  /** Opening any one inline mode closes the rest — two open panels are two places to type. */
  function onlyOpen(next: () => void) {
    setEditingGoal(null)
    setDeletingGoal(null)
    setEditingStep(null)
    setAddingTo(null)
    setEvaluating(null)
    next()
  }

  const allGoals = state.priority
    ? [state.priority, ...state.activeGoals.filter((goal) => goal.id !== state.priority?.id)]
    : state.activeGoals

  /**
   * The goal that has the page to itself, if one does.
   *
   * Three states take it: confirming a removal, changing the wording, and saying how close
   * it feels. Each asks **one** question about **one** goal, and each used to ask it as a
   * card among others — with two more goals and two page controls still offering things to
   * do, so the moments that need a single answer were the busiest states on the screen.
   *
   * Filtering the list is the whole mechanism: the card is already the question, so
   * everything else simply is not drawn. Nothing scrolls away and nothing is disabled.
   *
   * Editing an **entry** deliberately does not isolate. That field lives inside the entries
   * block, so hiding the surroundings would hide the thing being typed into; there the
   * narrower `busyHere` rule takes the goal's own controls down instead.
   */
  const isolated = deletingGoal ?? editingGoal ?? evaluating
  const goals = isolated ? allGoals.filter((goal) => goal.id === isolated) : allGoals

  /**
   * The congratulation takes the page in the same way, and needs its own flag because it is
   * the one state not attached to a goal id — the goal it is about has just left the list.
   *
   * Reaching the *last* goal in an area is what makes this matter: without it, "there is
   * nothing to see here yet" and an offer to create a goal appear directly under the
   * congratulation, which answers a moment with a shrug and a chore.
   */
  const celebrating = reached !== null

  /**
   * `back`, not `onDone`: finishing here returns to **this area**, not to the list of
   * areas.
   *
   * Writing a goal is the reason someone opened the area, so the useful thing to see next
   * is the goal they just wrote, with its entries under it — not a list of six areas one
   * of which they were already in. It used to leave the page entirely, which meant the one
   * screen showing what had just been created was the one you were sent away from.
   */
  /**
   * Where finishing the flow lands depends on whether the area has anything to come back
   * to — and the same expression answers both cases, because `state` is re-read after every
   * write.
   *
   * Backing out of the *first* goal leaves the area as empty as it was found, so returning
   * to its page would show a screen with nothing on it but the invitation just declined:
   * `/areas/` is the useful place. Backing out with goals already there returns to them.
   * And *finishing* always lands on the area, because by then `allGoals` counts the goal
   * that was just written — no flag needed to tell the two apart.
   */
  if (view.at === 'flow')
    return (
      <AreaFlow
        area={area}
        straightToGoal
        onDone={allGoals.length === 0 ? onDone : back}
      />
    )






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
      {/* `subject`, the larger size — the same one `QuestionCard` uses when the area is
          the heading. Both are this page at display scale, so a smaller mark here made the
          icon jump as you moved between them. */}
      <h1 className="heading flex items-center gap-x-3">
        <AreaIcon area={area} size="subject" />
        {m.areas[area]}
      </h1>

      {/**
       * Directly under the heading, because the goal it names has just left the page — and
       * above the empty state, since reaching the *last* goal produces both and
       * "nothing to see here" ahead of "congratulations" reads as the wrong one first.
       *
       * Always rendered: the live region inside has to exist before it has anything to say,
       * or the announcement is an insertion rather than a change and nothing is spoken.
       * Only its visible half is conditional.
       */}
      <GoalReached goalText={reached} onClose={() => setReached(null)} />

      {/**
       * An area with nothing in it says so, and offers one thing.
       *
       * Reachable by removing the last goal — which used to leave a heading, empty space,
       * and two controls, one of them offering to add "another" goal that had never
       * existed. A single primary reads as the way on rather than as a page that failed to
       * load, and the way *out* is the back link at the top, which every nested page has.
       */}
      {allGoals.length === 0 && !isolated && !celebrating && (
        <div className="space-y-6">
          <p className="max-w-prose leading-relaxed text-muted">{m.manage.emptyNote}</p>
          {/* One primary and one quiet way back, the same pairing the footer uses where
              there is a list. The back link at the top is the page's own exit; this is the
              one belonging to the two choices on offer here. */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setView({ at: 'flow' })}
            >
              {m.manage.goalCreate}
            </button>
            <button type="button" className="btn btn-quiet" onClick={onDone}>
              {m.manage.done}
            </button>
          </div>
        </div>
      )}

      {!celebrating && (
      <div className="space-y-3">
        {/* One card per goal, so a goal and its entries read as one object rather than
            as a run of lines that happen to be indented. `border-line` and not
            `line-strong`: this is a container, not a control — the edge groups, it does
            not invite a tap. Nothing inside it changed. */}
        <ol className="space-y-4">
          {goals.map((goal) => {
            const index = allGoals.indexOf(goal)
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
            /**
             * Whether this goal already has a field open under it.
             *
             * With one open, the goal's own edit and remove controls come down and so does
             * "+ Eintrag hinzufügen" — one thing at a time. Leaving them up offered three
             * more ways to start something else while something was half-written, and two
             * of them would have discarded it.
             */
            const entryEditing = editingStep !== null && trying.some((s) => s.id === editingStep)
            /**
             * The goal's own controls come down while anything under it is open — editing
             * an entry, adding one, *or* rating the goal. The add block is excluded from its
             * own condition, since that block is where the new-entry field lives.
             */
            const rating = evaluating === goal.id
            const busyHere = entryEditing || addingTo === goal.id || rating

            return (
              <li
                key={goal.id}
                className="card"
              >
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
                    {/* Numbered only where a number distinguishes something. With one
                        goal "Goal #1:" implies a second that is not there, which is the
                        objection that once justified having no label at all — keeping the
                        label and dropping the number answers both halves. */}
                    <p className="flex items-center gap-x-1.5 text-sm text-muted tabular-nums">
                      <GoalIcon />
                      {allGoals.length > 1
                        ? t(m.manage.goalNumber, { n: String(index + 1) })
                        : m.manage.goalOnly}
                    </p>
                    {/* Editing belongs to the goal, so its control sits with the goal —
                        not down among the entry controls, which act on a different level
                        of the hierarchy. `items-baseline` so the small button sits on the
                        serif line rather than floating beside it. */}
                    {editingGoal === goal.id ? (
                      /**
                       * Editing happens **here**, not on a screen of its own.
                       *
                       * Managing a goal used to mean leaving the page for `GoalManage` and
                       * coming back, which is the jumping this pass exists to remove. The
                       * field takes the heading's place, so what is being edited is where
                       * it was being read.
                       *
                       * **"I have reached this" is gone from here**, and the scale is why.
                       *
                       * It used to live in this state — the record distinguishes *reached*
                       * from *given up on*, and that distinction was worth a quiet control
                       * even if not a third icon on the row. The fifth point of "how close
                       * are you?" now makes exactly that distinction, with a confirmation
                       * that states what closing the goal takes with it, so this was a
                       * second door to one outcome reached from a screen about *wording*.
                       *
                       * The distinction itself is untouched: `completeGoal` still writes
                       * `done` and `retireGoal` still writes `retired`, and both are still
                       * reachable — one from the scale, one from the remove control.
                       */
                      <div className="space-y-3">
                        <TextAnswer
                          placeholder={m.goals.goalPlaceholder}
                          submitLabel={m.manage.editSubmit}
                          skipLabel={m.goals.stepsEditCancel}
                          initialValue={goal.text}
                          onSubmit={(value) => {
                            editGoal(area, goal.id, value)
                            setEditingGoal(null)
                          }}
                          onSkip={() => setEditingGoal(null)}
                        />
                        {/* Only where there is something to be first among. The row holds one
                            control now, so it is rendered only when that control exists —
                            an empty flex row is a gap nobody asked for. */}
                        {state.activeGoals.length > 1 && state.priority?.id !== goal.id && (
                          <div>
                            <button
                              type="button"
                              className="btn btn-sm btn-quiet"
                              onClick={() => {
                                prioritiseGoal(area, goal.id)
                                setEditingGoal(null)
                              }}
                            >
                              {m.manage.goalTop}
                            </button>
                          </div>
                        )}
                      </div>
                    ) : deletingGoal === goal.id ? (
                      /* One question, in place of the row it is about, so the thing being
                         removed is what the question is attached to. Not a modal: an
                         overlay needs focus trapping, and that is a dependency this does
                         not need. */
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                        <p className="max-w-prose leading-relaxed text-ink">
                          {t(m.manage.confirmDelete, {
                            goal: t(m.manage.goalQuoted, { text: goal.text }),
                          })}
                        </p>
                        <button
                          type="button"
                          className="btn btn-sm btn-quiet"
                          onClick={() => {
                            retireGoal(area, goal.id)
                            setDeletingGoal(null)
                          }}
                        >
                          {m.manage.confirmYes}
                        </button>
                        {/* Emphasised, because in a destructive step the safe choice is
                            the recommended one. */}
                        <button
                          type="button"
                          className="btn btn-sm btn-primary"
                          onClick={() => setDeletingGoal(null)}
                        >
                          {m.manage.confirmNo}
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                        <h2 className="heading text-2xl leading-snug">
                          {t(m.manage.goalQuoted, { text: goal.text })}
                        </h2>
                        {/**
                         * How close this feels — **first** in the group of three that sits at
                         * the end of the row.
                         *
                         * Two things decided that order. Edit and remove now land directly
                         * above the same two controls on every entry below, so the card has
                         * one column of act-on-this instead of two that nearly line up. And
                         * the scale is the odd one out — it asks a question where the other
                         * two act — so it sits on the far side of the group's own gap rather
                         * than between them and the words.
                         *
                         * `ms-auto` lives here and only here. Two auto margins in one flex
                         * row split the free space between them, which would prise the group
                         * apart instead of moving it — and this is the one of the three that
                         * is always present, so it is the reliable anchor.
                         *
                         * A **direct child** of this flex row rather than the far side of a
                         * `justify-between` pair, and that is load-bearing: §48e asserts the
                         * edit and remove controls share a parent with the heading, so
                         * wrapping the trailing group in a div to right-align it would break
                         * that. Auto margin does the same job and restructures nothing, and
                         * the row's `flex-wrap` still lets it drop to its own line at phone
                         * width.
                         *
                         * Open, it takes the same slot and lays out full width beneath the
                         * heading — so the goal being judged stays legible while it is
                         * judged. That is why it is not a fourth branch of the ternary above:
                         * those branches replace the `h2`.
                         */}
                        <GoalProgress
                          area={area}
                          goal={goal}
                          open={rating}
                          hasEntries={trying.length > 0}
                          className="ms-auto"
                          onOpen={() => onlyOpen(() => setEvaluating(goal.id))}
                          onClose={() => setEvaluating(null)}
                          onReached={setReached}
                        />
                        {/**
                         * The same bordered circle as the star on an entry, so a row reads as
                         * hit areas rather than as marks. Each is named after the goal it
                         * acts on: three buttons called "Edit" are three identical controls
                         * to anyone listening.
                         *
                         * **At the very end of the row, not beside the words.** They sat
                         * directly after the goal, which put two controls inside the sentence
                         * — the quoted line stopped reading as one thing, and where they
                         * landed moved with the length of what someone had written. Here they
                         * are also directly above the pencil and cross on every entry in the
                         * card, so one column acts and nothing nearly-aligns.
                         *
                         * `ms-2` sets them off from the scale, which asks rather than acts.
                         * The spacing is what says so, without a separator.
                         */}
                        {!busyHere && (
                        <>
                        <button
                          type="button"
                          className="pin-toggle ms-2"
                          aria-label={t(m.manage.goalChangeOn, { goal: goal.text })}
                          onClick={() => onlyOpen(() => setEditingGoal(goal.id))}
                        >
                          <Pencil />
                        </button>
                        <button
                          type="button"
                          className="pin-toggle"
                          aria-label={t(m.manage.deleteGoalOn, { goal: goal.text })}
                          onClick={() => onlyOpen(() => setDeletingGoal(goal.id))}
                        >
                          <Cross />
                        </button>
                        </>
                        )}
                      </div>
                    )}
                    {/* Only when it is there. There is no longer any way to write one,
                        and an absent reason is not an empty one. */}
                    {goal.why && (
                      <p className="max-w-prose text-sm leading-relaxed text-muted">{goal.why}</p>
                    )}
                  </div>

                  {/**
                   * The indent stays; the rule down its side does not. Inset is what says
                   * "these belong to the goal above" and it does that quietly — the line was
                   * a second edge inside the card, drawing a boundary within a boundary. A
                   * bullet on each entry carries what the rule was really for: marking these
                   * as a list rather than as loose lines.
                   *
                   * Hidden while the goal's removal is being confirmed, and while it is being
                   * rated.
                   *
                   * The question and the add control belong to a goal that may be about to
                   * go, so leaving them up asks how you want to reach something while
                   * asking whether to keep it — and offers a field for an entry that would
                   * be orphaned by the next tap. With them gone the confirmation is the
                   * only thing on the goal, which is what a confirmation is for.
                   *
                   * Rating is the same argument from the other direction: "how close are
                   * you?" and "how do you want to get there?" are two questions about the
                   * same goal, and answering one while the other is on screen is the
                   * split attention this page spent a whole pass removing. It matters most
                   * at the fifth point, where the next tap may close the goal these entries
                   * belong to.
                   */}
                  {isolated !== goal.id && (
                  <div className="space-y-3 ps-5">
                    {/* A question, where Package B deliberately left no heading at all.
                        That removal was right about the *label*: repeating "What you want
                        to try" once per goal said nothing the indent had not already said.
                        A question earns the line, because it says what the entries are
                        *for* — the step from something you want to something you could
                        actually do this week. */}
                    {/* A question asks for the first entry; with entries listed it would
                        be asking about what is plainly there, so it introduces them
                        instead. Same slot, same weight. */}
                    <p className="max-w-prose text-sm leading-relaxed text-muted">
                      {trying.length > 0 ? m.manage.goalHowDone : m.manage.goalHow}
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
                                editing={editingStep === step.id}
                                onEdit={() => onlyOpen(() => setEditingStep(step.id))}
                                onDone={() => setEditingStep(null)}
                              />
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {/* Alone here now. "Add something" and "Change this goal" used to sit
                        side by side as equals, which was the wrong claim: one adds to this
                        goal, the other acts on the goal itself. Editing moved up beside the
                        goal, so everything left in this indent operates on one level. */}
                    {!atCap &&
                      !entryEditing &&
                      (addingTo === goal.id ? (
                        // In place, not on a screen of its own. The whole point of this
                        // pass is that managing a goal and its entries never leaves the
                        // page the hierarchy is drawn on.
                        <TextAnswer
                          placeholder={m.goals.stepsPlaceholder}
                          submitLabel={m.goals.stepsSave}
                          skipLabel={m.goals.stepsEditCancel}
                          onSubmit={(value) => {
                            // Not pinned. Adding something and choosing to keep it in view
                            // are two intentions, and the second has its own control.
                            addStep(area, value, goal.id)
                            setAddingTo(null)
                          }}
                          onSkip={() => setAddingTo(null)}
                        />
                      ) : (
                        <div>
                          <button
                            type="button"
                            /**
                             * Primary while the goal has nothing under it, quiet once it
                             * does.
                             *
                             * A hint used to sit here saying nothing had been decided yet.
                             * The question directly above already says that, so the
                             * sentence was the third thing on screen making the same point
                             * — and none of them said what to do. Emphasis on the one
                             * control that does is the shorter way to say it.
                             */
                            className={`btn btn-sm ${trying.length === 0 ? 'btn-primary' : 'btn-quiet'}`}
                            aria-label={t(m.manage.addStepFor, { goal: goal.text })}
                            onClick={() => onlyOpen(() => setAddingTo(goal.id))}
                          >
                            {m.manage.addEntry}
                          </button>
                        </div>
                      ))}
                  </div>
                  )}
                </div>
              </li>
            )
          })}
        </ol>

        {/* An entry belonging to no goal must never be invisible. It can only
            happen through a hand-edited store or one written by an older build, but
            "stored and unshowable" is the one state this page cannot have. */}
        {!isolated && loose.length > 0 && (
          <div className="space-y-1 border-t border-line pt-4">
            <p className="text-sm text-muted">{m.manage.looseLabel}</p>
            <ul className="space-y-1">
              {loose.map((step) => (
                <li key={step.id}>
                  <Entry
                    area={area}
                    step={step}
                    editing={editingStep === step.id}
                    onEdit={() => onlyOpen(() => setEditingStep(step.id))}
                    onDone={() => setEditingStep(null)}
                  />
                </li>
              ))}
            </ul>
          </div>
        )}

        {!isolated && atCap && <p className="text-sm text-muted">{m.goals.stepsFull}</p>}
      </div>
      )}

      {/* No rule above these. It separated the goals from the page's own controls back
          when the goals were a run of lines; each goal is a bordered card now, so the line
          was a second edge doing the same job — and it read as a card boundary of its
          own. */}
      {!isolated && !celebrating && allGoals.length > 0 && (
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 pt-2">
        {allGoals.length < MAX_GOALS && (
          <button
            type="button"
            className="btn btn-quiet"
            onClick={() => setView({ at: 'flow' })}
          >
            {m.manage.goalAdd}
          </button>
        )}
        {/* Quiet, beside the equally quiet "add a goal". Nothing here is the
            recommended next thing — what is worth doing is in the list above. */}
        <button type="button" className="btn btn-quiet" onClick={onDone}>
          {m.manage.done}
        </button>
      </div>
      )}
    </section>
  )
}

/**
 * The person's own words and the three things that can be done to them.
 *
 * Pin, edit, remove — one shape for all three, so a row reads as hit areas rather than as
 * a mark and two words. Editing opens **here**; removing takes effect immediately and asks
 * nothing, which is safe rather than careless: append-only has no delete, so this records
 * that the entry is no longer current and `/data/stored/` still shows it. A mis-tap costs
 * a re-add.
 */
function Entry({
  area,
  step,
  editing,
  onEdit,
  onDone,
}: {
  area: AreaId
  step: Step
  editing: boolean
  onEdit: () => void
  onDone: () => void
}) {
  const { m, t } = useI18n()

  if (editing) {
    return (
      <TextAnswer
        placeholder={m.goals.stepsPlaceholder}
        submitLabel={m.manage.editSubmit}
        skipLabel={m.goals.stepsEditCancel}
        initialValue={step.text}
        onSubmit={(value) => {
          editStep(area, step.id, value)
          onDone()
        }}
        onSkip={onDone}
      />
    )
  }

  return (
    <div className="flex items-start gap-x-2.5">
      {/* Plain text, not a control. Tapping someone's own words used to complete the
          thing they described, with no confirmation and nothing saying it would. */}
      {/* A bullet, and a deliberately heavy one: with the rule gone it is what marks
          these as a list belonging to the goal above. `aria-hidden` because the `ul` it
          sits in already says "list item" — a spoken bullet would be the markup read
          twice. `leading-none` with a nudge down so it sits on the text's own line
          rather than shifting it. */}
      <span aria-hidden="true" className="mt-1 shrink-0 text-lg leading-none text-muted">
        &bull;
      </span>
      {/* Bold when starred, the same as the start page. */}
      <p className={`min-w-0 flex-1 leading-relaxed text-ink ${step.pinned ? 'font-semibold' : ''}`}>
        {step.text}
      </p>
      {/* All three controls together, to the right of the words.
          
          The pin used to sit *before* the entry, which read as a marker on it — but it
          put one hit area on one side of the row and two on the other, so the row had no
          single place where things could be done to it. Grouped, the words are the row
          and the controls are a cluster beside them. The pin is still first within the
          group: it is the one that changes what the entry *is* rather than its text. */}
      <button
        type="button"
        className={`pin-toggle shrink-0 ${step.pinned ? 'pin-toggle-on' : ''}`}
        aria-label={t(step.pinned ? m.manage.unpinOn : m.manage.pinOn, { text: step.text })}
        onClick={() => (step.pinned ? unpinStep(area, step.id) : pinStep(area, step.id))}
      >
        <Star filled={step.pinned} />
      </button>
      {/* The same circle as the pin beside it, and named after the entry's own words —
          three buttons reading "Edit" are three identical controls out loud. */}
      <button
        type="button"
        className="pin-toggle shrink-0"
        aria-label={t(m.goals.stepsEdit, { text: step.text })}
        onClick={onEdit}
      >
        <Pencil />
      </button>
      <button
        type="button"
        className="pin-toggle shrink-0"
        aria-label={t(m.manage.deleteOn, { text: step.text })}
        onClick={() => retireStep(area, step.id)}
      >
        <Cross />
      </button>
    </div>
  )
}

