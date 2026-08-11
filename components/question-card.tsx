'use client'

import type { ReactNode } from 'react'

/**
 * One question on screen at a time, with room around it. An acknowledgement of
 * the previous answer rides above the next question rather than taking a screen
 * and a click of its own — there is nothing here to endure.
 */
export function QuestionCard({
  ack,
  area,
  question,
  note,
  children,
}: {
  ack?: string | null
  /**
   * Which life area the question is about, when it is about one.
   *
   * It belongs *inside* this component rather than above it. Rendered by the
   * caller it sat in an `space-y-8` stack, equidistant from the progress marks and
   * from the question, so it read as a third unrelated item — the question looked
   * like it had no subject. Here it is one tight group with the heading, close
   * enough to be read as part of it.
   */
  area?: ReactNode
  question: string
  note?: string | null
  children?: ReactNode
}) {
  return (
    <section className="space-y-8">
      <div className="space-y-4">
        {ack && <p className="text-sm text-accent">{ack}</p>}
        <div className="space-y-1.5">
          {area}
          {/* One step down from a page title, and looser, on purpose: a question
              can run to six lines — the consent one does — and the display scale
              that suits a page title shouts at that length on a phone. Same
              face, so the screens still read as one product. */}
          <h1 className="heading text-2xl leading-snug sm:text-3xl">{question}</h1>
        </div>
        {note && <p className="text-sm leading-relaxed text-muted">{note}</p>}
      </div>
      {children}
    </section>
  )
}
