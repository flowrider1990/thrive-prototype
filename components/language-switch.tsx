'use client'

import { useI18n } from '@/lib/i18n'
import { locales } from '@/lib/i18n/locale'

/**
 * Works on every screen, including the consent question — someone should not
 * have to agree to anything in a language they did not choose.
 */
export function LanguageSwitch() {
  const { locale, setLocale, m } = useI18n()

  return (
    <div className="flex items-center gap-1" role="group" aria-label={m.lang.label}>
      {locales.map((option) => {
        const active = option === locale
        return (
          <button
            key={option}
            type="button"
            onClick={() => setLocale(option)}
            aria-pressed={active}
            className={`rounded-full px-3 py-1 text-xs transition-colors ${
              active ? 'bg-surface text-ink' : 'text-muted hover:text-ink'
            }`}
          >
            {m.lang[option]}
          </button>
        )
      })}
    </div>
  )
}
