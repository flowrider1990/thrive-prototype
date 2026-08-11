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
        <h1 className="text-balance text-2xl font-normal leading-snug tracking-tight text-ink sm:text-3xl">
          {question}
        </h1>
        {note && <p className="text-sm leading-relaxed text-muted">{note}</p>}
      </div>
      {children}
    </section>
  )
}
