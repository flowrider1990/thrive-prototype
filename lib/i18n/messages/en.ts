/**
 * The source catalog. `de.ts` is typed as `Messages = typeof en`, so a missing
 * or misspelled key there is a build error rather than a string that silently
 * falls back to English.
 *
 * Prose is split into named paragraphs (`isP1`, `isP2`, …) rather than arrays
 * on purpose: an array of the wrong length still type-checks, a missing key
 * does not.
 */
export const en = {
  // No `name` here on purpose: the product name lives in `lib/app.ts`, so a
  // rename is one edit. Copy that needs it interpolates `{app}`.
  app: {
    description: 'A prototype of an app to support living and thriving. Runs entirely in your browser.',
  },

  nav: {
    home: 'Start',
    you: 'You',
    about: 'About',
  },

  lang: {
    label: 'Language',
    de: 'Deutsch',
    en: 'English',
  },

  consent: {
    question:
      'This is an app prototype, only for personal use. Information you give is saved only on the device you are using right now. Is this okay for you?',
    yes: 'Yes, that is okay',
    no: 'No',
    ack: 'Thank you for your trust, curiosity and willingness to help!',
  },

  declined: {
    question: 'Oh ok. Why, what is the matter with that?',
    placeholder: 'Whatever comes to mind',
    note: 'This answer is not written to your device. It stays in this tab.',
    submit: 'Continue',
    ack: 'Thank you for telling me.',
    continueQuestion:
      'Would you like to go on anyway? Then nothing at all is written to your device — everything stays in this tab and is gone when you close it.',
    continueYes: 'Yes, let us go on',
    continueNo: 'No, that is it for now',
  },

  stopped: {
    title: 'That is completely fine.',
    body: 'Nothing was saved. You can close this tab, or start again whenever you like.',
    restart: 'Start again',
  },

  name: {
    question: 'How should I call you?',
    placeholder: 'Your name, or whatever you like',
    submit: 'Continue',
  },

  opening: {
    question: 'Hello {name}, how can I help you today?',
    placeholder: 'Whatever is on your mind',
    submit: 'Continue',
    skip: 'Nothing right now',
  },

  home: {
    ack: 'Thank you. That is everything I wanted to ask.',
    greeting: 'Hello {name}.',
    body: 'There is nothing more to do here yet. What stands so far is the shell: an app that asks before it remembers anything, and remembers only here.',
    youSaid: 'What you said when you arrived:',
    savedNote: 'What you told me is on this device only.',
    memoryNote: 'Nothing is being saved. What you told me stays in this tab.',
    toYou: 'See everything I know',
    rename: 'Call me something else',
  },

  you: {
    title: 'What I know about you',
    introSaved:
      'In your own words, exactly as you gave them. This has never left this browser: there is no server, no account, and nothing is sent anywhere.',
    introMemory:
      'You asked for nothing to be saved, so this list lives in this tab only and is gone when you close it. Nothing was written to your device.',
    introUnknown: 'We have not talked yet, so there is nothing here.',
    empty: 'Nothing yet.',
    learnedAt: 'noted {when}',
    consentAt: 'You agreed to saving on {when}.',
    keys: {
      preferred_name: 'What I should call you',
      opening_intent: 'What you wanted when you arrived',
      consent_concern: 'What you said about saving',
    },
    forget: {
      button: 'Forget everything',
      question:
        'Everything above will be removed from this device. This cannot be undone.',
      confirm: 'Yes, forget everything',
      cancel: 'Keep it',
      done: 'Forgotten. Nothing is left.',
    },
  },

  about: {
    title: 'About {app}',
    isTitle: 'What this is',
    isP1: '{app} is a prototype of an app meant to support a person in living and thriving. What you have seen is its shell: a question about consent, your name, and one open question.',
    isP2: 'It runs entirely in your browser. There is no server, no account, no analytics and no AI. Nothing you type is sent anywhere, and nothing is written to your device unless you said it was okay.',
    isP3: 'What you tell it is kept in your own words. Answers are added to a list rather than overwritten, so a later answer never erases an earlier one — how something changed is the interesting part.',
    isNotTitle: 'What it is not yet',
    isNotP1: 'There is no feature for anything in particular yet: no habits, no journal, no mood tracking, no reminders. Those choices come later, once the shell can be trusted.',
    isNotP2: 'It is also not a medical or therapeutic tool, and no substitute for talking to a person.',
    whereTitle: 'Where your answers live',
    whereP1: 'In this browser, in a single entry called {key}, on this device. Clearing your browser data removes it, and so does "forget everything" on the You page.',
    whereP2: 'If you declined, not even that entry exists: the app runs in memory for that visit and writes nothing at all. That has one honest consequence — it cannot remember that you declined, so it will ask again next time.',
  },
}

/**
 * Deliberately not `as const`: with literal types, `de.ts` could only satisfy
 * this by repeating the English strings verbatim. Widened to `string`, the type
 * checks the shape — every key present, none invented — which is the point.
 */
export type Messages = typeof en
