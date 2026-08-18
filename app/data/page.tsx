'use client'

import Link from 'next/link'
import { useState } from 'react'
import { PageShell } from '@/components/page-shell'
import { StorageChoice } from '@/components/storage-choice'
import { failureText } from '@/components/sign-in-dialog'
import { deleteAccount, useSync } from '@/lib/cloud/sync'
import { useI18n } from '@/lib/i18n'
import { usePerson } from '@/lib/person/store'

/**
 * What happens to what you write here, in plain language.
 *
 * Deliberately short, and deliberately **not** the page that lists the data. The
 * stored-data view grows without bound as the app is used, and expanding the page
 * whose whole job is to be understandable into a long technical list would defeat
 * its purpose. So this page explains and links; `/data/stored/` shows and deletes.
 *
 * No jargon, no hedging, one fact per sentence. Someone who does not care how
 * software works should be able to read this once and know where their words are.
 */
export default function DataPage() {
  const { m, t, status } = useI18n()
  const { mode, facts } = usePerson()
  const sync = useSync()
  const [confirming, setConfirming] = useState(false)
  const [gone, setGone] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  if (status !== 'ready') return <PageShell>{null}</PageShell>

  // Same phrasing as a folded area's summary on `/data/stored/`, because both answer
  // the same question: how much is behind this.
  const entryCount =
    facts.length === 1
      ? m.stored.entryCountOne
      : t(m.stored.entryCount, { count: String(facts.length) })

  return (
    <PageShell>
      <div className="space-y-10">
        {/* The state used to sit here as a "Currently: …" line, because the control
            further down was a button that opened a panel and said nothing on its own.
            The switches say it themselves now, and repeating it over them would be the
            page saying the same thing twice. */}
        <h1 className="heading">{m.data.title}</h1>

        {/* Two of the four sentences describe a device with no account, and both are
            false while sync is on. Swapping them rather than hedging all four keeps the
            page four short true sentences instead of one long careful one. */}
        <div className="space-y-4">
          {(sync.syncing
            ? [m.data.p1Cloud, m.data.p2Cloud, m.data.p3, m.data.p4]
            : [m.data.p1, m.data.p2, m.data.p3, m.data.p4]
          ).map((paragraph) => (
            <p key={paragraph} className="max-w-prose leading-relaxed text-ink">
              {paragraph}
            </p>
          ))}
        </div>

        {/* Someone who declined saving is told so here rather than being left to
            infer it from four paragraphs about storage that do not apply to them. The
            block below says which mode is in force; this says what it means for them. */}
        {mode === 'memory' && (
          <p className="max-w-prose border-t border-line pt-6 text-sm leading-relaxed text-muted">
            {m.data.memoryNote}
          </p>
        )}

        {/**
         * Three actions in three weights, so the page says what it expects you to do.
         *
         * Looking is primary and carries the count, because "how much is in there" is
         * what decides whether it is worth opening. Changing the storage mode is a
         * full-size quiet button — secondary, not subordinate to something beside it,
         * which is what `.btn-sm` had wrongly implied. Deleting is a quiet link, last:
         * the emphasis on this page belongs with looking rather than with the
         * irreversible thing.
         *
         * Both links go to `/data/stored/`. The delete one only jumps further down it,
         * to the control already there — no second confirmation flow lives here, and
         * nothing is armed by following it.
         */}
        <div className="space-y-6 border-t border-line pt-6">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Link href="/data/stored" className="btn btn-primary">
              {m.data.show}
            </Link>
            {/* Beside the action rather than inside its label: the count changes, and a
                control whose accessible name changes with the data is a control that
                cannot be found by name twice. */}
            {facts.length > 0 && <span className="text-sm text-muted">{entryCount}</span>}
          </div>

          {/* Reads the mode from the store and calls the store to change it, so there
              is no second copy of the setting here. */}
          <StorageChoice />

          {facts.length > 0 && (
            <p>
              <Link href="/data/stored#delete" className="link-inline text-sm">
                {m.data.deleteEntry}
              </Link>
            </p>
          )}

          {/**
           * Deleting the account, under deleting the data and never instead of it.
           *
           * They are different acts and the page has to keep saying so: one empties the
           * account, the other ends it. Only shown while there is an account to end —
           * offering it signed out would be offering to delete something that does not
           * exist.
           *
           * The confirmation is in the page rather than in a `confirm()`, matching
           * `/data/stored/`: the sentence saying what happens is part of what you are
           * reading when you decide.
           */}
          {sync.account && !gone && (
            <div className="space-y-3 border-t border-line pt-6">
              <p className="text-sm text-muted">
                {t(m.data.account.signedInAs, { email: sync.account.email })}
              </p>

              {confirming ? (
                <div className="space-y-4">
                  <p className="max-w-prose leading-relaxed text-ink">
                    {m.data.account.warnTitle}
                  </p>
                  <p className="max-w-prose text-sm leading-relaxed text-muted">
                    {m.data.account.warnBody}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
                    <button
                      type="button"
                      className="btn btn-quiet"
                      disabled={sync.busy !== null}
                      onClick={() => {
                        setFailure(null)
                        void deleteAccount().then((reason) => {
                          if (reason) setFailure(failureText(m, reason))
                          else {
                            setGone(true)
                            setConfirming(false)
                          }
                        })
                      }}
                    >
                      {sync.busy === 'deleting' ? m.auth.working : m.data.account.confirm}
                    </button>
                    {/* The safe choice carries the emphasis, as everywhere else in this
                        app that asks before something irreversible. */}
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={sync.busy !== null}
                      onClick={() => {
                        setConfirming(false)
                        setFailure(null)
                      }}
                    >
                      {m.data.account.cancel}
                    </button>
                  </div>
                  {/* The specific reason, which already ends by saying that nothing was
                      changed — the thing somebody actually needs to know here. */}
                  {failure && (
                    <p className="max-w-prose text-sm leading-relaxed text-note">{failure}</p>
                  )}
                </div>
              ) : (
                <p>
                  <button
                    type="button"
                    className="link-inline text-sm"
                    onClick={() => setConfirming(true)}
                  >
                    {m.data.account.delete}
                  </button>
                </p>
              )}
            </div>
          )}

          {/* Said where it happened. Mounted from the start so the region is there to
              change — an inserted `role="status"` announces nothing. */}
          <p role="status" className="sr-only">
            {gone ? m.data.account.done : ''}
          </p>
          {gone && <p className="text-sm text-accent">{m.data.account.done}</p>}
        </div>
      </div>
    </PageShell>
  )
}
