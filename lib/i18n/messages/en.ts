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
    // "For now" rather than a flat claim: this describes the current storage mode,
    // and the sentence should not have to be retracted if syncing ever exists. It
    // says nothing about what would replace it — see the note above `data`.
    description:
      'A prototype of an app to support living and thriving. For now it runs entirely in your browser.',
  },

  nav: {
    home: 'Start',
    areas: 'Life areas',
    data: 'Data protection',
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
   * but the copy stays until we decide whether it returns — and `/data/stored/` still
   * needs `stored.keys.preferred_name` to label a name someone already gave.
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
    /**
     * "Physical Health" rather than "Body & Health", now that mental wellbeing has an
     * area of its own: without the contrast, "Body & Health" quietly claimed all of
     * health. The id stays `body`, because ids are persisted inside fact keys.
     */
    body: 'Physical Health',
    /**
     * Scoped to inner life on purpose — rest, mood, stress, calm, how you are in
     * yourself. The risk with this area is not that it is too narrow but that it
     * absorbs the whole app: stress from work and loneliness both land here, and both
     * have areas that own them. Kept separate from Physical Health because physical
     * health is one input to wellbeing, while wellbeing is downstream of
     * relationships, work and circumstance too — merging them would make the merged
     * area the place everything hard goes.
     *
     * "Wellbeing", not "Health": this is not a clinical category and the app makes no
     * medical claims.
     */
    mind: 'Mental Wellbeing',
    relationships: 'Relationships & Social Life',
    work: 'Work & Career',
    finances: 'Finances',
    creativity: 'Hobbies & Creativity',
  },

  intro: {
    // The thanks is the consent acknowledgement above this question, so it is
    // not repeated here.
    question: 'Next we will look at six areas of your life, one at a time.',
    note: 'You do not need a goal in every one. "Not right now" is a real answer, and anything you note can be changed later.',
    submit: 'Okay',
  },

  goals: {
    /** The marks are a progressbar; these are its accessible name and value. */
    progressLabel: 'Life areas looked at',
    progressValue: 'Area {current} of {total}',

    reviewQuestion: 'Would you like to change or explore something here?',
    reviewYes: 'Yes',
    reviewNo: 'Not right now',

    goalQuestion: 'What is your goal?',
    goalPlaceholder: 'In your own words',
    goalSubmit: 'Continue',
    /**
     * The way past without inventing something, and the goal-screen counterpart to
     * `stepsUnknown` below.
     *
     * Worded differently on purpose: they answer different questions. This one is
     * about not having settled on what you want here; that one is about having a goal
     * and not yet knowing what would help.
     *
     * Taking it writes nothing at all — no empty goal, no placeholder — so the area
     * keeps its review answer, stays completable from its own page, and is never
     * pointed at from the start page.
     */
    goalSkip: 'Not sure yet',

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
    /**
     * The answer this screen was missing.
     *
     * Wanting something to change, having a goal, and not yet knowing what would help
     * is a perfectly ordinary place to be — and the screen used to have no way to say
     * it. The only way past was to invent something, which is the one outcome worth
     * preventing: a made-up action is worse than none, because the app would then treat
     * it as a real intention.
     *
     * It writes **nothing**. No placeholder entry, no "I don't know yet" masquerading
     * as a step. The area keeps its goal with no entry against it, which the model
     * already represents and which `manage.noStep` already describes.
     *
     * Uncontracted to match the rest of this catalog ("That is enough", "Not right
     * now", "You do not need a goal in every one").
     */
    stepsUnknown: 'I do not know yet',
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
     *
     * `{area}` is rendered as a link to that area, so the sentence names the place
     * it is talking about instead of saying "one of your life areas" and leaving
     * the reader to go looking. The placeholder has to survive translation:
     * `components/next-steps.tsx` falls back to plain text without it, so a
     * catalog that drops it loses the link rather than breaking the screen.
     *
     * Second half matches `manage.noStep` word for word. The two describe the same
     * gap from different pages, and saying it differently would imply a difference.
     */
    unfinished: '{area} has a goal, but you have not decided yet what could help.',
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
    /**
     * Answers, not commands. Nothing here counts, scores or congratulates.
     *
     * Three, not four. "I would rather do something else" and "This does not fit
     * anymore" were two labels for one state — this is not right for me now — and
     * offering both asked the person to classify their own dissatisfaction before the
     * app would act on it. They barely differed in effect either: one set the entry
     * aside and then offered another, the other kept it open and offered another.
     *
     * The single answer takes the honest path: the entry is set aside — out of current
     * use, still kept, as everywhere else — and then choosing something else is
     * offered. That covers both readings without a second semantic path.
     */
    outcomeDone: 'I have done this',
    outcomeOngoing: 'Still on it',
    outcomeAside: 'This does not fit me anymore',
    cancel: 'Cancel',
    done: 'Noted.',
    /**
     * Only rendered when both groups exist. With everything pinned, or nothing, one
     * unlabelled list says more than two headings over an obvious split.
     */
    pinnedLabel: 'Pinned',
    restLabel: 'Everything else',
    newStepQuestion: 'What could help you move toward this goal?',
    newStepPlaceholder: 'Something small and concrete',
    newStepSubmit: 'Save',
    /**
     * "Currently" is load-bearing. The sentence describes the storage mode in
     * force right now, not a permanent property of the product, so it stays true
     * rather than becoming a broken promise if syncing is ever added. It does not
     * hint that syncing is coming either — that would be its own claim.
     *
     * The detail lives behind the link rather than in this line: one calm sentence
     * on the start page, and the page that explains properly is one tap away.
     */
    savedNote: 'What you told me is currently kept on this device only.',
    memoryNote: 'Nothing is being saved. What you told me stays in this tab.',
    // Parked with the name question — see the note above `name`.
    ack: 'Thank you. That is everything I wanted to ask.',
    greeting: 'Hello {name}.',
    youSaid: 'What you said when you arrived:',
    rename: 'Call me something else',
  },

  manage: {
    /**
     * The way up from one area. Names the destination rather than saying "Back", so
     * it still means something read on its own — and it matches `pickerTitle`, which
     * is what the page it lands on is called.
     */
    back: 'Back to your life areas',
    /**
     * The same link when the area was opened from the start page.
     *
     * Two labels because a back link should name where it goes; one that said "Back to
     * your life areas" while returning to the start page would be worse than no label
     * at all.
     */
    backHome: 'Back to the start page',
    pickerTitle: 'Your life areas',
    pickerNote: 'Open one to change its goal, or what you want to try.',
    noGoal: 'No goal yet',
    notNow: 'Not right now',
    /**
     * Says what is missing *in relation to the goal*, which "Nothing to try yet"
     * did not — that read as a bare absence and left it unclear whether anything
     * was expected of you.
     *
     * Still no noun for the thing itself, for the reason spelled out above
     * `goals.stepsQuestion`: naming it task, habit or action would be wrong for
     * half of what belongs here. "What could help" is the same phrasing the
     * question uses, so the empty state and the question agree.
     */
    noStep: 'You have not decided yet what could help.',
    /** A count rather than one arbitrary entry: with nothing pinned, none is first. */
    tryingOne: 'One thing to try',
    trying: '{count} things to try',

    reconsiderQuestion: 'Would you like to change or explore something here now?',
    reconsiderYes: 'Yes',
    reconsiderNo: 'Leave it for now',

    /**
     * One label for the whole list rather than one per goal: the serif heading is
     * already unmistakably the thing you want. It pairs with `goals.entriesLabel`
     * ("What you want to try") one level down — the two name the two levels of the
     * hierarchy in the same words.
     */
    goalsLabel: 'What you want',
    /**
     * Kept in view on the start page. Deliberately not "focus": several entries can
     * be pinned, so a word implying one would be a promise the model does not make.
     * Separate from goal priority, which orders goals rather than entries.
     */
    pin: 'Pin',
    unpin: 'Unpin',
    pinOn: 'Pin: {text}',
    unpinOn: 'Unpin: {text}',
    addStep: 'Add something to try',
    /** Three visible "Add" buttons are three identical controls out loud. */
    addStepFor: 'Add something to try for: {goal}',
    goalAdd: 'Add a goal',
    goalChange: 'Change this goal',
    goalChangeOn: 'Change this goal: {goal}',
    done: 'Done',

    /** "Else", because the first one was asked for during the introduction. */
    goalNewQuestion: 'What else do you want here?',
    goalMenuQuestion: 'What would you like to change?',
    goalReword: 'Change the wording',

    /**
     * Rewritten from "Need more motivation? …", which opens by telling someone they
     * lack motivation — a diagnosis nobody asked for, and the kind of claim the
     * Feature Manifest rules out. This reports instead, and leaves the reader to
     * decide whether it applies to them.
     */
    goalWhy: 'Write down why this matters',
    goalWhyEdit: 'Change why this matters',
    goalWhyInvite: 'Some people find it easier to keep going when the reason is written down.',
    goalWhyQuestion: 'Why does reaching this goal matter to you?',
    /** The ceiling stated in prose, the way the three-entry cap already is. */
    goalWhyNote: 'A sentence or two is plenty. You can leave it empty.',

    goalTop: 'Move this to the top',
    goalTopNote: 'The one at the top is what this area is about right now.',

    goalReached: 'I have reached this',
    goalReachedQuestion: 'Have you reached this goal?',
    goalDrop: 'Remove from your current goals',
    goalDropQuestion: 'Is this no longer a goal for you?',
    /**
     * The consequence, stated before it happens rather than discovered afterwards.
     * Nothing is deleted — what was being tried leaves the list because the goal it
     * was for is closed, and `/data/stored/` still holds all of it.
     */
    goalCloseNote: 'What you were trying for it is set aside with it. Nothing is deleted.',
    goalCloseCancel: 'Not yet',
    /** Only ever shown when there is one, and there should not be. */
    looseLabel: 'Not tied to a goal right now',

    reviewEdit: 'Edit',
    editQuestion: 'What should it say instead?',
    editSubmit: 'Save',
  },

  /**
   * The stored-data view at `/data/stored/`. Named for the page, not for the person:
   * this used to be the `you` group behind a `/you` route, and a group whose name no
   * longer matches any route is how a catalog starts drifting from the app.
   */
  stored: {
    title: 'What is stored',
    back: 'Back to data protection',
    introSaved:
      'In your own words, exactly as you gave them. None of it has ever left this browser: there is currently no server and no account, and nothing is sent anywhere.',
    introMemory:
      'You asked for nothing to be saved, so this list lives in this tab only and is gone when you close it. Nothing was written to your device.',
    introUnknown: 'We have not talked yet, so there is nothing here.',
    empty: 'Nothing yet.',
    learnedAt: 'noted {when}',
    /**
     * How much is stored, in two forms because "1 entries" is wrong in English and
     * "1 Einträge" is worse in German.
     *
     * Used twice, which is why it sits here rather than under `areas`: on `/data/`
     * beside the action that opens this page, and in each folded area's summary. Both
     * answer the same question — how much is behind this — so both should say it the
     * same way.
     */
    entryCountOne: '1 entry',
    entryCount: '{count} entries',
    consentAt: 'You agreed to saving on {when}.',
    keys: {
      preferred_name: 'What I should call you',
      opening_intent: 'What you wanted when you arrived',
      consent_concern: 'What you said about saving',
      introduction_done: 'When you finished the introduction',
    },
    /**
     * Values the app wrote rather than words someone chose, and the sentence each
     * one reads as.
     *
     * The generic list on this page prints `fact.value` directly, which is right for
     * an utterance and wrong for a token — `docs/person-model.md` is explicit that a
     * token must never reach a screen as itself. Same division of labour as
     * `areas.review` / `areas.yes` one level down: the label supplies the occasion,
     * the value is a whole sentence, and neither needs the other to make sense.
     *
     * Deliberately says nothing about how many areas there are. A sentence that
     * counted them would have to be rewritten every time the list changed.
     */
    tokens: {
      introduction_done: { yes: 'You went through all the life areas once' },
    },
    /** Life-area facts are shown through the domain layer, so no internal id is ever printed. */
    areas: {
      /**
       * Said once, above every area, because it is true of every line under it
       * and because the words below — "set aside", "changed from" — would otherwise
       * be read as things having been removed. Nothing on this page is ever deleted
       * except by deleting all of it: the store is append-only.
       */
      note: 'Nothing here is removed. Earlier wordings and things you set aside are kept, so you can see how something changed.',
      /**
       * The stored value is the token `yes` or `not_now`, and "You said" followed by
       * "Yes" told the reader nothing — the question it answered was not on screen.
       * The label supplies the occasion and each value is a whole sentence, so the
       * line stands on its own.
       */
      review: 'When you looked at this area',
      yes: 'You wanted to change or try something here',
      notNow: 'You did not want to change anything then',
      goal: 'Your goal',
      /** Explicit about being a change, rather than leaving "earlier" to imply it. */
      earlier: 'changed from: {goal}',
      /** Past tense, and still no noun for the thing — see `goals.stepsQuestion`. */
      steps: 'What you wanted to try',
      /** When it was first written down, which is separate from what became of it. */
      added: 'added {when}',
      /** A pin, not an outcome — so it reads as a preference and carries no date. */
      pinned: 'kept in view',
      open: 'prepared',
      done: 'done',
      /**
       * Not "removed" and not "deleted": the words are still here, one line further
       * down, and either would be a false claim about the person's own data.
       */
      retired: 'set aside',
      /**
       * A goal is *reached*, not "done": done is what you say about a thing you were
       * trying, and a goal is the thing it was for.
       */
      goalReached: 'reached',
      /** A pointer, not a fact about the goal — so `standing()` gives it no date. */
      goalPriority: 'first for now',
      /** Only rendered when there is one; an absent reason is not an empty one. */
      why: 'why it matters: {why}',
      edited: 'reworded from: {text}',
      /** The collapsed summary has to say enough to be worth not opening. */
      noGoal: 'No goal recorded',
    },
  },

  /**
   * Two levels on purpose. `/data/` has to stay readable by someone with no interest
   * in how software works, and the stored-data list grows without bound as the app is
   * used — putting one inside the other would eventually bury the explanation under
   * the thing it is explaining.
   */
  data: {
    title: 'Data protection',
    /**
     * Plain language, present tense, one fact per sentence.
     *
     * "Currently" appears twice and is not hedging: both sentences describe the
     * storage mode in force today. Written as timeless facts they would silently
     * become false the day anything syncs, and a privacy page that has to be
     * retracted is worse than one that was accurate about its own scope. Nothing
     * here promises or implies that a cloud is coming.
     */
    p1: 'What you write here is currently stored only in this browser, on this device.',
    p2: 'It is not sent to us. There is currently no account and no cloud, and nobody else can see it.',
    p3: 'If you clear your browser data, it is deleted along with everything else.',
    p4: 'Another browser, or another device, will not have it.',
    /** The one thing this page is for, besides being true. */
    show: 'Show what is stored',
    /**
     * The second way in, for someone who came here to leave rather than to read.
     *
     * It goes to the same flow in the same place — `/data/stored/#delete` — rather
     * than putting a second copy of the confirmation on this page. Two delete flows
     * would be two things to keep in step, and the one that lives beside the data
     * is the honest one: you see what goes before you agree to it going.
     *
     * Shown only when there is something stored. Offering to delete nothing is
     * noise, and it would imply data exists where none does.
     */
    deleteEntry: 'Delete my data',

    /** The storage choice: what is in force, and how to change it. */
    storage: {
      /**
       * The state as a **label**, not a sentence — "Currently: …". It is the one thing
       * on this page someone might arrive specifically to check, so it reads at a
       * glance and sits directly under the title.
       *
       * Deliberately short. It used to restate what the four paragraphs below already
       * explain ("what you write is kept in this browser, on this device"), and saying
       * the same thing twice was most of why this section felt dense.
       *
       * "Currently" for the same reason it appears in `p1`: this describes the mode in
       * force today and must not read as a permanent property.
       */
      /**
       * The state in words, beside the switch. §17 forbids meaning carried by colour
       * alone, and a knob's position on its own is a graphic — so the word is what
       * makes the setting readable rather than merely visible.
       */
      on: 'ON',
      off: 'OFF',
      /**
       * Present, off, and not operable yet — with the reason under it rather than a
       * dead control to poke at. Registration is never required to use any of this,
       * and nothing here asks for it.
       */
      optionCloud: 'Sync with Cloud',
      cloudDevOnly: 'Cloud sync is currently available to developers only.',

      /**
       * The two modes, as the names of the thing you would be switching **to**.
       *
       * Only the one you are not on is ever offered, so there is nothing here that
       * restates the current setting — the `Currently: …` label above already does
       * that, and the page's four paragraphs already explain what storage means.
       *
       * This deliberately dropped a question and a second option. Reopening the
       * decision used to reprint onboarding's framing plus both modes with a line of
       * explanation each, on a page that had just explained all of it. With two modes
       * and the current one stated, the whole choice is "switch to the other one, or
       * do not".
       */
      optionLocal: 'Save on this device',

      /**
       * Turning saving off has to delete what was saved, and that is not a warning
       * dressed up — it is the only honest outcome. "Off" means nothing of yours is
       * left on the device, so anything already there has to go with it.
       *
       * Shown **only when there is something to lose.** Switching with nothing stored
       * costs nothing, and a confirmation step for a change with no consequence is the
       * kind of ceremony that teaches people to click through the ones that matter.
       */
      offTitle: 'Turn saving off?',
      offBody:
        'Saving off means nothing of yours stays on this device, so what is saved here is deleted as part of the change. This visit carries on, and what you do in it stays in this tab until you close it.',
      offConfirm: 'Turn saving off and delete',
      onDone: 'Saving is on now.',
      offDone: 'Saving is off now, and what was stored has been deleted.',
      /** Nothing was stored, so nothing was deleted, and the copy must not claim it. */
      offDoneEmpty: 'Saving is off now.',
    },
    memoryNote:
      'You asked for nothing to be saved, so nothing is being written to this device at all. What you tell the app this visit stays in this tab and is gone when you close it.',

    /**
     * Deleting is deliberate: one confirmation, which carries the whole consequence.
     * The copy stays factual — no warning tone, no attempt to talk anyone out of it.
     * It is their data.
     */
    delete: {
      button: 'Delete everything',
      /**
       * A question, then one sentence of consequence.
       *
       * It used to open with a statement ("This removes everything you have
       * entered.") followed by an inventory, which read as a warning being
       * delivered rather than a decision being offered. Asking is the honest
       * shape: the first step exists so the answer can be no.
       *
       * Nothing here is regretful or persuasive in either direction. It is their
       * data, and "if you change your mind later" quietly framed leaving as the
       * expected choice.
       */
      warnTitle: 'Delete all data?',
      /**
       * One confirmation, and it has to carry everything the two used to: what goes,
       * that it would have to be typed again, and that it cannot be undone.
       *
       * There were three asks — the button, then "are you sure", then "really sure".
       * Two of them said the same thing, and a step that adds no information teaches
       * people to click through the step that does. What prevents an accident here is
       * that deleting is never the first tap and the safe choice is the emphasised
       * one, not the number of times the question is repeated.
       */
      warnBody:
        'This deletes everything you have saved, and cannot be undone. If you use the app again later, you would have to enter it all again.',
      cancel: 'Keep it',
      finalConfirm: 'Yes, delete everything',
      done: 'Deleted. Nothing is left.',
    },
  },

  about: {
    title: 'About {app}',
    isTitle: 'What this is',
    isP1: '{app} is a prototype of an app meant to support a person in living and thriving. What you have seen is its beginning: a question about consent, and six areas of a life to look at one at a time.',
    /**
     * "For now" and "at the moment" carry the same weight here as "currently" does in
     * the `data` group. These are the strongest claims the app makes about itself, and
     * an architectural promise is not what they are — they describe what is true of
     * this prototype today. Saying so costs one phrase and saves having to retract a
     * paragraph.
     */
    isP2: 'It runs entirely in your browser for now. At the moment there is no server, no account, no analytics and no AI. Nothing you type is sent anywhere, and nothing is written to your device unless you said it was okay.',
    isP3: 'What you tell it is kept in your own words. Answers are added to a list rather than overwritten, so a later answer never erases an earlier one — how something changed is the interesting part.',
    isNotTitle: 'What it is not yet',
    isNotP1: 'There is no habit tracking, no journal, no mood tracking, no reminders and no scoring. It does not ask you to come back every day. Those choices come later, if they earn their place.',
    isNotP2: 'It is also not a medical or therapeutic tool, and no substitute for talking to a person.',
    whereTitle: 'Where your answers live',
    whereP1: 'For now, in this browser, in a single entry called {key}, on this device. Clearing your browser data removes it, and so does "delete everything" under Data protection.',
    whereP2: 'If you declined, not even that entry exists: the app runs in memory for that visit and writes nothing at all. That has one honest consequence — it cannot remember that you declined, so it will ask again next time.',
  },
}

/**
 * Deliberately not `as const`: with literal types, `de.ts` could only satisfy
 * this by repeating the English strings verbatim. Widened to `string`, the type
 * checks the shape — every key present, none invented — which is the point.
 */
export type Messages = typeof en
