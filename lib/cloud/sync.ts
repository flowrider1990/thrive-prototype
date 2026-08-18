'use client'

import { useSyncExternalStore } from 'react'
import type { PersonFact } from '@/lib/person/schema'
import {
  adoptGeneration,
  beginCloud,
  endCloud,
  forgetEverything,
  markSynced,
  mergeFromCloud,
  pendingForCloud,
  readStore,
  replaceWithCloud,
  subscribeStore,
  syncableFacts,
} from '@/lib/person/store'
import { hasStoredSession, isSupabaseConfigured } from '@/lib/supabase/client'
import {
  deleteAccount as deleteAccountRemotely,
  requestCode,
  restore,
  signOut as endSession,
  submitCode,
  type Account,
  type Failure,
} from './account'
import { hasMeaningfulData, sameState } from './compare'
import { fetchFacts, pushFacts } from './facts'
import {
  currentGeneration,
  deleteOtherGenerations,
  deleteSupersededFacts,
  mintGeneration,
} from './generations'

/**
 * Sync orchestration: the one module that decides *when* the account is read from and
 * written to, and the only one that touches both the person store and the network.
 *
 * The layers under it each do one thing and know nothing about the others —
 * `account.ts` handles sessions, `facts.ts` handles rows, `compare.ts` decides whether
 * two datasets say the same thing, and `lib/person/store.ts` remains the single storage
 * boundary. Everything above it is a screen. That separation is the point: no component
 * in this app performs a database write, and this file performs no rendering.
 *
 * ## The shape of it
 *
 * **Local first, always** (decision D1). Every change is written to the device and shown
 * immediately; the cloud is a mirror that catches up. Nothing on screen ever waits for a
 * round trip, and a failed request is a thing to retry rather than a thing that undoes
 * what somebody just did.
 *
 * **There is no queue.** What is unsent is derived by comparing the facts against the
 * ids the device knows the account holds (`CloudMark.synced`). A write made in a tunnel
 * is indistinguishable from one made a second ago, so offline needs no separate path,
 * and no enqueue call can be forgotten in a code path written next year.
 *
 * **That same marker is the loop guard** (brief §17). Facts pulled from the cloud are
 * stored and marked synced in one commit, so the change notification they cause finds
 * nothing to push. Hydration and genuine local change do not need to be told apart,
 * because a hydrated fact is already where a push would send it.
 *
 * **Signed in means syncing** (brief §3). There is one state, not two: an account with
 * sync off is not representable, which is why "turn sync off" and "sign out" are the
 * same function called from two places.
 *
 * **A union is only safe between peers.** Two devices that have never disagreed can
 * merge by set union and lose nothing. Two devices where one has been *declared wrong* —
 * by somebody choosing which copy wins — cannot, and merging them anyway is how a
 * discarded dataset comes back to life. `./generations.ts` is what lets this module tell
 * the two situations apart: same generation means peers and a union; a different one
 * means this device is holding a copy that was replaced, and the union is off the table.
 */

/** What the engine is doing that a person should be told about. */
export type Busy = 'signing-in' | 'sending-code' | 'resolving' | 'signing-out' | 'deleting'

export type Conflict = {
  /** How many values are in force on this device, and in the account. Not row counts. */
  here: number
  there: number
  /**
   * Why the question is being asked, because the two reasons deserve different words.
   *
   * `'first-sign-in'` — this device and this account have simply never met, and both hold
   * something. Nobody has done anything wrong and nothing has been discarded yet.
   *
   * `'superseded'` — the account's dataset was replaced somewhere else, so this device is
   * holding a copy that has already been decided against, *and* it has local work that
   * was never uploaded. Adopting silently would throw that work away; merging would
   * revive the copy somebody chose to discard. Neither is ours to pick.
   */
  reason: 'first-sign-in' | 'superseded'
}

export type SyncSnapshot = {
  /** Whether the device has been looked at yet. Screens wait on this, as they do for the store. */
  ready: boolean
  /** Whether this build can talk to a project at all. */
  available: boolean
  account: Account | null
  /**
   * Signed in **and** past any conflict question: the state the switch on `/data/` shows.
   */
  syncing: boolean
  /** Waiting for somebody to choose which copy wins. Sync is not on until they have. */
  conflict: Conflict | null
  /** Facts written here that the account does not have yet. Zero is the resting state. */
  pending: number
  lastSyncedAt: string | null
  /** The last failure that has not been recovered from, or `null` when all is well. */
  trouble: Failure | null
  busy: Busy | null
  /** Whether the sign-in dialog is open. Held here so one dialog serves the whole app. */
  signInOpen: boolean
}

const IDLE: SyncSnapshot = {
  ready: false,
  available: false,
  account: null,
  syncing: false,
  conflict: null,
  pending: 0,
  lastSyncedAt: null,
  trouble: null,
  busy: null,
  signInOpen: false,
}

let snapshot: SyncSnapshot = IDLE
const listeners = new Set<() => void>()

function set(patch: Partial<SyncSnapshot>): void {
  snapshot = { ...snapshot, ...patch }
  for (const listener of listeners) listener()
}

/**
 * Long enough that typing a sentence is one write rather than forty, short enough that
 * closing the tab straight after a tap is still safe in practice.
 *
 * Batching is what the brief asks for and what a text field makes necessary: every
 * keystroke does not reach this layer today — only committed answers do — but a rapid
 * sequence of taps (starring three goals) genuinely does, and three requests where one
 * would do is the kind of waste that becomes a bill.
 */
const DEBOUNCE_MS = 800

/** Back off, but never further than a minute: a person may be watching the "pending" line. */
const BACKOFF_MS = [2_000, 5_000, 15_000, 60_000]

let started = false
let timer: ReturnType<typeof setTimeout> | undefined
let attempt = 0
let inFlight = false

function clearTimer(): void {
  if (timer !== undefined) clearTimeout(timer)
  timer = undefined
}

/** Recompute what is outstanding, from the store rather than from a counter kept here. */
function refreshPending(): void {
  const count = snapshot.account ? pendingForCloud().length : 0
  if (count !== snapshot.pending) set({ pending: count })
}

/**
 * A change happened. Send it, soon.
 *
 * Deliberately does nothing while a conflict is unresolved: until somebody has said which
 * copy wins, pushing this device's version would be answering the question on their
 * behalf.
 */
function schedulePush(delay = DEBOUNCE_MS): void {
  if (!snapshot.syncing || !snapshot.account) return
  clearTimer()
  timer = setTimeout(() => {
    timer = undefined
    void flush()
  }, delay)
}

/**
 * Send everything outstanding, in one call.
 *
 * A failure here changes nothing locally. The facts stay exactly where they are, still
 * marked unsent, and the next attempt picks up the same set — which is why a lost
 * connection costs a retry rather than an answer.
 */
async function flush(): Promise<void> {
  const account = snapshot.account
  const generation = readStore().cloud?.generation
  if (!account || !generation || !snapshot.syncing || inFlight) return
  const outstanding = pendingForCloud()
  if (outstanding.length === 0) {
    if (snapshot.trouble) set({ trouble: null })
    return
  }

  inFlight = true
  // Stamped with the generation **this device believes is current**, not with whatever
  // is current on the server. If another device has replaced the dataset since, these
  // rows land in a generation that is no longer active — inert rather than wrong, and
  // never able to become active again, because nothing in the schema can move a row
  // between generations. The device finds out at the next reconcile.
  const result = await pushFacts(outstanding, generation)
  inFlight = false

  if (result.ok) {
    attempt = 0
    const at = new Date().toISOString()
    markSynced(
      account.id,
      generation,
      outstanding.map((fact) => fact.id),
      at,
    )
    set({ trouble: null, lastSyncedAt: at })
    refreshPending()
    // Anything written while that request was in the air is still outstanding.
    if (pendingForCloud().length > 0) schedulePush(0)
    return
  }

  // Nothing is marked, nothing is dropped, and the count keeps saying so.
  set({ trouble: result.reason })
  refreshPending()
  const wait = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)]
  attempt += 1
  schedulePush(wait)
}

/**
 * Bring this device and the account into agreement, and decide whether that is something
 * this code may do on its own.
 *
 * The one function every entry point goes through — restoring a session, signing in, and
 * regaining a connection — so the rule about when a person is asked lives in exactly one
 * place rather than being re-derived at three call sites.
 *
 * Four outcomes, in the order they can be told apart:
 *
 * | the account | this device | what happens |
 * | --- | --- | --- |
 * | no generation at all | anything | mint one, upload whatever is here |
 * | same generation as ours | anything | **union** — peers, so nothing can be lost |
 * | newer generation, nothing unsynced here | — | adopt it silently |
 * | newer generation, unsynced work here | — | **ask** |
 *
 * The third row is the ordinary multi-device case after somebody chose a copy, and it is
 * silent on purpose: everything this device held *was* the discarded dataset, and asking
 * again would be asking the same question twice. The fourth is the case where silence
 * would destroy something — local work that never reached the account — so it goes to the
 * dialog.
 *
 * One extra guard, which is not in the table because it cuts across it: **an empty
 * authoritative dataset is never adopted silently over a device that holds something.**
 * A newer, empty generation is either a real "delete my data" from elsewhere or the brief
 * moment during a replace before the winning copy finishes uploading, and the two are
 * indistinguishable from here. Asking is right for both.
 */
async function reconcile(account: Account): Promise<boolean> {
  const known = readStore().cloud?.generation
  const local = syncableFacts()

  const generation = await currentGeneration()
  if (!generation.ok) {
    set({ trouble: generation.reason })
    return false
  }

  // An account that has never held a dataset. Whatever is here becomes its first, which
  // is case A of the brief — and minting is what gives every later push something to be
  // stamped with.
  if (!generation.value) {
    const minted = await mintGeneration()
    if (!minted.ok) {
      set({ trouble: minted.reason })
      return false
    }
    const pushed = await pushFacts(local, minted.value.id)
    if (!pushed.ok) {
      // The generation exists and is empty; the facts are still here and still unsent.
      // Recording it anyway is what lets the retry know where to put them.
      adoptGeneration(account.id, minted.value.id, [])
      set({ trouble: pushed.reason })
      schedulePush(BACKOFF_MS[0])
      return true
    }
    adoptGeneration(
      account.id,
      minted.value.id,
      local.map((fact) => fact.id),
    )
    set({ trouble: null, lastSyncedAt: new Date().toISOString() })
    refreshPending()
    return true
  }

  const current = generation.value.id
  const remote = await fetchFacts(current)
  if (!remote.ok) {
    set({ trouble: remote.reason })
    return false
  }
  const cloud = remote.value

  // Peers. The union is safe here and only here, and this is the path taken on every
  // ordinary app load — which is why two devices do not produce a dialog every morning.
  if (known === current) {
    mergeFromCloud(account.id, current, cloud)
    set({ trouble: null, lastSyncedAt: new Date().toISOString() })
    refreshPending()
    if (pendingForCloud().length > 0) schedulePush(0)
    return true
  }

  // Not peers. Either this device has never met this account, or the account's dataset
  // was replaced somewhere else while this copy carried on as though it had not been.
  const superseded = known !== undefined
  const unsynced = pendingForCloud().length > 0

  if (!hasMeaningfulData(local)) {
    // Case B: nothing here worth protecting, so take the account's copy whole.
    replaceWithCloud(account.id, current, cloud)
    set({ trouble: null, conflict: null, lastSyncedAt: new Date().toISOString() })
    refreshPending()
    return true
  }

  if (cloud.length === 0) {
    // Newer generation, nothing in it, something here. Never silently wipe on that.
    return ask(account, local, cloud, superseded ? 'superseded' : 'first-sign-in')
  }

  if (superseded) {
    // Everything this device holds belongs to the dataset that was decided against. With
    // no unsynced work of its own there is nothing left to ask about — the question was
    // answered on the other device, and repeating it here would be asking somebody to
    // make the same decision twice.
    if (!unsynced) {
      replaceWithCloud(account.id, current, cloud)
      set({ trouble: null, conflict: null, lastSyncedAt: new Date().toISOString() })
      refreshPending()
      return true
    }
    return ask(account, local, cloud, 'superseded')
  }

  // First contact. Equivalent datasets merge silently; a real difference is put to the
  // person, which is the brief's case C.
  if (sameState(local, cloud)) {
    mergeFromCloud(account.id, current, cloud)
    set({ trouble: null, lastSyncedAt: new Date().toISOString() })
    refreshPending()
    if (pendingForCloud().length > 0) schedulePush(0)
    return true
  }

  return ask(account, local, cloud, 'first-sign-in')
}

/**
 * Stop, and put it to the person.
 *
 * Sync stays **off** until they answer — pushing this device's version in the meantime
 * would be answering on their behalf, which is the whole thing the dialog exists to
 * avoid. On a reconnect the dialog is opened here rather than waiting for somebody to
 * find it, because the alternative is a device that has quietly stopped syncing with no
 * indication why.
 */
function ask(
  account: Account,
  local: readonly PersonFact[],
  cloud: readonly PersonFact[],
  reason: Conflict['reason'],
): boolean {
  set({
    account,
    syncing: false,
    busy: null,
    conflict: { here: countValues(local), there: countValues(cloud), reason },
    signInOpen: true,
  })
  return true
}

/**
 * Watch the store for as long as an account is attached.
 *
 * Registered once and never removed: the callback is cheap, and a subscription that is
 * added and dropped as sync comes and goes is a subscription that can be missing at the
 * moment it matters.
 */
function watchStore(): void {
  subscribeStore(() => {
    refreshPending()
    if (snapshot.syncing && pendingForCloud().length > 0) schedulePush()
  })
}

/**
 * Look at the device once, and restore a session if there is one.
 *
 * The first thing it does is ask whether there is anything to restore **without building
 * a Supabase client**, so a person who has never signed in causes no client, no timer and
 * no request — which is how "nothing leaves the browser" stays literally true in local
 * mode.
 */
function startOnce(): void {
  if (started) return
  started = true

  const available = isSupabaseConfigured()
  if (!available || !hasStoredSession()) {
    set({ ready: true, available })
    watchStore()
    return
  }

  set({ available })
  void (async () => {
    const account = await restore()
    if (!account) {
      set({ ready: true })
      watchStore()
      return
    }
    beginCloud(account.id)
    set({ account, syncing: true, ready: true })
    watchStore()
    // `reconcile` may turn syncing back off and open the dialog, if this device turns out
    // to be holding a dataset that was replaced elsewhere.
    await reconcile(account)
  })()

  if (typeof window !== 'undefined') {
    // A retry that costs nothing when it is not needed: `flush` returns immediately if
    // there is nothing outstanding.
    // Regaining a connection is the moment a device is most likely to be out of date, so
    // it re-reads which generation is current rather than only flushing. A device that
    // came back to find its dataset replaced has to learn that before it writes more.
    window.addEventListener('online', () => {
      attempt = 0
      if (!snapshot.syncing || !snapshot.account) return
      void reconcile(snapshot.account)
    })
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  startOnce()
  return () => {
    listeners.delete(listener)
  }
}

const getSnapshot = (): SyncSnapshot => snapshot
const getServerSnapshot = (): SyncSnapshot => IDLE

// --- the actions a screen can take ------------------------------------------------

export function openSignIn(): void {
  set({ signInOpen: true, trouble: null })
}

/**
 * Close the dialog, abandoning a sign-in that has not finished.
 *
 * Cancelling at the conflict question is the case that matters: the session exists by
 * then, so leaving it in place would mean sync had effectively been turned on by
 * closing a dialog. It signs out instead, and the brief is explicit that cancelling
 * leaves sync off.
 */
export function closeSignIn(): void {
  set({ signInOpen: false })
  if (snapshot.conflict) void stopSync()
}

export async function sendCode(email: string): Promise<Failure | null> {
  set({ busy: 'sending-code', trouble: null })
  const result = await requestCode(email)
  set({ busy: null, trouble: result.ok ? null : result.reason })
  return result.ok ? null : result.reason
}

/**
 * Finish signing in, and decide what happens to what is already here.
 *
 * The three cases in the brief, in the order they can be told apart:
 *
 * - **the account is empty** → this device's data becomes its first contents;
 * - **the device has nothing meaningful** → the account's data is loaded;
 * - **both hold something** → if they describe the same app, they are merged silently;
 *   only a genuine difference is put to the person.
 *
 * A failure to *read* the account signs back out rather than proceeding. Enabling sync
 * without knowing what is up there would mean pushing this device's facts into an
 * account whose contents were never compared — the one path that could overwrite
 * something without anybody being asked.
 */
export async function signIn(email: string, code: string): Promise<Failure | null> {
  set({ busy: 'signing-in', trouble: null })

  const auth = await submitCode(email, code)
  if (!auth.ok) {
    set({ busy: null, trouble: auth.reason })
    return auth.reason
  }
  const account = auth.value

  beginCloud(account.id)
  set({ account })

  const reconciled = await reconcile(account)
  if (!reconciled) {
    // Reading the account failed, so nothing is known about what is up there. Signing
    // back out is the honest response: staying signed in would mean syncing into an
    // account whose contents were never compared, which is the one path that could
    // overwrite something without anybody being asked.
    const reason = snapshot.trouble
    await endSession()
    endCloud()
    set({ busy: null, account: null, syncing: false, conflict: null, trouble: reason })
    return reason
  }

  // `reconcile` leaves sync off when it needs an answer, and on when it did not.
  set({ busy: null, syncing: snapshot.conflict === null })
  return null
}

/** How many values are in force — what the conflict dialog is actually about. */
function countValues(facts: readonly PersonFact[]): number {
  return new Set(facts.filter((fact) => fact.key).map((fact) => fact.key)).size
}

/**
 * Answer the conflict question, and make the answer stick.
 *
 * `'account'` — what is in the account replaces what is on this device. The account's
 * dataset is unchanged, so **no new generation is minted**: nothing was replaced up
 * there, and stamping a new one would needlessly orphan every other device.
 *
 * `'device'` — what is on this device replaces what is in the account, which *is* a
 * replacement and therefore mints one. The sequence is the fix for stale-device
 * resurrection, and its order is the whole of it:
 *
 * 1. **mint** the new generation — from this moment the old dataset is inert, and every
 *    other device will discover that rather than merging its copy back in;
 * 2. **write** this device's facts into it — the composite primary key is what allows a
 *    fact to exist in both generations at once, so the account never holds less than it
 *    did a moment ago;
 * 3. **clear** what is left of the old generation, which is housekeeping: those rows are
 *    already invisible, so a failure here costs storage rather than correctness.
 *
 * A failure at step 2 leaves an empty current generation with the old rows still present.
 * That is recoverable and not silently wrong: this device retries, and any other device
 * arriving meanwhile finds an empty authoritative dataset, which `reconcile` refuses to
 * adopt over a device that holds something.
 */
export async function resolveConflict(keep: 'device' | 'account'): Promise<Failure | null> {
  const account = snapshot.account
  if (!account) return null
  set({ busy: 'resolving', trouble: null })

  if (keep === 'account') {
    const generation = await currentGeneration()
    if (!generation.ok) {
      set({ busy: null, trouble: generation.reason })
      return generation.reason
    }
    if (!generation.value) {
      // Nothing up there to keep. Falling through to a full reconcile is better than
      // inventing an answer to a question that turned out not to apply.
      set({ busy: null, conflict: null })
      await reconcile(account)
      set({ syncing: snapshot.conflict === null })
      return null
    }
    const remote = await fetchFacts(generation.value.id)
    if (!remote.ok) {
      set({ busy: null, trouble: remote.reason })
      return remote.reason
    }
    replaceWithCloud(account.id, generation.value.id, remote.value)
    set({ busy: null, conflict: null, syncing: true, lastSyncedAt: new Date().toISOString() })
    refreshPending()
    return null
  }

  const minted = await mintGeneration()
  if (!minted.ok) {
    set({ busy: null, trouble: minted.reason })
    return minted.reason
  }

  const local = syncableFacts()
  const pushed = await pushFacts(local, minted.value.id)
  if (!pushed.ok) {
    // The new generation exists and is empty; everything is still here. Recording it is
    // what lets the retry aim at the right place, and `reconcile` will not let another
    // device adopt an empty dataset in the meantime.
    adoptGeneration(account.id, minted.value.id, [])
    set({ busy: null, trouble: pushed.reason, conflict: null, syncing: true })
    refreshPending()
    schedulePush(BACKOFF_MS[0])
    return pushed.reason
  }

  adoptGeneration(
    account.id,
    minted.value.id,
    local.map((fact) => fact.id),
  )

  // Housekeeping, and allowed to fail without failing the operation: the rows it removes
  // are already inactive, so leaving them behind costs storage and nothing else.
  const swept = await deleteSupersededFacts(account.id, minted.value.id)
  set({
    busy: null,
    conflict: null,
    syncing: true,
    trouble: null,
    lastSyncedAt: new Date().toISOString(),
  })
  refreshPending()
  if (!swept.ok) return null
  return null
}

/**
 * Stop syncing and sign out, keeping every local answer.
 *
 * One function behind both doors — the switch on `/data/` and the footer link — because
 * the brief requires them to end in the same state, and two implementations of "the same
 * state" drift. Nothing is deleted here, on either side.
 */
export async function stopSync(): Promise<void> {
  clearTimer()
  attempt = 0
  set({ busy: 'signing-out', conflict: null, syncing: false, trouble: null })
  await endSession()
  endCloud()
  set({ busy: null, account: null, pending: 0, lastSyncedAt: null, signInOpen: false })
}

/**
 * Delete everything, everywhere, in the order that cannot lie.
 *
 * The account's rows go **first**. If the local copy were cleared first and the server
 * step then failed, the data would survive on a server the person believes they emptied —
 * which is the one outcome this ordering exists to prevent. A failed server step changes
 * nothing locally and says so.
 *
 * **Emptying is a replacement, so it mints a generation too**, and that is not
 * bookkeeping pedantry. Without one, another device still holding the deleted dataset
 * would reconnect, find the same generation it already knew, conclude it was a peer with
 * an account that had merely lost some rows, and helpfully upload all of them again. The
 * mint is what turns a deletion into something the other devices can see happened.
 *
 * Minting *before* the delete is deliberate for the same reason the order above is: from
 * the moment the new generation exists the old dataset is inert, so a failure part-way
 * through leaves an account that is empty as far as anything can read it, rather than one
 * that is briefly still full.
 *
 * Signing out afterwards is not tidiness: forgetting everything returns the store to
 * `undecided`, and cloud mode requires device consent (decision D2), so a session that
 * outlived it would be a state that decision says cannot exist.
 */
export async function forgetEverywhere(): Promise<Failure | null> {
  const account = snapshot.account
  if (!account) {
    forgetEverything()
    return null
  }
  set({ busy: 'deleting', trouble: null })

  const minted = await mintGeneration()
  if (!minted.ok) {
    set({ busy: null, trouble: minted.reason })
    return minted.reason
  }

  // One request, and the cascade does the rest: dropping the old generations takes every
  // fact that belonged to them. Nothing can be left orphaned, because a fact cannot
  // outlive the generation it points at.
  const cleared = await deleteOtherGenerations(account.id, minted.value.id)
  if (!cleared.ok) {
    // Nothing readable survives — the new generation is current and empty — but rows are
    // physically still there, and the person asked for them to be gone. Saying so and
    // keeping the local copy beats reporting a deletion that only half happened.
    set({ busy: null, trouble: cleared.reason })
    return cleared.reason
  }

  forgetEverything()
  await stopSync()
  return null
}

/**
 * Delete the account itself, and everything in it.
 *
 * The rows go by `on delete cascade`, so the Edge Function needs no table access. The
 * local copy goes too: somebody who deletes their account has not asked to keep a copy
 * of it on this device, and leaving one behind after that particular button would be the
 * silent kind of dishonesty this project keeps trying to avoid.
 */
export async function deleteAccount(): Promise<Failure | null> {
  if (!snapshot.account) return null
  set({ busy: 'deleting', trouble: null })
  const result = await deleteAccountRemotely()
  if (!result.ok) {
    set({ busy: null, trouble: result.reason })
    return result.reason
  }
  forgetEverything()
  await stopSync()
  return null
}

/** Try again now, for a person looking at a "not sent yet" line. */
export function retryNow(): void {
  attempt = 0
  schedulePush(0)
}

export function useSync(): SyncSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
