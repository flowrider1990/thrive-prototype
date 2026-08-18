'use client'

import { PageShell } from '@/components/page-shell'
import { APP_NAME } from '@/lib/app'
import { useSync } from '@/lib/cloud/sync'
import { useI18n } from '@/lib/i18n'
import { STORAGE_KEY } from '@/lib/person/store'

/** What this is, and what it is not yet. Both halves matter. */
export default function AboutPage() {
  const { m, t, status } = useI18n()
  const { syncing } = useSync()

  if (status !== 'ready') return <PageShell>{null}</PageShell>

  // The product name and the storage key are interpolated rather than written
  // into the copy: the name is likely to change, and the key deliberately is not.
  const vars = { app: APP_NAME, key: STORAGE_KEY }

  const sections = [
    {
      title: m.about.isTitle,
      paragraphs: [t(m.about.isP1, vars), m.about.isP2, m.about.isP3],
    },
    { title: m.about.isNotTitle, paragraphs: [m.about.isNotP1, m.about.isNotP2] },
    {
      title: m.about.whereTitle,
      // A third paragraph rather than different ones: the first two stay true while
      // signed in — the device copy is still there and still the one that is read — so
      // this says what the account *adds*, and says nothing at all to somebody who has
      // not asked for one.
      paragraphs: syncing
        ? [t(m.about.whereP1, vars), m.about.whereP2, m.about.whereP3]
        : [t(m.about.whereP1, vars), m.about.whereP2],
    },
  ]

  return (
    <PageShell>
      <div className="space-y-10">
        <h1 className="heading">{t(m.about.title, vars)}</h1>
        {sections.map((section) => (
          <section key={section.title} className="space-y-3">
            <h2 className="text-sm uppercase tracking-wide text-muted">{section.title}</h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph} className="max-w-prose leading-relaxed text-ink">
                {paragraph}
              </p>
            ))}
          </section>
        ))}
      </div>
    </PageShell>
  )
}
