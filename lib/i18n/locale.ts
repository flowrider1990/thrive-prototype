export const locales = ['de', 'en'] as const

export type Locale = (typeof locales)[number]

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (locales as readonly string[]).includes(value)
}

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
