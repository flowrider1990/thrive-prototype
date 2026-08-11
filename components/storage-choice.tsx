'use client'

import { useEffect, useRef, useState } from 'react'
import { Choice } from '@/components/choice'
import { OptionList } from '@/components/option-list'
import { useI18n, type Messages } from '@/lib/i18n'
import { usePerson, type Mode } from '@/lib/person/store'

/** Closed, choosing a mode, or spelling out what turning saving off costs. */
type View = 'closed' | 'choosing' | 'confirmOff'

/**
 * One mapping from mode to label, used by both exports below.
 *
 * They are two components because the state belongs under the page title and the
 * control belongs with the page's other actions — but they must never be able to
 * disagree, and neither holds the mode: both read it from the person store.
 */
function statusLabel(mode: Mode, m: Messages): string {
  if (mode === 'local') return m.data.storage.local
  if (mode === 'memory') return m.data.storage.memory
  return m.data.storage.undecided
}

/**
 * Which storage mode is in force, as a label.
 *
 * "Currently: saved on this device" rather than a sentence about storage. Someone who
 * came to this page to check one thing should be able to read it at a glance, and the
 * paragraphs below already explain what it means — this used to restate them, which
 * was most of why the section felt dense.
 */
export function StorageStatus() {
  const { m } = useI18n()
  const { mode } = usePerson()
  return <p className="text-sm text-muted">{statusLabel(mode, m)}</p>
}

/**
 * The storage decision, reopened after onboarding.
 *
 * **It offers only the mode you are not on.** There are exactly two, and
 * `StorageStatus` above already says which is in force, so the whole decision is
 * "switch to the other one, or do not". Earlier versions of this reprinted
 * onboarding's framing and both modes with a line of explanation each — on a page
 * whose four paragraphs had just explained all of it. Reopening a setting is not the
 * same act as deciding it for the first time, and it does not need the same screen.
 *
 * Onboarding is untouched: it still asks its own question, in its own words, once.
 *
 * There is no second source of truth. This holds no copy of the setting: it reads
 * `mode` from the person store and calls the store's own `grantConsent` /
 * `declineConsent` / `forgetEverything`, so there is nothing here that can drift from
 * what is actually stored.
 *
 * ## Turning saving off deletes what was saved
 *
 * Not a scare screen — the only honest implementation. "Off" means nothing of the
 * person's is left on the device, and `declineConsent()` alone does **not** clear the
 * key: `commit()` writes only when the mode is `local`, and nothing in it removes
 * anything. Switching with that call alone would leave the stored key on disk while
 * the page said nothing was being saved, which `CLAUDE.md` §8 forbids.
 *
 * So leaving `local` is `forgetEverything()` (which removes the key) followed by
 * `declineConsent()` (which carries the visit on in memory). Both already existed; no
 * store semantics changed for this. See `docs/progress.md` for the one wart that
 * follows from it — the theme preference is reset too.
 *
 * The confirmation appears **only when there is something to lose.** Switching with
 * nothing stored costs nothing, and a confirmation for a change with no consequence is
 * the ceremony that teaches people to click through the ones that matter.
 */
export function StorageChoice() {
  const { m } = useI18n()
  const { mode, facts, grantConsent, declineConsent, forgetEverything } = usePerson()
  const [view, setView] = useState<View>('closed')
  const [done, setDone] = useState<'on' | 'off' | 'offEmpty' | null>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const opened = useRef(false)

  // Focus follows the steps and comes back if they are abandoned, and both halves have
  // to wait for the render that changes the DOM — the panel replaces the trigger, so
  // an inline `.focus()` on the way out would land on a node React has not made yet.
  //
  // The `opened` guard is why this does not fire on mount: without it, arriving on
  // `/data/` would move focus into the middle of the page. That exact bug shipped once
  // on `/data/stored/` and was caught in review.
  useEffect(() => {
    if (view !== 'closed') {
      opened.current = true
      panel.current?.querySelector('button')?.focus()
      return
    }
    if (opened.current) {
      opened.current = false
      trigger.current?.focus()
    }
  }, [view])

  /** Anything stored is what makes turning saving off destructive. */
  const hasStored = mode === 'local' && facts.length > 0

  // The one mode this control can switch to. 'undecided' writes nothing, so from the
  // person's side it is already "this tab only" even though the store tells them apart
  // — which makes saving on the only change available from there.
  const target: 'local' | 'memory' = mode === 'local' ? 'memory' : 'local'

  const message =
    done === 'on'
      ? m.data.storage.onDone
      : done === 'off'
        ? m.data.storage.offDone
        : done === 'offEmpty'
          ? m.data.storage.offDoneEmpty
          : ''

  function close() {
    setView('closed')
  }

  function turnOff() {
    // Order matters. `forgetEverything()` clears the key and drops back to 'undecided';
    // `declineConsent()` then carries the visit on in memory without writing anything.
    // Reversing them would leave the key in place.
    forgetEverything()
    declineConsent()
  }

  function select(id: string) {
    // Choosing what is already in force is not a change. Closing is the whole of the
    // correct response — writing again would append a fact that records nothing.
    if (id === mode || (id === 'memory' && mode === 'undecided')) return close()

    if (id === 'local') {
      // Writes the snapshot as it stands, so anything given this visit is kept rather
      // than being asked for again.
      grantConsent()
      setDone('on')
      return close()
    }

    if (hasStored) {
      setView('confirmOff')
      return
    }
    // Nothing stored, so nothing is destroyed and nothing needs confirming. Still goes
    // through `turnOff()`, because a `local` store with no facts still has a key.
    turnOff()
    setDone('offEmpty')
    close()
  }

  return (
    <div className="space-y-4">
      {/* Mounted once and never unmounted. A `role="status"` inserted together with its
          text announces nothing — assistive technology watches an existing region for
          changes, so the region has to be there first. */}
      <p role="status" className="sr-only">
        {message}
      </p>

      {/* Seen here; announced by the region above. Cleared when the choice is reopened,
          so a stale "saving is on now" cannot sit under a fresh question. */}
      {done && view === 'closed' && <p className="max-w-prose text-sm text-accent">{message}</p>}

      {view === 'closed' && (
        <button
          ref={trigger}
          type="button"
          className="btn btn-quiet"
          onClick={() => {
            setDone(null)
            setView('choosing')
          }}
        >
          {m.data.storage.change}
        </button>
      )}

      {view === 'choosing' && (
        <div ref={panel} className="space-y-4">
          {/**
           * Only the mode you are **not** on, because that is the only thing this
           * control can do. There are two modes and the label above says which one is
           * in force, so a list of both — with a question over it and a line of
           * explanation under each — was three ways of saying what the page had
           * already said. What is left is the change itself, or not.
           *
           * Not `.btn-primary`: switching is not recommended, it is available.
           */}
          <OptionList
            options={[
              target === 'local'
                ? { id: 'local', label: m.data.storage.optionLocal }
                : { id: 'memory', label: m.data.storage.optionMemory },
            ]}
            onSelect={select}
          />
          <Choice options={[{ label: m.home.cancel, tone: 'quiet', onSelect: close }]} />
        </div>
      )}

      {view === 'confirmOff' && (
        <div ref={panel} className="space-y-4">
          <p className="max-w-prose leading-relaxed text-ink">{m.data.storage.offTitle}</p>
          <p className="max-w-prose text-sm leading-relaxed text-muted">
            {m.data.storage.offBody}
          </p>
          {/* The safe choice takes the emphasis, as on both steps of the delete flow:
              emphasis marks what is recommended, not what comes next. */}
          <Choice
            options={[
              {
                label: m.data.storage.offConfirm,
                tone: 'quiet',
                onSelect: () => {
                  turnOff()
                  setDone('off')
                  close()
                },
              },
              { label: m.data.delete.cancel, onSelect: close },
            ]}
          />
        </div>
      )}
    </div>
  )
}
