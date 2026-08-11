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
 * happened.
 *
 * Each state differs from the others in **two** ways, never in colour alone
 * (`CLAUDE.md` §17). Ring thickness carries as much of it as colour does:
 *
 *   done      filled, thick ring
 *   current   unfilled, thick ring
 *   upcoming  unfilled, thin ring
 *
 * The earlier version differed only by colour between *current* and *upcoming*,
 * which was the one pair a person who cannot distinguish them had no other cue
 * for. Varying the border width is free because Tailwind's preflight sets
 * `box-sizing: border-box` — a 12px box is 12px whether its border is 1px or 2px,
 * so the metrics stay identical in every state and advancing cannot reflow the
 * question underneath. `scripts/verify.mjs` §31 asserts both halves of that:
 * identical rects, and a difference beyond colour.
 *
 * The marks must stay **direct children** of this element — the verification
 * helper reads them as `[...el.children]`.
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
          className={`h-3 w-3 rounded-full transition-colors ${
            state === 'done'
              ? 'border-2 border-accent bg-accent'
              : state === 'current'
                ? 'border-2 border-ink bg-transparent'
                : 'border border-line-strong bg-transparent'
          }`}
        />
      ))}
    </div>
  )
}
