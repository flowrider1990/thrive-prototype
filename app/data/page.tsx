'use client'

import Link from 'next/link'
import { PageShell } from '@/components/page-shell'
import { StorageChoice } from '@/components/storage-choice'
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
  const { m, status } = useI18n()
  const { mode, facts } = usePerson()

  if (status !== 'ready') return <PageShell>{null}</PageShell>

  return (
    <PageShell>
      <div className="space-y-8">
        <h1 className="heading">{m.data.title}</h1>

        <div className="space-y-4">
          {[m.data.p1, m.data.p2, m.data.p3, m.data.p4].map((paragraph) => (
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

        {/* The decision itself, reopenable. It reads the mode from the store and calls
            the store to change it, so there is no second copy of the setting here. */}
        <StorageChoice />

        {/**
         * Reading and leaving are two different reasons to be on this page, so there
         * are two ways on. Showing what is stored stays the clear action; deleting is
         * a quiet link under it, because the emphasis on a page like this should sit
         * with looking rather than with the irreversible thing.
         *
         * Both go to `/data/stored/`. The delete link only jumps further down it, to
         * the control that is already there — no second confirmation flow lives here,
         * and nothing is armed by following it.
         */}
        <div className="space-y-4 border-t border-line pt-6">
          <div>
            <Link href="/data/stored" className="btn btn-primary">
              {m.data.show}
            </Link>
          </div>
          {facts.length > 0 && (
            <p>
              <Link href="/data/stored#delete" className="link-inline text-sm">
                {m.data.deleteEntry}
              </Link>
            </p>
          )}
        </div>
      </div>
    </PageShell>
  )
}
