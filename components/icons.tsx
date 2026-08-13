/**
 * The few icons that are used across more than one page.
 *
 * There is no icon library and adding one for two glyphs would be the kind of
 * dependency `CLAUDE.md` §11 rules out — these are ~10 lines of markup each. They
 * follow the conventions the existing inline icons already set: a 12-unit
 * viewBox, `fill="none"`, `stroke="currentColor"` so they take the colour of the
 * text they sit in, and `aria-hidden` because in every current call site the
 * adjacent words already say what the icon says.
 *
 * `Pin` is the one exception to `aria-hidden` meaning "decorative": it is the whole
 * content of a control, so the *button* carries the name ("Pin: …" / "Unpin: …") and the
 * glyph stays hidden. The glyph still has to change with the state, because a name alone
 * would leave someone looking at the screen with nothing to read — that is the same
 * two-cue rule the progress marks and the theme toggle follow.
 *
 * `Check` and `Chevron` deliberately stay in `components/menu.tsx`. They belong to
 * that widget and are only ever used with it; moving them here would be churn
 * without a reader benefit.
 */

/**
 * Sits before a sentence about where data is kept.
 *
 * Decorative, not informative: it draws the eye to a line that is easy to skim
 * past, and the sentence beside it carries the whole meaning. If it ever becomes
 * the only thing saying "this is private" it needs a label instead — an icon alone
 * making a privacy claim is exactly the kind of thing §17 forbids.
 */
export function Lock({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 12 12"
      aria-hidden="true"
      className={`size-3.5 shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3.9 5.1V3.7a2.1 2.1 0 0 1 4.2 0v1.4" />
      <rect x="2.6" y="5.1" width="6.8" height="4.8" rx="1.2" />
    </svg>
  )
}

/**
 * The arrow on a back link.
 *
 * Drawn pointing left rather than using a logical property, because the only
 * locales are English and German. A right-to-left locale would need this mirrored
 * — `rtl:-scale-x-100` on the call site is the cheap fix when one arrives.
 */
export function ArrowLeft({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 12 12"
      aria-hidden="true"
      className={`size-3 shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9.5 6H3M5.5 3.5 3 6l2.5 2.5" />
    </svg>
  )
}

/**
 * Keeps something in view on the start page.
 *
 * Two glyphs, one box: `filled` draws the same pin solid rather than outlined, which is
 * the second cue beside the button's changing accessible name. Colour is deliberately
 * not the difference — §17 — and neither is size, because a control that changes its
 * metrics when you press it moves the row underneath it.
 *
 * `aria-hidden` like the others, but for a different reason: here the *button* is named,
 * not the words beside it.
 */
/**
 * Edit, as a pencil.
 *
 * Paired with `Cross` and `Pin` on every row of the area page, so the three share one
 * box and one stroke weight — the row reads as three hit areas rather than three
 * unrelated marks. Like `Pin`, it is the whole content of its control, so the *button*
 * carries the name ("Ändern: gesünder Essen") and the glyph stays hidden.
 */
export function Pencil({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 12 12"
      aria-hidden="true"
      className={`size-3.5 shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* Nib at the bottom left, body running up to the right. */}
      <path d="M2.2 9.8l.5-2 5.1-5.1a1 1 0 0 1 1.4 1.4L4.1 9.3z" />
      <path d="M7.4 3.2l1.4 1.4" />
    </svg>
  )
}

/**
 * Delete, as a cross.
 *
 * A cross rather than a bin: what it does is closer to putting something aside than to
 * destroying it. Nothing is erased — the store is append-only, so this records that the
 * item is no longer current and `/data/stored/` can still show it.
 */
export function Cross({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 12 12"
      aria-hidden="true"
      className={`size-3.5 shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3.2 3.2l5.6 5.6M8.8 3.2l-5.6 5.6" />
    </svg>
  )
}

/**
 * A star, for an entry kept in view.
 *
 * **The action is still pinning** — `pinStep`, `unpinStep`, and an accessible name of
 * "Pin: …" — so this is named for what it draws rather than what it does. A star says
 * "one of the few I care about", which is what the control means; a pushpin said "fixed
 * in place", which was a promise about ordering the model does not make (pinning does not
 * reorder a goal's own list).
 *
 * Filled when pinned, outlined when not, at identical box size — and drawn in
 * `--color-note` when active. Three cues, none of them alone: remove the colour and the
 * fill and the flipped name still carry the state.
 */
export function Star({ filled = false, className = '' }: { filled?: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 12 12"
      aria-hidden="true"
      className={`size-3.5 shrink-0 ${className}`}
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 1.3l1.45 3.15 3.45.5-2.45 2.45.6 3.4L6 9.2l-3.05 1.6.6-3.4L1.1 4.95l3.45-.5z" />
    </svg>
  )
}
