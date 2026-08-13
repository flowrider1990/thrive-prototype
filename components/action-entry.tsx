'use client'

import { useState } from 'react'
import { Choice } from '@/components/choice'
import { TextAnswer } from '@/components/text-answer'
import type { AreaId } from '@/lib/areas'
import { useI18n } from '@/lib/i18n'
import { addStep, editStep, MAX_OPEN_STEPS, type Step } from '@/lib/person/goals'

/**
 * Writing down the few things you want to try in one area.
 *
 * Three things about the old version were not obvious enough, and each has a
 * specific answer here:
 *
 * - **That more than one is allowed.** The list is a numbered `<ol>`, so "1." and "2."
 *   make three feel like a real ceiling without a counter, and the cap is stated in
 *   words *once there is a first entry to add to*. It used to be stated before the
 *   field, where the first thing read on a screen asking what could help was a rule
 *   about quantity — an answer to a question nobody had asked yet.
 * - **That entries can be changed.** They used to render as a read-only list with
 *   a left rule and no affordance at all. Each now carries an explicit Edit
 *   control whose accessible name includes the entry's own words — three buttons
 *   all saying "Edit" are three indistinguishable controls out loud.
 * - **That one is genuinely enough.** "That is enough" appears as soon as there is
 *   something to keep, and nothing pushes toward filling all three.
 *
 * Deliberately **not** done: rendering three numbered empty slots. It would make
 * the cap maximally obvious and simultaneously imply you should fill them, which
 * contradicts the note directly above it.
 */
export function ActionEntry({
  area,
  goalId,
  entries,
  atCap,
  onEnough,
}: {
  area: AreaId
  /** The goal these serve. Every entry belongs to exactly one. */
  goalId: string
  /** This goal's open entries, oldest first. */
  entries: Step[]
  /**
   * Whether the **area** is at its cap.
   *
   * Separate from `entries.length`, because the cap counts across the whole area while
   * this list is one goal's: three goals holding three each would be nine open entries
   * in one area, which is the task manager this is not. Defaults to the list's own
   * length for the single-goal case.
   */
  atCap?: boolean
  /** Offered once there is at least one; absent means the caller wants none. */
  onEnough?: () => void
}) {
  const { m, t } = useI18n()
  const [editing, setEditing] = useState<string | null>(null)
  /**
   * Whether the field is open.
   *
   * **Saving an action and adding another are two acts, and this is what separates
   * them.** The field used to reappear the instant one was saved, with its button
   * relabelled "Add another" — so the control that saved what you had just written was
   * named after a thing you had not decided to do, and an empty field sat waiting as
   * though two were expected.
   *
   * Now saving closes the field and shows what you have, with adding another offered
   * beside the way on.
   */
  const [adding, setAdding] = useState(false)

  const full = atCap ?? entries.length >= MAX_OPEN_STEPS
  /**
   * With nothing written there is nothing to choose between, so the field is simply
   * there — a screen asking what could help has to have somewhere to answer.
   *
   * Derived rather than initial state, because this component is **not** remounted
   * between goals: the introduction can move from one goal's entries to the next, and an
   * `adding` flag left over from the previous goal would show a "what next" list with an
   * empty list in it. Reading the entries makes that impossible rather than unlikely.
   */
  const showField = adding || entries.length === 0

  return (
    <div className="space-y-6">
      {entries.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm text-muted">{m.goals.entriesLabel}</p>
          {/* A real ordered list: the numbers are the cap made visible, and a
              screen reader says "1 of 3" without any of it being written down. */}
          <ol className="space-y-2">
            {entries.map((entry, index) => (
              <li key={entry.id} className="flex items-start gap-x-3">
                <span aria-hidden="true" className="pt-0.5 text-sm text-muted tabular-nums">
                  {index + 1}.
                </span>

                {editing === entry.id ? (
                  <div className="min-w-0 flex-1">
                    <TextAnswer
                      placeholder={m.goals.stepsPlaceholder}
                      submitLabel={m.goals.stepsEditSubmit}
                      skipLabel={m.goals.stepsEditCancel}
                      initialValue={entry.text}
                      onSubmit={(value) => {
                        // Appends the new wording; the old one stays in history,
                        // which is what makes /data able to show how it changed.
                        editStep(area, entry.id, value)
                        setEditing(null)
                      }}
                      onSkip={() => setEditing(null)}
                    />
                  </div>
                ) : (
                  // No wrapping: the entry's own text takes the remaining width and
                  // wraps inside itself, so Edit stays on the first line where it
                  // belongs to the entry rather than dropping below it.
                  <div className="flex min-w-0 flex-1 items-start justify-between gap-x-3">
                    <span className="leading-relaxed text-ink">{entry.text}</span>
                    <button
                      type="button"
                      className="btn btn-sm btn-quiet mt-0.5 shrink-0"
                      aria-label={t(m.goals.stepsEdit, { text: entry.text })}
                      onClick={() => setEditing(entry.id)}
                    >
                      {m.manage.reviewEdit}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Nothing new can be added while an entry is open for editing: two fields on
          screen at once is two places the next keystroke could go. */}
      {editing === null &&
        (full ? (
          <div className="space-y-4">
            <p className="text-sm text-muted">{m.goals.stepsFull}</p>
            {onEnough && (
              <Choice options={[{ label: m.goals.stepsContinue, onSelect: onEnough }]} />
            )}
          </div>
        ) : !showField ? (
          /**
           * What you have, and the two things that can follow it — after a save rather
           * than instead of one.
           *
           * The cap belongs here and not above the field: it is worth knowing once there
           * is something to add to. Continuing is the primary, because with one thing
           * written the expected next step is to get on with it; adding another is
           * genuinely available but nothing pushes toward three. One primary per state,
           * as everywhere.
           */
          <div className="space-y-4">
            <p className="text-sm text-muted">{m.goals.stepsNote}</p>
            <Choice
              options={[
                ...(onEnough
                  ? [{ label: m.goals.stepsContinue, onSelect: onEnough }]
                  : []),
                {
                  /**
                   * `manage.addStep` on purpose, which is the label the area page uses
                   * for this same act — adding an action to a goal reads the same in the
                   * introduction and afterwards.
                   *
                   * It also avoids a collision the obvious wording walked into: during
                   * the introduction this sits beside "Add another goal", so calling it
                   * "Add another" would put two near-identical labels next to each other
                   * for acts on two different levels of the hierarchy.
                   */
                  label: m.manage.addStep,
                  tone: onEnough ? ('quiet' as const) : undefined,
                  onSelect: () => setAdding(true),
                },
              ]}
            />
          </div>
        ) : (
          // Remounted per entry so the field clears itself and takes focus again.
          <TextAnswer
            key={entries.length}
            placeholder={m.goals.stepsPlaceholder}
            submitLabel={m.goals.stepsSave}
            /**
             * The way out is always offered; only what it is called changes.
             *
             * With nothing written it says "I do not know yet", because that is the
             * true answer for someone who wants something to change here and does not
             * yet know what would help. This screen used to have no way to say it — the
             * only way past was to invent something, and an invented action is worse
             * than none, since the app would then treat it as a real intention.
             *
             * With something written it says "That is enough", which is a different
             * sentence: not "I have nothing" but "I have what I need".
             *
             * Either way it writes nothing. `TextAnswer` renders it as `.btn-quiet`
             * beside the primary Add, so it never competes with entering something
             * concrete.
             */
            skipLabel={
              onEnough
                ? entries.length === 0
                  ? m.goals.stepsUnknown
                  : m.goals.stepsEnough
                : undefined
            }
            onSubmit={(value) => {
              addStep(area, value, goalId)
              // Saving ends here. What happens next is the person's choice, offered
              // above rather than assumed by leaving an empty field open.
              setAdding(false)
            }}
            onSkip={onEnough}
          />
        ))}
    </div>
  )
}
