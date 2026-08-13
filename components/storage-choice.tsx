'use client'

import { useState } from 'react'
import { SwitchRow } from '@/components/switch-row'
import { useI18n } from '@/lib/i18n'
import { usePerson } from '@/lib/person/store'

/**
 * The storage settings on `/data/`.
 *
 * **There is no "Save on this device" toggle.** Turning one off deleted what was stored,
 * which is the same act as "Delete my data" further down this page — two controls for one
 * outcome, and the switch was the one that did it without saying so. The deletion path is
 * the one that spells out the consequence, and it is the one that stays.
 *
 * What is left in that direction is an **opt-in**, and only for someone who is not saving:
 * a way to change your mind after declining. A plain quiet button rather than a switch,
 * because it goes one way — a toggle that can only be flipped on is a control lying about
 * itself. For anyone already saving it is not rendered at all, so the ordinary state of
 * this page is the cloud setting and nothing else.
 *
 * That opt-in is load-bearing beyond convenience. `grantConsent()` persists the in-memory
 * snapshot as it stands, and §39 walks the path where someone declines, says *why*, and
 * later turns saving on — proving `consent_concern` never reaches the device even then.
 * Removing the path outright would have made that guarantee unreachable.
 *
 * Cloud sync is the other setting: present, off, and not operable yet, with the reason
 * under it rather than a dead control to poke at.
 *
 * There is no second source of truth here. This holds no copy of the setting: it reads
 * `mode` from the person store and calls the store's own `grantConsent`.
 */
export function StorageChoice() {
  const { m } = useI18n()
  const { mode, grantConsent } = usePerson()
  const [turnedOn, setTurnedOn] = useState(false)

  return (
    <div className="space-y-4">
      {/* Mounted once and never unmounted. A `role="status"` inserted together with its
          text announces nothing — assistive technology watches an existing region for
          changes, so the region has to be there first. */}
      <p role="status" className="sr-only">
        {turnedOn ? m.data.storage.onDone : ''}
      </p>

      {/* Seen here; announced by the region above. */}
      {turnedOn && <p className="max-w-prose text-sm text-accent">{m.data.storage.onDone}</p>}

      {/* Only when there is something to opt into. Someone already saving sees the cloud
          setting and nothing else here — the way to stop saving is "Delete my data",
          which is the control that says what it does. */}
      {mode !== 'local' && (
        <div>
          <button
            type="button"
            className="btn btn-quiet"
            onClick={() => {
              // Persists the snapshot as it stands, so anything given this visit is kept
              // rather than asked for again — with `MEMORY_ONLY_KEYS` dropped at the one
              // function that touches the device, which is the path §39 walks.
              grantConsent()
              setTurnedOn(true)
            }}
          >
            {m.data.storage.optionLocal}
          </button>
        </div>
      )}

      <SwitchRow
        label={m.data.storage.optionCloud}
        checked={false}
        disabled
        note={m.data.storage.cloudDevOnly}
        onChange={() => {}}
      />
    </div>
  )
}
