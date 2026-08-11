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
    areas: 'Life areas',
    you: 'You',
    about: 'About',
    /** Accessible name for the nav dropdown the links collapse into on narrow screens. */
    menu: 'Menu',
  },

  lang: {
    label: 'Language',
    de: 'Deutsch',
    en: 'English',
  },

  theme: {
    light: 'Light',
    dark: 'Dark',
    /** The toggle's accessible name: it announces the action, not just a state. */
    switchTo: 'Switch to {theme}',
  },

  consent: {
    /** Rides above the question in the acknowledgement slot, so it costs no screen. */
    welcome: 'Welcome, and thank you for trying this out.',
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

  /**
   * Parked, not dead. The name question was removed so the app asks for less,
   * but the copy stays until we decide whether it returns — and `/you` still
   * needs `you.keys.preferred_name` to label a name someone already gave.
   * Same for `opening` and for the parked entries in `home`.
   */
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

  areas: {
    body: 'Body & Health',
    relationships: 'Relationships & Social Life',
    work: 'Work & Career',
    finances: 'Finances',
    creativity: 'Hobbies & Creativity',
  },

  intro: {
    // The thanks is the consent acknowledgement above this question, so it is
    // not repeated here.
    question: 'Next we will look at five areas of your life, one at a time.',
    note: 'You do not need a goal in every one. "Not right now" is a real answer, and anything you note can be changed later.',
    submit: 'Okay',
  },

  goals: {
    /** The five marks are a progressbar; these are its accessible name and value. */
    progressLabel: 'Life areas looked at',
    progressValue: 'Area {current} of {total}',

    reviewQuestion: 'Would you like to change or explore something here?',
    reviewYes: 'Yes',
    reviewNo: 'Not right now',

    goalQuestion: 'What is your goal?',
    goalPlaceholder: 'In your own words',
    goalSubmit: 'Continue',

    /**
     * Deliberately no noun for the thing being asked for.
     *
     * "Next step" leaned task: a step is something you finish, and half of what
     * belongs here — "eat lower-carb most days", "use less screen time in the
     * evening" — is not finishable. Rather than pick one universal word (task,
     * habit, tactic, experiment) and be wrong for the others, the question does
     * the work and the concept stays unnamed. `docs/goals-and-areas.md`.
     */
    stepsQuestion: 'What could help you move toward this goal?',
    /** The cap, stated before the first entry rather than discovered at the third. */
    stepsNote: 'One is enough. You can add up to three.',
    stepsPlaceholder: 'Something small and concrete',
    /** Heads the numbered list once there is something in it. */
    entriesLabel: 'What you want to try',
    stepsAdd: 'Add',
    /** From the second entry on, so the button itself says more is allowed. */
    stepsAddAnother: 'Add another',
    stepsEnough: 'That is enough',
    stepsFull: 'Three is plenty to start with.',
    stepsContinue: 'Continue',
    /**
     * Names what is being edited. Three Edit buttons that all just say "Edit" are
     * three identical controls to a screen reader, and unclickable by name to the
     * verification suite.
     */
    stepsEdit: 'Edit: {text}',
    stepsEditQuestion: 'What should it say instead?',
    stepsEditSubmit: 'Save',
    stepsEditCancel: 'Cancel',

    focusQuestion: 'Which one would you like to focus on first?',
  },

  complete: {
    title: 'That is it for now.',
    body: 'What you want to try is on the start page.',
    submit: 'Go to the start page',
  },

  home: {
    title: 'What you are working on',
    empty: 'Nothing is active right now. That is a fine place to be.',
    /**
     * Shown only when an area holds a goal that never got a next step — that is,
     * setup that was interrupted rather than a pause someone chose. Deliberately
     * not shown after "Later": leaving an area quiet is a real answer, and
     * pointing at it would be nagging.
     */
    unfinished: 'One of your life areas has a goal but nothing to try yet.',
    /**
     * The control that opens the outcomes, and the question *is* the control.
     *
     * It replaces "Mark as done: {step}" on a full-width button that completed the
     * thing on any tap. Done was the only outcome available, which quietly made
     * finishing the model — wrong for anything ongoing. Asking instead means the
     * four answers below cover both, and it is the same affordance a future
     * check-in reuses: later it gets *asked* rather than only offered.
     */
    check: 'How is it going?',
    /** The accessible name, so the control says which thing it is about. */
    checkOn: 'How is it going with: {text}',
    /** Answers, not commands. Nothing here counts, scores or congratulates. */
    outcomeDone: 'I have done this',
    outcomeOngoing: 'Still on it',
    outcomeSwap: 'I would rather do something else',
    outcomeAside: 'This does not fit anymore',
    cancel: 'Cancel',
    done: 'Noted.',
    chooseNextQuestion: 'Would you like to choose what to try next?',
    chooseNext: 'Choose something',
    later: 'Later',
    newStepQuestion: 'What could help you move toward this goal?',
    newStepPlaceholder: 'Something small and concrete',
    newStepSubmit: 'Save',
    savedNote: 'What you told me is on this device only.',
    memoryNote: 'Nothing is being saved. What you told me stays in this tab.',
    // Parked with the name question — see the note above `name`.
    ack: 'Thank you. That is everything I wanted to ask.',
    greeting: 'Hello {name}.',
    youSaid: 'What you said when you arrived:',
    rename: 'Call me something else',
  },

  manage: {
    pickerTitle: 'Your life areas',
    pickerNote: 'Open one to change its goal, or what you want to try.',
    noGoal: 'No goal yet',
    notNow: 'Not right now',
    noStep: 'Nothing to try yet',

    reconsiderQuestion: 'Would you like to change or explore something here now?',
    reconsiderYes: 'Yes',
    reconsiderNo: 'Leave it for now',

    goalLabel: 'Your goal',
    activeLabel: 'Focusing on',
    preparedLabel: 'Also prepared',
    changeGoal: 'Change goal',
    changeStep: 'Focus on something else',
    addStep: 'Add something to try',
    done: 'Done',

    goalQuestion: 'What is your goal now?',

    /** One step per screen. Nothing is carried over silently, nothing is dropped silently. */
    reviewQuestion: 'Your goal changed. Is this still useful?',
    reviewKeep: 'Keep',
    reviewEdit: 'Edit',
    /** Deliberately not "Remove": nothing is deleted, and the copy should not pretend otherwise. */
    reviewRemove: 'Remove from current steps',
    editQuestion: 'What should it say instead?',
    editSubmit: 'Save',
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
    /** Life-area facts are shown through the domain layer, so no internal id is ever printed. */
    areas: {
      review: 'You said',
      yes: 'Yes',
      notNow: 'Not right now',
      goal: 'Your goal',
      earlier: 'earlier: {goal}',
      steps: 'Next steps',
      active: 'focusing on',
      open: 'prepared',
      done: 'done',
      retired: 'removed from current steps',
      edited: 'reworded from: {text}',
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
    isP1: '{app} is a prototype of an app meant to support a person in living and thriving. What you have seen is its beginning: a question about consent, and five areas of a life to look at one at a time.',
    isP2: 'It runs entirely in your browser. There is no server, no account, no analytics and no AI. Nothing you type is sent anywhere, and nothing is written to your device unless you said it was okay.',
    isP3: 'What you tell it is kept in your own words. Answers are added to a list rather than overwritten, so a later answer never erases an earlier one — how something changed is the interesting part.',
    isNotTitle: 'What it is not yet',
    isNotP1: 'There is no habit tracking, no journal, no mood tracking, no reminders and no scoring. It does not ask you to come back every day. Those choices come later, if they earn their place.',
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
