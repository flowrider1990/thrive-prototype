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
export function Pin({ filled = false, className = '' }: { filled?: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 12 12"
      aria-hidden="true"
      className={`size-3.5 shrink-0 ${className}`}
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      /* 1 rather than the 1.2 the other icons share, and the exception is deliberate:
         this is the only glyph here with interior detail, and at 1.2 the stroke closed
         the waist up into a solid sliver — the shape lost the one feature that makes it
         read as a pushpin. */
      strokeWidth="1"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* An office pushpin seen from the side, straight down: the flat grip on top, the
          waist under it, the flange it flares out to, and the needle.

          The waist carries the recognition, so it is drawn wide enough to survive at
          14px instead of being a detail that disappears. A round head on a stem — the
          first attempt — read as a map marker, which is a different promise: "where this
          is" rather than "keep this in front of me". `linejoin` rounds the corners, so
          the outline needs no curves of its own. */}
      <path d="M4.3 1H7.7v.6L7.2 3.1 8.5 7.7H3.5l1.3-4.6L4.3 1.6z" />
      <path d="M6 7.7v3.3" fill="none" />
    </svg>
  )
}
