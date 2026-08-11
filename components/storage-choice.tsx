'use client'

import { useEffect, useRef, useState } from 'react'
import { Choice } from '@/components/choice'
import { useI18n } from '@/lib/i18n'
import { usePerson } from '@/lib/person/store'

/** Closed, asking the original question again, or spelling out what turning off costs. */
type View = 'closed' | 'choosing' | 'confirmOff'

/**
 * The storage decision, reopened after onboarding.
 *
 * It asks **the same question with the same words** — `consent.question`,
 * `consent.yes`, `consent.no`, straight from the catalog onboarding uses. There is no
 * toggle and no second phrasing: a switch labelled "save my data" would be a second
 * way of putting a question the app has already put carefully, and the two would
 * drift.
 *
 * There is also no second source of truth. The mode lives in the person store and
 * nowhere else; this component reads `mode` and calls the store's own
 * `grantConsent` / `declineConsent` / `forgetEverything`. It holds no copy of the
 * setting, so there is nothing here that can disagree with what is actually stored.
 *
 * ## Turning saving off deletes what was saved
 *
 * That is not a scare screen, it is the only honest implementation. "Off" means
 * nothing of the person's is left on the device, and `declineConsent()` alone does
 * **not** clear the key — `commit()` only writes when the mode is `local`, and
 * nothing in it removes anything. Switching with that call alone would leave the
 * stored key sitting on disk while the app said nothing was being saved, which is
 * exactly what `CLAUDE.md` §8 forbids.
 *
 * So leaving `local` is `forgetEverything()` (which removes the key) followed by
 * `declineConsent()` (which continues the visit in memory). Both already exist; no
 * store semantics changed for this. The cost is real and is stated before it
 * happens, and the way back carries the emphasis, as everywhere else a step cannot
 * be undone.
 */
export function StorageChoice() {
  const { m } = useI18n()
  const { mode, grantConsent, declineConsent, forgetEverything } = usePerson()
  const [view, setView] = useState<View>('closed')
  const [done, setDone] = useState<'on' | 'off' | null>(null)
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

  const status =
    mode === 'local'
      ? m.data.storage.local
      : mode === 'memory'
        ? m.data.storage.memory
        : m.data.storage.undecided

  function close() {
    setView('closed')
  }

  /** Yes: start saving. Already saving means there is nothing to change. */
  function chooseOn() {
    if (mode === 'local') return close()
    // Writes the snapshot as it stands, so anything given this visit is kept rather
    // than being asked for again.
    grantConsent()
    setDone('on')
    close()
  }

  /** No: stop saving. From `local` that costs the stored data, so it is confirmed. */
  function chooseOff() {
    if (mode === 'local') {
      setView('confirmOff')
      return
    }
    declineConsent()
    setDone('off')
    close()
  }

  function confirmOff() {
    // Order matters. `forgetEverything()` clears the key and drops back to
    // 'undecided'; `declineConsent()` then continues the visit in memory without
    // writing anything. Reversing them would leave the key in place.
    //
    // It also resets the theme to following the OS, which is a side effect of the
    // only available way to clear the key rather than an intended part of this.
    forgetEverything()
    declineConsent()
    setDone('off')
    close()
  }

  return (
    <section className="space-y-4 border-t border-line pt-6">
      {/* Mounted once and never unmounted. A `role="status"` inserted together with
          its text announces nothing — assistive technology watches an existing region
          for changes, so the region has to be there first. */}
      <p role="status" className="sr-only">
        {done === 'on' ? m.data.storage.onDone : done === 'off' ? m.data.storage.offDone : ''}
      </p>

      <p className="max-w-prose text-sm leading-relaxed text-muted">{status}</p>

      {/* Seen here; announced by the region above. Cleared as soon as the choice is
          reopened, so a stale "saving is on now" cannot sit under a fresh question. */}
      {done && view === 'closed' && (
        <p className="max-w-prose text-sm text-accent">
          {done === 'on' ? m.data.storage.onDone : m.data.storage.offDone}
        </p>
      )}

      {view === 'closed' && (
        <button
          ref={trigger}
          type="button"
          className="btn btn-sm btn-quiet"
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
          {/* Onboarding's own question, verbatim. Not a heading: this page has an `h1`
              already, and a second one would put the outline in the wrong order. */}
          <p className="max-w-prose leading-relaxed text-ink">{m.consent.question}</p>
          <Choice
            options={[
              { label: m.consent.yes, onSelect: chooseOn },
              { label: m.consent.no, tone: 'quiet', onSelect: chooseOff },
            ]}
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
              { label: m.data.storage.offConfirm, tone: 'quiet', onSelect: confirmOff },
              { label: m.data.delete.cancel, onSelect: close },
            ]}
          />
        </div>
      )}

    </section>
  )
}
