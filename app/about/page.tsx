'use client'

import { PageShell } from '@/components/page-shell'
import { useI18n } from '@/lib/i18n'

/** What this is, and what it is not yet. Both halves matter. */
export default function AboutPage() {
  const { m, status } = useI18n()

  if (status !== 'ready') return <PageShell>{null}</PageShell>

  const sections = [
    { title: m.about.isTitle, paragraphs: [m.about.isP1, m.about.isP2, m.about.isP3] },
    { title: m.about.isNotTitle, paragraphs: [m.about.isNotP1, m.about.isNotP2] },
    { title: m.about.whereTitle, paragraphs: [m.about.whereP1, m.about.whereP2] },
  ]

  return (
    <PageShell>
      <div className="space-y-10">
        <h1 className="text-2xl font-normal leading-snug tracking-tight text-ink sm:text-3xl">
          {m.about.title}
        </h1>
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
