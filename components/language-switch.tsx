'use client'

import { useI18n } from '@/lib/i18n'
import { locales } from '@/lib/i18n/locale'
import { Check, Chevron, Menu, menuItemClass } from './menu'

/**
 * Works on every screen, including the consent question — someone should not have
 * to agree to anything in a language they did not choose.
 *
 * The trigger shows the current language as a code rather than a flag. Flags are
 * countries, not languages: English is not only British, and picking a flag for it
 * would make a claim about a person that nobody asked us to make. The code also
 * renders everywhere, which emoji flags do not — Windows has no glyphs for them.
 */
export function LanguageSwitch() {
  const { locale, setLocale, m } = useI18n()

  return (
    <Menu
      label={m.lang.label}
      trigger={
        <>
          <span className="font-medium tracking-wide">{locale.toUpperCase()}</span>
          <Chevron />
        </>
      }
    >
      {(close) =>
        locales.map((option) => {
          const active = option === locale
          return (
            <button
              key={option}
              type="button"
              // The active language is marked for assistive technology too, not
              // only by looking heavier.
              aria-current={active ? 'true' : undefined}
              onClick={() => {
                setLocale(option)
                close()
              }}
              className={`${menuItemClass} ${active ? 'text-ink' : ''}`}
            >
              <Check checked={active} />
              {/* The name only: the trigger already carries the code, and a second
                  copy here would just be noise. */}
              {m.lang[option]}
            </button>
          )
        })
      }
    </Menu>
  )
}
