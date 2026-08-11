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
 * - **That more than one is allowed.** The cap is now stated before the first
 *   entry rather than discovered on reaching it, and the list is a numbered
 *   `<ol>`, so "1." and "2." make three feel like a real ceiling without a
 *   counter. From the second entry the button itself says "Add another".
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
  entries,
  onEnough,
}: {
  area: AreaId
  /** The open entries, oldest first. */
  entries: Step[]
  /** Offered once there is at least one; absent means the caller wants none. */
  onEnough?: () => void
}) {
  const { m, t } = useI18n()
  const [editing, setEditing] = useState<string | null>(null)

  const full = entries.length >= MAX_OPEN_STEPS

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
        ) : (
          // Remounted per entry so the field clears itself and takes focus again,
          // which is what makes adding three in a row feel like one action.
          <TextAnswer
            key={entries.length}
            placeholder={m.goals.stepsPlaceholder}
            submitLabel={entries.length === 0 ? m.goals.stepsAdd : m.goals.stepsAddAnother}
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
              addStep(area, value)
            }}
            onSkip={onEnough}
          />
        ))}
    </div>
  )
}
