export const locales = ['de', 'en'] as const

export type Locale = (typeof locales)[number]

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (locales as readonly string[]).includes(value)
}

/**
 * A chosen locale is 'de' or 'en'. **Unset is a third state** — follow the browser —
 * and it is the state until someone opens the language switch. Deliberately the same
 * shape as `ThemeChoice`, because it is the same idea: a preference the person has not
 * expressed yet is not the same as one they expressed as the default.
 *
 * Before this existed the detected locale was persisted the moment anything was, so
 * "German because your browser is German" became indistinguishable from "German
 * because I chose it" — and a person who later switched their browser to English kept
 * getting German with nothing having ever asked them.
 */
export type LocaleChoice = Locale | null

/**
 * The locale to start in, from the browser's preference.
 *
 * Reading `navigator.language` is not storing it, so this is allowed before
 * consent — and it has to be, because the consent question itself has to be
 * in some language. Never called during the build: static export prerenders
 * pages where `navigator` does not exist.
 */
export function detectLocale(): Locale {
  if (typeof navigator === 'undefined') return 'en'
  const preferred = navigator.languages?.length ? navigator.languages : [navigator.language]
  for (const tag of preferred) {
    if (tag?.toLowerCase().startsWith('de')) return 'de'
    if (tag?.toLowerCase().startsWith('en')) return 'en'
  }
  return 'en'
}
