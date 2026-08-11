export const themes = ['light', 'dark'] as const

export type Theme = (typeof themes)[number]

export function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (themes as readonly string[]).includes(value)
}

/**
 * A stored theme is either 'light' or 'dark'. **Unset is a third state** — follow
 * the operating system — and it is the state until someone touches the button.
 * Nothing is written to reach it, so it costs nothing before consent.
 */
export type ThemeChoice = Theme | null

/**
 * The inline script that applies a stored theme **before the first paint**.
 *
 * Without it, a consented dark choice would only be applied after mount, and
 * anyone whose OS prefers light would see a white flash on every load — the exact
 * failure `CLAUDE.md` §9 exists to prevent. Reading storage is not writing it, so
 * this is allowed before consent, the same reasoning that already permits reading
 * `navigator.language`.
 *
 * Kept to one guarded statement: it runs before anything else, so it must not be
 * able to throw. If the store is missing, corrupt, or unreadable, the OS
 * preference simply wins.
 */
export function themeBootstrapScript(storageKey: string): string {
  return `try{var s=localStorage.getItem(${JSON.stringify(storageKey)});if(s){var t=JSON.parse(s).theme;if(t==="light"||t==="dark"){document.documentElement.dataset.theme=t}}}catch(e){}`
}
