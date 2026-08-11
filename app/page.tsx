'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Choice } from '@/components/choice'
import { PageShell } from '@/components/page-shell'
import { QuestionCard } from '@/components/question-card'
import { TextAnswer } from '@/components/text-answer'
import { useI18n } from '@/lib/i18n'
import { usePerson } from '@/lib/person/store'

type Step = 'consent' | 'concern' | 'continue' | 'stopped' | 'name' | 'opening' | 'home'

/**
 * Acknowledgements are held as a key, not as a translated string: storing the
 * sentence would freeze it in whichever language it was produced, and the
 * language switch has to keep working on every screen.
 */
type Ack = 'consent' | 'declined' | 'arrived' | null

export default function Home() {
  const { m, t, status } = useI18n()
  const person = usePerson()
  const { mode, current, grantConsent, declineConsent, remember, forgetEverything } = person

  // `null` means "wherever the person left off"; once they answer anything, the
  // flow drives itself. Derived rather than set from an effect, so there is no
  // render in between where the step is known but not yet applied.
  const [chosenStep, setStep] = useState<Step | null>(null)
  const [ack, setAck] = useState<Ack>(null)
  // A second pass at the name should return to the greeting, not re-ask
  // everything after it.
  const [renaming, setRenaming] = useState(false)

  const name = current('preferred_name')?.value
  const intent = current('opening_intent')?.value

  const step: Step = chosenStep ?? (mode === 'undecided' ? 'consent' : name ? 'home' : 'name')

  if (status !== 'ready') return <PageShell>{null}</PageShell>

  const ackText = ack === 'consent' ? m.consent.ack : ack === 'declined' ? m.declined.ack : ack === 'arrived' ? m.home.ack : null

  return (
    <PageShell>
      {step === 'consent' && (
        <QuestionCard question={m.consent.question}>
          <Choice
            options={[
              {
                label: m.consent.yes,
                onSelect: () => {
                  grantConsent()
                  setAck('consent')
                  setStep('name')
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
                  setStep('name')
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
                  setStep('consent')
                },
              },
            ]}
          />
        </QuestionCard>
      )}

      {step === 'name' && (
        <QuestionCard ack={ackText} question={m.name.question}>
          <TextAnswer
            placeholder={m.name.placeholder}
            submitLabel={m.name.submit}
            onSubmit={(value) => {
              remember('preferred_name', value)
              setAck(null)
              if (renaming) {
                setRenaming(false)
                setStep('home')
              } else {
                setStep('opening')
              }
            }}
          />
        </QuestionCard>
      )}

      {step === 'opening' && (
        <QuestionCard question={t(m.opening.question, { name: name ?? '' })}>
          <TextAnswer
            placeholder={m.opening.placeholder}
            submitLabel={m.opening.submit}
            skipLabel={m.opening.skip}
            multiline
            onSubmit={(value) => {
              remember('opening_intent', value)
              setAck('arrived')
              setStep('home')
            }}
            onSkip={() => {
              setAck('arrived')
              setStep('home')
            }}
          />
        </QuestionCard>
      )}

      {step === 'home' && (
        <section className="space-y-8">
          <div className="space-y-4">
            {ackText && <p className="text-sm text-accent">{ackText}</p>}
            <h1 className="text-2xl font-normal leading-snug tracking-tight text-ink sm:text-3xl">
              {t(m.home.greeting, { name: name ?? '' })}
            </h1>
            <p className="max-w-prose leading-relaxed text-muted">{m.home.body}</p>
          </div>

          {intent && (
            <figure className="space-y-2 border-s-2 border-line ps-5">
              <figcaption className="text-xs uppercase tracking-wide text-muted">
                {m.home.youSaid}
              </figcaption>
              <blockquote className="whitespace-pre-line leading-relaxed text-ink">
                {intent}
              </blockquote>
            </figure>
          )}

          <div className="space-y-4 border-t border-line pt-6">
            <p className="text-sm text-muted">
              {mode === 'local' ? m.home.savedNote : m.home.memoryNote}
            </p>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
              <Link href="/you" className="btn btn-primary">
                {m.home.toYou}
              </Link>
              <button
                type="button"
                className="btn btn-quiet"
                onClick={() => {
                  setRenaming(true)
                  setAck(null)
                  setStep('name')
                }}
              >
                {m.home.rename}
              </button>
            </div>
          </div>
        </section>
      )}
    </PageShell>
  )
}
