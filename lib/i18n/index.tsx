'use client'

import { useEffect, useMemo } from 'react'
import { usePerson } from '@/lib/person/store'
import { de } from './messages/de'
import { en, type Messages } from './messages/en'
import type { Locale } from './locale'

export type { Locale } from './locale'
export { locales } from './locale'
export type { Messages } from './messages/en'

const catalogs: Record<Locale, Messages> = { de, en }

/**
 * Interpolates `{name}`-style placeholders. Unknown placeholders are left as
 * they are, so a typo shows up on screen instead of vanishing silently.
 */
export function t(template: string, vars?: Record<string, string>): string {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (match, key: string) => vars[key] ?? match)
}

/**
 * Timestamps are formatted in the browser only — the app renders nothing before
 * mount, so this can never differ between the prerendered HTML and the client.
 * An unparseable date falls back to what was stored rather than showing
 * "Invalid Date".
 */
export function formatWhen(iso: string, locale: Locale): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeStyle: 'short' }).format(date)
}

/**
 * The locale lives in the person store, so it follows the same consent rule as
 * everything else: persisted when consented, session-only when not. `status`
 * is re-exposed here because no copy may render before it is 'ready'.
 */
export function useI18n() {
  const { locale, setLocale, status } = usePerson()
  return useMemo(
    () => ({ locale, setLocale, status, m: catalogs[locale], t }),
    [locale, setLocale, status],
  )
}

/**
 * Keeps `<html lang>` in step with the chosen language. It cannot be rendered
 * correctly at build time — the language is not known until the browser is
 * there — so it is set from an effect instead.
 */
export function HtmlLang() {
  const { locale, status } = useI18n()
  useEffect(() => {
    if (status === 'ready') document.documentElement.lang = locale
  }, [locale, status])
  return null
}
