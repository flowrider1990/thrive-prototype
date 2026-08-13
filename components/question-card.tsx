'use client'

import type { ReactNode } from 'react'
import { AreaIcon } from '@/components/area-icon'
import type { AreaId } from '@/lib/areas'
import { useI18n } from '@/lib/i18n'

/**
 * One question on screen at a time, with room around it. An acknowledgement of
 * the previous answer rides above the next question rather than taking a screen
 * and a click of its own — there is nothing here to endure.
 */
export function QuestionCard({
  ack,
  subject,
  area,
  question,
  note,
  children,
}: {
  ack?: string | null
  /**
   * The life area this question is about, when the *area* is the point.
   *
   * Given one, the area becomes the page's heading at full display scale and the
   * question drops to a sans line beneath it. That is the right weighting during the
   * introduction: the question is the same on every screen, so the thing worth reading
   * first is which area you are being asked about — and the eyebrow treatment made the
   * one variable part of the screen its smallest.
   *
   * Rendered here rather than through `AreaLabel`, which must not emit headings: it has
   * five call sites where an `h2` in front of the question would put the outline in the
   * wrong order. Same reason `components/stored-areas.tsx` builds its own heading.
   */
  subject?: AreaId
  /**
   * A quiet line above the question, for context that is not a life area — the goal a
   * question is about, most often.
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
  const { m } = useI18n()

  return (
    <section className="space-y-8">
      <div className="space-y-4">
        {ack && <p className="text-sm text-accent">{ack}</p>}
        <div className="space-y-1.5">
          {subject ? (
            <>
              <h1 className="heading flex items-center gap-x-3">
                <AreaIcon area={subject} size="subject" />
                {m.areas[subject]}
              </h1>
              {/* Sans, full ink, and a step above body: unmistakably the thing to
                  answer, and no longer competing with the area for the display face. */}
              <p className="max-w-prose text-lg leading-relaxed text-ink">{question}</p>
            </>
          ) : (
            <>
              {area}
              {/* One step down from a page title, and looser, on purpose: a question
                  can run to six lines — the consent one does — and the display scale
                  that suits a page title shouts at that length on a phone. Same
                  face, so the screens still read as one product. */}
              <h1 className="heading text-2xl leading-snug sm:text-3xl">{question}</h1>
            </>
          )}
        </div>
        {note && <p className="text-sm leading-relaxed text-muted">{note}</p>}
      </div>
      {children}
    </section>
  )
}
