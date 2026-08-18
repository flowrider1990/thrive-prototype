'use client'

import { useState } from 'react'
import { failureText } from '@/components/sign-in-dialog'
import { SwitchRow } from '@/components/switch-row'
import { openSignIn, retryNow, stopSync, useSync } from '@/lib/cloud/sync'
import { formatWhen, useI18n } from '@/lib/i18n'
import { usePerson } from '@/lib/person/store'

/**
 * The storage settings on `/data/`: what is kept where, and how to change it.
 *
 * **There is no "Save on this device" toggle.** Turning one off deleted what was stored,
 * which is the same act as "Delete my data" further down this page — two controls for one
 * outcome, and the switch was the one that did it without saying so. The deletion path is
 * the one that spells out the consequence, and it is the one that stays.
 *
 * What is left in that direction is an **opt-in**, and only for someone who is not saving:
 * a way to change your mind after declining. A plain quiet button rather than a switch,
 * because it goes one way — a toggle that can only be flipped on is a control lying about
 * itself. For anyone already saving it is not rendered at all.
 *
 * That opt-in is load-bearing beyond convenience. `grantConsent()` persists the in-memory
 * snapshot as it stands, and §39 walks the path where someone declines, says *why*, and
 * later turns saving on — proving `consent_concern` never reaches the device even then.
 * Removing the path outright would have made that guarantee unreachable.
 *
 * **The cloud switch is a real setting now, and it is also the account.** Signed in means
 * syncing and syncing means signed in (brief §3), so this switch and the footer's "Sign
 * out" are two doors into one state — both call `stopSync()`, so they cannot drift.
 * Turning it *on* does not turn it on: it opens the sign-in dialog, and only a completed
 * sign-in, including any conflict question, switches it.
 *
 * There is no second source of truth here. This holds no copy of either setting: it reads
 * `mode` from the person store and `syncing` from the sync layer, and calls them to change.
 */
export function StorageChoice() {
  const { m, t, locale } = useI18n()
  const { mode, grantConsent } = usePerson()
  const sync = useSync()
  const [turnedOn, setTurnedOn] = useState(false)
  const [turnedOff, setTurnedOff] = useState(false)

  // Cloud storage requires device storage — decision D2, and not a policy so much as an
  // arithmetic fact: staying signed in means keeping a token on the device, so offering
  // it to somebody who asked for nothing to be written would be offering to break that
  // promise. The note under the switch says exactly this rather than leaving a dead
  // control to poke at.
  const canSync = mode === 'local' && sync.available
  const note = !sync.available
    ? m.data.storage.cloudUnavailable
    : mode !== 'local'
      ? m.data.storage.cloudNeedsSaving
      : undefined

  const announcement = sync.syncing
    ? t(m.data.storage.cloudOn, { email: sync.account?.email ?? '' })
    : turnedOff
      ? m.data.storage.cloudOffDone
      : turnedOn
        ? m.data.storage.onDone
        : ''

  return (
    <div className="space-y-4">
      {/* Mounted once and never unmounted. A `role="status"` inserted together with its
          text announces nothing — assistive technology watches an existing region for
          changes, so the region has to be there first. */}
      <p role="status" className="sr-only">
        {announcement}
      </p>

      {/* Seen here; announced by the region above. */}
      {turnedOn && !sync.syncing && (
        <p className="max-w-prose text-sm text-accent">{m.data.storage.onDone}</p>
      )}

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
        checked={sync.syncing}
        disabled={!canSync || sync.busy !== null}
        note={note}
        onChange={() => {
          setTurnedOn(false)
          if (sync.syncing) {
            setTurnedOff(true)
            void stopSync()
            return
          }
          // Not switched here. The dialog switches it, once there is an account and any
          // conflict has been answered — and cancelling leaves it exactly as it is.
          setTurnedOff(false)
          openSignIn()
        }}
      />

      {/* What the switch cannot say on its own: which account, what is still on its way,
          and whether the last attempt got there. All of it one weight down, because none
          of it is a problem — the local copy is complete either way. */}
      {sync.syncing && (
        <div className="space-y-1">
          <p className="max-w-prose text-sm leading-relaxed text-muted">
            {t(m.data.storage.cloudOn, { email: sync.account?.email ?? '' })}
          </p>
          {sync.pending > 0 && (
            <p className="max-w-prose text-sm leading-relaxed text-muted">
              {sync.pending === 1
                ? m.data.storage.cloudPendingOne
                : t(m.data.storage.cloudPending, { count: String(sync.pending) })}
            </p>
          )}
          {sync.trouble && (
            <p className="max-w-prose text-sm leading-relaxed text-note">
              {m.data.storage.cloudTrouble}{' '}
              <button type="button" className="link-inline" onClick={retryNow}>
                {m.data.storage.cloudRetry}
              </button>
            </p>
          )}
          {!sync.trouble && sync.pending === 0 && sync.lastSyncedAt && (
            <p className="max-w-prose text-sm leading-relaxed text-muted">
              {t(m.data.storage.cloudLastSynced, {
                when: formatWhen(sync.lastSyncedAt, locale),
              })}
            </p>
          )}
        </div>
      )}

      {turnedOff && !sync.syncing && (
        <p className="max-w-prose text-sm text-accent">{m.data.storage.cloudOffDone}</p>
      )}

      {/* A failure that happened outside the dialog — a sign-out that could not reach the
          server, say — still has to be visible somewhere. */}
      {!sync.syncing && sync.trouble && (
        <p className="max-w-prose text-sm leading-relaxed text-note">
          {failureText(m, sync.trouble)}
        </p>
      )}
    </div>
  )
}
