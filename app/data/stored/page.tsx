'use client'

import { useEffect, useRef, useState } from 'react'
import { BackLink } from '@/components/back-link'
import { PageShell } from '@/components/page-shell'
import { StoredAreas } from '@/components/stored-areas'
import { formatWhen, useI18n } from '@/lib/i18n'
import { isAreaKey } from '@/lib/person/goals'
import { usePerson } from '@/lib/person/store'

/**
 * Known keys first, in the order they came up; anything added later follows.
 *
 * `preferred_name` and `opening_intent` are parked rather than current — the app no
 * longer asks either question — but anyone who answered them before still has the
 * answers, and this page's whole job is to show what is there.
 */
const KEY_ORDER = ['preferred_name', 'opening_intent', 'consent_concern']

/** Nothing → explain → confirm. Deleting is never one tap away. */
type Deleting = 'no' | 'warned' | 'confirming'

/**
 * Everything the app holds, in the person's own words, and the way to end it.
 *
 * This page is what makes the promise on `/data/` checkable rather than merely
 * stated. It is allowed to be long; that is why it is its own route.
 */
export default function StoredPage() {
  const { m, t, locale, status } = useI18n()
  const { mode, facts, consentAt, forgetEverything } = usePerson()
  const [deleting, setDeleting] = useState<Deleting>('no')
  const [deleted, setDeleted] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const opened = useRef(false)

  // Focus follows the steps, and comes back if they are abandoned. Each step replaces
  // the one before it, so both directions have to wait for the render that changes
  // the DOM — an inline `.focus()` would land on a node React has not made yet.
  //
  // The `opened` guard is load-bearing rather than tidiness: without it the
  // returning branch also runs on **mount**, so arriving on this page put focus on
  // "Delete everything" and scrolled past everything the page exists to show.
  useEffect(() => {
    if (deleting !== 'no') {
      opened.current = true
      panel.current?.querySelector('button')?.focus()
      return
    }
    if (opened.current) {
      opened.current = false
      trigger.current?.focus()
    }
  }, [deleting])

  if (status !== 'ready') return <PageShell>{null}</PageShell>

  // Life-area facts go through the domain layer instead: their keys carry internal
  // step ids, and printing an id at someone is not showing them anything.
  const plain = facts.filter((fact) => !isAreaKey(fact.key))

  const groups = [...new Set([...KEY_ORDER, ...plain.map((fact) => fact.key)])]
    .map((key) => ({
      key,
      // Newest first, so a changed answer reads as the current one — with the
      // earlier answer still there underneath it.
      entries: plain.filter((fact) => fact.key === key).reverse(),
    }))
    .filter((group) => group.entries.length > 0)

  const labels: Record<string, string | undefined> = m.stored.keys
  const intro =
    mode === 'local' ? m.stored.introSaved : mode === 'memory' ? m.stored.introMemory : m.stored.introUnknown

  return (
    <PageShell>
      <div className="space-y-10">
        <header className="space-y-4">
          {/* Above the title rather than at the foot of the page: this page is as long
              as the person's history, and a way back you have to scroll to is not one.
              Shared with `/areas/<id>/` through `BackLink`, so the two cannot drift. */}
          <BackLink href="/data" label={m.stored.back} />
          <h1 className="heading">{m.stored.title}</h1>
          <p className="max-w-prose leading-relaxed text-muted">{intro}</p>
          {mode === 'local' && consentAt && (
            <p className="text-sm text-muted">
              {t(m.stored.consentAt, { when: formatWhen(consentAt, locale) })}
            </p>
          )}
        </header>

        {facts.length === 0 && <p className="text-muted">{m.stored.empty}</p>}

        {groups.length > 0 && (
          <dl className="space-y-10">
            {groups.map((group) => (
              <div key={group.key} className="space-y-4">
                <dt className="text-xs uppercase tracking-wide text-muted">
                  {labels[group.key] ?? group.key}
                </dt>
                {group.entries.map((fact) => (
                  <dd key={fact.id} className="space-y-1 border-s-2 border-line ps-5">
                    <p className="whitespace-pre-line leading-relaxed text-ink">{fact.value}</p>
                    <p className="text-xs text-muted">
                      {t(m.stored.learnedAt, { when: formatWhen(fact.learnedAt, locale) })}
                    </p>
                  </dd>
                ))}
              </div>
            ))}
          </dl>
        )}

        <StoredAreas />

        {/* `id` so that `/data/` can offer "delete my data" as its own entry point
            and land here, on the one control that does it. Naming the section rather
            than the button because the button is conditional — nothing to delete
            means no button — and a fragment pointing at an element that is sometimes
            absent silently does nothing.

            It scrolls to the control; it does not arm it. Arriving via a link must
            not put anyone one tap from deleting everything, which is the whole
            reason this flow has two confirmations. §33c asserts the confirmation is
            still closed on arrival. */}
        <section id="delete" className="space-y-4 border-t border-line pt-6">
          {/* Mounted from the start and never removed. A `role="status"` inserted
              together with its text announces nothing — the region has to exist for
              the change to be a change. Visually hidden; the visible confirmation is
              the line below. */}
          <p role="status" className="sr-only">
            {deleted ? m.data.delete.done : ''}
          </p>

          {/* Said where it happened, rather than from the top of the page. */}
          {deleted && <p className="text-sm text-accent">{m.data.delete.done}</p>}

          {facts.length > 0 && deleting === 'no' && (
            <button
              ref={trigger}
              type="button"
              className="btn btn-quiet"
              onClick={() => setDeleting('warned')}
            >
              {m.data.delete.button}
            </button>
          )}

          {/**
           * Two confirmations, and the first one only explains: what goes, and that
           * it would have to be typed again. In-page steps rather than a browser
           * `confirm()`, so the sentences saying what happens are part of the page.
           *
           * Nothing is written or removed until the second. Verification §8a asserts
           * that the stored data is still there — byte-identical — after the first,
           * because "the key still exists" would not notice it being rewritten.
           */}
          {deleting !== 'no' && (
            <div ref={panel} className="space-y-4">
              {deleting === 'warned' ? (
                <>
                  <p className="max-w-prose leading-relaxed text-ink">
                    {m.data.delete.warnTitle}
                  </p>
                  <p className="max-w-prose text-sm leading-relaxed text-muted">
                    {m.data.delete.warnBody}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
                    <button
                      type="button"
                      className="btn btn-quiet"
                      onClick={() => setDeleting('confirming')}
                    >
                      {m.data.delete.warnContinue}
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => setDeleting('no')}
                    >
                      {m.data.delete.cancel}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="max-w-prose leading-relaxed text-ink">
                    {m.data.delete.finalTitle}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
                    <button
                      type="button"
                      className="btn btn-quiet"
                      onClick={() => {
                        forgetEverything()
                        setDeleting('no')
                        setDeleted(true)
                      }}
                    >
                      {m.data.delete.finalConfirm}
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => setDeleting('no')}
                    >
                      {m.data.delete.cancel}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </section>

      </div>
    </PageShell>
  )
}
