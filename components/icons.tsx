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
