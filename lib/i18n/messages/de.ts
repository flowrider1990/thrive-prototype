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
    signIn: 'Anmelden',
    signOut: 'Abmelden',
  },

  auth: {
    title: 'Anmelden',
    emailQuestion: 'An welche E-Mail-Adresse sollen wir einen Code schicken?',
    emailPlaceholder: 'du@beispiel.de',
    send: 'Code schicken',
    note: 'Wenn du noch kein Konto hast, wird beim Anmelden eines angelegt. Was synchronisiert wird, liegt dann bei uns — und du kannst es jederzeit wieder löschen.',
    noteData: 'Was auf diesem Gerät liegt, kommt beim Anmelden in dein Konto.',
    prototypeNote:
      'Hinweis: Das funktioniert noch nicht. In der E-Mail steht kein Code, die Anmeldung lässt sich also nicht abschließen — eine Einschränkung dieses Prototyps, nicht dein Fehler. Auf diesem Gerät ändert sich dadurch nichts.',
    codeQuestion: 'Wie lautet der Code?',
    codeSent: 'Wir haben ihn an {email} geschickt. Er gilt etwa eine Stunde.',
    codePlaceholder: 'Der Code aus der E-Mail',
    verify: 'Anmelden',
    resend: 'Neuen Code schicken',
    otherEmail: 'Andere Adresse verwenden',
    cancel: 'Abbrechen',
    close: 'Schließen',
    working: 'Einen Moment…',
    signedInAs: 'Angemeldet als {email}.',
    done: 'Die Synchronisierung läuft. Was hier ist, ist auch in deinem Konto.',

    error: {
      offline: 'Das hat uns nicht erreicht. Hier hat sich nichts geändert — versuch es noch einmal, wenn du wieder Verbindung hast.',
      rejected: 'Der Code wurde nicht angenommen. Vielleicht ist er abgelaufen, oder es wurde inzwischen ein neuer geschickt.',
      rateLimited: 'Das waren viele Versuche in kurzer Zeit. Warte eine Minute und versuch es dann noch einmal.',
      signupClosed: 'Diese App nimmt gerade keine neuen Konten an.',
      server: 'Bei uns ist etwas schiefgegangen. Hier hat sich nichts geändert.',
      unconfigured: 'In dieser Version der App ist die Synchronisierung nicht eingerichtet.',
    },

    conflict: {
      title: 'Hier liegt etwas, und in deinem Konto liegt etwas.',
      body: 'Die beiden sind nicht gleich, deshalb wurde noch nichts geändert. Was du behältst, ersetzt das andere.',
      supersededTitle: 'Deine Daten wurden von einem anderen Gerät aus ersetzt.',
      supersededBody:
        'Was hier liegt, ist von davor — und einiges davon ist nie in deinem Konto angekommen. Geändert wurde noch nichts: Was du behältst, ersetzt das andere.',
      here: 'Auf diesem Gerät: {count}',
      there: 'In deinem Konto: {count}',
      keepDevice: 'Das von diesem Gerät behalten',
      keepDeviceNote: 'Was jetzt auf diesem Gerät liegt, ersetzt das, was in deinem Konto gespeichert ist.',
      keepAccount: 'Das aus meinem Konto behalten',
      keepAccountNote: 'Was jetzt auf diesem Gerät gespeichert ist, wird durch das aus deinem Konto ersetzt.',
    },
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
    // Nicht „Zuhause“: das Wort setzt für manche eine Familie und ein angekommenes Leben
    // voraus und trifft für andere einen wunden Punkt. „Wohnung“ ist schlicht der Ort,
    // „Wohnen“ ist, wie es sich darin lebt — und darum geht es hier eigentlich.
    living: 'Wohnung & Wohnen',
    relationships: 'Beziehungen & Soziales',
    work: 'Beruf & Karriere',
    creativity: 'Hobbys & Kreativität',
    // Nicht „Geld & Finanzen“: der Bereich fragt, was Geld ermöglicht — abgesichert
    // sein und Handlungsspielraum haben —, nicht nach dem Kontostand. Die id heißt
    // weiter `finances`, weil sie in gespeicherten Schlüsseln steckt.
    finances: 'Absicherung & Freiheit',
  },

  intro: {
    question: 'Als Nächstes schauen wir uns die Bereiche deines Lebens an, einen nach dem anderen.',
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
    goalSubmit: 'Bestätigen',
    goalSkip: 'Bin noch nicht sicher',
    goalBack: 'Zurück',

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
    manage: 'Ziele und nächste Schritte bearbeitest du in {link}.',
    manageLink: 'deinen Lebensbereichen',
    submit: 'Zur Startseite',
  },

  home: {
    title: 'Deine nächsten Schritte',
    viewLabel: 'Was anzeigen',
    viewSteps: 'Meine nächsten Schritte',
    viewGoals: 'Meine Ziele',
    goalsTitle: 'Deine Ziele',
    goalsEmpty: 'Noch keine Ziele.',
    empty: 'Gerade ist nichts aktiv. Auch das ist ein guter Ort.',
    unfinished:
      'Hinweis: es gibt Ziele ohne konkrete Schritte. Trage sie ein, damit sie hier auftauchen.',
    unfinishedLink: 'Zu den Lebensbereichen',
    check: 'Wie läuft’s?',
    checkOn: 'Wie läuft’s mit: {text}',
    outcomeDone: 'Das habe ich verinnerlicht',
    outcomeOngoing: 'Bin noch dran',
    outcomeAside: 'Das passt für mich nicht mehr',
    cancel: 'Abbrechen',
    done: 'Notiert.',
    newStepQuestion: 'Was könnte dir helfen, diesem Ziel näherzukommen?',
    newStepPlaceholder: 'Etwas Kleines und Konkretes',
    savedNote: 'Was du mir erzählt hast, liegt aktuell nur auf diesem Gerät.',
    syncedNote: 'Was du mir erzählt hast, liegt auf diesem Gerät und in deinem Konto.',
    memoryNote: 'Es wird nichts gespeichert. Was du mir erzählt hast, bleibt in diesem Tab.',
    ack: 'Danke. Das war alles, was ich fragen wollte.',
    greeting: 'Hallo {name}.',
    youSaid: 'Was du beim Ankommen gesagt hast:',
    rename: 'Nenn mich anders',
  },

  manage: {
    back: 'Zurück zu deinen Lebensbereichen',
    iconChange: 'Symbol für {area} ändern',
    backHome: 'Zurück zur Startseite',
    pickerTitle: 'Deine Lebensbereiche',
    pickerNote: 'Öffne einen, um sein Ziel zu ändern — oder was du ausprobieren willst.',
    goalsNone: 'Keine Ziele vorhanden',
    stepsOne: '(1 nächster Schritt)',
    stepsMany: '({count} nächste Schritte)',
    goalsOne: '1 Ziel angegeben',
    goalsMany: '{count} Ziele angegeben',
    noStepOne: 'Lege nächste Schritte fest, um dein Ziel zu erreichen.',
    noStepMany: 'Lege nächste Schritte fest, um deine Ziele zu erreichen.',
    tryingOne: '1 Aktivität geplant',
    trying: '{count} Aktivitäten geplant',


    goalNumber: 'Ziel #{n}:',
    goalOnly: 'Ziel:',
    // Tiefe und hohe Anführungszeichen, wie im Deutschen üblich — im Englischen beide
    // oben. Deshalb steht die Zeichensetzung im Katalog und nicht im Bauteil.
    goalQuoted: '„{text}“',
    goalHow: 'Wie willst du dieses Ziel erreichen?',
    goalHowDone: 'So willst du dein Ziel erreichen:',
    addEntry: '+ Eintrag hinzufügen',
    editOn: 'Ändern: {text}',
    deleteOn: 'Entfernen: {text}',
    deleteGoalOn: 'Ziel entfernen: {goal}',
    confirmDelete: 'Willst du das Ziel {goal} wirklich entfernen?',
    confirmYes: 'Ja',
    confirmNo: 'Nein',
    pin: 'Anpinnen',
    unpin: 'Loslösen',
    pinOn: 'Anpinnen: {text}',
    unpinOn: 'Loslösen: {text}',
    pinAreaOn: 'Anpinnen: {area}',
    unpinAreaOn: 'Loslösen: {area}',
    addStep: 'Etwas hinzufügen',
    addStepFor: 'Etwas hinzufügen für: {goal}',
    goalAdd: '+ Weiteres Ziel hinzufügen',
    emptyNote: 'Noch gibt es hier nichts zu sehen.',
    goalCreate: 'Ziel erstellen',
    goalChange: 'Ändern',
    goalChangeOn: 'Dieses Ziel ändern: {goal}',
    done: 'Zurück',

    goalNewQuestion: 'Was willst du hier außerdem?',


    goalTop: 'Nach oben setzen',
    goalCloseNote:
      'Was du dafür ausprobieren wolltest, wird mit beiseitegelegt. Gelöscht wird nichts.',
    goalCloseCancel: 'Noch nicht',
    looseLabel: 'Gerade keinem Ziel zugeordnet',

    progressQuestion: 'Wie nah bist du diesem Ziel?',
    /** Antworten auf die Frage darüber, nicht Beschreibungen eines Zustands. */
    progress1: 'Überhaupt nicht',
    progress2: 'Ein wenig',
    progress3: 'Einigermaßen',
    progress4: 'Ziemlich',
    progress5: 'Ziel erreicht',
    progressNone: 'Noch nicht beantwortet',
    progressOn: '{goal}: Wie nah bist du diesem Ziel? {value}',
    /** „Bestätigen“, nicht „Weiter“ — nach diesem Knopf kommt kein weiterer Schritt. */
    progressSave: 'Bestätigen',
    reachedQuestion: 'Dieses Ziel als erreicht markieren?',
    reachedYes: 'Ja, ich habe es erreicht',
    congrats: 'Herzlichen Glückwunsch!',
    congratsAny: 'Du hast eines deiner Ziele erreicht.',
    /** „Weiter“, weil danach die Seite zurückkommt — anders als beim Speichern der Skala. */
    congratsClose: 'Weiter',

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
    introCloud:
      'In deinen eigenen Worten, genau so, wie du sie gesagt hast. Es liegt auf diesem Gerät und in deinem Konto, auf Servern in der EU (Supabase). Niemand sonst, der angemeldet ist, kann es lesen. Wer diese App betreibt, könnte technisch in die Datenbank sehen — das gehört dazu, denn kein Versprechen ändert etwas daran.',
    sessionNote:
      'Solange du angemeldet bist, liegt in diesem Browser außerdem ein Anmeldetoken für dein Konto, unter Einträgen, die mit „sb-“ beginnen. Beim Abmelden verschwindet es.',
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
      areaPinned: 'ganz oben',
      areaIcon: 'eigenes Symbol',
      goalProgress: 'wie nah es sich anfühlte: {value}',
      why: 'warum es zählt: {why}',
      edited: 'umformuliert aus: {text}',
      noGoal: 'Kein Ziel notiert',
    },
  },

  data: {
    title: 'Datenschutz',
    p1: 'Was du hier schreibst, wird aktuell nur in diesem Browser auf diesem Gerät gespeichert.',
    p2: 'Es wird nicht an uns gesendet. Es gibt aktuell kein Konto und keine Cloud, und niemand sonst kann es sehen.',
    p1Cloud: 'Was du hier schreibst, wird in diesem Browser gespeichert — und in deinem Konto.',
    p2Cloud:
      'Dein Konto liegt auf Servern in der EU (Supabase). Niemand sonst, der angemeldet ist, kann es lesen, und es wird kein Profil von dir daraus gebaut.',
    p3: 'Wenn du deine Browserdaten löschst, wird es mit allem anderen zusammen gelöscht.',
    p4: 'Ein anderer Browser oder ein anderes Gerät hat es nicht.',
    show: 'Zeigen, was gespeichert ist',
    deleteEntry: 'Meine Daten löschen',

    storage: {
      on: 'EIN',
      off: 'AUS',
      optionCloud: 'Mit der Cloud synchronisieren',
      cloudNeedsSaving:
        'Dafür muss zuerst auf diesem Gerät gespeichert werden — angemeldet bleiben heißt, ein Token hier zu behalten, und du wolltest, dass nichts geschrieben wird.',
      cloudUnavailable: 'Diese Version der App hat keine Cloud, mit der sie sich synchronisieren könnte.',
      cloudOn: 'Synchronisiert mit {email}. Was du hier schreibst, geht auch in dein Konto.',
      cloudOffDone: 'Die Synchronisierung ist aus und du bist abgemeldet. Alles, was du hattest, liegt weiterhin auf diesem Gerät.',
      cloudPendingOne: 'Ein Eintrag ist noch nicht in deinem Konto angekommen.',
      cloudPending: '{count} Einträge sind noch nicht in deinem Konto angekommen.',
      cloudTrouble: 'Dein Konto war nicht erreichbar. Alles ist weiterhin hier und wird gesendet, sobald es geht.',
      cloudRetry: 'Jetzt noch einmal versuchen',
      cloudLastSynced: 'Zuletzt mit deinem Konto abgeglichen {when}.',

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
      alsoCloud:
        'Damit wird auch die Kopie in deinem Konto gelöscht, und du wirst abgemeldet. Jedes andere Gerät, auf dem du angemeldet bist, zieht beim nächsten Verbinden nach. Dein Konto selbst bleibt.',
      cloudFailed: 'Dein Konto war nicht erreichbar, deshalb wurde nichts gelöscht — weder hier noch dort. Versuch es noch einmal, wenn du Verbindung hast.',
    },

    account: {
      title: 'Dein Konto',
      signedInAs: 'Angemeldet als {email}.',
      delete: 'Konto löschen',
      warnTitle: 'Dein Konto löschen?',
      warnBody:
        'Damit werden dein Konto, alles darin und die Kopie auf diesem Gerät gelöscht. Das lässt sich nicht rückgängig machen.',
      cancel: 'Behalten',
      confirm: 'Ja, mein Konto löschen',
      done: 'Dein Konto ist weg, und alles, was darin war, auch.',
    },
  },

  about: {
    title: 'Über {app}',
    isTitle: 'Was das hier ist',
    isP1: '{app} ist der Prototyp einer App, die einen Menschen dabei unterstützen soll, gut zu leben. Was du gesehen hast, ist ihr Anfang: die Frage nach deinem Einverständnis und einige Lebensbereiche, die man sich nacheinander ansieht.',
    isP2: 'Sie läuft vorerst vollständig in deinem Browser. Derzeit gibt es keinen Server, kein Konto, keine Auswertung und keine KI. Nichts, was du schreibst, wird irgendwohin geschickt, und auf dein Gerät wird nichts geschrieben, solange du nicht ja gesagt hast.',
    isP3: 'Was du erzählst, bleibt in deinen eigenen Worten. Antworten werden ergänzt statt überschrieben, damit eine spätere Antwort eine frühere nie löscht — wie sich etwas verändert hat, ist ja das Interessante.',
    isNotTitle: 'Was sie noch nicht ist',
    isNotP1: 'Es gibt kein Gewohnheits-Tracking, kein Tagebuch, keine Stimmungskurve, keine Erinnerungen und keine Punkte. Sie verlangt nicht, dass du jeden Tag wiederkommst. Das kommt später, falls es sich als sinnvoll erweist.',
    isNotP2: 'Sie ist außerdem kein medizinisches oder therapeutisches Werkzeug und kein Ersatz dafür, mit einem Menschen zu sprechen.',
    whereTitle: 'Wo deine Antworten liegen',
    whereP1: 'Vorerst in diesem Browser, in einem einzigen Eintrag namens {key}, auf diesem Gerät. Wenn du deine Browserdaten löschst, ist er weg — genauso über „alles löschen“ unter Datenschutz.',
    whereP2: 'Wenn du abgelehnt hast, existiert nicht einmal dieser Eintrag: die App läuft dann nur im Arbeitsspeicher und schreibt gar nichts. Das hat eine ehrliche Folge — sie kann sich nicht merken, dass du abgelehnt hast, und fragt dich beim nächsten Mal wieder.',
    whereP3: 'Du bist angemeldet, also gibt es eine zweite Kopie in deinem Konto, auf Servern in der EU (Supabase). Gelesen wird weiterhin die Kopie auf dem Gerät; das Konto ist das, womit ein anderes Gerät nachziehen kann. Die Synchronisierung auszuschalten meldet dich ab und lässt hier alles unangetastet, und „alles löschen“ entfernt beide Kopien.',
  },
}
