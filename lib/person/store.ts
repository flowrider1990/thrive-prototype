'use client'

import { useMemo, useSyncExternalStore } from 'react'
import { detectLocale, isLocale, type Locale, type LocaleChoice } from '@/lib/i18n/locale'
import { isTheme, type Theme, type ThemeChoice } from '@/lib/theme'
import { MEMORY_ONLY_KEYS, STORAGE_KEY, type PersonFact, type PersonStore } from './schema'

/**
 * The only place in the app that touches persistent storage.
 *
 * Two backends behind one API: **local** (this one key) once consent is given,
 * and **memory** (this module's state, which dies with the tab) when it is not.
 * Callers never know which is active — that is what makes the consent switch one
 * line here instead of a condition at every call site.
 *
 * The persisted shape and the storage key live in `./schema`, which server code
 * can import; everything else goes through this module.
 */
export { STORAGE_KEY } from './schema'
export type { PersonFact, PersonStore } from './schema'

export type Mode =
  /** Not asked yet, or asked and then forgotten. Nothing is written in this mode. */
  | 'undecided'
  /** Consented: one localStorage key. */
  | 'local'
  /** Declined but continuing: nothing is written, ever. */
  | 'memory'

export type Status = 'loading' | 'ready'

type Snapshot = {
  status: Status
  mode: Mode
  consentAt: string | null
  /**
   * The locale in force — already resolved, so every screen reads one field and none
   * of them has to know where it came from.
   */
  locale: Locale
  /**
   * `null` means "follow the browser", and it is what `locale` was resolved *from*.
   * Kept apart from `locale` because otherwise the resolved value gets written back on
   * the next commit and silently becomes a choice nobody made.
   */
  localeChoice: LocaleChoice
  /** `null` means "follow the operating system" — see `lib/theme.ts`. */
  theme: ThemeChoice
  /** Which view the start page opens on. `'steps'` is the default and is never stored. */
  homeView: 'steps' | 'goals'
  facts: readonly PersonFact[]
}

export type Person = Snapshot & {
  /** Newest fact for a key, or undefined. Current state is a derived read. */
  current: (key: string) => PersonFact | undefined
  /** Every fact for a key, oldest first. */
  history: (key: string) => PersonFact[]
  grantConsent: () => void
  declineConsent: () => void
  remember: (key: string, value: string, source?: string) => void
  setLocale: (locale: Locale) => void
  setTheme: (theme: Theme) => void
  setHomeView: (view: 'steps' | 'goals') => void
  forgetEverything: () => void
}

/**
 * The snapshot the build produces, and therefore the one the first client render
 * has to agree with. `status: 'loading'` is what every screen waits on: nothing
 * here claims to know the person or the language yet, because at this point it
 * genuinely cannot.
 */
const EMPTY: Snapshot = {
  status: 'loading',
  mode: 'undecided',
  consentAt: null,
  locale: 'en',
  localeChoice: null,
  theme: null,
  homeView: 'steps',
  facts: [],
}

let snapshot: Snapshot = EMPTY
let loaded = false
const listeners = new Set<() => void>()

function set(next: Snapshot): void {
  snapshot = next
  for (const listener of listeners) listener()
}

function getSnapshot(): Snapshot {
  return snapshot
}

function getServerSnapshot(): Snapshot {
  return EMPTY
}

/**
 * React calls this after mounting, never during render — which makes it the
 * right moment to read the device. Doing it in a render would be a hydration
 * mismatch; doing it in a page's own effect would be a second source of truth.
 */
function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  loadOnce()
  return () => {
    listeners.delete(listener)
  }
}

function loadOnce(): void {
  if (loaded) return
  loaded = true

  let stored: PersonStore | null = null
  try {
    stored = parse(window.localStorage.getItem(STORAGE_KEY))
  } catch {
    // Storage can throw on access alone in locked-down browsers.
    stored = null
  }

  set(
    stored
      ? {
          status: 'ready',
          mode: 'local',
          consentAt: stored.consentAt,
          // Absent means nobody ever chose, so the browser still decides — the same
          // rule as `theme`, and the reason this is resolved here rather than stored.
          locale: stored.locale ?? detectLocale(),
          localeChoice: stored.locale ?? null,
          theme: stored.theme ?? null,
          homeView: stored.homeView === 'goals' ? 'goals' : 'steps',
          facts: stored.facts,
        }
      : {
          // Reading `navigator.language` is not storing it, so this is allowed
          // before consent — and has to be, since the consent question itself
          // has to be in some language.
          status: 'ready',
          mode: 'undecided',
          consentAt: null,
          locale: detectLocale(),
          localeChoice: null,
          theme: null,
          homeView: 'steps',
          facts: [],
        },
  )
}

/**
 * Exported because a caller sometimes needs an id *before* the write: a next
 * step's id lives inside its fact keys, so it has to exist before the first fact
 * about that step can be written. Keeping the generator here means there is one
 * copy of the secure-context fallback below, not two.
 */
export function newId(): string {
  // randomUUID needs a secure context: fine on https and localhost, which is
  // everywhere this runs. The fallback keeps a plain-http host from throwing.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `fact-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`
}

function isFact(value: unknown): value is PersonFact {
  if (typeof value !== 'object' || value === null) return false
  const fact = value as Record<string, unknown>
  return (
    typeof fact.id === 'string' &&
    typeof fact.key === 'string' &&
    typeof fact.value === 'string' &&
    typeof fact.source === 'string' &&
    typeof fact.learnedAt === 'string'
  )
}

/**
 * Guarded parse: a corrupt or hand-edited key degrades to "nothing known yet",
 * never a white screen. Individual malformed facts are dropped rather than
 * taking the whole store down with them.
 */
function parse(raw: string | null): PersonStore | null {
  if (!raw) return null
  try {
    const data: unknown = JSON.parse(raw)
    if (typeof data !== 'object' || data === null) return null
    const stored = data as Record<string, unknown>
    if (stored.version !== 1) return null
    if (typeof stored.consentAt !== 'string') return null
    if (!Array.isArray(stored.facts)) return null
    return {
      version: 1,
      consentAt: stored.consentAt,
      // Absent or nonsense reads as "follow the browser". Nonsense used to reject the
      // whole store, which threw away every real answer in it over one bad field —
      // the opposite of degrading gracefully.
      ...(isLocale(stored.locale) ? { locale: stored.locale } : {}),
      // Absent or nonsense reads as "follow the operating system". A store
      // written before the theme existed must keep loading — this is the whole
      // reason the field is optional instead of a version bump.
      ...(isTheme(stored.theme) ? { theme: stored.theme } : {}),
      // Anything but the one value reads as the default, like every other optional field.
      ...(stored.homeView === 'goals' ? { homeView: 'goals' as const } : {}),
      facts: stored.facts.filter(isFact),
    }
  } catch {
    return null
  }
}

function write(state: Snapshot): void {
  // A local-mode snapshot without a consent timestamp would be a bug, and the
  // safe direction for that bug is not writing.
  if (!state.consentAt) throw new Error('refusing to write without recorded consent')
  const stored: PersonStore = {
    version: 1,
    consentAt: state.consentAt,
    // Omitted while unset, so following the browser leaves no trace — exactly as an
    // unset theme leaves none. This is the field that makes detection keep applying
    // after consent instead of being frozen by it.
    ...(state.localeChoice ? { locale: state.localeChoice } : {}),
    // Omitted while unset, so following the OS leaves no trace in the store.
    ...(state.theme ? { theme: state.theme } : {}),
    // Omitted while it is the default, so never touching the toggle leaves nothing behind.
    ...(state.homeView === 'goals' ? { homeView: 'goals' as const } : {}),
    // Memory-only keys are dropped **here**, at the one function that touches the
    // device, rather than wherever consent happens to be granted. `grantConsent()`
    // persists the snapshot as it stands so that answers given this visit are kept
    // instead of being asked for again — and from `/data/` that snapshot can hold a
    // `consent_concern`, given precisely because nothing was being written at the
    // time. Filtering at the boundary makes that guarantee hold for every path that
    // reaches local mode, including ones that do not exist yet.
    facts: state.facts.filter((fact) => !MEMORY_ONLY_KEYS.includes(fact.key)),
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
}

/**
 * Every write goes through here, and the `mode === 'local'` check is the whole
 * consent gate. If the write fails — private mode, quota, no consent recorded —
 * the app drops to memory mode rather than claiming to have saved something it
 * did not.
 */
function commit(update: (previous: Snapshot) => Snapshot): void {
  const next = update(snapshot)
  if (next.mode === 'local') {
    try {
      write(next)
    } catch {
      set({ ...next, mode: 'memory' })
      return
    }
  }
  set(next)
}

export function grantConsent(): void {
  commit((previous) => ({
    ...previous,
    mode: 'local',
    consentAt: previous.consentAt ?? new Date().toISOString(),
  }))
}

export function declineConsent(): void {
  // Note what is *not* here: no write recording the decision. Persisting "they
  // said no" would be the single write that proves them right, so the question
  // returns next visit instead.
  commit((previous) => ({ ...previous, mode: 'memory', consentAt: null }))
}

export function remember(key: string, value: string, source = 'onboarding'): void {
  commit((previous) => ({
    ...previous,
    // Append-only: answer the same question differently in three months and both
    // are kept, so the app can see that something changed.
    facts: [
      ...previous.facts,
      { id: newId(), key, value, source, learnedAt: new Date().toISOString() },
    ],
  }))
}

/**
 * The chosen locale is data too: persisted when consented, session-only when not.
 *
 * This is the **only** way `localeChoice` becomes non-null, which is what makes it mean
 * "the person said so" rather than "this is what we happened to render".
 */
export function setLocale(locale: Locale): void {
  commit((previous) => ({ ...previous, locale, localeChoice: locale }))
}

/**
 * The theme is a preference, and a preference is still something written to
 * someone's device — so it goes through `commit()` like everything else, and
 * declining means it lasts only for the visit.
 */
export function setTheme(theme: Theme): void {
  commit((previous) => ({ ...previous, theme }))
}

/**
 * Which view the start page opens on — a preference, so it goes through `commit()` like
 * the theme: kept when consent was given, session-only when it was not.
 */
export function setHomeView(view: 'steps' | 'goals'): void {
  commit((previous) => ({ ...previous, homeView: view }))
}

export function forgetEverything(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing to do: if it cannot be removed, it was never written.
  }
  // Forgetting includes forgetting that consent was given, so this returns to a
  // genuinely fresh state. The displayed language is left alone — yanking that
  // away mid-sentence would be its own small betrayal — but the theme choice
  // goes, which is also the only way back to following the OS.
  set({
    status: 'ready',
    mode: 'undecided',
    consentAt: null,
    // The language on screen is left alone — yanking that away mid-sentence would be
    // its own small betrayal — but the *choice* goes, exactly like the theme choice, so
    // a reload follows the browser again. Deleting everything has to include this, or
    // "delete my data" leaves a preference behind.
    locale: snapshot.locale,
    localeChoice: null,
    theme: null,
    // Back to the default view as well: deleting everything includes a preference.
    homeView: 'steps',
    facts: [],
  })
}

/**
 * Newest per key, with ties broken on the id rather than on position.
 *
 * The `>=` this replaces meant "later in the array wins", and array order is
 * insertion order — which is not the same on two devices once facts arrive by more
 * than one route. Two devices could then derive *different* current state from the
 * *same* set of facts. That is not a merge conflict, so nothing upstream would catch
 * it; it is a derivation that quietly depends on how the list was assembled.
 *
 * Exact-timestamp ties are rare and the tie-break is arbitrary — but it is arbitrary
 * *the same way everywhere*, which is the whole point.
 */
function newest(facts: readonly PersonFact[], key: string): PersonFact | undefined {
  let found: PersonFact | undefined
  for (const fact of facts) {
    if (fact.key !== key) continue
    if (
      !found ||
      fact.learnedAt > found.learnedAt ||
      (fact.learnedAt === found.learnedAt && fact.id > found.id)
    ) {
      found = fact
    }
  }
  return found
}

export function usePerson(): Person {
  const current = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  return useMemo(
    () => ({
      ...current,
      current: (key: string) => newest(current.facts, key),
      history: (key: string) => current.facts.filter((fact) => fact.key === key),
      grantConsent,
      declineConsent,
      remember,
      setLocale,
      setTheme,
      setHomeView,
      forgetEverything,
    }),
    [current],
  )
}
