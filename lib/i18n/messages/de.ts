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
      'Ein Prototyp einer App, die dabei unterstützen soll, gut zu leben. Läuft vorerst vollständig in deinem Browser.',
  },

  nav: {
    home: 'Start',
    areas: 'Lebensbereiche',
    data: 'Datenschutz',
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
    body: 'Körperliche Gesundheit',
    // "Mentales", nicht "Psychisches": psychisch ist die klinische Ebene, und die App
    // erhebt keine medizinischen Ansprüche.
    mind: 'Mentales Wohlbefinden',
    relationships: 'Beziehungen & Soziales',
    work: 'Beruf & Karriere',
    creativity: 'Hobbys & Kreativität',
    // Nicht „Geld & Finanzen“: der Bereich fragt, was Geld ermöglicht — abgesichert
    // sein und Handlungsspielraum haben —, nicht nach dem Kontostand. Die id heißt
    // weiter `finances`, weil sie in gespeicherten Schlüsseln steckt.
    finances: 'Absicherung & Freiheit',
  },

  intro: {
    question: 'Als Nächstes schauen wir uns sechs Bereiche deines Lebens an, einen nach dem anderen.',
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
    goalSkip: 'Bin noch nicht sicher',
    goalBack: 'Zurück',
    goalAnother: 'Noch ein Ziel hinzufügen',

    stepsQuestion: 'Was könnte dir helfen, diesem Ziel näherzukommen?',
    forGoal: 'Ziel: „{text}“',
    stepsNote: 'Eines reicht. Du kannst bis zu drei hinzufügen.',
    stepsPlaceholder: 'Etwas Kleines und Konkretes',
    entriesLabel: 'Was du ausprobieren willst',
    stepsSave: 'Speichern',
    stepsEnough: 'Das reicht',
    stepsUnknown: 'Ich weiß es noch nicht',
    stepsFull: 'Drei sind für den Anfang genug.',
    stepsContinue: 'Weiter',
    stepsEdit: 'Ändern: {text}',
    stepsEditQuestion: 'Was soll stattdessen dastehen?',
    stepsEditSubmit: 'Speichern',
    stepsEditCancel: 'Abbrechen',

  },

  complete: {
    ack: 'Sehr gut, vielen Dank!',
    title: 'Das war’s für den Anfang.',
    body: 'Was du ausprobieren willst, findest du auf der Startseite.',
    submit: 'Zur Startseite',
  },

  home: {
    title: 'Woran du gerade dran bist',
    empty: 'Gerade ist nichts aktiv. Auch das ist ein guter Ort.',
    unfinished:
      'In {area} steht ein Ziel, aber du hast noch nicht festgelegt, was dir dabei helfen könnte.',
    check: 'Wie läuft’s?',
    checkOn: 'Wie läuft’s mit: {text}',
    outcomeDone: 'Das habe ich gemacht',
    outcomeOngoing: 'Bin noch dran',
    outcomeAside: 'Das passt für mich nicht mehr',
    cancel: 'Abbrechen',
    done: 'Notiert.',
    pinnedLabel: 'Angepinnt',
    restLabel: 'Alles andere',
    newStepQuestion: 'Was könnte dir helfen, diesem Ziel näherzukommen?',
    newStepPlaceholder: 'Etwas Kleines und Konkretes',
    savedNote: 'Was du mir erzählt hast, liegt aktuell nur auf diesem Gerät.',
    memoryNote: 'Es wird nichts gespeichert. Was du mir erzählt hast, bleibt in diesem Tab.',
    ack: 'Danke. Das war alles, was ich fragen wollte.',
    greeting: 'Hallo {name}.',
    youSaid: 'Was du beim Ankommen gesagt hast:',
    rename: 'Nenn mich anders',
  },

  manage: {
    back: 'Zurück zu deinen Lebensbereichen',
    backHome: 'Zurück zur Startseite',
    pickerTitle: 'Deine Lebensbereiche',
    pickerNote: 'Öffne einen, um sein Ziel zu ändern — oder was du ausprobieren willst.',
    goalsNone: 'Keine Ziele vorhanden',
    goalsOne: '1 Ziel angegeben',
    goalsMany: '{count} Ziele angegeben',
    noStep: 'Hinweis: Du hast noch nicht festgelegt, was dir dabei helfen könnte.',
    tryingOne: 'Eine Sache zum Ausprobieren',
    trying: '{count} Sachen zum Ausprobieren',

    reconsiderQuestion: 'Möchtest du hier jetzt etwas verändern oder ausprobieren?',
    reconsiderYes: 'Ja',
    reconsiderNo: 'Erst einmal so lassen',

    goalNumber: 'Ziel #{n}:',
    goalOnly: 'Ziel:',
    // Tiefe und hohe Anführungszeichen, wie im Deutschen üblich — im Englischen beide
    // oben. Deshalb steht die Zeichensetzung im Katalog und nicht im Bauteil.
    goalQuoted: '„{text}“',
    goalHow: 'Wie willst du dieses Ziel erreichen?',
    pin: 'Anpinnen',
    unpin: 'Loslösen',
    pinOn: 'Anpinnen: {text}',
    unpinOn: 'Loslösen: {text}',
    addStep: 'Etwas hinzufügen',
    addStepFor: 'Etwas hinzufügen für: {goal}',
    goalAdd: '+ Weiteres Ziel hinzufügen',
    goalChange: 'Ändern',
    goalChangeOn: 'Dieses Ziel ändern: {goal}',
    done: 'Fertig',

    goalNewQuestion: 'Was willst du hier außerdem?',


    goalTop: 'Nach oben setzen',
    goalTopNote: 'Ganz oben steht, worum es in diesem Bereich gerade geht.',

    goalReached: 'Das habe ich erreicht',
    goalReachedQuestion: 'Hast du dieses Ziel erreicht?',
    goalDrop: 'Aus deinen aktuellen Zielen entfernen',
    goalDropQuestion: 'Ist das kein Ziel mehr für dich?',
    goalCloseNote:
      'Was du dafür ausprobieren wolltest, wird mit beiseitegelegt. Gelöscht wird nichts.',
    goalCloseCancel: 'Noch nicht',
    looseLabel: 'Gerade keinem Ziel zugeordnet',

    reviewEdit: 'Ändern',
    editQuestion: 'Was soll stattdessen dastehen?',
    editSubmit: 'Speichern',
  },

  stored: {
    title: 'Was gespeichert ist',
    back: 'Zurück zum Datenschutz',
    introSaved:
      'In deinen eigenen Worten, genau so, wie du sie gesagt hast. Nichts davon hat diesen Browser jemals verlassen: es gibt aktuell keinen Server und kein Konto, und nichts wird irgendwohin geschickt.',
    introMemory:
      'Du wolltest nicht, dass etwas gespeichert wird — deshalb lebt diese Liste nur in diesem Tab und ist weg, sobald du ihn schließt. Auf dein Gerät wurde nichts geschrieben.',
    introUnknown: 'Wir haben noch nicht gesprochen, deshalb ist hier nichts.',
    empty: 'Noch nichts.',
    learnedAt: 'notiert {when}',
    entryCountOne: 'ein Eintrag',
    entryCount: '{count} Einträge',
    consentAt: 'Du hast dem Speichern am {when} zugestimmt.',
    keys: {
      preferred_name: 'Wie ich dich nennen soll',
      opening_intent: 'Was du beim Ankommen wolltest',
      consent_concern: 'Was du zum Speichern gesagt hast',
      introduction_done: 'Als du die Einführung abgeschlossen hast',
    },
    tokens: {
      introduction_done: { yes: 'Du hast alle Lebensbereiche einmal durchgesehen' },
    },
    areas: {
      note: 'Hier wird nichts entfernt. Frühere Formulierungen und Dinge, die du beiseitegelegt hast, bleiben erhalten — so bleibt sichtbar, wie sich etwas verändert hat.',
      review: 'Als du diesen Bereich angesehen hast',
      yes: 'Du wolltest hier etwas verändern oder ausprobieren',
      notNow: 'Du wolltest damals nichts verändern',
      goal: 'Dein Ziel',
      earlier: 'geändert von: {goal}',
      steps: 'Was du ausprobieren wolltest',
      added: 'hinzugefügt {when}',
      pinned: 'im Blick behalten',
      open: 'notiert',
      done: 'erledigt',
      retired: 'beiseitegelegt',
      goalReached: 'erreicht',
      goalPriority: 'zurzeit zuerst',
      why: 'warum es zählt: {why}',
      edited: 'umformuliert aus: {text}',
      noGoal: 'Kein Ziel notiert',
    },
  },

  data: {
    title: 'Datenschutz',
    p1: 'Was du hier schreibst, wird aktuell nur in diesem Browser auf diesem Gerät gespeichert.',
    p2: 'Es wird nicht an uns gesendet. Es gibt aktuell kein Konto und keine Cloud, und niemand sonst kann es sehen.',
    p3: 'Wenn du deine Browserdaten löschst, wird es mit allem anderen zusammen gelöscht.',
    p4: 'Ein anderer Browser oder ein anderes Gerät hat es nicht.',
    show: 'Zeigen, was gespeichert ist',
    deleteEntry: 'Meine Daten löschen',

    storage: {
      on: 'EIN',
      off: 'AUS',
      optionCloud: 'Mit der Cloud synchronisieren',
      cloudDevOnly: 'Cloud-Synchronisierung ist derzeit nur für Entwickler verfügbar.',

      optionLocal: 'Auf diesem Gerät speichern',

      onDone: 'Speichern ist jetzt an.',
    },
    memoryNote:
      'Du wolltest nicht, dass etwas gespeichert wird — deshalb wird auf dieses Gerät gar nichts geschrieben. Was du der App diesmal erzählst, bleibt in diesem Tab und ist weg, sobald du ihn schließt.',

    delete: {
      button: 'Alles löschen',
      warnTitle: 'Alle Daten löschen?',
      warnBody:
        'Dadurch werden alle von dir gespeicherten Daten gelöscht, und das lässt sich nicht rückgängig machen. Wenn du die App später wieder verwendest, musst du sie erneut eingeben.',
      cancel: 'Behalten',
      finalConfirm: 'Ja, alles löschen',
      done: 'Gelöscht. Es ist nichts mehr da.',
      restart: 'Neu anfangen',
    },
  },

  about: {
    title: 'Über {app}',
    isTitle: 'Was das hier ist',
    isP1: '{app} ist der Prototyp einer App, die einen Menschen dabei unterstützen soll, gut zu leben. Was du gesehen hast, ist ihr Anfang: die Frage nach deinem Einverständnis und sechs Lebensbereiche, die man sich nacheinander ansieht.',
    isP2: 'Sie läuft vorerst vollständig in deinem Browser. Derzeit gibt es keinen Server, kein Konto, keine Auswertung und keine KI. Nichts, was du schreibst, wird irgendwohin geschickt, und auf dein Gerät wird nichts geschrieben, solange du nicht ja gesagt hast.',
    isP3: 'Was du erzählst, bleibt in deinen eigenen Worten. Antworten werden ergänzt statt überschrieben, damit eine spätere Antwort eine frühere nie löscht — wie sich etwas verändert hat, ist ja das Interessante.',
    isNotTitle: 'Was sie noch nicht ist',
    isNotP1: 'Es gibt kein Gewohnheits-Tracking, kein Tagebuch, keine Stimmungskurve, keine Erinnerungen und keine Punkte. Sie verlangt nicht, dass du jeden Tag wiederkommst. Das kommt später, falls es sich als sinnvoll erweist.',
    isNotP2: 'Sie ist außerdem kein medizinisches oder therapeutisches Werkzeug und kein Ersatz dafür, mit einem Menschen zu sprechen.',
    whereTitle: 'Wo deine Antworten liegen',
    whereP1: 'Vorerst in diesem Browser, in einem einzigen Eintrag namens {key}, auf diesem Gerät. Wenn du deine Browserdaten löschst, ist er weg — genauso über „alles löschen“ unter Datenschutz.',
    whereP2: 'Wenn du abgelehnt hast, existiert nicht einmal dieser Eintrag: die App läuft dann nur im Arbeitsspeicher und schreibt gar nichts. Das hat eine ehrliche Folge — sie kann sich nicht merken, dass du abgelehnt hast, und fragt dich beim nächsten Mal wieder.',
  },
}
