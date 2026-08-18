'use client'

import { useMemo, useSyncExternalStore } from 'react'
import { detectLocale, isLocale, type Locale, type LocaleChoice } from '@/lib/i18n/locale'
import { isTheme, type Theme, type ThemeChoice } from '@/lib/theme'
import {
  MEMORY_ONLY_KEYS,
  STORAGE_KEY,
  type CloudMark,
  type PersonFact,
  type PersonStore,
} from './schema'

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
export { STORAGE_KEY, MEMORY_ONLY_KEYS } from './schema'
export type { CloudMark, PersonFact, PersonStore } from './schema'

export type Mode =
  /** Not asked yet, or asked and then forgotten. Nothing is written in this mode. */
  | 'undecided'
  /** Consented: one localStorage key. */
  | 'local'
  /** Declined but continuing: nothing is written, ever. */
  | 'memory'

export type Status = 'loading' | 'ready'

export type Snapshot = {
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
  /**
   * What this device knows about an account's copy of these facts, or `null` for the
   * ordinary never-signed-in state. Written by the sync layer through the functions
   * below and by nothing else — see `lib/cloud/sync.ts`.
   */
  cloud: CloudMark | null
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
  cloud: null,
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
          cloud: stored.cloud ?? null,
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
          cloud: null,
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
 * Bookkeeping only, so the guard is correspondingly forgiving: anything unrecognised
 * reads as "never signed in", which costs one round trip to rebuild and cannot lose an
 * answer. Individual malformed ids are dropped rather than the whole record.
 */
function isCloudMark(value: unknown): value is CloudMark {
  if (typeof value !== 'object' || value === null) return false
  const mark = value as Record<string, unknown>
  if (typeof mark.userId !== 'string' || !mark.userId) return false
  if (!Array.isArray(mark.synced)) return false
  if (mark.generation !== undefined && typeof mark.generation !== 'string') delete mark.generation
  mark.synced = mark.synced.filter((id): id is string => typeof id === 'string')
  if (mark.at !== undefined && typeof mark.at !== 'string') delete mark.at
  return true
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
      // Same rule again: nonsense here reads as "never signed in", which costs one
      // reconciliation with the server and loses nothing, where rejecting the store
      // would throw away every real answer in it over bookkeeping.
      ...(isCloudMark(stored.cloud) ? { cloud: stored.cloud } : {}),
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
    // Omitted until there has been an account, so a device that never signed in carries
    // no trace of the feature — the same rule as every optional field above.
    //
    // Only ids that are still here are kept. Otherwise the record grows forever and
    // starts describing facts this device no longer holds, which is a marker that can
    // only become wrong.
    ...(state.cloud
      ? {
          cloud: {
            ...state.cloud,
            synced: state.cloud.synced.filter((id) => state.facts.some((f) => f.id === id)),
          },
        }
      : {}),
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
    // The account is not deleted here — that is `deleteAccount()` — but this device's
    // memory of it is, along with everything else. The sync layer signs out in the same
    // act, because cloud mode requires consent and this returns the store to
    // `undecided`; see `docs/supabase-migration.md` §9.
    cloud: null,
    facts: [],
  })
}

/**
 * The store, for a reader that is not a React component.
 *
 * `lib/cloud/sync.ts` needs to watch facts appear so it can push them, and it is not a
 * component — so it gets the same subscription React gets, rather than a second copy of
 * the state or a callback threaded through every writer. The store still knows nothing
 * about the cloud: it publishes changes, and something else decides what they mean.
 */
export function subscribeStore(listener: () => void): () => void {
  listeners.add(listener)
  loadOnce()
  return () => {
    listeners.delete(listener)
  }
}

/** The current snapshot, for the same non-React readers. */
export function readStore(): Snapshot {
  return snapshot
}

/**
 * What this device holds that the account does not — the push queue, derived rather
 * than kept.
 *
 * There is no queue to lose, corrupt, or forget to enqueue into: the facts *are* the
 * queue, and the marker says which of them have landed. A write that happened while the
 * network was down is indistinguishable from one that happened a second ago, which is
 * exactly the property offline needs.
 *
 * `MEMORY_ONLY_KEYS` is applied **here**, where the rows are chosen, rather than at a
 * call site that happens to remember. `consent_concern` is what someone said when they
 * declined saving; uploading it would be a worse version of the local bug `write()`
 * already guards against, because a copy on a server is not theirs to clear.
 */
export function pendingForCloud(state: Snapshot = snapshot): PersonFact[] {
  const synced = new Set(state.cloud?.synced ?? [])
  return state.facts.filter((fact) => !synced.has(fact.id) && !MEMORY_ONLY_KEYS.includes(fact.key))
}

/** Everything that may leave the device, in the order it was learned. */
export function syncableFacts(state: Snapshot = snapshot): PersonFact[] {
  return state.facts.filter((fact) => !MEMORY_ONLY_KEYS.includes(fact.key))
}

/**
 * Begin tracking an account, discarding any markers that belonged to a different one.
 *
 * Signing in as somebody else must not inherit "these ids are already up there" from the
 * previous account, or the first push would skip everything and the two accounts would
 * quietly disagree.
 */
export function beginCloud(userId: string): void {
  commit((previous) => ({
    ...previous,
    cloud:
      previous.cloud?.userId === userId ? previous.cloud : { userId, synced: [] },
  }))
}

/**
 * These ids are in the account's current generation now. Called after a push and after a
 * pull.
 *
 * The marker is **reset rather than extended** when the generation changes, because ids
 * from a superseded dataset say nothing about what the new one holds. Carrying them over
 * would leave a device believing its facts were safely uploaded when they had in fact
 * been discarded — which is the quiet half of the resurrection bug, the half that loses
 * data rather than revives it.
 */
export function markSynced(
  userId: string,
  generation: string,
  ids: readonly string[],
  at = new Date().toISOString(),
): void {
  commit((previous) => {
    const same = previous.cloud?.userId === userId && previous.cloud.generation === generation
    const known = same ? previous.cloud!.synced : []
    return {
      ...previous,
      cloud: { userId, generation, synced: [...new Set([...known, ...ids])], at },
    }
  })
}

/**
 * Facts that came from the account, added to what is here.
 *
 * The union that `docs/supabase-migration.md` §13 describes: append-only facts with
 * client-generated ids cannot contradict each other, so "both sides hold everything" is
 * always a safe answer and never needs a person to arbitrate.
 *
 * **The loop guard is that this marks them synced in the same commit.** They arrived
 * from the cloud, so they are in the cloud, so the push that the resulting change
 * notification triggers finds nothing to send and stops. Nothing has to know whether a
 * change was "genuine" or "hydration" — see `CloudMark`.
 */
export function mergeFromCloud(
  userId: string,
  generation: string,
  incoming: readonly PersonFact[],
): void {
  commit((previous) => {
    const have = new Set(previous.facts.map((fact) => fact.id))
    const added = incoming.filter((fact) => !have.has(fact.id))
    const same = previous.cloud?.userId === userId && previous.cloud.generation === generation
    const known = same ? previous.cloud!.synced : []
    return {
      ...previous,
      facts: added.length ? [...previous.facts, ...added] : previous.facts,
      cloud: {
        userId,
        generation,
        synced: [...new Set([...known, ...incoming.map((fact) => fact.id)])],
        at: new Date().toISOString(),
      },
    }
  })
}

/**
 * The account's copy replaces this device's — the "use what is in my account" half of
 * the conflict choice, and the only path in the app that discards facts without
 * deleting everything.
 *
 * Deliberately **not** reachable except from that choice. It exists because somebody
 * asked for it in a dialog that spelled out the consequence; nothing automatic may call
 * it, which is why it is named for the act rather than for the mechanism.
 *
 * Memory-only facts survive it. They were never uploaded, so the cloud copy cannot
 * contain them, and dropping them here would delete something the person is still being
 * shown this visit for a reason that has nothing to do with them.
 */
export function replaceWithCloud(
  userId: string,
  generation: string,
  incoming: readonly PersonFact[],
): void {
  commit((previous) => ({
    ...previous,
    facts: [
      ...previous.facts.filter((fact) => MEMORY_ONLY_KEYS.includes(fact.key)),
      ...incoming,
    ],
    cloud: {
      userId,
      generation,
      synced: incoming.map((fact) => fact.id),
      at: new Date().toISOString(),
    },
  }))
}

/**
 * This device's facts are now the account's, under a new generation.
 *
 * The other half of `replaceWithCloud`, and the reason it is a separate function rather
 * than a `markSynced` call: the synced set is **replaced**, not extended. Every local
 * fact has just been written into a brand-new generation, and nothing from the old one
 * survives — so the marker has to describe the new dataset exactly, or the next push
 * would skip facts on the strength of a claim about a dataset that no longer exists.
 */
export function adoptGeneration(
  userId: string,
  generation: string,
  syncedIds: readonly string[],
): void {
  commit((previous) => ({
    ...previous,
    cloud: { userId, generation, synced: [...syncedIds], at: new Date().toISOString() },
  }))
}

/**
 * Stop tracking an account, keeping every fact.
 *
 * Signing out is not deleting, and the two are never allowed to blur: this drops the
 * bookkeeping and nothing else. What was written on this device stays on this device.
 */
export function endCloud(): void {
  commit((previous) => (previous.cloud ? { ...previous, cloud: null } : previous))
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
