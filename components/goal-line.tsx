'use client'

import { useI18n } from '@/lib/i18n'

/**
 * The goal an action is being written for, shown while writing it.
 *
 * "What could help you move toward this goal?" needs a *this* to point at. It used to
 * appear only when an area held more than one goal, on the reasoning that with one goal
 * the line was redundant — which was true about telling goals apart and wrong about the
 * question, whose subject was then nowhere on the screen at all. The Goal → Action
 * relationship is the thing this page exists to establish, so it is always stated.
 *
 * Shared rather than written twice, because both places that ask for an action have to
 * say it the same way: the introduction and the area page. Secondary by design — small
 * and muted, so it gives context without competing with the question above it or the
 * field below.
 *
 * The label and the quotation marks both come from the catalog: German sets quotes low
 * then high („so“) and English sets both high (“so”), so one hardcoded pair would be
 * wrong in one language.
 */
export function GoalLine({ text }: { text: string }) {
  const { m, t } = useI18n()

  return <p className="max-w-prose text-sm leading-relaxed text-muted">{t(m.goals.forGoal, { text })}</p>
}
