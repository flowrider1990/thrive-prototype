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
    you: 'Du',
    about: 'Über',
  },

  lang: {
    label: 'Sprache',
    de: 'Deutsch',
    en: 'English',
  },

  consent: {
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

  home: {
    ack: 'Danke. Das war alles, was ich fragen wollte.',
    greeting: 'Hallo {name}.',
    body: 'Hier gibt es noch nichts weiter zu tun. Was bisher steht, ist das Grundgerüst: eine App, die fragt, bevor sie sich etwas merkt — und die sich nur hier etwas merkt.',
    youSaid: 'Was du beim Ankommen gesagt hast:',
    savedNote: 'Was du mir erzählt hast, liegt nur auf diesem Gerät.',
    memoryNote: 'Es wird nichts gespeichert. Was du mir erzählt hast, bleibt in diesem Tab.',
    toYou: 'Alles ansehen, was ich weiß',
    rename: 'Nenn mich anders',
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
    isP1: '{app} ist der Prototyp einer App, die einen Menschen dabei unterstützen soll, gut zu leben. Was du gesehen hast, ist ihr Grundgerüst: die Frage nach deinem Einverständnis, dein Name und eine offene Frage.',
    isP2: 'Sie läuft vollständig in deinem Browser. Es gibt keinen Server, kein Konto, keine Auswertung und keine KI. Nichts, was du schreibst, wird irgendwohin geschickt, und auf dein Gerät wird nichts geschrieben, solange du nicht ja gesagt hast.',
    isP3: 'Was du erzählst, bleibt in deinen eigenen Worten. Antworten werden ergänzt statt überschrieben, damit eine spätere Antwort eine frühere nie löscht — wie sich etwas verändert hat, ist ja das Interessante.',
    isNotTitle: 'Was sie noch nicht ist',
    isNotP1: 'Es gibt noch keine Funktion für irgendetwas Bestimmtes: keine Gewohnheiten, kein Tagebuch, keine Stimmungskurve, keine Erinnerungen. Das kommt später, wenn das Grundgerüst verlässlich steht.',
    isNotP2: 'Sie ist außerdem kein medizinisches oder therapeutisches Werkzeug und kein Ersatz dafür, mit einem Menschen zu sprechen.',
    whereTitle: 'Wo deine Antworten liegen',
    whereP1: 'In diesem Browser, in einem einzigen Eintrag namens {key}, auf diesem Gerät. Wenn du deine Browserdaten löschst, ist er weg — genauso über „alles vergessen“ auf der Seite Du.',
    whereP2: 'Wenn du abgelehnt hast, existiert nicht einmal dieser Eintrag: die App läuft dann nur im Arbeitsspeicher und schreibt gar nichts. Das hat eine ehrliche Folge — sie kann sich nicht merken, dass du abgelehnt hast, und fragt dich beim nächsten Mal wieder.',
  },
}
