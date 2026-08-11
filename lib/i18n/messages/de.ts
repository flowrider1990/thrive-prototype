import type { Messages } from './en'

/**
 * German as real copy, not word-for-word. The register is `du` throughout — one
 * decision, made once, for an app about how a life is going; switching register
 * mid-flow feels broken in a way that is hard to name.
 *
 * Typed as `Messages`, so a missing key fails the build and an invented one is
 * rejected as an excess property.
 */
export const de: Messages = {
  app: {
    description:
      'Ein Prototyp einer App, die dabei unterstützen soll, gut zu leben. Läuft vollständig in deinem Browser.',
  },

  nav: {
    home: 'Start',
    areas: 'Lebensbereiche',
    you: 'Du',
    about: 'Über',
    menu: 'Menü',
  },

  lang: {
    label: 'Sprache',
    de: 'Deutsch',
    en: 'English',
  },

  theme: {
    light: 'Hell',
    dark: 'Dunkel',
    switchTo: 'Zu {theme} wechseln',
  },

  consent: {
    welcome: 'Willkommen — und danke, dass du das hier ausprobierst.',
    question:
      'Das hier ist ein Prototyp einer App, nur für den persönlichen Gebrauch. Was du mir erzählst, wird ausschließlich auf dem Gerät gespeichert, das du gerade benutzt. Ist das okay für dich?',
    yes: 'Ja, das ist okay',
    no: 'Nein',
    ack: 'Danke für dein Vertrauen, deine Neugier und deine Hilfe!',
  },

  declined: {
    question: 'Oh, okay. Warum, was stört dich daran?',
    placeholder: 'Was dir gerade dazu einfällt',
    note: 'Diese Antwort wird nicht auf deinem Gerät gespeichert. Sie bleibt in diesem Tab.',
    submit: 'Weiter',
    ack: 'Danke, dass du mir das sagst.',
    continueQuestion:
      'Möchtest du trotzdem weitermachen? Dann wird gar nichts auf deinem Gerät gespeichert — alles bleibt in diesem Tab und ist weg, sobald du ihn schließt.',
    continueYes: 'Ja, machen wir weiter',
    continueNo: 'Nein, das war es für jetzt',
  },

  stopped: {
    title: 'Das ist völlig in Ordnung.',
    body: 'Es wurde nichts gespeichert. Du kannst den Tab schließen oder jederzeit neu anfangen.',
    restart: 'Neu anfangen',
  },

  name: {
    question: 'Wie darf ich dich nennen?',
    placeholder: 'Dein Name, oder was du magst',
    submit: 'Weiter',
  },

  opening: {
    question: 'Hallo {name}, wie kann ich dir heute helfen?',
    placeholder: 'Was dir gerade im Kopf herumgeht',
    submit: 'Weiter',
    skip: 'Gerade nichts',
  },

  areas: {
    body: 'Körper & Gesundheit',
    relationships: 'Beziehungen & Soziales',
    work: 'Arbeit & Beruf',
    finances: 'Finanzen',
    creativity: 'Hobbys & Kreativität',
  },

  intro: {
    question: 'Als Nächstes schauen wir uns fünf Bereiche deines Lebens an, einen nach dem anderen.',
    note: 'Du brauchst nicht in jedem ein Ziel. „Gerade nicht“ ist eine echte Antwort, und alles, was du notierst, kannst du später ändern.',
    submit: 'Okay',
  },

  goals: {
    progressLabel: 'Angesehene Lebensbereiche',
    progressValue: 'Bereich {current} von {total}',

    reviewQuestion: 'Möchtest du hier gerade etwas verändern oder ausprobieren?',
    reviewYes: 'Ja',
    reviewNo: 'Gerade nicht',

    goalQuestion: 'Was ist dein Ziel?',
    goalPlaceholder: 'In deinen eigenen Worten',
    goalSubmit: 'Weiter',

    stepsQuestion: 'Was könnte dir helfen, diesem Ziel näherzukommen?',
    stepsNote: 'Eines reicht. Du kannst bis zu drei hinzufügen.',
    stepsPlaceholder: 'Etwas Kleines und Konkretes',
    entriesLabel: 'Was du ausprobieren willst',
    stepsAdd: 'Hinzufügen',
    stepsAddAnother: 'Noch etwas hinzufügen',
    stepsEnough: 'Das reicht',
    stepsFull: 'Drei sind für den Anfang genug.',
    stepsContinue: 'Weiter',
    stepsEdit: 'Ändern: {text}',
    stepsEditQuestion: 'Was soll stattdessen dastehen?',
    stepsEditSubmit: 'Speichern',
    stepsEditCancel: 'Abbrechen',

    focusQuestion: 'Womit möchtest du zuerst anfangen?',
  },

  complete: {
    title: 'Das war’s für den Anfang.',
    body: 'Was du ausprobieren willst, findest du auf der Startseite.',
    submit: 'Zur Startseite',
  },

  home: {
    title: 'Woran du gerade dran bist',
    empty: 'Gerade ist nichts aktiv. Auch das ist ein guter Ort.',
    unfinished: 'In einem deiner Lebensbereiche steht ein Ziel, aber noch nichts zum Ausprobieren.',
    check: 'Wie läuft’s?',
    checkOn: 'Wie läuft’s mit: {text}',
    outcomeDone: 'Das habe ich gemacht',
    outcomeOngoing: 'Bin noch dran',
    outcomeSwap: 'Ich möchte lieber etwas anderes',
    outcomeAside: 'Das passt nicht mehr',
    cancel: 'Abbrechen',
    done: 'Notiert.',
    chooseNextQuestion: 'Möchtest du wählen, was du als Nächstes ausprobierst?',
    chooseNext: 'Etwas wählen',
    later: 'Später',
    newStepQuestion: 'Was könnte dir helfen, diesem Ziel näherzukommen?',
    newStepPlaceholder: 'Etwas Kleines und Konkretes',
    newStepSubmit: 'Speichern',
    savedNote: 'Was du mir erzählt hast, liegt nur auf diesem Gerät.',
    memoryNote: 'Es wird nichts gespeichert. Was du mir erzählt hast, bleibt in diesem Tab.',
    ack: 'Danke. Das war alles, was ich fragen wollte.',
    greeting: 'Hallo {name}.',
    youSaid: 'Was du beim Ankommen gesagt hast:',
    rename: 'Nenn mich anders',
  },

  manage: {
    pickerTitle: 'Deine Lebensbereiche',
    pickerNote: 'Öffne einen, um sein Ziel zu ändern — oder was du ausprobieren willst.',
    noGoal: 'Noch kein Ziel',
    notNow: 'Gerade nicht',
    noStep: 'Noch nichts zum Ausprobieren',

    reconsiderQuestion: 'Möchtest du hier jetzt etwas verändern oder ausprobieren?',
    reconsiderYes: 'Ja',
    reconsiderNo: 'Erst einmal so lassen',

    goalLabel: 'Dein Ziel',
    activeLabel: 'Daran arbeitest du gerade',
    preparedLabel: 'Außerdem notiert',
    changeGoal: 'Ziel ändern',
    changeStep: 'An etwas anderem arbeiten',
    addStep: 'Etwas zum Ausprobieren hinzufügen',
    done: 'Fertig',

    goalQuestion: 'Was ist jetzt dein Ziel?',

    reviewQuestion: 'Dein Ziel hat sich geändert. Ist das hier noch nützlich?',
    reviewKeep: 'Behalten',
    reviewEdit: 'Ändern',
    reviewRemove: 'Aus den aktuellen Schritten entfernen',
    editQuestion: 'Was soll stattdessen dastehen?',
    editSubmit: 'Speichern',
  },

  you: {
    title: 'Was ich über dich weiß',
    introSaved:
      'In deinen eigenen Worten, genau so, wie du sie gesagt hast. Das hat diesen Browser nie verlassen: es gibt keinen Server, kein Konto, und nichts wird irgendwohin geschickt.',
    introMemory:
      'Du wolltest nicht, dass etwas gespeichert wird — deshalb lebt diese Liste nur in diesem Tab und ist weg, sobald du ihn schließt. Auf dein Gerät wurde nichts geschrieben.',
    introUnknown: 'Wir haben noch nicht gesprochen, deshalb ist hier nichts.',
    empty: 'Noch nichts.',
    learnedAt: 'notiert {when}',
    consentAt: 'Du hast dem Speichern am {when} zugestimmt.',
    keys: {
      preferred_name: 'Wie ich dich nennen soll',
      opening_intent: 'Was du beim Ankommen wolltest',
      consent_concern: 'Was du zum Speichern gesagt hast',
    },
    areas: {
      review: 'Du hast gesagt',
      yes: 'Ja',
      notNow: 'Gerade nicht',
      goal: 'Dein Ziel',
      earlier: 'vorher: {goal}',
      steps: 'Nächste Schritte',
      active: 'daran arbeitest du',
      open: 'notiert',
      done: 'erledigt',
      retired: 'aus den aktuellen Schritten entfernt',
      edited: 'umformuliert aus: {text}',
    },
    forget: {
      button: 'Alles vergessen',
      question:
        'Alles hier oben wird von diesem Gerät entfernt. Das lässt sich nicht rückgängig machen.',
      confirm: 'Ja, alles vergessen',
      cancel: 'Behalten',
      done: 'Vergessen. Es ist nichts mehr da.',
    },
  },

  about: {
    title: 'Über {app}',
    isTitle: 'Was das hier ist',
    isP1: '{app} ist der Prototyp einer App, die einen Menschen dabei unterstützen soll, gut zu leben. Was du gesehen hast, ist ihr Anfang: die Frage nach deinem Einverständnis und fünf Lebensbereiche, die man sich nacheinander ansieht.',
    isP2: 'Sie läuft vollständig in deinem Browser. Es gibt keinen Server, kein Konto, keine Auswertung und keine KI. Nichts, was du schreibst, wird irgendwohin geschickt, und auf dein Gerät wird nichts geschrieben, solange du nicht ja gesagt hast.',
    isP3: 'Was du erzählst, bleibt in deinen eigenen Worten. Antworten werden ergänzt statt überschrieben, damit eine spätere Antwort eine frühere nie löscht — wie sich etwas verändert hat, ist ja das Interessante.',
    isNotTitle: 'Was sie noch nicht ist',
    isNotP1: 'Es gibt kein Gewohnheits-Tracking, kein Tagebuch, keine Stimmungskurve, keine Erinnerungen und keine Punkte. Sie verlangt nicht, dass du jeden Tag wiederkommst. Das kommt später, falls es sich als sinnvoll erweist.',
    isNotP2: 'Sie ist außerdem kein medizinisches oder therapeutisches Werkzeug und kein Ersatz dafür, mit einem Menschen zu sprechen.',
    whereTitle: 'Wo deine Antworten liegen',
    whereP1: 'In diesem Browser, in einem einzigen Eintrag namens {key}, auf diesem Gerät. Wenn du deine Browserdaten löschst, ist er weg — genauso über „alles vergessen“ auf der Seite Du.',
    whereP2: 'Wenn du abgelehnt hast, existiert nicht einmal dieser Eintrag: die App läuft dann nur im Arbeitsspeicher und schreibt gar nichts. Das hat eine ehrliche Folge — sie kann sich nicht merken, dass du abgelehnt hast, und fragt dich beim nächsten Mal wieder.',
  },
}
