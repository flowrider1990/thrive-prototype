'use client'

import Link from 'next/link'
import { useState } from 'react'
import { AreaFlow } from '@/components/area-flow'
import { AreaIcon } from '@/components/area-icon'
import { AreaManage } from '@/components/area-manage'
import { Choice } from '@/components/choice'
import { NextSteps } from '@/components/next-steps'
import { OptionList } from '@/components/option-list'
import { PageShell } from '@/components/page-shell'
import { ProgressMarks, type MarkState } from '@/components/progress-marks'
import { QuestionCard } from '@/components/question-card'
import { TextAnswer } from '@/components/text-answer'
import { areas, isAreaId, type AreaId } from '@/lib/areas'
import { useI18n } from '@/lib/i18n'
import { isSettled, readArea } from '@/lib/person/goals'
import { usePerson } from '@/lib/person/store'

type Step =
  /** Welcome, what saving means, and the question that gates everything else. */
  | 'greeting'
  | 'concern'
  | 'continue'
  | 'stopped'
  /** What is about to happen, and that not every area needs a goal. */
  | 'intro'
  | 'area'
  | 'complete'
  | 'home'
  /** All five areas with their state, reached from home. */
  | 'areas'
  | 'manage'

/**
 * Acknowledgements are held as a key, not as a translated string: storing the
 * sentence would freeze it in whichever language it was produced, and the
 * language switch has to keep working on every screen.
 */
type Ack = 'consent' | 'declined' | null

export default function Home() {
  const { m, t, status } = useI18n()
  const person = usePerson()
  const { mode, grantConsent, declineConsent, remember, forgetEverything } = person

  // `null` means "wherever the person left off"; once they answer anything, the
  // flow drives itself. Derived rather than set from an effect, so there is no
  // render in between where the step is known but not yet applied.
  const [chosenStep, setStep] = useState<Step | null>(null)
  const [ack, setAck] = useState<Ack>(null)
  const [chosenArea, setChosenArea] = useState<AreaId | null>(null)

  const states = areas.map((area) => readArea(person, area))

  // What decides the introduction is over is the *count of areas asked about*,
  // because a review answer is never taken away. `isSettled` is not usable for
  // this: completing a step and choosing "Later" would make an area unsettled
  // again, and the app would drop back into onboarding months later.
  const reviewed = states.filter((state) => state.review).length
  const resumeArea = states.find((state) => !isSettled(state))?.area ?? areas[0]

  const step: Step =
    chosenStep ??
    (mode === 'undecided'
      ? 'greeting'
      : reviewed === 0
        ? 'intro'
        : reviewed === areas.length
          ? 'home'
          : 'area')

  const area = chosenArea ?? resumeArea

  if (status !== 'ready') return <PageShell>{null}</PageShell>

  const ackText = ack === 'consent' ? m.consent.ack : ack === 'declined' ? m.declined.ack : null

  /** Moves to the next area, or to the closing screen after the fifth. */
  function nextArea() {
    const following = areas[areas.indexOf(area) + 1]
    setChosenArea(following ?? null)
    setStep(following ? 'area' : 'complete')
  }

  function toHome() {
    setChosenArea(null)
    setStep('home')
  }

  const marks: MarkState[] = states.map((state, index) =>
    // A review answer is what fills a mark. The area being asked about is
    // distinguished but not filled — claiming it is done before the question is
    // answered would be a small lie about the person's own progress.
    state.review ? 'done' : areas[index] === area ? 'current' : 'upcoming',
  )

  return (
    <PageShell>
      {step === 'greeting' && (
        <QuestionCard ack={m.consent.welcome} question={m.consent.question}>
          <Choice
            options={[
              {
                label: m.consent.yes,
                onSelect: () => {
                  grantConsent()
                  setAck('consent')
                  setStep('intro')
                },
              },
              {
                label: m.consent.no,
                tone: 'quiet',
                onSelect: () => {
                  declineConsent()
                  setStep('concern')
                },
              },
            ]}
          />
        </QuestionCard>
      )}

      {step === 'concern' && (
        <QuestionCard question={m.declined.question} note={m.declined.note}>
          <TextAnswer
            placeholder={m.declined.placeholder}
            submitLabel={m.declined.submit}
            multiline
            allowEmpty
            onSubmit={(value) => {
              // Memory mode, so this is never written to the device. It is kept
              // for the visit because their reason is worth having on /you.
              if (value) remember('consent_concern', value)
              setAck(value ? 'declined' : null)
              setStep('continue')
            }}
          />
        </QuestionCard>
      )}

      {step === 'continue' && (
        <QuestionCard ack={ackText} question={m.declined.continueQuestion}>
          <Choice
            options={[
              {
                label: m.declined.continueYes,
                onSelect: () => {
                  setAck(null)
                  setStep('intro')
                },
              },
              {
                label: m.declined.continueNo,
                tone: 'quiet',
                onSelect: () => {
                  setAck(null)
                  setStep('stopped')
                },
              },
            ]}
          />
        </QuestionCard>
      )}

      {step === 'stopped' && (
        <QuestionCard question={m.stopped.title} note={m.stopped.body}>
          <Choice
            options={[
              {
                label: m.stopped.restart,
                tone: 'quiet',
                onSelect: () => {
                  forgetEverything()
                  setStep('greeting')
                },
              },
            ]}
          />
        </QuestionCard>
      )}

      {step === 'intro' && (
        <QuestionCard ack={ackText} question={m.intro.question} note={m.intro.note}>
          <Choice
            options={[
              {
                label: m.intro.submit,
                onSelect: () => {
                  setAck(null)
                  setStep('area')
                },
              },
            ]}
          />
        </QuestionCard>
      )}

      {step === 'area' && (
        <AreaFlow
          // Remounts per area, so the previous area's sub-step cannot carry over.
          key={area}
          area={area}
          progress={
            <ProgressMarks
              states={marks}
              label={m.goals.progressLabel}
              valueText={t(m.goals.progressValue, {
                current: String(areas.indexOf(area) + 1),
                total: String(areas.length),
              })}
            />
          }
          onDone={nextArea}
        />
      )}

      {step === 'complete' && (
        <QuestionCard question={m.complete.title} note={m.complete.body}>
          <div className="space-y-6">
            <p className="max-w-prose text-sm leading-relaxed text-muted">{m.complete.note}</p>
            <Choice options={[{ label: m.complete.submit, onSelect: toHome }]} />
          </div>
        </QuestionCard>
      )}

      {step === 'home' && (
        <section className="space-y-10">
          <h1 className="heading">{m.home.title}</h1>

          <NextSteps />

          <div className="border-t border-line pt-6">
            <button type="button" className="btn btn-quiet" onClick={() => setStep('areas')}>
              {m.home.toAreas}
            </button>
          </div>

          <div className="space-y-4 border-t border-line pt-6">
            <p className="text-sm text-muted">
              {mode === 'local' ? m.home.savedNote : m.home.memoryNote}
            </p>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
              <Link href="/you" className="btn btn-primary">
                {m.home.toYou}
              </Link>
            </div>
          </div>
        </section>
      )}

      {step === 'areas' && (
        <section className="space-y-8">
          <div className="space-y-4">
            <h1 className="heading">{m.manage.pickerTitle}</h1>
            <p className="max-w-prose leading-relaxed text-muted">{m.manage.pickerNote}</p>
          </div>

          <OptionList
            options={states.map((state) => ({
              id: state.area,
              label: m.areas[state.area],
              note: state.active
                ? state.active.text
                : state.review === 'not_now'
                  ? m.manage.notNow
                  : state.goal
                    ? m.manage.noStep
                    : m.manage.noGoal,
              icon: <AreaIcon area={state.area} />,
            }))}
            onSelect={(id) => {
              if (!isAreaId(id)) return
              setChosenArea(id)
              setStep('manage')
            }}
          />

          <Choice options={[{ label: m.manage.back, tone: 'quiet', onSelect: toHome }]} />
        </section>
      )}

      {step === 'manage' && <AreaManage key={area} area={area} onDone={toHome} />}
    </PageShell>
  )
}
