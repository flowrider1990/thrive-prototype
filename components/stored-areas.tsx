'use client'

import { AreaIcon } from '@/components/area-icon'
import { Chevron } from '@/components/menu'
import { areas } from '@/lib/areas'
import { formatWhen, useI18n } from '@/lib/i18n'
import { readAreaDetail, type GoalDetail, type StepDetail } from '@/lib/person/goals'
import { usePerson } from '@/lib/person/store'

/**
 * The life-area part of `/data/stored/`.
 *
 * Rendered through the domain layer rather than as raw fact groups, for one
 * reason: an entry is identified internally by an id, and an id is not something to
 * show a person. Everything here resolves to the words they wrote — every goal
 * including the ones it replaced, every entry with what became of it, and every
 * earlier wording of one that was reworded.
 *
 * It is a record, not a task list: there is nothing to act on here, which is the
 * difference between this page and the start page.
 *
 * **Each area folds away.** The page grows without bound as the app is used, and
 * every area's full history is a wall of text to scroll through when you came to
 * check one thing. A closed area still says which area it is, what the goal is and
 * how much is behind it, so folding hides detail rather than hiding that anything
 * is there — and `<details>` means find-in-page can still open a closed section, so
 * nothing becomes unreachable.
 */
export function StoredAreas() {
  const { m, t, locale } = useI18n()
  const person = usePerson()

  const details = areas
    .map((area) => readAreaDetail(person, area))
    .filter((detail) => detail.any)

  if (details.length === 0) return null

  function noted(when: string) {
    return t(m.stored.learnedAt, { when: formatWhen(when, locale) })
  }

  /**
   * What became of an entry, and when.
   *
   * The active one is a pointer rather than a fact about the entry, so it has no
   * date of its own — saying "working on this" without one is honest, where reusing
   * the creation date would quietly invent a timestamp.
   */
  function became(step: StepDetail): string | null {
    // Pinned is not an outcome, so it is said alongside rather than instead — and it
    // carries no date, because a pin is a preference rather than a thing that
    // happened. A legacy `step_active` pointer reads as a pin, which is what keeps
    // it visible on the one page that promises to show everything.
    if (step.pinned) return m.stored.areas.pinned
    const word =
      step.state === 'done'
        ? m.stored.areas.done
        : step.state === 'retired'
          ? m.stored.areas.retired
          : null
    if (!word) return null
    // Both exist together in practice; a store without the date still says what
    // happened rather than dropping the line.
    return step.stateAt ? `${word} · ${formatWhen(step.stateAt, locale)}` : word
  }

  /**
   * Where a goal stands, and when it was written down.
   *
   * The same shape as `became()` one level up, and the same rule about dates: being
   * the one put first is a pointer rather than a fact about the goal, so it carries
   * no date of its own. Reaching or setting aside a goal is a fact, and does.
   */
  function standing(goal: GoalDetail): string {
    const parts = [noted(goal.createdAt)]
    if (goal.priority) parts.push(m.stored.areas.goalPriority)
    /**
     * The newest rating, as the **word** that was chosen.
     *
     * The stored value is `'3'` — a token the app wrote, and this page never prints one of
     * those. Rendering it here at all is not decoration: `isAreaKey()` keeps every `area.*`
     * fact out of the generic list on `/data/stored/`, so anything not resolved here is held
     * and never shown, which is the one thing this page exists to make impossible.
     *
     * It carries a date, unlike being the goal put first: a rating is something that
     * happened at a moment, where a pointer is just where something currently points.
     */
    if (goal.progress !== undefined) {
      const scale = [
        m.manage.progress1,
        m.manage.progress2,
        m.manage.progress3,
        m.manage.progress4,
        m.manage.progress5,
      ]
      const felt = t(m.stored.areas.goalProgress, { value: scale[goal.progress - 1] ?? '' })
      parts.push(goal.progressAt ? `${felt} · ${formatWhen(goal.progressAt, locale)}` : felt)
    }
    const word =
      goal.state === 'done'
        ? m.stored.areas.goalReached
        : goal.state === 'retired'
          ? m.stored.areas.retired
          : null
    if (word) parts.push(goal.stateAt ? `${word} · ${formatWhen(goal.stateAt, locale)}` : word)
    return parts.join(' · ')
  }

  return (
    <div className="space-y-6">
      {/* Once, above all of them. "set aside" and "changed from" would otherwise read as
          things having been taken away, and on the page whose whole job is to be
          checkable that would be the one misleading sentence. */}
      <p className="max-w-prose text-sm leading-relaxed text-muted">{m.stored.areas.note}</p>

      <div className="space-y-3">
        {details.map((detail) => {
          // What the area is about now, for the closed summary line. Goals are
          // newest first, so the first still-standing one is the current one.
          const goal =
            detail.goals.find((entry) => entry.state === 'active')?.text ?? detail.goals[0]?.text
          const count =
            detail.steps.length === 1
              ? m.stored.entryCountOne
              : t(m.stored.entryCount, { count: String(detail.steps.length) })

          return (
            <details key={detail.area} className="disclosure border-t border-line pt-3">
              {/* A grid rather than nested boxes, because `summary` may only contain
                  phrasing and heading content — the `h2` is allowed, a wrapping `div`
                  is not. Keeping the real `h2` matters: each area is a section
                  of this document, and the outline should say so.

                  The marker spans both rows so it aligns with the heading while the
                  summary line sits under it. */}
              <summary className="grid grid-cols-[auto_1fr] items-start gap-x-2 py-1">
                <span className="disclosure-marker row-span-2 mt-1.5">
                  <Chevron />
                </span>
                <h2 className="flex min-w-0 items-center gap-x-2 font-medium text-ink">
                  <AreaIcon area={detail.area} />
                  {m.areas[detail.area]}
                </h2>
                {/* What a closed area still tells you: which goal it is about, and
                    that there is history behind it worth opening.

                    A star is said alongside rather than instead — it is a preference, not
                    an outcome, so it carries no date, the same rule an entry's pin follows.
                    It has to appear *somewhere*: an area whose only fact is a star would
                    otherwise be held and never shown, on the page that promises otherwise. */}
                <span className="min-w-0 text-sm leading-relaxed text-muted">
                  {goal ?? m.stored.areas.noGoal}
                  {detail.steps.length > 0 && ` · ${count}`}
                  {detail.pinned && ` · ${m.stored.areas.areaPinned}`}
                </span>
              </summary>

              <dl className="space-y-5 pt-4">
                {detail.reviews.length > 0 && (
                  <div className="space-y-2 border-s-2 border-line ps-5">
                    <dt className="text-sm text-muted">{m.stored.areas.review}</dt>
                    {detail.reviews.map((review, index) => (
                      <dd key={index} className="space-y-1">
                        <p className="leading-relaxed text-ink">
                          {review.value === 'yes' ? m.stored.areas.yes : m.stored.areas.notNow}
                        </p>
                        <p className="text-xs text-muted">{noted(review.at)}</p>
                      </dd>
                    ))}
                  </div>
                )}

                {detail.goals.length > 0 && (
                  <div className="space-y-2 border-s-2 border-line ps-5">
                    <dt className="text-sm text-muted">{m.stored.areas.goal}</dt>
                    {detail.goals.map((goalEntry) => (
                      <dd key={goalEntry.id} className="space-y-1">
                        <p className="whitespace-pre-line leading-relaxed text-ink">
                          {goalEntry.text}
                        </p>
                        {/* Only when it is there. An absent reason is not an empty
                            one, and the page should not invent a blank line for it. */}
                        {goalEntry.why && (
                          <p className="whitespace-pre-line text-sm leading-relaxed text-muted">
                            {t(m.stored.areas.why, { why: goalEntry.why })}
                          </p>
                        )}
                        {/* Every earlier wording of *this* goal, newest first. A
                            reworded goal is the same goal said differently, which is
                            why these sit under it rather than beside it as peers. */}
                        {goalEntry.previous.map((wording, index) => (
                          <p
                            key={index}
                            className="whitespace-pre-line text-sm leading-relaxed text-muted"
                          >
                            {t(m.stored.areas.earlier, { goal: wording })}
                          </p>
                        ))}
                        <p className="text-xs text-muted">{standing(goalEntry)}</p>
                      </dd>
                    ))}
                  </div>
                )}

                {detail.steps.length > 0 && (
                  <div className="space-y-2 border-s-2 border-line ps-5">
                    <dt className="text-sm text-muted">{m.stored.areas.steps}</dt>
                    {detail.steps.map((step) => {
                      const outcome = became(step)
                      return (
                        <dd key={step.id} className="space-y-1">
                          <p className="whitespace-pre-line leading-relaxed text-ink">
                            {step.text}
                          </p>
                          {/* When it was written down and what became of it are two
                              different facts. They used to share one line, which read
                              as "done" having happened at the moment it was added. */}
                          <p className="text-xs text-muted">
                            {t(m.stored.areas.added, {
                              when: formatWhen(step.createdAt, locale),
                            })}
                          </p>
                          {outcome && <p className="text-xs text-muted">{outcome}</p>}
                          {step.previous.map((text, index) => (
                            <p key={index} className="text-xs text-muted">
                              {t(m.stored.areas.edited, { text })}
                            </p>
                          ))}
                        </dd>
                      )
                    })}
                  </div>
                )}
              </dl>
            </details>
          )
        })}
      </div>
    </div>
  )
}
