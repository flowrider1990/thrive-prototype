export type MarkState = 'done' | 'current' | 'upcoming'

/**
 * How far through the five life areas, as five marks.
 *
 * It measures **areas looked at** — not goals set, not steps completed. Saying
 * "not right now" advances it exactly as much as setting a goal does, because
 * having considered an area is the whole of what it reports.
 *
 * Three states, and the current one is deliberately not shown as done: filling a
 * mark before its question is answered would claim something that has not
 * happened. Fill differs as well as colour, so the state does not depend on
 * colour alone, and every state has identical metrics, so advancing cannot
 * reflow the screen (`docs/design-system.md`).
 */
export function ProgressMarks({
  states,
  label,
  valueText,
}: {
  states: readonly MarkState[]
  /** Accessible name — the marks themselves say nothing out loud. */
  label: string
  /** Read instead of a bare number: "Area 2 of 5". */
  valueText: string
}) {
  const done = states.filter((state) => state === 'done').length

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={states.length}
      aria-valuenow={done}
      aria-valuetext={valueText}
      className="flex items-center gap-x-2"
    >
      {states.map((state, index) => (
        <span
          key={index}
          className={`h-2.5 w-2.5 rounded-full border transition-colors ${
            state === 'done'
              ? 'border-accent bg-accent'
              : state === 'current'
                ? 'border-ink bg-transparent'
                : 'border-line bg-transparent'
          }`}
        />
      ))}
    </div>
  )
}
