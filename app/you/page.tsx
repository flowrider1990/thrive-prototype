'use client'

import { useState } from 'react'
import { PageShell } from '@/components/page-shell'
import { YouAreas } from '@/components/you-areas'
import { formatWhen, useI18n } from '@/lib/i18n'
import { isAreaKey } from '@/lib/person/goals'
import { usePerson } from '@/lib/person/store'

/**
 * Known keys first, in the order they come up; anything added later follows.
 *
 * `preferred_name` and `opening_intent` are parked rather than current — the app
 * no longer asks either question — but anyone who answered them before still has
 * the answers, and this page's whole job is to show what is there.
 */
const KEY_ORDER = ['preferred_name', 'opening_intent', 'consent_concern']

/**
 * Everything the app knows, in the person's own words. This page is what makes
 * the premise checkable rather than merely claimed — including the part where
 * they can end it.
 */
export default function YouPage() {
  const { m, t, locale, status } = useI18n()
  const { mode, facts, consentAt, forgetEverything } = usePerson()
  const [confirming, setConfirming] = useState(false)
  const [forgotten, setForgotten] = useState(false)

  if (status !== 'ready') return <PageShell>{null}</PageShell>

  // Life-area facts are shown by `<YouAreas/>` instead: their keys carry internal
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

  const labels: Record<string, string | undefined> = m.you.keys
  const intro =
    mode === 'local' ? m.you.introSaved : mode === 'memory' ? m.you.introMemory : m.you.introUnknown

  return (
    <PageShell>
      <div className="space-y-10">
        <header className="space-y-4">
          <h1 className="heading">{m.you.title}</h1>
          <p className="max-w-prose leading-relaxed text-muted">{intro}</p>
          {mode === 'local' && consentAt && (
            <p className="text-sm text-muted">
              {t(m.you.consentAt, { when: formatWhen(consentAt, locale) })}
            </p>
          )}
          {forgotten && <p className="text-sm text-accent">{m.you.forget.done}</p>}
        </header>

        {facts.length === 0 && <p className="text-muted">{m.you.empty}</p>}

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
                      {t(m.you.learnedAt, { when: formatWhen(fact.learnedAt, locale) })}
                    </p>
                  </dd>
                ))}
              </div>
            ))}
          </dl>
        )}

        <YouAreas />

        {facts.length > 0 && (
          <section className="space-y-4 border-t border-line pt-6">
            {confirming ? (
              <>
                <p className="max-w-prose text-sm leading-relaxed text-muted">
                  {m.you.forget.question}
                </p>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => {
                      forgetEverything()
                      setConfirming(false)
                      setForgotten(true)
                    }}
                  >
                    {m.you.forget.confirm}
                  </button>
                  <button
                    type="button"
                    className="btn btn-quiet"
                    onClick={() => setConfirming(false)}
                  >
                    {m.you.forget.cancel}
                  </button>
                </div>
              </>
            ) : (
              // An in-page step rather than a browser confirm() dialog: the
              // sentence explaining what happens is part of the page.
              <button type="button" className="btn btn-quiet" onClick={() => setConfirming(true)}>
                {m.you.forget.button}
              </button>
            )}
          </section>
        )}
      </div>
    </PageShell>
  )
}
