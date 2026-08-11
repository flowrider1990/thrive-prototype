'use client'

import Link from 'next/link'
import { PageShell } from '@/components/page-shell'
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
  const { mode } = usePerson()

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
            infer it from four paragraphs about storage that do not apply to them. */}
        {mode === 'memory' && (
          <p className="max-w-prose border-t border-line pt-6 text-sm leading-relaxed text-muted">
            {m.data.memoryNote}
          </p>
        )}

        <div className="border-t border-line pt-6">
          <Link href="/data/stored" className="btn btn-primary">
            {m.data.show}
          </Link>
        </div>
      </div>
    </PageShell>
  )
}
