'use client'

import Link from 'next/link'
import { useState } from 'react'
import { AreaFlow } from '@/components/area-flow'
import { Choice } from '@/components/choice'
import { Lock } from '@/components/icons'
import { NextSteps } from '@/components/next-steps'
import { PageShell } from '@/components/page-shell'
import { ProgressMarks, type MarkState } from '@/components/progress-marks'
import { QuestionCard } from '@/components/question-card'
import { TextAnswer } from '@/components/text-answer'
import { areas, type AreaId } from '@/lib/areas'
import { useI18n } from '@/lib/i18n'
import { finishIntroduction, introductionFinished, isSettled, readArea } from '@/lib/person/goals'
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

  // Whether the introduction is over comes from the shared derivation, not from a
  // comparison written out here. The navigation asks the same question in
  // `components/page-shell.tsx`, and the two must never disagree — a nav appearing
  // while this page still shows the introduction would offer empty pages.
  //
  // `isSettled` is deliberately not what decides it: completing something and
  // choosing "Later" un-settles an area, and the app would drop back into onboarding
  // months later. It decides only *where an interrupted pass resumes*.
  const reviewed = states.filter((state) => state.review).length
  const resumeArea = states.find((state) => !isSettled(state))?.area ?? areas[0]

  const step: Step =
    chosenStep ??
    (mode === 'undecided'
      ? 'greeting'
      : reviewed === 0
        ? 'intro'
        : introductionFinished(person)
          ? 'home'
          : 'area')

  const area = chosenArea ?? resumeArea

  if (status !== 'ready') return <PageShell>{null}</PageShell>

  const ackText = ack === 'consent' ? m.consent.ack : ack === 'declined' ? m.declined.ack : null

  /** Moves to the next area, or to the closing screen after the last one. */
  function nextArea() {
    const following = areas[areas.indexOf(area) + 1]
    // The one place the introduction closes, exactly once per pass — which is why
    // the fact is written here rather than anywhere it could be inferred.
    // `AreaManage` passes its own `onDone`, so opening an area later cannot fire it.
    if (!following) finishIntroduction(person)
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
              // Never written to the device, and not because the mode happens to be
              // memory right now — saving can be turned on later from /data/. The key
              // is in `MEMORY_ONLY_KEYS`, so the store drops it on every write. It is
              // kept for the visit because their reason is worth having on /you.
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

      {/* Three elements, down from four. It used to explain how to mark something
          done and where goals can be changed — a manual, at the one moment someone
          has just finished answering questions and wants to leave. It now says the
          introduction is over and where to go. */}
      {step === 'complete' && (
        <QuestionCard question={m.complete.title} note={m.complete.body}>
          <Choice options={[{ label: m.complete.submit, onSelect: toHome }]} />
        </QuestionCard>
      )}

      {/* One purpose: the few things being worked on. What used to sit under it —
          a button into the life areas, a note about storage, a link to everything
          stored — are navigation destinations now, which is what stops this page
          being a form, a task list and a settings page at once. */}
      {step === 'home' && (
        <section className="space-y-10">
          <h1 className="heading">{m.home.title}</h1>
          <NextSteps />

          {/* The note stays; the buttons that used to sit with it are gone. A
              competing call to action was the problem, and one quiet line saying
              where what you typed lives is not one — least of all in memory mode,
              where it is the only thing telling the person nothing is being kept.

              The lock is decorative and the sentence carries the meaning: this line
              is the easiest thing on the page to skim past, and a mark in the margin
              is what stops it being furniture. The link replaces explaining any of
              it here — one sentence, and the page that explains properly is a tap
              away. */}
          <p className="flex items-start gap-x-2 border-t border-line pt-6 text-sm leading-relaxed text-muted">
            <Lock className="mt-[0.3em]" />
            <span>
              {mode === 'local' ? m.home.savedNote : m.home.memoryNote}{' '}
              <Link href="/data" className="link-inline">
                {m.nav.data}
              </Link>
            </span>
          </p>
        </section>
      )}

    </PageShell>
  )
}
