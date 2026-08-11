'use client'

import type { ReactNode } from 'react'

/**
 * One question on screen at a time, with room around it. An acknowledgement of
 * the previous answer rides above the next question rather than taking a screen
 * and a click of its own — there is nothing here to endure.
 */
export function QuestionCard({
  ack,
  question,
  note,
  children,
}: {
  ack?: string | null
  question: string
  note?: string | null
  children?: ReactNode
}) {
  return (
    <section className="space-y-8">
      <div className="space-y-4">
        {ack && <p className="text-sm text-accent">{ack}</p>}
        {/* One step down from a page title, and looser, on purpose: a question
            can run to six lines — the consent one does — and the display scale
            that suits `Hello Florian.` shouts at that length on a phone. Same
            face, so the screens still read as one product. */}
        <h1 className="heading text-2xl leading-snug sm:text-3xl">{question}</h1>
        {note && <p className="text-sm leading-relaxed text-muted">{note}</p>}
      </div>
      {children}
    </section>
  )
}
