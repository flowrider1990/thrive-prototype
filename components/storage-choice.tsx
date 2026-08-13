'use client'

import { useEffect, useRef, useState } from 'react'
import { Choice } from '@/components/choice'
import { SwitchRow } from '@/components/switch-row'
import { useI18n } from '@/lib/i18n'
import { usePerson } from '@/lib/person/store'

/**
 * The switch is the choice, so there is no step for making one.
 *
 * What is left is the confirmation, which exists only because turning saving off
 * deletes what is stored. Turning it on needs none.
 */
type View = 'closed' | 'confirmOff'

/**
 * The storage settings: two switches, read and set in place.
 *
 * This replaced a "Change storage settings" button that opened a panel holding a single
 * full-width option. The complaint was that it looked like a text field, and it did —
 * `.option` and `.field` are the same rule in every property that draws a box, so one
 * bordered row above a Cancel pill is indistinguishable from an empty input. A setting
 * should look like a setting.
 *
 * **The switch is also the state**, which is why the "Currently: …" line that used to
 * sit under the page title is gone: a switch labelled "Save on this device" beside a
 * line reading "Currently: saved on this device" says it twice, and the second one
 * would have to be kept in step with the first forever.
 *
 * `undecided` reads as off, truthfully — nothing is being written. The store tells
 * `undecided` and `memory` apart because their consent history differs; from this page
 * the only available change is on.
 *
 * There is no second source of truth. This holds no copy of the setting: it reads
 * `mode` from the person store and calls the store's own `grantConsent` /
 * `declineConsent` / `forgetEverything`.
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
        <div className="space-y-1">
          {/**
           * Two settings, read and set in place. This replaced a "Change storage
           * settings" button opening a panel with a single full-width option in it —
           * which read as an empty text field, because `.option` and `.field` are the
           * same rule in every property that draws a box.
           *
           * The switch is also the state, so the "Currently: …" label that used to sit
           * under the page title is gone: a switch labelled "Save on this device"
           * beside a line saying "Currently: saved on this device" says it twice.
           */}
          <SwitchRow
            label={m.data.storage.optionLocal}
            // `undecided` reads as off, and truthfully: nothing is being written. The
            // store tells the two apart; from here the only available change is on.
            checked={mode === 'local'}
            onChange={() => {
              setDone(null)
              select(mode === 'local' ? 'memory' : 'local')
            }}
          />
          <SwitchRow
            label={m.data.storage.optionCloud}
            checked={false}
            disabled
            note={m.data.storage.cloudDevOnly}
            onChange={() => {}}
          />
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
