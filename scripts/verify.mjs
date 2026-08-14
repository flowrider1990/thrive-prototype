/**
 * Walks the plan's verification list against the served static export in real
 * Chrome, over CDP. Node 22 has a global WebSocket, so this needs no packages.
 *
 * Usage: node verify.mjs [baseUrl]
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BASE = process.argv[2] ?? 'http://localhost:4321'
const PORT = 9333

// Kept in step with lib/person/store.ts by hand: this script runs outside the
// bundle, so it cannot import it. The key is deliberately independent of the
// product name — see lib/app.ts.
const STORAGE_KEY = 'thrive.person.v1'

const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  join(process.env.LOCALAPPDATA ?? '', 'Google/Chrome/Application/chrome.exe'),
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
]

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browserPath = CHROME_CANDIDATES.find((p) => p && existsSync(p))
if (!browserPath) {
  console.error('No Chrome or Edge found; cannot run browser verification.')
  process.exit(2)
}
console.log(`browser: ${browserPath}\nbase:    ${BASE}\n`)

const profile = mkdtempSync(join(tmpdir(), 'thrive-verify-'))
const chrome = spawn(
  browserPath,
  [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--lang=en-US',
    'about:blank',
  ],
  { stdio: 'ignore' },
)

// --- CDP plumbing -----------------------------------------------------------

async function targetUrl() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`)
      const list = await res.json()
      const page = list.find((t) => t.type === 'page')
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl
    } catch {
      /* not up yet */
    }
    await sleep(250)
  }
  throw new Error('CDP endpoint never appeared')
}

const ws = new WebSocket(await targetUrl())
await new Promise((resolve, reject) => {
  ws.onopen = resolve
  ws.onerror = reject
})

let nextId = 1
const pending = new Map()
const events = []
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data)
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id)
    pending.delete(msg.id)
    if (msg.error) reject(new Error(JSON.stringify(msg.error)))
    else resolve(msg.result)
  } else if (msg.method) {
    events.push(msg)
  }
}

function send(method, params = {}) {
  const id = nextId++
  ws.send(JSON.stringify({ id, method, params }))
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }))
}

async function evaluate(expression) {
  const { result, exceptionDetails } = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  })
  if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? 'eval failed')
  return result.value
}

async function goto(path) {
  const before = events.length
  await send('Page.navigate', { url: `${BASE}${path}` })
  for (let i = 0; i < 80; i++) {
    if (events.slice(before).some((e) => e.method === 'Page.loadEventFired')) break
    await sleep(50)
  }
  await sleep(400) // let the store load and React settle
}

await send('Page.enable')
await send('Runtime.enable')
await send('Network.enable')

// Samples what is actually painted, from before the app's own scripts run, so a
// flash of the wrong state is caught rather than assumed absent.
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `
    window.__frames = [];
    window.__bgFrames = [];
    const tick = () => {
      if (document.body) {
        window.__frames.push(document.body.innerText);
        window.__bgFrames.push(getComputedStyle(document.body).backgroundColor);
      }
      if (window.__frames.length < 150) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  `,
})

// --- page helpers -----------------------------------------------------------

const HELPERS = `
  /**
   * Prefers a match a person could actually reach.
   *
   * The nav is rendered twice — inline above sm, inside the collapsed menu below —
   * so at phone width the *first* DOM match for a nav label is the hidden inline
   * copy. Clicking it still navigates, which meant "the collapsed menu still
   * navigates" passed without the panel being involved at all. Laid-out matches win;
   * the fallback keeps the old behaviour for anything intentionally offscreen.
   */
  window.__click = (text) => {
    const all = [...document.querySelectorAll('button, a')]
      .filter((e) => e.textContent.trim() === text);
    const el = all.find((e) => e.offsetParent !== null) ?? all[0];
    if (!el) throw new Error('no clickable: ' + text + ' | seen: ' +
      [...document.querySelectorAll('button, a')].map(e => e.textContent.trim()).join(' / '));
    el.click();
    return true;
  };
  window.__type = (value) => {
    const el = document.querySelector('input, textarea');
    if (!el) throw new Error('no field on screen');
    const proto = el.tagName === 'INPUT' ? HTMLInputElement : HTMLTextAreaElement;
    Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  };
  window.__text = () => document.body.innerText;
  window.__keys = () => Object.keys(localStorage);
  window.__raw = () => localStorage.getItem(${JSON.stringify(STORAGE_KEY)});
  /** Opens a dropdown by its accessible name — the trigger shows an icon or a code. */
  window.__open = (label) => {
    const el = document.querySelector('button[aria-label="' + label + '"]');
    if (!el) throw new Error('no dropdown trigger: ' + label + ' | seen: ' +
      [...document.querySelectorAll('button[aria-label]')].map(e => e.getAttribute('aria-label')).join(' / '));
    if (el.getAttribute('aria-expanded') !== 'true') el.click();
    return true;
  };
  window.__visible = (text) => [...document.querySelectorAll('button, a')]
    .some((e) => e.textContent.trim() === text && e.offsetParent !== null);
  /*
   * The same question, asked inside one region.
   *
   * __visible searches the whole document, which is right for "can the person act
   * on this anywhere" and wrong for any claim about a *particular* region. Check 12a
   * needs the second kind: it asserts the nav labels are not laid out in the header
   * bar at phone width, and a link elsewhere on the page carrying the same words —
   * the storage note on home links to "Data protection" — would otherwise read as
   * the header having failed to collapse.
   *
   * (No backticks in here: this whole block is a template literal.)
   */
  window.__visibleIn = (selector, text) => [...document.querySelectorAll(selector + ' a, ' + selector + ' button')]
    .some((e) => e.textContent.trim() === text && e.offsetParent !== null);
  /**
   * Header children all on one line: the wrap this change exists to prevent.
   * Only laid-out children count — a display:none child (the inline nav on a
   * phone) reports offsetTop 0 and would look like a second row.
   */
  window.__headerRows = () => {
    const row = document.querySelector('header > div');
    // Vertical centres, not tops: the items have different heights and are
    // centre-aligned, so on one line their tops differ while their centres agree.
    const centres = [...row.children]
      .filter((c) => c.getClientRects().length > 0)
      .map((c) => {
        const box = c.getBoundingClientRect();
        return Math.round(box.top + box.height / 2);
      });
    return new Set(centres).size;
  };
  window.__theme = () => document.documentElement.dataset.theme || null;
  /**
   * Where the centred column starts. A scrollbar appearing on the tall pages and
   * not on the short ones used to move this by ~7.5px between routes, which is
   * the "layout shifts when switching nav items" defect.
   */
  window.__mainX = () => document.querySelector('main').getBoundingClientRect().x;
  /** Everything about a nav link that a paint depends on, to the sub-pixel. */
  window.__navBox = (text) => {
    const el = [...document.querySelectorAll('header a')]
      .find((e) => e.textContent.trim() === text);
    if (!el) throw new Error('no nav link: ' + text);
    const box = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return {
      w: box.width, h: box.height,
      current: el.getAttribute('aria-current'),
      weight: style.fontWeight,
      borderBottom: style.borderBottomWidth,
      pad: style.paddingTop + '/' + style.paddingBottom,
    };
  };
  /**
   * Flips the theme and watches the root element for the suppression attribute,
   * sampling
   * the toggle's transition-duration while it is set. Observed from inside the
   * page because the whole window is a single frame — far too short to poll for
   * over CDP.
   */
  window.__watchThemeSwitch = () => new Promise((resolve) => {
    const root = document.documentElement;
    // Matched on a substring, not a prefix. The German label is "Zu Dunkel
    // wechseln", so the old \`^="Wechsle"\` never matched anything — this only ever
    // ran in English, silently, because section 22 happens to run there.
    const toggle = document.querySelector('button[aria-label^="Switch to"], button[aria-label*="wechseln"]');
    const seen = [];
    const observer = new MutationObserver(() => {
      seen.push({
        switching: root.hasAttribute('data-theme-switching'),
        theme: root.dataset.theme || null,
        duration: getComputedStyle(toggle).transitionDuration,
      });
    });
    observer.observe(root, { attributes: true });
    toggle.click();
    setTimeout(() => {
      observer.disconnect();
      resolve({
        seen,
        stillSwitching: root.hasAttribute('data-theme-switching'),
        theme: root.dataset.theme || null,
      });
    }, 600);
  });
  /** What ring, if any, the browser is painting on whatever currently has focus. */
  window.__activeRing = () => {
    const el = document.activeElement;
    const style = getComputedStyle(el);
    return {
      label: el.getAttribute('aria-label') || el.textContent.trim(),
      focusVisible: el.matches(':focus-visible'),
      width: style.outlineWidth,
      style: style.outlineStyle,
      color: style.outlineColor,
    };
  };
  window.__bg = () => getComputedStyle(document.body).backgroundColor;
  /**
   * Clicks a stacked option. Unlike __click these are matched loosely, because an
   * option can carry an icon and a second line, so its textContent is the label
   * run together with everything around it rather than the label alone.
   */
  window.__clickOption = (text) => {
    const el = [...document.querySelectorAll('.option')]
      .find((e) => e.textContent.includes(text));
    if (!el) throw new Error('no option containing: ' + text + ' | seen: ' +
      [...document.querySelectorAll('.option')].map(e => e.textContent.trim()).join(' / '));
    el.click();
    return true;
  };
  /**
   * The progress marks, including how each one is actually painted — the point
   * being that the area currently being asked about must not look completed.
   */
  window.__progress = () => {
    const el = document.querySelector('[role="progressbar"]');
    if (!el) return null;
    return {
      now: Number(el.getAttribute('aria-valuenow')),
      max: Number(el.getAttribute('aria-valuemax')),
      text: el.getAttribute('aria-valuetext'),
      background: getComputedStyle(document.body).backgroundColor,
      marks: [...el.children].map((mark) => {
        const style = getComputedStyle(mark);
        const box = mark.getBoundingClientRect();
        return {
          // Kept as one string for the descriptor comparisons that predate the
          // rest of this object.
          paint: style.backgroundColor + ' | ' + style.borderColor,
          background: style.backgroundColor,
          borderColor: style.borderColor,
          // Two states differing only in colour is what §17 forbids, and current
          // vs upcoming used to do exactly that. Width is the second cue.
          borderWidth: style.borderTopWidth,
          // Border width varies per state, so this is the assertion that the box
          // does not: border-box makes that free, and someone adding box-content
          // or padding would silently reintroduce reflow-on-advance.
          w: box.width,
          h: box.height,
        };
      }),
    };
  };
  /**
   * WCAG relative-luminance contrast ratio between two computed colours.
   *
   * Here because an inequality check is not a visibility check: the border colour
   * that motivated all of this differed from the page background and still
   * measured 1.22:1. Only a ratio catches that.
   */
  window.__contrast = (a, b) => {
    const channel = (c) => {
      const v = c / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    const luminance = (colour) => {
      const [r, g, b] = colour.match(/[\\d.]+/g).slice(0, 3).map(Number);
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    };
    const one = luminance(a);
    const two = luminance(b);
    const ratio = (Math.max(one, two) + 0.05) / (Math.min(one, two) + 0.05);
    return Math.round(ratio * 100) / 100;
  };
  window.__count = (selector) => document.querySelectorAll(selector).length;
  /**
   * Is the first match actually laid out?
   *
   * __visible matches on an element's *text*, which cannot see an icon-only
   * control: the collapsed-nav trigger is a hamburger whose name lives in
   * aria-label, so __visible('Menu') was always false and every assertion built
   * on it could never fail.
   */
  window.__shown = (selector) => {
    const el = document.querySelector(selector);
    return Boolean(el && el.offsetParent !== null);
  };
  /**
   * Clicks whatever element holds exactly this text, button or not.
   *
   * Every other click helper refuses to click a non-control, which is usually the
   * right instinct and useless here: the assertion is precisely that clicking the
   * words is inert, and that cannot be tested by a helper that will not click them.
   */
  window.__clickText = (text) => {
    const el = [...document.querySelectorAll('*')]
      .filter((e) => e.children.length === 0 && e.textContent.trim() === text)[0];
    if (!el) throw new Error('no element with text: ' + text);
    el.click();
    return true;
  };
  /** Where focus is, and whether it is inside the given selector. */
  window.__focus = (selector) => {
    const el = document.activeElement;
    return {
      label: el?.getAttribute('aria-label') || el?.textContent?.trim()?.slice(0, 60) || null,
      inside: Boolean(selector && el?.closest(selector)),
    };
  };
  /**
   * Every accessible name on the page. innerText cannot see these, and they are
   * where a step's own words now live — so they are also where an id could leak
   * without any visible symptom.
   */
  window.__ariaLabels = () => [...document.querySelectorAll('[aria-label]')]
    .map((e) => e.getAttribute('aria-label'));
  /** Every header nav link, with where it points and whether it is marked current. */
  window.__navLinks = () => [...document.querySelectorAll('header nav a')].map((a) => ({
    text: a.textContent.trim(),
    href: a.getAttribute('href'),
    current: a.getAttribute('aria-current'),
  }));
  /** For icon-only controls, whose accessible name is the only stable handle. */
  window.__clickAria = (label) => {
    const el = document.querySelector('[aria-label="' + label + '"]');
    if (!el) throw new Error('no [aria-label="' + label + '"] | seen: ' +
      [...document.querySelectorAll('[aria-label]')].map(e => e.getAttribute('aria-label')).join(' / '));
    el.click();
    return true;
  };
  true;
`

async function click(text) {
  await evaluate(HELPERS)
  await evaluate(`__click(${JSON.stringify(text)})`)
  await sleep(220)
}
async function type(value) {
  await evaluate(HELPERS)
  await evaluate(`__type(${JSON.stringify(value)})`)
  await sleep(120)
}
/** Opens a dropdown, then clicks something inside it. */
async function chooseIn(triggerLabel, itemText) {
  await evaluate(HELPERS)
  await evaluate(`__open(${JSON.stringify(triggerLabel)})`)
  await sleep(150)
  await click(itemText)
}
/**
 * Clicks a nav link whether it is inline or collapsed behind the menu, so the
 * checks do not have to care about the viewport they happen to run at.
 */
async function clickNav(label, menuLabel = 'Menu') {
  await evaluate(HELPERS)
  const inline = await evaluate(`__visible(${JSON.stringify(label)})`)
  if (inline) await click(label)
  else await chooseIn(menuLabel, label)
}
async function clickAria(label) {
  await evaluate(HELPERS)
  await evaluate(`__clickAria(${JSON.stringify(label)})`)
  await sleep(220)
}
/**
 * Waits until the page contains some text, instead of sleeping a guessed number of ms.
 *
 * Navigating into `/areas/<id>/` is measurably slower than it was: that route now has a
 * `Suspense` boundary, so its content is client-rendered after the navigation commits —
 * ~340ms in headless Chrome, against the 220ms a click helper waits. That difference
 * turned a correct app into two failing checks, and a bigger fixed sleep would only move
 * the guess. Waiting for the thing being asserted removes the guess.
 */
async function waitForText(needle, timeout = 5000) {
  const started = Date.now()
  while (Date.now() - started < timeout) {
    if (String(await evaluate('document.body.innerText')).includes(needle)) return true
    await sleep(60)
  }
  return false
}
async function clickOption(text) {
  await evaluate(HELPERS)
  await evaluate(`__clickOption(${JSON.stringify(text)})`)
  await sleep(220)
}
const progress = async () => {
  await evaluate(HELPERS)
  return evaluate('__progress()')
}
const headerRows = async () => {
  await evaluate(HELPERS)
  return evaluate('__headerRows()')
}
const mainX = async () => {
  await evaluate(HELPERS)
  return evaluate('__mainX()')
}
const navBox = async (label) => {
  await evaluate(HELPERS)
  return evaluate(`__navBox(${JSON.stringify(label)})`)
}
const watchThemeSwitch = async () => {
  await evaluate(HELPERS)
  return evaluate('__watchThemeSwitch()')
}
const activeRing = async () => {
  await evaluate(HELPERS)
  return evaluate('__activeRing()')
}
const count = async (selector) => {
  await evaluate(HELPERS)
  return evaluate(`__count(${JSON.stringify(selector)})`)
}
const ariaLabels = async () => {
  await evaluate(HELPERS)
  return evaluate('__ariaLabels()')
}
const contrast = async (a, b) => {
  await evaluate(HELPERS)
  return evaluate(`__contrast(${JSON.stringify(a)}, ${JSON.stringify(b)})`)
}
async function clickText(text) {
  await evaluate(HELPERS)
  await evaluate(`__clickText(${JSON.stringify(text)})`)
  await sleep(220)
}
/**
 * Opens every folded section on the page.
 *
 * `innerText` cannot see inside a closed `<details>`, so any check that asserts
 * content is present has to unfold first or it is answered by the fold rather than
 * by the content — "the words are not there" and "the words are hidden" look
 * identical from the outside. Returns how many it opened, so a caller can tell the
 * difference between "nothing folded" and "nothing on the page".
 */
async function expandAll() {
  const opened = await evaluate(
    `(() => {
       const all = [...document.querySelectorAll('details:not([open])')];
       all.forEach((d) => { d.open = true; });
       return all.length;
     })()`,
  )
  await sleep(200)
  return opened
}
/**
 * Clicks the first element matching a selector.
 *
 * For controls whose text is not their only content: `__clickText` insists on a leaf
 * element, and a back link holds an arrow as well as its label.
 */
async function clickSelector(selector) {
  await evaluate(
    `(() => {
       const el = document.querySelector(${JSON.stringify(selector)});
       if (!el) throw new Error('nothing matching: ' + ${JSON.stringify(selector)});
       el.click();
       return true;
     })()`,
  )
  await sleep(250)
}
/**
 * Opens one folded section the way a person would: by clicking its summary.
 *
 * `__clickText` cannot do it — it only clicks leaf elements, and these summaries
 * hold a heading with an icon inside it.
 */
async function clickSummary(text) {
  await evaluate(HELPERS)
  await evaluate(
    `(() => {
       const summary = [...document.querySelectorAll('details > summary')]
         .find((s) => s.innerText.includes(${JSON.stringify(text)}));
       if (!summary) throw new Error('no summary containing: ' + ${JSON.stringify(text)});
       summary.click();
       return true;
     })()`,
  )
  await sleep(250)
}
const focused = async (selector) => {
  await evaluate(HELPERS)
  return evaluate(`__focus(${JSON.stringify(selector)})`)
}
const navLinks = async () => {
  await evaluate(HELPERS)
  return evaluate('__navLinks()')
}
const shown = async (selector) => {
  await evaluate(HELPERS)
  return evaluate(`__shown(${JSON.stringify(selector)})`)
}
/** The back link on whatever page is loaded: where it goes, and how it is drawn. */
const backLinkOn = async () =>
  evaluate(
    `(() => {
       const first = document.querySelector('main a[href]');
       if (!first) return null;
       const heading = document.querySelector('main h1, main h2, main p');
       const style = getComputedStyle(first);
       return {
         tag: first.tagName,
         href: new URL(first.href).pathname,
         text: first.textContent.trim(),
         hasArrow: Boolean(first.querySelector('svg')),
         fontSize: style.fontSize,
         colour: style.color,
         // The back link must come first in the page, above whatever titles it.
         beforeHeading: heading ? Boolean(first.compareDocumentPosition(heading) & 4) : false,
       };
     })()`,
  )
const visibleIn = async (selector, text) => {
  await evaluate(HELPERS)
  return evaluate(`__visibleIn(${JSON.stringify(selector)}, ${JSON.stringify(text)})`)
}
/**
 * Presses Tab for real, until the wanted element has focus. Real key events
 * rather than `.focus()`, because `:focus-visible` is precisely a judgement about
 * *how* focus arrived — a scripted focus after a scripted click does not qualify,
 * and asserting on it would prove nothing about a keyboard user.
 */
async function tabTo(selector, max = 25) {
  for (let pressed = 1; pressed <= max; pressed++) {
    for (const type of ['rawKeyDown', 'keyUp']) {
      await send('Input.dispatchKeyEvent', {
        type,
        key: 'Tab',
        code: 'Tab',
        windowsVirtualKeyCode: 9,
        nativeVirtualKeyCode: 9,
      })
    }
    await sleep(40)
    const arrived = await evaluate(
      `!!document.activeElement && document.activeElement.matches(${JSON.stringify(selector)})`,
    )
    if (arrived) return pressed
  }
  return 0
}
const visible = async (label) => {
  await evaluate(HELPERS)
  return evaluate(`__visible(${JSON.stringify(label)})`)
}
const dataTheme = () => evaluate('document.documentElement.dataset.theme || null')
const background = () => evaluate('getComputedStyle(document.body).backgroundColor')
async function setViewport(width, height = 844) {
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width < 640,
  })
}
async function setScheme(scheme) {
  await send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-color-scheme', value: scheme }],
  })
}
/**
 * Chrome is launched with `--lang=en-US`, so without this every check in the file
 * runs as an English browser and nothing exercises detection at all. `null` puts the
 * launch language back, which matters because these checks are not the last thing to
 * run — leaving a German override in place would quietly re-answer later ones.
 */
async function setBrowserLanguage(locale) {
  const userAgent = await evaluate('navigator.userAgent')
  if (locale === null) {
    await send('Emulation.setLocaleOverride', {})
    await send('Network.setUserAgentOverride', { userAgent, acceptLanguage: 'en-US' })
    return
  }
  await send('Emulation.setLocaleOverride', { locale })
  await send('Network.setUserAgentOverride', { userAgent, acceptLanguage: locale })
}
const text = () => evaluate('document.body.innerText')
const keys = () => evaluate('Object.keys(localStorage)')
const raw = () => evaluate(`localStorage.getItem(${JSON.stringify(STORAGE_KEY)})`)
const frames = () => evaluate('window.__frames || []')

const EN = {
  welcome: 'Welcome, and thank you for trying this out.',
  consent: 'Is this okay for you?',
  yes: 'Yes, that is okay',
  no: 'No',
  /**
   * Deliberately the half of the sentence that does not name a number.
   *
   * This needle is used in both directions — 4b asserts the introduction *is* on
   * screen, 25f asserts it is *not* — and the negative is the dangerous one: a
   * stale needle makes 25f pass while guarding nothing. Matching on
   * "areas of your life" rather than "five areas of your life" means changing how
   * many areas there are cannot quietly retire that guard.
   */
  intro: 'areas of your life, one at a time',
  introOk: 'Okay',
  review: 'Would you like to change or explore something here?',
  reviewYes: 'Yes',
  reviewNo: 'Not right now',
  goal: 'What is your goal?',
  cont: 'Continue',
  confirm: 'Confirm',
  steps: 'What could help you move toward this goal?',
  entries: 'What you want to try',
  entriesNote: 'One is enough. You can add up to three.',
  unfinished: 'there are goals with no concrete steps yet',
  unfinishedLink: 'Go to your life areas',
  forGoal: 'Goal: “Sleep better”',
  ack: 'Very good, thank you!',
  full: 'Three is plenty to start with.',
  edit: 'Edit',
  editSubmit: 'Save',
  enough: 'That is enough',
  stepsUnknown: 'I do not know yet',
  focus: 'Which one would you like to focus on first?',
  complete: 'That is it for now.',
  toHome: 'Go to the start page',
  home: 'Your next steps',
  check: 'How is it going?',
  outcomeDone: 'I have done this',
  outcomeOngoing: 'Still on it',
  outcomeAside: 'This does not fit me anymore',
  cancel: 'Cancel',
  noted: 'Noted.',
  save: 'Save',
  navHome: 'Start',
  navAreas: 'Life areas',
  picker: 'Your life areas',
  addStep: 'Add something',
  addEntry: '+ Add an entry',
  manageDone: 'Back',
  goalAdd: '+ Add another goal',
  goalNewQuestion: 'What else do you want here?',
  goalChange: 'Edit',
  goalReword: 'Change the wording',
  goalTop: 'Move this to the top',
  confirmDelete: 'really want to remove the goal',
  confirmYes: 'Yes',
  confirmNo: 'No',
  goalCloseNote: 'What you were trying for it is set aside with it. Nothing is deleted.',
  goalNumber: 'Goal #1:',
  goalOnly: 'Goal:',
  goalsOne: '1 goal set',
  editSubmit: 'Save',
  contYes: 'Yes, let us go on',
  navData: 'Data protection',
  dataShow: 'Show what is stored',
  storedTitle: 'What is stored',
  del: 'Delete everything',
  delWarn: 'Delete all data?',
  delKeep: 'Keep it',
  delConfirm: 'Yes, delete everything',
  delDone: 'Deleted. Nothing is left.',
  pinnedLabel: 'Pinned',
  tryingOne: '1 activity planned',
  restLabel: 'Everything else',
  goalSkip: 'Not sure yet',
  goalBack: 'Back',
  goalAnother: 'Add another goal',
  storedBack: 'Back to data protection',
  delRestart: 'Start again',
  emptyNote: 'There is nothing to see here yet.',
  viewSteps: 'My next steps',
  viewGoals: 'My goals',
  goalsTitle: 'Your goals',
  goalCreate: 'Create a goal',
  pin: 'Pin',
  unpin: 'Unpin',
  storageOptionLocal: 'Save on this device',
  storageOptionCloud: 'Sync with Cloud',
  cloudDevOnly: 'Cloud sync is currently available to developers only.',
  storageOnDone: 'Saving is on now.',
  dataDelete: 'Delete my data',
  progressQuestion: 'How close are you to reaching this goal?',
  progressNone: 'Not answered yet',
  progress2: 'A little bit',
  progress3: 'Kind of',
  progress4: 'Very close',
  progressSave: 'Confirm',
  reachedQuestion: 'Mark this goal as reached?',
  reachedYes: 'Yes, I reached it',
  reachedNo: 'Not yet',
  congrats: 'Congratulations!',
  congratsAny: 'You have reached one of your goals.',
  congratsClose: 'Continue',
}

/**
 * The life areas: ids as they are persisted, and their English labels.
 *
 * Mirrored by hand from `lib/areas.ts` and the catalogs, for the same reason
 * `STORAGE_KEY` is: this script runs outside the bundle, and owing nothing to the
 * app's own modules is what makes a passing run mean something.
 *
 * **Everything downstream derives from this list** — the progress totals, the
 * label and link lists, `seedOnboarded()`'s review facts, and how many times a
 * walk has to answer "Not right now". Adding an area should be a change here and
 * almost nowhere else. It used to be a change in roughly thirty places, most of
 * which aborted the run rather than failing a check.
 */
const AREAS = [
  { id: 'body', label: 'Physical Health', de: 'Körperliche Gesundheit' },
  { id: 'mind', label: 'Mental Wellbeing', de: 'Mentales Wohlbefinden' },
  { id: 'relationships', label: 'Relationships & Social Life', de: 'Beziehungen & Soziales' },
  { id: 'work', label: 'Work & Career', de: 'Beruf & Karriere' },
  { id: 'creativity', label: 'Hobbies & Creativity', de: 'Hobbys & Kreativität' },
  { id: 'finances', label: 'Security & Freedom', de: 'Absicherung & Freiheit' },
]

/** The one the introduction ends on, which is the area §25 interrupts. */
const LAST_AREA = AREAS[AREAS.length - 1]

/** The collapsed-nav trigger, which is icon-only and so has to be found by name. */
const MENU = 'button[aria-label="Menu"], button[aria-label="Menü"]'

/** Newlines, for the one-line detail strings the checks print. */
const NL = new RegExp(String.fromCharCode(10), 'g')

/** Any internal id leaking into rendered copy would look like this. */
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

async function clearStorage() {
  await goto('/')
  await evaluate('localStorage.clear()')
}

/**
 * Writes a store that has finished the introduction, then loads `/`.
 *
 * Several checks need the app *past* onboarding — the navigation only exists then —
 * and replaying twelve clicks for each of them is slow and, worse, couples them to
 * onboarding copy they are not about. The shape is kept in step with
 * `lib/person/schema.ts` by hand, exactly as `STORAGE_KEY` is.
 *
 * One area is given a goal and something active so the home screen has a row.
 */
async function seedOnboarded() {
  const at = '2026-01-01T00:00:00.000Z'
  const step = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa'
  const facts = [
    ...AREAS.map(({ id }, i) => ({
      id: `seed-review-${i}`,
      key: `area.${id}.review`,
      value: id === AREAS[0].id ? 'yes' : 'not_now',
      source: 'goals',
      learnedAt: at,
    })),
    {
      id: 'seed-goal',
      key: `area.${AREAS[0].id}.goal`,
      value: 'Sleep better',
      source: 'goals',
      learnedAt: at,
    },
    {
      id: 'seed-text',
      key: `area.${AREAS[0].id}.step.${step}.text`,
      value: 'Walk after dinner',
      source: 'goals',
      learnedAt: at,
    },
    {
      id: 'seed-active',
      key: `area.${AREAS[0].id}.step_active`,
      value: step,
      source: 'goals',
      learnedAt: at,
    },
    // Both this and the review facts above, deliberately: this fixture stands for
    // someone who really finished, not for someone who merely satisfies the gate.
    // `seedLegacyOnboarded()` is the one that tests the fallback.
    {
      id: 'seed-intro',
      key: 'introduction_done',
      value: 'yes',
      source: 'goals',
      learnedAt: at,
    },
  ]
  const store = { version: 1, consentAt: at, locale: 'en', facts }
  await goto('/')
  await evaluate(
    `localStorage.setItem(${JSON.stringify(STORAGE_KEY)}, ${JSON.stringify(JSON.stringify(store))})`,
  )
  await goto('/')
}

/**
 * A store written **before** the introduction recorded its own completion.
 *
 * The area ids here are deliberately written out rather than taken from `AREAS`,
 * and that is the entire point of the fixture: it has to keep representing the five
 * areas that existed when it was written, however many there are now. Deriving them
 * would make it agree with the app by construction and assert nothing.
 *
 * It carries no `introduction_done` fact, so the only thing that can carry it past
 * the introduction is the `LEGACY_AREAS` fallback. §40 is what stands between an
 * added life area and every existing store losing its home screen and its
 * navigation — including the route to the page that offers to delete the data.
 */
async function seedLegacyOnboarded() {
  const at = '2026-01-01T00:00:00.000Z'
  const step = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb'
  const facts = [
    ...['body', 'relationships', 'work', 'finances', 'creativity'].map((area, i) => ({
      id: `legacy-review-${i}`,
      key: `area.${area}.review`,
      value: area === 'body' ? 'yes' : 'not_now',
      source: 'goals',
      learnedAt: at,
    })),
    { id: 'legacy-goal', key: 'area.body.goal', value: 'Sleep better', source: 'goals', learnedAt: at },
    {
      id: 'legacy-text',
      key: `area.body.step.${step}.text`,
      value: 'Walk after dinner',
      source: 'goals',
      learnedAt: at,
    },
    { id: 'legacy-active', key: 'area.body.step_active', value: step, source: 'goals', learnedAt: at },
  ]
  const store = { version: 1, consentAt: at, locale: 'en', facts }
  await goto('/')
  await evaluate(
    `localStorage.setItem(${JSON.stringify(STORAGE_KEY)}, ${JSON.stringify(JSON.stringify(store))})`,
  )
  await goto('/')
}

/**
 * Walks one life area in the introduction: yes, a goal, and **one** thing to try.
 *
 * One, not a list, and the signature says so — it used to take an array. Saving an action
 * during the introduction now carries straight on to the next area, so there is no second
 * field to type into and no Continue to press afterwards. Passing `null` means answering
 * "I do not know yet", which writes nothing and is the only honest way past an empty field.
 *
 * Everything the list shape used to exercise — the numbered entries, the cap notice, the
 * per-entry Edit, the offer of another — still exists on the **area page's** flow, and §29
 * exercises it there. This helper is not the place it disappeared from; it is the place it
 * never belonged.
 */
async function runArea(goal, step) {
  await click(EN.reviewYes)
  await type(goal)
  await click(EN.confirm)
  if (step === null) {
    await click(EN.stepsUnknown)
    return
  }
  await type(step)
  await click(EN.save)
}

/**
 * Answers "Not right now" for exactly `count` areas.
 *
 * For the walks that have to stop on a *particular* area — §25 interrupts the last
 * one — so the count is derived from `AREAS.length` rather than written out.
 */
async function declineAreas(count, label = EN.reviewNo) {
  for (let area = 0; area < count; area++) await click(label)
}

/**
 * Answers "Not right now" until the introduction closes.
 *
 * Bounded by `AREAS.length` rather than trusting a literal count, because a wrong
 * count here does not fail a check — `__click` throws, `evaluate()` rethrows, and
 * the run dies mid-section without printing a summary or killing Chrome. Nine
 * walks each carried their own number; now none of them does.
 *
 * Localised through its arguments so the German walk uses the same helper.
 */
async function declineRest({ no = EN.reviewNo, done = EN.complete } = {}) {
  for (let declined = 0; declined <= AREAS.length; declined++) {
    if ((await text()).includes(done)) return declined
    if (declined === AREAS.length) break
    await click(no)
  }
  throw new Error(`the introduction did not close after ${AREAS.length} declines`)
}

// --- 4. consent yes: the whole introduction, then reload with no flash ------

await clearStorage()
await goto('/')
let screen = await text()
check(
  '4a. a fresh visit welcomes, then asks about saving',
  screen.includes(EN.welcome) && screen.includes(EN.consent),
)

// The positive control for 4l, and the reason 4l can be believed.
//
// 4l proves a *negative* — no sampled frame contained the consent question — using
// a needle string and an injected rAF sampler, either of which can quietly stop
// working. A stale needle after a copy change, or a sampler that never ran, both
// make 4l pass while testing nothing. So first prove that this exact needle and
// this exact sampler *can* see the consent screen, on the one page where it is
// definitely painted.
const consentFrames = await frames()
check(
  '4a2. the frame sampler and the consent needle both actually work',
  consentFrames.length >= 10 && consentFrames.some((f) => f.includes(EN.consent)),
  `${consentFrames.length} frames, ${consentFrames.filter((f) => f.includes(EN.consent)).length} with the question`,
)

await click(EN.yes)
screen = await text()
check(
  '4b. saying yes is acknowledged and explains what comes next',
  screen.includes('Thank you for your trust') && screen.includes(EN.intro),
)

await click(EN.introOk)
screen = await text()
check(
  '4c. the first life area is asked about',
  screen.includes(AREAS[0].label) && screen.includes(EN.review),
)

let marks = await progress()
check(
  '4d. progress starts at none reviewed, and says which area this is',
  marks.now === 0 && marks.max === AREAS.length && marks.text === `Area 1 of ${AREAS.length}`,
  JSON.stringify(marks && { now: marks.now, max: marks.max, text: marks.text }),
)
check(
  '4e. the area being asked about is distinguished but NOT painted as completed',
  // `at(-1)` rather than a literal index: with a fixed one this keeps passing
  // while comparing against a mark that is no longer the last.
  marks.marks[0].paint !== marks.marks[1].paint &&
    marks.marks[1].paint === marks.marks.at(-1).paint,
  `current=${marks.marks[0].paint} upcoming=${marks.marks[1].paint}`,
)

await runArea('Sleep better', 'Walk for 20 minutes')
marks = await progress()
check(
  '4f. answering an area fills its mark and moves to the next',
  marks.now === 1 &&
    marks.text === `Area 2 of ${AREAS.length}` &&
    marks.marks[0].paint !== marks.marks[1].paint,
  JSON.stringify({ now: marks.now, text: marks.text }),
)

// "Not right now" advances exactly as much as a goal does — reviewing is the
// progress, and nothing about declining an area is a skipped state.
await click(EN.reviewNo)
screen = await text()
marks = await progress()
check(
  '4g. "Not right now" moves straight on without asking for a goal',
  !screen.includes(EN.goal) && screen.includes(AREAS[2].label) && marks.now === 2,
  `${marks.now} reviewed`,
)

// Sampled while the introduction is still running, so 4j2's "not before" half is
// a real observation rather than an assumption about when the write happens.
const doneMidway = JSON.parse(await raw()).facts.filter((f) => f.key === 'introduction_done')

await runArea('Get the portfolio finished', 'Finish the case study')
// Three areas are answered by now — two walked, one declined — so the rest is the
// remainder. Asserting the count keeps this check falsifiable: without it, the
// helper's own success would be the only thing 4h could fail on.
const declined = await declineRest()
screen = await text()
check(
  '4h. after the last area the introduction closes, and not before',
  screen.includes(EN.complete) && declined === AREAS.length - 3,
  `${declined} declined, expected ${AREAS.length - 3}`,
)
check(
  // Order matters, which is why this is an index comparison and not two `includes`.
  // Opening with "That is it for now." lands as a dismissal right after someone has
  // answered questions about six areas of their life; the thanks has to come first.
  '4h2. and it thanks you before it says that is it, not instead of it',
  screen.includes(EN.ack) && screen.indexOf(EN.ack) < screen.indexOf(EN.complete),
  screen.replace(NL, ' / ').slice(0, 110),
)

/**
 * The closing screen says where the rest of it is done, and links there.
 *
 * It has to, now that the introduction stops at one goal and one action per area:
 * without this the ceiling reads as the product, and the page that lifts it is never
 * mentioned. The link names its destination rather than saying "here" — out of context,
 * "here" says nothing at all.
 */
const closingLink = await evaluate(`(() => {
  const link = [...document.querySelectorAll('main a[href]')]
    .find((a) => a.textContent.trim() === ${JSON.stringify('your life areas')});
  return link ? new URL(link.href).pathname : null;
})()`)
check(
  '4h3. and it says where goals and next steps are changed, with a way there',
  screen.includes('To change goals and next steps') && closingLink === '/areas/',
  `link → ${closingLink}`,
)

await click(EN.toHome)

/**
 * The second entry for this area is added **where the app now puts that ability**.
 *
 * The introduction writes one action per area, so two open in one area can no longer come
 * out of the walk. §24 needs exactly that — "finishing one with others still open asks
 * nothing" is a claim about an *area*, not about a list — so it is set up through the area
 * page's own inline field, which is a real path a person takes rather than a seeded store.
 */
await goto(`/areas/${AREAS[0].id}/`)
await waitForText('Sleep better')
await click(EN.addEntry)
await type('Read before bed')
await click(EN.save)
await goto('/')
screen = await text()
check(
  '4i. home lists everything open across areas, each with the goal it serves',
  screen.includes(EN.home) &&
    screen.includes('Walk for 20 minutes') &&
    screen.includes('Finish the case study') &&
    // Prepared but not first — it used to be absent, because home showed only the
    // one being worked on. Listing it is the point of the rewrite.
    screen.includes('Read before bed') &&
    // Its goal, beside it, which is only knowable because entries belong to one.
    screen.includes('Sleep better') &&
    // Nothing is pinned, so there is no distinction to label.
    !screen.includes(EN.pinnedLabel) &&
    // Reviewed with "not right now" — present in the store, and still not shown as
    // a gap to fill. An area nobody is working on is not a failure to display.
    !screen.includes(AREAS[3].label),
  screen.replace(/\n/g, ' / ').slice(0, 120),
)

const stored = JSON.parse(await raw())
const factsFor = (store, suffix) => store.facts.filter((f) => f.key.endsWith(suffix))
check(
  '4j. the store holds the answers verbatim, and nothing was prioritised',
  stored.version === 1 &&
    typeof stored.consentAt === 'string' &&
    factsFor(stored, '.review').length === AREAS.length &&
    // Under a goal id now. `.text` alone stopped meaning "an entry" the moment goals
    // grew their own text key, which is why these two are matched by shape.
    stored.facts.some(
      (f) =>
        new RegExp(`^area\.${AREAS[0].id}\.goal\.[^.]+\.text$`).test(f.key) &&
        f.value === 'Sleep better',
    ) &&
    stored.facts.some(
      (f) => f.key === `area.${AREAS[3].id}.review` && f.value === 'not_now',
    ) &&
    stored.facts.filter((f) => /\.step\.[^.]+\.text$/.test(f.key)).length === 3 &&
    stored.facts.filter((f) => /\.goal\.[^.]+\.text$/.test(f.key)).length === 2 &&
    // Nothing prioritised, nothing pinned. The introduction stopped asking which
    // entry to start with, and pinning is never one of its questions.
    factsFor(stored, '.step_active').length === 0 &&
    stored.facts.every((f) => !f.key.endsWith('.pinned')),
  `${stored.facts.length} facts`,
)
// Recorded rather than re-derived. The count of answered areas used to be the whole
// answer, which made "the introduction is over" depend on how many areas there are —
// so adding one took the home screen and the navigation away from every store that
// already existed. See `introductionFinished()`.
const introDone = stored.facts.filter((f) => f.key === 'introduction_done')
check(
  '4j2. finishing the introduction is recorded once, and not before it finished',
  doneMidway.length === 0 && introDone.length === 1 && introDone[0].value === 'yes',
  `${doneMidway.length} midway, ${introDone.length} after`,
)

// A step's id is in its key, which is what leaves the value free to be the
// person's own words — and what makes rewording a step expressible at all. The
// one place an id is a *value* is the pointer at the active step; check 7f is
// what guarantees no id ever reaches the screen.
check(
  '4k. ids live in keys; every fact whose value is an id is a named reference',
  stored.facts.some((f) => new RegExp(`^area\.${AREAS[0].id}\.step\.[^.]+\.text$`).test(f.key)) &&
    stored.facts
      .filter((f) => UUID.test(f.value))
      // Exactly three keys may hold one: what is being worked on, which goal comes
      // first, and which goal an entry serves. Anything else with a UUID in its
      // value is an id that escaped into a place meant for someone's own words.
      .every(
        (f) =>
          f.key.endsWith('.step_active') ||
          f.key.endsWith('.goal_priority') ||
          /\.step\.[^.]+\.goal$/.test(f.key),
      ),
  stored.facts
    .filter((f) => UUID.test(f.value))
    .map((f) => f.key)
    .join(', '),
)

await goto('/')
const painted = await frames()
const flashed = painted.filter((f) => f.includes(EN.consent) || f.includes(EN.review))
check(
  '4l. reload shows the next steps with NO flash of consent or the area question',
  // The frame floor is not decoration. Without it this check passes whenever the
  // sampler failed to run at all, because an empty array filters to an empty
  // array — and it is a §16 guarantee, so it must not be able to pass vacuously.
  // Around 35 frames is typical.
  flashed.length === 0 && painted.length >= 10 && (await text()).includes('Walk for 20 minutes'),
  flashed.length ? `flashed ${flashed.length} frame(s)` : `${painted.length} frames sampled`,
)

// --- 24. what you are working on: outcomes, identity, and the caps ---------

// The guarantee this whole rework exists to establish, and the reason it is first:
// the words on the home screen are *text*. Previously they were a full-width button
// whose only content was those words, and any tap on it completed the thing — no
// confirmation, no undo, and looking exactly like the rows elsewhere that merely
// select. Two assertions, because the markup and the behaviour are separate claims.
const actionText = await evaluate(`(() => {
  const walk = [...document.querySelectorAll('*')]
    .filter((e) => e.children.length === 0 && e.textContent.trim() === 'Walk for 20 minutes')[0];
  if (!walk) return { found: false };
  return { found: true, tag: walk.tagName, inClickable: Boolean(walk.closest('button, a')) };
})()`)
check(
  '24a. what you are working on is text, not a control that acts when touched',
  actionText.found && !actionText.inClickable,
  JSON.stringify(actionText),
)

// The behavioural half. The markup check above says it is not inside a control;
// this says that clicking it changes nothing — which is the defect as a person
// experienced it, and the one assertion that would have failed before this rework.
const beforeIdle = JSON.parse(await raw()).facts.length
await clickText('Walk for 20 minutes')
check(
  '24a2. and clicking those words does nothing at all',
  JSON.parse(await raw()).facts.length === beforeIdle && (await text()).includes(EN.check),
  `${JSON.parse(await raw()).facts.length} facts vs ${beforeIdle}`,
)

await clickAria(`How is it going with: Walk for 20 minutes`)
// Focus location after a scripted click is a fair test — where focus *lands* is not
// a judgement about how it arrived, unlike `:focus-visible`, which 23b covers with
// real key events.
let where = await focused('ul')
screen = await text()
check(
  '24b. an explicit control asks how it is going, and offers answers for both kinds',
  screen.includes(EN.outcomeDone) &&
    screen.includes(EN.outcomeOngoing) &&
    screen.includes(EN.outcomeAside) &&
    JSON.parse(await raw()).facts.length === beforeIdle,
  `${JSON.parse(await raw()).facts.length} facts vs ${beforeIdle} before opening`,
)

// Three answers, not four. "I would rather do something else" and "this does not fit
// anymore" were two labels for one state, and offering both asked the person to
// classify their own dissatisfaction before the app would act on it. A fourth option
// reappearing here means that distinction crept back.
check(
  '24b1. and there are exactly three of them, with no second way to say the same thing',
  (await count('main li button.option')) === 3 &&
    !screen.includes('rather do something else'),
  `${await count('main li button.option')} answer(s)`,
)

check(
  '24b2. opening the answers moves focus into them',
  where.inside && where.label === EN.outcomeDone,
  JSON.stringify(where),
)

// Cancelling returns focus to the control that opened them, rather than dropping a
// keyboard user back at the top of the page. Both halves have to happen after the
// render that changes the DOM, because the answers *replace* the trigger.
await click(EN.cancel)
where = await focused('button')
check(
  '24b3. and cancelling gives it back to the control that opened them',
  where.label === `How is it going with: Walk for 20 minutes`,
  JSON.stringify(where),
)

// "Still on it" is the one outcome whose entire contract is that nothing is
// written: the person confirmed nothing changed, and the active pointer already
// says so. Easiest of the four to implement as a stray `chooseStep`.
await clickAria(`How is it going with: Walk for 20 minutes`)
await clickOption(EN.outcomeOngoing)
screen = await text()
check(
  '24c. "Still on it" writes nothing at all, and closes the answers',
  JSON.parse(await raw()).facts.length === beforeIdle &&
    !screen.includes(EN.outcomeDone) &&
    screen.includes('Walk for 20 minutes'),
  `${JSON.parse(await raw()).facts.length} facts vs ${beforeIdle}`,
)

// With something else still open in that area, finishing one asks nothing: whatever
// is left is already on this page, so there is nothing to choose between. The offer
// only appears when the area runs out, which 24g reaches.
await clickAria(`How is it going with: Walk for 20 minutes`)
await clickOption(EN.outcomeDone)
screen = await text()
check(
  '24d. finishing one with others still open asks nothing further',
  !screen.includes(EN.steps) &&
    !screen.includes('Walk for 20 minutes') &&
    // The rest of the area is untouched and still listed.
    screen.includes('Read before bed'),
  screen.replace(NL, ' / ').slice(0, 200),
)

let store = JSON.parse(await raw())
const doneFacts = store.facts.filter((f) => f.key.endsWith('.state') && f.value === 'done')
check(
  '24e. what was done is kept, not removed: its words are still there',
  doneFacts.length === 1 &&
    store.facts.some((f) => f.value === 'Walk for 20 minutes') &&
    // the state key names the same step the pointer named
    doneFacts[0].key.startsWith(`area.${AREAS[0].id}.step.`),
  `${doneFacts.length} done`,
)

// Closing one entry costs exactly one fact. Nothing is written on behalf of the
// others, and nothing is written to record that the area moved on — there is no
// "choose what is next" step left to answer.
store = JSON.parse(await raw())
check(
  '24f. and nothing was written for the entries left alone',
  store.facts.filter((f) => f.key.endsWith('.state')).length === 1 &&
    store.facts.every((f) => !f.key.endsWith('.pinned')),
  store.facts.filter((f) => f.key.endsWith('.state')).map((f) => f.value).join(', '),
)

// The fourth outcome. It is the second path from this screen that writes to the
// store, which is why §5 has to exercise it in memory mode too.
const beforeAside = JSON.parse(await raw()).facts.length
await clickAria(`How is it going with: Finish the case study`)
await clickOption(EN.outcomeAside)
store = JSON.parse(await raw())
const retired = store.facts.filter((f) => f.key.endsWith('.state') && f.value === 'retired')
check(
  '24g. "This does not fit anymore" retires it — one fact appended, nothing deleted',
  retired.length === 1 &&
    store.facts.length === beforeAside + 1 &&
    store.facts.some((f) => f.value === 'Finish the case study'),
  `${store.facts.length} facts vs ${beforeAside}, ${retired.length} retired`,
)

// That was the only entry in its area, so this is where the offer belongs: nothing
// is left to choose between, so it asks straight out rather than offering a choice
// of one.
screen = await text()
check(
  '24h. emptying an area asks what could help, instead of inventing something',
  screen.includes(EN.steps) && screen.includes(EN.noted),
  screen.replace(NL, ' / ').slice(0, 200),
)
await type('Write the intro')
await click(EN.save)
check('24i. and the new one is listed straight away', (await text()).includes('Write the intro'))

// The same words at two points in time are two different things. Doing something
// useful again later is a new thing to do, not a repeat of the old one.
await clickAria(`How is it going with: Write the intro`)
await clickOption(EN.outcomeDone)
await type('Write the intro')
await click(EN.save)
store = JSON.parse(await raw())
const written = store.facts.filter((f) => f.value === 'Write the intro')
const ids = new Set(written.map((f) => f.key))
check(
  '24j. the same text twice is two entries with different ids, not one reused',
  written.length === 2 && ids.size === 2,
  `${written.length} facts, ${ids.size} distinct keys`,
)
// Two done and one set aside, which is the point: the three outcomes that write
// anything each wrote once, and none of them replaced an earlier one.
check(
  '24k. and the first is still done while the second is active',
  store.facts.filter((f) => f.key.endsWith('.state') && f.value === 'done').length === 2 &&
    store.facts.filter((f) => f.key.endsWith('.state') && f.value === 'retired').length === 1,
  store.facts
    .filter((f) => f.key.endsWith('.state'))
    .map((f) => f.value)
    .join(', '),
)

await goto('/')
check(
  '24l. what is being worked on survives a reload — it is derived, not held in the page',
  (await text()).includes('Write the intro'),
)

// The cap: three open at a time, counting the one being worked on.
await clickNav(EN.navAreas)
check('24m. Life areas lists every one with its state', (await text()).includes(EN.picker))
// The area §4's walk gave its second goal to — not a fixed one. §7 below keeps
// working on this same area, which is why it reads from `AREAS` rather than naming
// it: inserting an area anywhere before it silently moves which one this is.
await clickOption(AREAS[2].label)
// Navigation, not a selection: wait for the destination rather than for a fixed delay.
await waitForText(EN.addEntry)
await click(EN.addEntry)
await type('Ask Sam for feedback')
await click(EN.save)
await click(EN.addEntry)
await type('Pick the three best pieces')
await click(EN.save)
check(
  '24n. at three open entries there is no way to add a fourth',
  !(await visible(EN.addEntry)),
  (await text()).replace(/\n/g, ' / ').slice(0, 140),
)

// --- 7. more than one goal, and what closing one takes with it -------------
//
// This section used to walk every open entry one screen at a time whenever a goal
// changed, because entries belonged to the *area* and a new goal might orphan them.
// Entries now belong to a goal, so rewording one carries them along and there is
// nothing to ask about. What still needs asking about is **closing** a goal — that is
// the case where something really does leave the list — and the answer is one
// sentence stated before it happens rather than a walk afterwards.

await click(EN.goalAdd)
await type('Get hired somewhere I like')
await click(EN.confirm)
screen = await text()
check(
  /**
   * A later goal is followed by the same question as the first one.
   *
   * It used to return to the overview instead, so a goal added this way began with nothing
   * under it — the very state `/areas/` then flags as a hint. The cause was a duplicated
   * screen: `AreaManage` had its own copy of the goal question whose only difference was
   * where it went afterwards, and deleting the copy is what made the two paths one.
   */
  '7a0. a later goal is asked about its next steps, exactly as the first one is',
  screen.includes(EN.steps) &&
    screen.includes('Get hired somewhere I like') &&
    // And not the offer to add a third instead: on this page the overview already carries
    // it, so here it only invited abandoning the question on screen. §45a asserts the
    // introduction still makes the offer.
    !(await visible(EN.goalAnother)),
  screen.replace(NL, ' / ').slice(0, 140),
)
// Out of the steps screen without inventing anything. Which control that is depends on the
// area, not on this goal: the cap counts across the whole area, and by now this one is at
// it — so the field has given way to the notice and its Continue. Either way it writes
// nothing and returns to the area.
await click((await visible(EN.stepsUnknown)) ? EN.stepsUnknown : EN.cont)
screen = await text()
check(
  '7a. a second goal sits beside the first, each one named and numbered',
  screen.includes('Get hired somewhere I like') &&
    screen.includes('Get the portfolio finished') &&
    screen.includes(EN.goalNumber) &&
    screen.includes('Goal #2:'),
  screen.replace(/\n/g, ' / ').slice(0, 200),
)
// Order is the priority, so the ordinals have to be real list markers rather than
// text someone typed. With one goal there were none at all.
const ordered = await evaluate(
  `(() => {
     const list = document.querySelector('main ol');
     if (!list) return null;
     return [...list.children].map((li) => li.textContent.trim().slice(0, 40));
   })()`,
)
check(
  '7b. and they are an ordered list, oldest first until something says otherwise',
  // `includes`, not `startsWith`: the row opens with the goal mark now. Which label sits
  // on which row is still the claim.
  ordered?.length === 2 && ordered[0].includes('Goal #1:') && ordered[1].includes('Goal #2:'),
  JSON.stringify(ordered),
)

// One tap, one write, and the order changes. This is the whole priority feature:
// there is no rank to rewrite and no second goal to renumber.
await clickAria('Change this goal: Get hired somewhere I like')
await click(EN.goalTop)
const reordered = await evaluate(
  `(() => [...document.querySelector('main ol').children].map((li) => li.textContent.trim().slice(0, 40)))()`,
)
check(
  '7c. putting a goal first reorders the list, with one fact and no renumbering',
  reordered[0].includes('Get hired somewhere I like') &&
    JSON.parse(await raw()).facts.filter((f) => f.key.endsWith('.goal_priority')).length === 1,
  JSON.stringify(reordered),
)

// Rewording is the case the old walk fired on, and the case that no longer needs it.
const beforeReword = JSON.parse(await raw()).facts.length
await clickAria('Change this goal: Get the portfolio finished')
// No menu step any more: opening a goal opens the field, prefilled. Renaming is an
// edit rather than a decision, and it used to cost a whole screen to say so.
await type('Finish the portfolio properly')
await click(EN.editSubmit)
screen = await text()
check(
  '7d. rewording a goal keeps everything being tried for it, and asks nothing',
  screen.includes('Finish the portfolio properly') &&
    screen.includes('Write the intro') &&
    // One fact: the new wording. No walk, no keep/remove, nothing about the entries.
    JSON.parse(await raw()).facts.length === beforeReword + 1,
  screen.replace(/\n/g, ' / ').slice(0, 200),
)

// Closing a goal with nothing being tried for it costs nothing, so it asks nothing.
// A confirmation with no consequence to state is a step that teaches people to tap
// through steps. The case that *does* have one is §41, on a store built for it —
// closing a goal here would take the only active entry in the run with it.
const beforeDrop = JSON.parse(await raw()).facts.length
// Removing is its own control now — a cross beside the goal, not an option inside the
// edit screen — and it asks once, in place. "One tap" in the name below always meant one
// *write*, which is still true: the confirmation writes nothing.
await clickAria('Remove goal: Get hired somewhere I like')
screen = await text()
check(
  // Names the goal, and is the only thing on the page: the second goal's card and the
  // page's own controls come down, so the one moment needing a single answer is not also
  // the busiest state on the screen.
  '7e0. removing a goal asks once, names it, and is the only thing on screen',
  screen.includes(EN.confirmDelete) &&
    screen.includes('Get hired somewhere I like') &&
    !screen.includes('Finish the portfolio properly') &&
    !(await visible(EN.goalAdd)) &&
    !(await visible(EN.manageDone)) &&
    JSON.parse(await raw()).facts.length === beforeDrop &&
    (await visible(EN.confirmNo)),
  screen.replace(NL, ' / ').slice(0, 120),
)
await click(EN.confirmYes)
screen = await text()
check(
  '7e. setting aside a goal nothing was being tried for takes one tap and one fact',
  !screen.includes('Get hired somewhere I like') &&
    screen.includes('Finish the portfolio properly') &&
    JSON.parse(await raw()).facts.length === beforeDrop + 1,
  screen.replace(/\n/g, ' / ').slice(0, 200),
)
check(
  /**
   * With one goal left the **label** stays and the **number** goes.
   *
   * Two earlier rules met here. The first hid a bare `aria-hidden` "1." at one goal,
   * because a lone ordinal implies a sibling that is not there. The second showed
   * "Goal #1:" always, as visible words. This keeps what each was right about: the line
   * still names what the quoted sentence beneath it is, and it stops counting when
   * there is nothing to count.
   */
  '7f2. and with one goal left the label stays but stops numbering',
  // The absence to assert is the **number**, not any hidden span: the goal mark is an
  // `aria-hidden` span and belongs there. Looking for a `#` says what this is about.
  (await text()).includes(EN.goalOnly) &&
    !(await text()).includes(EN.goalNumber) &&
    !(await evaluate(`document.querySelector('main ol li').innerText.includes('#')`)),
  (await text()).replace(NL, ' / ').slice(0, 80),
)

await click(EN.manageDone)
await goto('/data/stored/')
await expandAll()
screen = await text()
check(
  '7e. /you shows the current goal and the one it replaced, with dates',
  screen.includes('Get hired somewhere I like') &&
    screen.includes('Get the portfolio finished') &&
    /noted /.test(screen),
)
// `screen` is `innerText`, which cannot see an accessible name — and a step's own
// words live in one ("How is it going with: {text}", "Edit: {text}"). A bug
// interpolating a step's *id* there produces a control that reads
// a UUID aloud and leaves the visible page spotless, so the visible sweep alone
// would call it clean. Both surfaces, one assertion.
const named = await ariaLabels()
check(
  '7f. /you resolves every id into words — no internal id reaches the screen, seen or spoken',
  !UUID.test([screen, ...named].join(' ')),
  UUID.exec([screen, ...named].join(' '))?.[0] ?? `clean (${named.length} accessible names)`,
)
// The three outcomes, in the words the record now uses. The negative half is the
// point of that rewording: an entry taken out of current use is still on this page,
// one line further down, so "removed from current steps" was describing a deletion
// that never happened. Append-only has no delete.
check(
  '7g. and it says what became of each step, without claiming any of it was removed',
  screen.includes('done') &&
    screen.includes('set aside') &&
    !/removed from/.test(screen),
  ['done', 'set aside']
    .filter((word) => !screen.includes(word))
    .map((word) => `missing "${word}"`)
    .concat(/removed from/.test(screen) ? ['still claims removal'] : [])
    .join(', ') || 'all three, and no claim of removal',
)

// --- 8. forget everything --------------------------------------------------

// **One** confirmation, down from two. The flow used to ask three times over — the
// button, then "this removes everything, continue?", then "delete everything now,
// really?" — and the middle two said the same thing. A step that adds no information
// is what teaches someone to click through the step that does.
//
// What still prevents an accident: deleting is never the first tap, the consequence is
// spelled out in the same breath as the question, and the safe choice is emphasised.
const beforeDelete = await raw()
await click(EN.del)
screen = await text()
check(
  '8a. one confirmation, and it states the consequence and the irreversibility',
  screen.includes(EN.delWarn) &&
    screen.includes('cannot be undone') &&
    screen.includes('would have to enter it all again') &&
    // Byte-identical, not merely present: "the key still exists" would not notice it
    // being rewritten, which is the failure mode a presence check misses.
    (await raw()) === beforeDelete,
  (await raw()) === beforeDelete ? 'store untouched' : 'STORE CHANGED',
)

// The count itself, asserted. Two steps between the button and deletion would pass
// every other check here while being the thing this change removed.
const deleteSteps = await evaluate(
  `(() => {
     const labels = [...document.querySelectorAll('#delete button')].map((b) => b.textContent.trim());
     return { labels, confirms: labels.filter((l) => l === 'Yes, delete everything').length };
   })()`,
)
check(
  '8a2. and reaching deletion takes exactly one confirming click from here',
  deleteSteps.confirms === 1 && !deleteSteps.labels.includes('Continue'),
  JSON.stringify(deleteSteps.labels),
)

// Backing out has to be possible, and has to leave everything.
await click(EN.delKeep)
check(
  '8c. and backing out leaves it all in place',
  (await raw()) === beforeDelete && (await visible(EN.del)),
  (await raw()) === beforeDelete ? 'store untouched' : 'STORE CHANGED',
)

await click(EN.del)
await click(EN.delConfirm)
check(
  '8d. confirming deletes, and it removes the key entirely',
  (await keys()).length === 0 && (await text()).includes(EN.delDone),
  JSON.stringify(await keys()),
)
await goto('/')
check('8e. after a reload it starts over', (await text()).includes(EN.consent))

// --- 29. writing down what to try: the cap is visible, entries are editable -
//
// Three things were not obvious on the old screen: that more than one is allowed,
// that the cap is three, and that what you typed can be changed. Each has its own
// assertion, because each was its own complaint.
//
// **Re-based, not weakened.** This section used to run inside the introduction, where
// saving an action now carries straight on to the next area — one goal and one action is
// the whole of what the walk asks for. Everything it asserts still exists, on the flow the
// area page enters after a goal is added there, so the section moved to where the behaviour
// lives rather than being deleted along with the path it happened to use.
//
// That is also the check that the introduction's ceiling is a property of the introduction
// and not of `ActionEntry`: if saving ever auto-continued here too, every assertion below
// would fail at once.

await seedOnboarded()
await goto(`/areas/${AREAS[1].id}/`)
await waitForText(EN.emptyNote)
await click(EN.goalCreate)
await waitForText(EN.goal)
await type('Sleep better')
await click(EN.confirm)

screen = await text()
check(
  /**
   * "What could help you move toward this goal?" needs a *this*.
   *
   * The goal used to be shown only where an area held more than one, on the reasoning
   * that with one it was redundant — true about telling goals apart, wrong about the
   * question, whose subject was then nowhere on the screen. This area holds exactly one,
   * which is the case that used to be blank.
   */
  '29a0. the goal is named while the action is asked for, even with one goal',
  screen.includes(EN.forGoal),
  screen.replace(NL, ' / ').slice(0, 120),
)
check(
  // Inverted. It used to be stated *before* the field, so the first thing read on a
  // screen asking what could help was a rule about how many — an answer to a question
  // nobody had asked. The question and the field now stand alone.
  '29a. the cap is not stated before the first entry — the question stands alone',
  !screen.includes(EN.entriesNote) && screen.includes(EN.steps) && (await count('input')) === 1,
  `${await count('ol li')} entries listed, note shown: ${screen.includes(EN.entriesNote)}`,
)

// Saving is one act and adding another is the next, so the field closes on save and the
// cap appears at the point it becomes useful. The old flow relabelled the same button
// "Add another" and left an empty field open, which named the wrong act and implied a
// second entry was expected.
const savesFirst = (await visible(EN.save)) && !(await visible(EN.addStep))
await type('Walk after dinner')
await click(EN.save)
screen = await text()
const afterSave = {
  field: await count('input'),
  addOffered: await visible(EN.addStep),
  note: screen.includes(EN.entriesNote),
  on: await visible(EN.cont),
}
check(
  '29b. saving says "Save", closes the field, and only then offers another',
  savesFirst &&
    afterSave.field === 0 &&
    afterSave.addOffered === true &&
    afterSave.note === true &&
    afterSave.on === true,
  `first: ${savesFirst}, after: ${JSON.stringify(afterSave)}`,
)

check(
  '29c. entries are a numbered list under a heading, and offer their own Edit',
  (await count('ol li')) === 1 &&
    (await text()).includes(EN.entries) &&
    (await ariaLabels()).includes('Edit: Walk after dinner'),
  (await ariaLabels()).join(' / '),
)

await click(EN.addStep)
await type('Read before bed')
await click(EN.save)
await click(EN.addStep)
await type('Stretch in the morning')
await click(EN.save)
screen = await text()
check(
  '29d. the third entry fills the list and the field gives way',
  (await count('ol li')) === 3 && (await count('input')) === 0 && screen.includes(EN.full),
  `${await count('ol li')} entries, ${await count('input')} field(s)`,
)

// Editing appends the new wording. The old one is not overwritten — it stays in
// history, which is what /you can show and what makes this append-only rather than
// a mutable list wearing append-only's clothes.
await clickAria('Edit: Read before bed')
await type('Read before bed instead of scrolling')
await click(EN.editSubmit)
screen = await text()
store = JSON.parse(await raw())
const rewordings = store.facts.filter((f) => f.key.endsWith('.text') && /Read before bed/.test(f.value))
check(
  '29e. an entry can be reworded: the list shows the new words, the store keeps both',
  screen.includes('Read before bed instead of scrolling') &&
    (await count('ol li')) === 3 &&
    rewordings.length === 2 &&
    new Set(rewordings.map((f) => f.key)).size === 1,
  `${rewordings.length} wordings under ${new Set(rewordings.map((f) => f.key)).size} key(s)`,
)

// --- 5. consent no — the critical one --------------------------------------

await clearStorage()
await goto('/')
await click(EN.no)
screen = await text()
check('5a. declining asks why, and says the answer is not written down', screen.includes('what is the matter with that?'))

await type('I do not want apps keeping things about me.')
await click(EN.cont)
screen = await text()
check('5b. the reason is acknowledged and going on is offered', screen.includes('Would you like to go on anyway?'))

await click(EN.contYes)
await click(EN.introOk)
await runArea('Move more', 'Walk after lunch')
await declineRest()
await click(EN.toHome)
screen = await text()
check('5c. the whole introduction works in memory-only mode', screen.includes('Walk after lunch'))
check('5d. and it says nothing is being saved', screen.includes('Nothing is being saved'))

// Not "no goal facts": no key. The whole area flow ran, and then **both** paths
// from the home screen that write to the store — completing something and setting
// it aside — and the device still knows nothing.
//
// Exercising both matters: `retireStep` is new to this screen, and "it goes through
// `remember()` so it must be gated" is an argument, not a check.
await clickAria(`How is it going with: Walk after lunch`)
await clickOption(EN.outcomeDone)
await type('Ring Ada')
await click(EN.save)
await clickAria(`How is it going with: Ring Ada`)
await clickOption(EN.outcomeAside)
// The area is empty again, so it asks again — and declining writes nothing either.
await click(EN.cancel)
const keysAfterDecline = await keys()
check(
  '5e. localStorage is COMPLETELY empty — no key at all, not even consent or locale',
  keysAfterDecline.length === 0,
  JSON.stringify(keysAfterDecline),
)

// Via the in-app link, not a fresh page load: memory mode is meant to die with
// the tab, so a hard navigation losing it is the design, not a defect.
await clickNav(EN.navData)
screen = await text()
check(
  '5f. Data protection says plainly that nothing is being written this visit',
  screen.includes('nothing is being written to this device') && screen.includes(EN.dataShow),
  screen.replace(/\n/g, ' / ').slice(0, 140),
)

// One level deeper, and still in memory mode: their words are there to see even
// though the device holds nothing.
await click(EN.dataShow)
await expandAll()
screen = await text()
check(
  '5f2. and the stored view still shows their words, from memory alone',
  screen.includes('lives in this tab only') &&
    screen.includes('Walk after lunch') &&
    (await keys()).length === 0,
)

await goto('/')
check('5g. reloading starts over, since the decision itself was not stored', (await text()).includes(EN.consent))

// --- 39. turning saving on keeps the answers and leaves the concern behind ---
//
// One key is promised never to reach the device: `consent_concern`, what someone said
// when they declined saving. Until this section existed that promise rested on the mode
// never changing — and `/data/` exists to change it. `grantConsent()` persists the
// in-memory snapshot as it stands, deliberately, so answers given this visit are kept
// rather than asked for again; but that snapshot can hold an objection given precisely
// because nothing was being written. Declining, saying why, and later turning saving on
// wrote it to disk.
//
// §39c is the other half of the fix and not a formality. Dropping everything gathered
// before consent would also keep the concern off the device, and would be the wrong
// repair: what was said this visit is exactly what turning saving on is meant to keep.
//
// The whole flow is one tab. A reload would drop the memory snapshot and the section
// would pass without ever testing anything.

const CONCERN = 'Because I do not trust apps with this.'

await clearStorage()
await goto('/')
await click(EN.no)
await type(CONCERN)
await click(EN.cont)
await click(EN.contYes)
await click(EN.introOk)
await runArea('Move more', 'Walk after lunch')
await declineRest()
await click(EN.toHome)

// The precondition, stated rather than assumed: in memory mode the concern and a real
// answer are held exactly alike, and the device holds neither. Without this, §39b would
// pass just as well against a concern that was never recorded.
await clickNav(EN.navData)
await click(EN.dataShow)
await expandAll()
screen = await text()
check(
  '39a. before consent, the concern and a real answer are both held, with nothing on the device',
  screen.includes(CONCERN) && screen.includes('Walk after lunch') && (await keys()).length === 0,
  `concern ${screen.includes(CONCERN) ? 'held' : 'MISSING'}, answer ${screen.includes('Walk after lunch') ? 'held' : 'MISSING'}, keys ${JSON.stringify(await keys())}`,
)

await clickNav(EN.navData)
await click(EN.storageOptionLocal)
await sleep(300)
const afterOn = JSON.parse(await raw())
check(
  '39b. turning saving on does not write the concern to the device',
  !afterOn.facts.some((fact) => fact.key === 'consent_concern') && !(await raw()).includes(CONCERN),
  afterOn.facts.some((fact) => fact.key === 'consent_concern')
    ? 'THE CONCERN WAS PERSISTED'
    : `${afterOn.facts.length} facts written, none of them the concern`,
)
check(
  '39c. and the answers given before consent are kept, not thrown away with it',
  afterOn.facts.some((fact) => fact.value === 'Move more') &&
    afterOn.facts.some((fact) => fact.value === 'Walk after lunch'),
  JSON.stringify(afterOn.facts.map((fact) => fact.value)),
)

// Not persisted is not the same as taken away: it stays for the visit, which is what it
// was kept for. This is also what separates the fix from clearing the snapshot.
await click(EN.dataShow)
await expandAll()
check(
  '39d. the concern is still there for the rest of the visit',
  (await text()).includes(CONCERN),
  (await text()).includes(CONCERN) ? 'still shown' : 'the visit lost it',
)

// The guarantee as the person meets it: it was never on the device, so a reload cannot
// bring it back — while everything that was legitimately saved survives.
await goto('/data/stored/')
await expandAll()
screen = await text()
check(
  '39e. and after a reload it is gone, while what was saved survives',
  !screen.includes(CONCERN) && screen.includes('Walk after lunch'),
  `concern ${screen.includes(CONCERN) ? 'CAME BACK FROM THE DEVICE' : 'gone'}, answer ${screen.includes('Walk after lunch') ? 'survived' : 'MISSING'}`,
)

// This section is spliced into a chain that runs in order, and unlike §5 it ends
// consented, onboarded and on a nested page. §6 opens on the consent screen, so hand
// back the state this borrowed rather than making the next section defend itself.
await clearStorage()
await goto('/')

// --- 6. language ----------------------------------------------------------

// The language switch is a dropdown now, so the option has to be opened first.
await chooseIn('Language', 'Deutsch')
screen = await text()
check('6a. German works on the consent screen itself', screen.includes('Ist das okay für dich?'))
await click('Ja, das ist okay')
await click('Okay')
screen = await text()
marks = await progress()
check(
  '6b. interpolation reads correctly in German',
  marks.text === `Bereich 1 von ${AREAS.length}`,
  marks.text,
)
check(
  '6c. the life areas and their question are German, with no English leaking',
  screen.includes(AREAS[0].de) &&
    screen.includes('Möchtest du hier gerade etwas verändern') &&
    !screen.includes(AREAS[0].label),
)

await click('Ja')
await type('Besser schlafen')
await click('Bestätigen')
await type('20 Minuten spazieren gehen')
// Saving is the way on now — there is no "Weiter" to press afterwards, because during the
// introduction one action per area is the whole of what is asked for. The German walk
// exercises that in its own language rather than trusting the English one.
await click('Speichern')
await declineRest({ no: 'Gerade nicht', done: 'Das war’s für den Anfang.' })
await click('Zur Startseite')
screen = await text()
check(
  '6d. the whole flow reads in German and what was typed comes back verbatim',
  screen.includes('Deine nächsten Schritte') &&
    screen.includes('20 Minuten spazieren gehen') &&
    // The English-leak guard, stated against the fixture rather than a literal, so
    // renaming the home title cannot quietly make it vacuous.
    !screen.includes(EN.home),
)

await goto('/data/stored/')
await expandAll()
screen = await text()
check(
  '6e. the stored view is German too, including the life-area labels',
  screen.includes('Was gespeichert ist') &&
    !screen.includes(EN.storedTitle) &&
    screen.includes('Dein Ziel') &&
    screen.includes('Besser schlafen'),
)
await goto('/about/')
// innerText reflects text-transform, and the section headings are uppercased in
// CSS — so compare case-insensitively rather than chasing a styling artefact.
screen = (await text()).toLowerCase()
check(
  '6f. /about is German too',
  screen.includes('was das hier ist') && !screen.includes('what this is'),
)
check('6g. the locale was persisted with consent', JSON.parse(await raw()).locale === 'de')

// --- 25. onboarding ends once, and never comes back -----------------------

/**
 * Closing the tab midway through the **fifth** area is a deliberately accepted
 * edge: by then every area has a review answer, so the introduction is over
 * and the app lands on home rather than resuming. Nothing is lost, and the four
 * properties that make that acceptable are what this section pins down.
 *
 * The fourth is the important regression guard. "Introduction finished" has to be
 * derived from something monotonic — the count of areas with a review answer —
 * because an area legitimately loses its active step whenever someone completes a
 * step and chooses "Later". Deriving it from "every area settled" would drop
 * someone back into onboarding months later.
 */
await clearStorage()
await goto('/')
await click(EN.yes)
await click(EN.introOk)
await declineAreas(AREAS.length - 1)
// The last area: answered, a goal given, then interrupted before any next step.
await click(EN.reviewYes)
await type('Draw something every week')
await click(EN.confirm)
await goto('/')
screen = await text()
check(
  '25a. a review answer for every area ends the introduction, even with one left unfinished',
  screen.includes(EN.home) && !screen.includes(EN.review) && !screen.includes(EN.steps),
  screen.replace(/\n/g, ' / ').slice(0, 100),
)
check(
  '25b. and home says so, rather than reporting that everything is settled',
  screen.includes(EN.unfinished),
)

/**
 * The hint carries the way to act on it, and it no longer names the area.
 *
 * It used to read "{area} has a goal, but you have not decided yet…" with the area as an
 * inline link. Precise — and it left the reader to work out what to do, with "you have
 * not" where a reason should be. The hint now says what is true and offers one control,
 * which is why this asserts a **destination** rather than a name: naming an area was the
 * old design's way of being useful, not the guarantee.
 *
 * It also sits **after** the list now, so the first thing read on a page about steps is
 * the steps. Asserted by position, because "present somewhere" was never the claim.
 */
const unfinishedCta = await evaluate(
  `(() => {
     const main = document.querySelector('main');
     const link = [...main.querySelectorAll('a[href]')]
       .find((a) => a.textContent.trim() === ${JSON.stringify('Go to your life areas')});
     if (!link) return null;
     const hint = [...main.querySelectorAll('p')]
       .find((p) => p.textContent.includes('no concrete steps'));
     const list = main.querySelector('ul');
     return {
       href: new URL(link.href).pathname,
       primary: link.classList.contains('btn-primary'),
       italic: hint ? getComputedStyle(hint).fontStyle : null,
       hasList: Boolean(list),
       // 4 === DOCUMENT_POSITION_FOLLOWING: the hint comes after the list.
       afterList: Boolean(hint && list && list.compareDocumentPosition(hint) & 4),
     };
   })()`,
)
check(
  '25b2. the hint offers one way to act on it, under the list rather than over it',
  unfinishedCta?.href === '/areas/' &&
    unfinishedCta.primary === true &&
    unfinishedCta.italic === 'italic' &&
    /**
     * **The ordering is checked only when there is a list to order against, and no
     * fixture in this file produces one.**
     *
     * `unfinished` fires on an area with a goal and *no steps ever written*, which every
     * walk here reaches only by declining every other area — so home has the hint and an
     * empty list. `seedGoals()` gives the opposite: a list, and no area qualifying for the
     * hint. So the clause is guarded rather than asserted, and this is written down instead
     * of left as a green check implying more than it measures. Verified by eye for now.
     */
    (!unfinishedCta.hasList || unfinishedCta.afterList),
  JSON.stringify(unfinishedCta),
)

// The trap this page has already fallen into once: something that looks like navigation
// but writes. Following it must leave the store byte-identical.
const beforeUnfinished = await raw()
await clickText(EN.unfinishedLink)
await sleep(400)
check(
  '25b3. and following it navigates without changing anything',
  (await text()).includes(EN.picker) && (await raw()) === beforeUnfinished,
  (await raw()) === beforeUnfinished ? 'store untouched' : 'STORE CHANGED',
)
await goto('/')
screen = await text()

await clickNav(EN.navAreas)
screen = await text()
check(
  '25c. the unfinished area is reachable and says what is missing',
  screen.includes(LAST_AREA.label) && screen.includes('ecide on next steps to reach your goal'),
)
await clickOption(LAST_AREA.label)
await waitForText('Draw something every week')
screen = await text()
check(
  '25d. its goal survived, and finishing the setup is one action away',
  screen.includes('Draw something every week') && (await visible(EN.addEntry)),
)
await click(EN.addEntry)
await type('Sketch on Sunday morning')
await click(EN.save)
// "Done" now returns to the areas list rather than to home, because the area is its
// own route. The list is where it shows up first.
await click(EN.manageDone)
await sleep(400)
screen = await text()
check(
  '25e. adding the missing entry lists it, with nothing else asked',
  // The count is per goal now, in brackets after the goal it belongs to.
  screen.includes('(1 next step)') && screen.includes(EN.picker),
  screen.replace(/\n/g, ' / ').slice(0, 120),
)

await clickNav(EN.navHome)
screen = await text()
check(
  '25e2. and home stops reporting it as unfinished setup',
  screen.includes('Sketch on Sunday morning') && !screen.includes(EN.unfinished),
  screen.replace(/\n/g, ' / ').slice(0, 120),
)

// The guard: an area with nothing active must never be read as "not onboarded".
await clickAria(`How is it going with: Sketch on Sunday morning`)
await clickOption(EN.outcomeDone)
await click(EN.cancel)
await goto('/')
screen = await text()
check(
  '25f. after finishing the last thing in an area, a reload still lands on home',
  screen.includes(EN.home) && !screen.includes(EN.review) && !screen.includes(EN.intro),
  screen.replace(/\n/g, ' / ').slice(0, 100),
)
check(
  '25g. and "Later" is not reported as unfinished setup — it is a real answer',
  !screen.includes(EN.unfinished),
)

// --- 38. a goal with nothing to try yet is a real answer, not a blocked screen -
//
// Wanting something to change here, having a goal, and not yet knowing what would help
// is an ordinary place to be. The steps screen used to have no way to say it: the only
// way past was to invent something, and an invented action is worse than none because
// the app would then treat it as a real intention.
//
// The state needs no new keys — a `review` fact plus a `goal` fact and no step facts
// already means exactly this — so the assertions below are about the flow and about
// **nothing fake being written**.

await clearStorage()
await goto('/')
await click(EN.yes)
await click(EN.introOk)

// Area 1: yes, a goal, then "I do not know yet".
await click(EN.reviewYes)
await type('Sleep better')
await click(EN.confirm)
screen = await text()
check(
  '38a. the steps screen offers a way on without inventing something',
  screen.includes(EN.steps) && (await visible(EN.stepsUnknown)) && !(await visible(EN.enough)),
  `"${EN.stepsUnknown}" offered: ${await visible(EN.stepsUnknown)}`,
)

// Secondary, and it must not compete with entering something concrete. `.btn-primary`
// on the way out would invite skipping.
// Scoped to `main section`, not to the form. It used to read `main form button`, which
// stopped covering the screen the moment a control appeared beside the form — and one
// did: "Add another goal". Three `.find()` lookups also never noticed a second primary,
// so the "stays the primary action" half was only ever half asserted.
const stepsButtons = await evaluate(
  `(() => {
     const b = [...document.querySelectorAll('main section button')];
     return b.map((x) => ({ label: x.textContent.trim(), primary: x.classList.contains('btn-primary'), quiet: x.classList.contains('btn-quiet') }));
   })()`,
)
check(
  '38b. adding stays the primary action, and every way out of it is quiet',
  stepsButtons.find((b) => b.label === EN.save)?.primary === true &&
    stepsButtons.find((b) => b.label === EN.stepsUnknown)?.quiet === true &&
    stepsButtons.find((b) => b.label === EN.stepsUnknown)?.primary === false &&
    // Exactly one, over every control on the screen: entering something concrete.
    stepsButtons.filter((b) => b.primary).length === 1 &&
    // And every other control on it is quiet, so nothing competes with that.
    stepsButtons.every((b) => b.primary || b.quiet),
  JSON.stringify(stepsButtons),
)

const beforeUnknown = JSON.parse(await raw()).facts.length
await click(EN.stepsUnknown)
await sleep(300)
const afterUnknown = JSON.parse(await raw()).facts
check(
  '38c. taking it writes nothing at all — no placeholder entry, no fake step',
  afterUnknown.length === beforeUnknown &&
    !afterUnknown.some((fact) => /\.step\./.test(fact.key)) &&
    !afterUnknown.some((fact) => /know/i.test(fact.value)),
  `${afterUnknown.length} facts (was ${beforeUnknown}); keys: ${afterUnknown.map((f) => f.key).join(', ')}`,
)
check(
  '38d. and the goal is still stored, which is the whole point of the state',
  afterUnknown.some(
    (fact) =>
      new RegExp(`^area\.${AREAS[0].id}\.goal\.[^.]+\.text$`).test(fact.key) &&
      fact.value === 'Sleep better',
  ),
  afterUnknown
    .filter((f) => /\.goal\.[^.]+\.text$/.test(f.key))
    .map((f) => f.value)
    .join(' | '),
)

// The flow has to have moved on rather than stalled on an empty list of things to pick
// between, which is where it would have landed without the zero case handled.
screen = await text()
check(
  '38e. the introduction moved on to the next area instead of a dead screen',
  screen.includes(EN.review) && !screen.includes(EN.focus) && !screen.includes(EN.steps),
  screen.replace(/\n/g, ' / ').slice(0, 120),
)

// Finish the remaining areas the quick way, so the downstream views can be checked.
await declineRest()
await click(EN.toHome)
screen = await text()
check(
  '38f. home renders goal-with-no-entry as guidance, not as broken data',
  screen.includes(EN.unfinished) && screen.includes(EN.home),
  screen.replace(/\n/g, ' / ').slice(0, 140),
)

await clickNav(EN.navAreas)
screen = await text()
check(
  // The goal's own words are no longer printed here (34b), so what has to match home
  // is the sentence about there being nothing to try yet — which is the half this check
  // was really about: two screens describing one state in one wording.
  '38g. and the areas list says the same thing in the same words',
  screen.includes('ecide on next steps to reach your goal') && screen.includes('Sleep better'),
  screen.replace(/\n/g, ' / ').slice(0, 160),
)

// Opening it must offer adding something without re-asking for the goal.
await clickOption(AREAS[0].label)
await waitForText(EN.addEntry)
screen = await text()
check(
  '38h. opening the area offers adding something, with the goal intact',
  screen.includes('Sleep better') && (await visible(EN.addEntry)),
  screen.replace(/\n/g, ' / ').slice(0, 140),
)

// And the state is reachable in German too, where the copy is a full sentence.
await goto('/')
await chooseIn('Language', 'Deutsch')
await sleep(400)
check(
  '38i. the same state reads correctly in German',
  // The German hint no longer says "noch nicht festgelegt" — it names the absence rather
  // than the person's inaction: "es gibt Ziele ohne konkrete Schritte".
  (await text()).includes('Ziele ohne konkrete Schritte') &&
    (await visible('Zu den Lebensbereichen')),
  (await text()).replace(/\n/g, ' / ').slice(0, 160),
)
await chooseIn('Sprache', 'English')

// --- 31. the progress marks are painted distinguishably, in both themes -----
//
// Three marks states have to be told apart by someone who cannot compare their
// colours, and advancing must not move the question underneath. Both properties
// are cheap to state and easy to lose: the previous version differed *only* by
// colour between current and upcoming, and nothing asserted otherwise.
//
// Three clicks reach a frame holding all three states at once: consent, the
// introduction, then "Not right now" for the first area leaves one done, one
// current, and the rest upcoming.

for (const scheme of ['light', 'dark']) {
  await clearStorage()
  await setScheme(scheme)
  await goto('/')
  await click(EN.yes)
  await click(EN.introOk)
  await click(EN.reviewNo)

  const trio = await progress()
  const [done, current, upcoming] = trio.marks

  check(
    `31a. all three mark states have identical metrics (${scheme})`,
    new Set(trio.marks.map((mark) => `${mark.w}x${mark.h}`)).size === 1,
    trio.marks.map((mark) => `${mark.w}x${mark.h}`).join(' '),
  )
  check(
    `31b. current differs from upcoming by more than colour (${scheme})`,
    current.borderWidth !== upcoming.borderWidth && done.background !== upcoming.background,
    `current ${current.borderWidth}, upcoming ${upcoming.borderWidth}, done fill ${done.background}`,
  )

  // The check that would have caught the defect this whole change exists to fix.
  // An inequality would not have: the old border colour differed from the page
  // background and still measured 1.22:1. WCAG 1.4.11 asks 3:1 for the boundary of
  // a non-text UI component, which is what an upcoming mark is.
  const ratio = await contrast(upcoming.borderColor, trio.background)
  check(
    `31c. an upcoming mark is actually visible against the page (${scheme})`,
    ratio >= 3,
    `${ratio}:1 (${upcoming.borderColor} on ${trio.background}) — was 1.22:1`,
  )

  /**
   * The same floor, on the surface rather than the page — and it is a separate
   * assertion because it is a separate background.
   *
   * `.field`, `.option` and the menu panel all sit on `--color-surface`, which in
   * dark mode is *lighter* than the ground. A border tuned against the ground alone
   * therefore comes out too dark on every control that has one, and 31c cannot see
   * it: it measures a progress mark, which sits on the page. The first
   * `--dark-line-strong` was 3.05 against the ground and **2.77** against the
   * surface, which is what this check is here to stop.
   */
  await click(EN.reviewYes)
  const edge = await evaluate(`(() => {
    const field = document.querySelector('.field');
    if (!field) return null;
    const style = getComputedStyle(field);
    return {
      border: style.borderTopColor,
      background: style.backgroundColor,
      width: style.borderTopWidth,
    };
  })()`)
  const edgeRatio = await contrast(edge.border, edge.background)
  check(
    `31d. and a control's edge is visible against the surface it sits on (${scheme})`,
    edgeRatio >= 3,
    `${edgeRatio}:1 (${edge.border} on ${edge.background})`,
  )

  /**
   * The one hue in the palette has to clear the same floor as everything else, in
   * both themes and against both backgrounds.
   *
   * A colour is the easiest thing in this project to pick by eye and ship unreadable,
   * and this one is picked by eye by definition — someone asked for red. A red tuned
   * against a white page is close to invisible on the dark ground, and the reverse;
   * that is the whole reason it is two values rather than one.
   *
   * Measured through a probe rather than through a pinned entry, so it holds wherever
   * the glyph is drawn instead of only on the screen that happens to have one. That
   * the class actually applies the token is §42's job, not this one.
   */
  const pin = await evaluate(`(() => {
    const probe = document.createElement('span');
    probe.style.color = 'var(--color-pin)';
    document.body.append(probe);
    const colour = getComputedStyle(probe).color;
    probe.remove();
    const read = (name) => {
      const el = document.createElement('span');
      el.style.color = name;
      document.body.append(el);
      const value = getComputedStyle(el).color;
      el.remove();
      return value;
    };
    return { colour, ground: read('var(--color-ground)'), surface: read('var(--color-surface)') };
  })()`)
  const onGround = await contrast(pin.colour, pin.ground)
  const onSurface = await contrast(pin.colour, pin.surface)
  const noteColour = await evaluate(`(() => {
    const read = (value) => {
      const el = document.createElement('span');
      el.style.color = value;
      document.body.append(el);
      const out = getComputedStyle(el).color;
      el.remove();
      return out;
    };
    return {
      colour: read('var(--color-note)'),
      ground: read('var(--color-ground)'),
      surface: read('var(--color-surface)'),
    };
  })()`)
  const noteGround = await contrast(noteColour.colour, noteColour.ground)
  const noteSurface = await contrast(noteColour.colour, noteColour.surface)
  check(
    // **4.5:1, not the 3:1 a border needs.** A control edge only has to be seen; this is
    // a whole sentence at `text-sm` that has to be read. Gold is also the easiest hue in
    // the set to pick too light on paper and too dark on ink, so both are measured.
    `31g. and a hint's colour is readable as body text on both backgrounds (${scheme})`,
    noteGround >= 4.5 && noteSurface >= 4.5,
    `${noteGround}:1 on ground, ${noteSurface}:1 on surface (${noteColour.colour})`,
  )

  check(
    `31e. and an active pin's colour is readable on both backgrounds (${scheme})`,
    onGround >= 3 && onSurface >= 3,
    `${onGround}:1 on ground, ${onSurface}:1 on surface (${pin.colour})`,
  )
}

/**
 * Every `--dark-*` value has to be mapped in **both** dark blocks.
 *
 * The dark palette is defined once and mapped twice — under
 * `@media (prefers-color-scheme: dark)` for "the OS asked", and under
 * `:root[data-theme='dark']` for "the person chose". Forgetting the second is invisible
 * to every other check in this file, because they all emulate the media query. That is
 * precisely how `--color-pin` shipped mapped in one block and not the other, drawing an
 * active pin in the light red at 2.48:1 on a chosen dark theme.
 *
 * So this asserts the *shape* rather than any single colour, and every token added later
 * is covered by it without anyone having to remember.
 */
const themeMapping = await evaluate(`(() => {
  const root = document.documentElement;
  const names = new Set();
  for (const sheet of document.styleSheets) {
    let rules;
    try { rules = sheet.cssRules } catch { continue }
    for (const rule of rules) {
      if (!rule.style) continue;
      for (const prop of rule.style) if (prop.startsWith('--dark-')) names.add(prop);
    }
  }
  const had = root.dataset.theme;
  root.dataset.theme = 'dark';
  const cs = getComputedStyle(root);
  const unmapped = [];
  for (const dark of names) {
    const target = '--color-' + dark.slice('--dark-'.length);
    const want = cs.getPropertyValue(dark).trim();
    if (!want) continue;
    const got = cs.getPropertyValue(target).trim();
    if (got !== want) unmapped.push(target + ' = ' + (got || 'unset') + ', expected ' + want);
  }
  if (had) root.dataset.theme = had; else delete root.dataset.theme;
  return { count: names.size, unmapped };
})()`)
check(
  '31f. every dark token is mapped for a chosen theme, not only for the OS one',
  // The count guards the sweep against finding nothing and passing vacuously.
  themeMapping.count >= 8 && themeMapping.unmapped.length === 0,
  themeMapping.unmapped.length
    ? themeMapping.unmapped.join(' | ')
    : `${themeMapping.count} tokens mapped`,
)

await setScheme('light')

// --- 10. corrupt store ----------------------------------------------------

await evaluate(`localStorage.setItem(${JSON.stringify(STORAGE_KEY)}, '{ not json at all')`)
await goto('/')
screen = await text()
check(
  '10. a corrupt key degrades to "nothing known yet" instead of a white screen',
  screen.includes(EN.consent) || screen.includes('Ist das okay für dich?'),
  screen.slice(0, 60).replace(/\n/g, ' '),
)

// --- 26. the navigation appears only once the introduction is over ---------
//
// Nothing to navigate to before then: the destinations exist but are empty. Only
// the *nav* is gated — the routes are not, because gating a route in a static
// export means a client-side redirect, which is a flash (§9).

await setScheme('light')
await setViewport(390)
await clearStorage()
await goto('/')
check(
  '26a. during the introduction there are no nav links at all',
  (await count('header nav a')) === 0 && (await count(MENU)) === 0,
  `${await count('header nav a')} link(s), ${await count(MENU)} menu trigger(s)`,
)
// The controls that must survive the gate. 22 and 23 both select the theme toggle by
// name and throw if it is absent, so a regression here would otherwise surface as a
// confusing exception several sections later rather than as a named failure. And the
// language switch has to work on every screen, consent included.
check(
  '26b. but the language switch and theme toggle are still there',
  (await count('button[aria-label="Language"]')) === 1 &&
    (await count('button[aria-label^="Switch to"]')) === 1,
  `${await count('button[aria-label="Language"]')} language, ${await count('button[aria-label^="Switch to"]')} theme`,
)

await seedOnboarded()
check(
  '26c. once it is finished the links are there',
  (await count('header nav a')) === 3,
  (await navLinks()).map((l) => `${l.text}→${l.href}`).join(' '),
)

// Memory mode has to get the navigation too: the gate is derived from the person,
// not from `localStorage`, and someone who declined saving still finishes the
// introduction.
await clearStorage()
await goto('/')
await click(EN.no)
await click(EN.cont)
await click(EN.contYes)
await click(EN.introOk)
await declineRest()
await click(EN.toHome)
check(
  '26d. and in memory mode as well — the gate is about the person, not the store',
  (await count('header nav a')) === 3 && (await keys()).length === 0,
  `${await count('header nav a')} link(s), ${(await keys()).length} storage key(s)`,
)

// --- 27. the life areas are real routes ------------------------------------
//
// They used to be two states inside the home page's state machine. Making them
// routes is what took that machine from ten states to seven, and it is also the
// first thing in this app that is deep-linkable.

await setViewport(1200, 800)
await seedOnboarded()
await clickNav('Life areas')
screen = await text()
check(
  '27a. Life areas lists every one with its state',
  AREAS.every((area) => screen.includes(area.label)),
  screen.replace(/\n/g, ' / ').slice(0, 160),
)

// A set, not a count. Every link pointing at `body` is the copy-paste bug a
// count cannot see, and it is the likeliest one in a mapped list.
const areaHrefs = await evaluate(
  `[...document.querySelectorAll('main a[href]')].map((a) => new URL(a.href).pathname)`,
)
const wanted = AREAS.map(({ id }) => `/areas/${id}/`)
check(
  '27b. every row is a real link, and each points at its own area',
  wanted.every((href) => areaHrefs.includes(href)) && new Set(areaHrefs).size === areaHrefs.length,
  areaHrefs.join(' '),
)

/**
 * **Inverted, and the half that mattered is kept.**
 *
 * This read "the rows are links, not buttons — this page changes nothing", and asserted
 * zero buttons on the page. Starring an area makes the second half false: the page does
 * change something now.
 *
 * The first half is the part that was ever load-bearing, and it survives unchanged. A *row*
 * navigates, so a row is an `<a>` — the whole difference from the `.option` buttons
 * elsewhere, which select. What this now adds is the structural rule that made the star
 * possible at all: the button is a **sibling** of the link, never inside it. A `<button>`
 * within an `<a>` is invalid and would navigate on press, and it is exactly what someone
 * reaching for "put the star in the row" would write.
 *
 * Inverted rather than deleted, as 36c, 7f, 29a, 34b, 41g, 42j and 46b were: quietly
 * removing a check that says *do not do this* is how a codebase forgets it ever decided.
 */
const pickerRows = await evaluate(`(() => {
  const rows = [...document.querySelectorAll('main ul > li')];
  return {
    rows: rows.length,
    links: rows.filter((li) => li.querySelector(':scope > a[href]')).length,
    stars: rows.filter((li) => li.querySelector(':scope > button')).length,
    nested: rows.filter((li) => li.querySelector('a button, button a')).length,
  };
})()`)
check(
  '27c. each row is a link, with its star beside it rather than inside it',
  pickerRows?.rows === AREAS.length &&
    pickerRows.links === AREAS.length &&
    pickerRows.stars === AREAS.length &&
    pickerRows.nested === 0,
  JSON.stringify(pickerRows),
)

// The deep link, cold. This is the half of the original plan's verification item 11
// that could never be checked before, because there was no nested route to check.
await goto('/areas/body/')
screen = await text()
check(
  '27d. a deep link to one area loads it directly, on a cold navigation',
  screen.includes(AREAS[0].label) && screen.includes('Sleep better'),
  screen.replace(/\n/g, ' / ').slice(0, 120),
)
await goto('/areas/body/')
check('27e. and survives a reload of that URL', (await text()).includes('Sleep better'))

// --- 32. the storage note on home: current-mode wording, cue, and a way on ---
//
// The wording is what this section is really about. "currently kept on this device
// only" scopes the sentence to the storage mode in force today, so it stays true
// rather than turning into a broken promise if anything ever syncs. A flat "is on
// this device only" is the version that would have to be retracted, and the app
// makes this claim on its busiest screen.
//
// Seeded rather than replayed, so it is independent of whatever screen the previous
// section finished on.

await seedOnboarded()
screen = await text()
check(
  '32a. the storage note scopes itself to how things are stored now',
  screen.includes('currently kept on this device only'),
  screen.replace(/\n/g, ' / ').slice(-120),
)

// The lock is decoration and has to stay that way. If it ever became the thing
// carrying the claim this fails — §17 forbids encoding meaning by colour or icon
// alone, and a privacy assurance is the last place to say something silently.
const storageNote = await evaluate(
  `(() => {
     const p = [...document.querySelectorAll('main p')]
       .find((e) => e.innerText.includes('currently kept on this device only'));
     if (!p) return null;
     const svg = p.querySelector('svg');
     const link = p.querySelector('a[href]');
     return {
       icon: Boolean(svg),
       iconHidden: svg?.getAttribute('aria-hidden') === 'true',
       iconNamed: Boolean(svg?.getAttribute('aria-label') || svg?.querySelector('title')),
       href: link ? new URL(link.href).pathname : null,
       linkText: link?.textContent.trim() ?? null,
     };
   })()`,
)
check(
  '32b. it carries a privacy icon, and the icon is decorative rather than the claim',
  storageNote?.icon === true && storageNote.iconHidden === true && storageNote.iconNamed === false,
  JSON.stringify(storageNote),
)
check(
  '32c. and it links onward to the page that explains, instead of explaining inline',
  storageNote?.href === '/data/',
  `${storageNote?.linkText} → ${storageNote?.href}`,
)

// --- 28. data protection is two levels, and readable at the first ----------
//
// The plain-language page has to stay short. The stored-data view grows without
// bound as the app is used, so putting it inside the explanation would eventually
// bury the explanation under the thing it explains.

await seedOnboarded()
await clickNav(EN.navData)
screen = await text()
check(
  '28a. the plain-language page says where the data is, in four plain sentences',
  screen.includes('stored only in this browser') &&
    screen.includes('not sent to us') &&
    screen.includes('clear your browser data') &&
    screen.includes('Another browser'),
  screen.replace(/\n/g, ' / ').slice(0, 200),
)
check(
  '28b. and it does not list the data itself — that is one level deeper',
  !screen.includes('Sleep better') && (await visible(EN.dataShow)),
  screen.includes('Sleep better') ? 'the list leaked onto the explanation' : 'explanation only',
)

await click(EN.dataShow)
await sleep(400)
screen = await text()

// Each area folds away, so this is now two claims rather than one, and both matter.
//
// Closed, the summary still has to be worth not opening: which area, which goal, and
// that there is history behind it. If folding hid *that anything is there*, the page
// would stop being the thing that makes `/data/` checkable.
check(
  '28c. a folded area still says which area, which goal, and how much is behind it',
  screen.includes(EN.storedTitle) && screen.includes('Sleep better') && screen.includes('1 entry'),
  screen.replace(/\n/g, ' / ').slice(0, 200),
)

// Native `<details>`, not a hand-rolled disclosure. `components/menu.tsx` explains
// why this project will not claim a role it has not implemented; here the element
// supplies the state, the keyboard and find-in-page, so there is nothing to claim.
const disclosures = await evaluate(
  `(() => {
     const all = [...document.querySelectorAll('main details')];
     return {
       count: all.length,
       open: all.filter((d) => d.open).length,
       withSummary: all.filter((d) => d.querySelector(':scope > summary')).length,
       headings: all.filter((d) => d.querySelector(':scope > summary h2')).length,
     };
   })()`,
)
check(
  '28c2. it is a real disclosure, and each one still carries its section heading',
  disclosures.count > 0 &&
    disclosures.count === disclosures.withSummary &&
    disclosures.count === disclosures.headings,
  JSON.stringify(disclosures),
)

// The words themselves are one interaction away, and that interaction is what the
// person's own entries live behind now. 28c used to assert them directly; asserting
// that expanding reveals them is strictly more than that, because it proves the
// disclosure works as well as that the data is there.
await clickSummary(AREAS[0].label)
screen = await text()
check(
  '28c3. and expanding one reveals the entries in the person’s own words',
  screen.includes('Walk after dinner') && screen.includes('added '),
  screen.replace(/\n/g, ' / ').slice(0, 200),
)

// Provenance, which is the other half of this section's rework. "You said / Yes" said
// nothing, because the question it answered was not on the page. And nothing may
// claim removal: the words are still here, which is exactly what append-only means.
check(
  '28c4. a review answer reads as a sentence rather than as a stored token',
  screen.includes('You wanted to change or try something here') && !/\bYou said\b/.test(screen),
  screen.includes('You wanted to change or try something here') ? 'sentence' : 'still a bare token',
)
check(
  '28c5. and the page says plainly that nothing here is removed',
  screen.includes('Nothing here is removed'),
)

// --- 33. the second way into deleting, and the back link's position ---------
//
// Two reasons to be on `/data/`: to read, or to leave. Both now have a way on, and
// both land on the same flow in the same place — there is deliberately no second
// copy of the confirmation on the explanation page.

await seedOnboarded()
await goto('/data/')
const deleteEntry = await evaluate(
  `(() => {
     const link = [...document.querySelectorAll('main a[href]')]
       .find((a) => a.textContent.trim() === 'Delete my data');
     return link ? { href: link.getAttribute('href'), tag: link.tagName } : null;
   })()`,
)
check(
  '33a. the explanation page offers deleting as its own entry point, as a link',
  deleteEntry?.tag === 'A' && String(deleteEntry.href).includes('/data/stored'),
  JSON.stringify(deleteEntry),
)
check(
  '33b. and it points into the existing flow rather than duplicating it here',
  String(deleteEntry?.href).includes('#delete') && !(await text()).includes(EN.delWarn),
  `${deleteEntry?.href}, no confirmation copy on /data/`,
)

// Following it must not arm anything. There is one confirmation now, so arriving with
// it already open would put someone a single tap from deleting everything.
await clickText('Delete my data')
await sleep(500)
screen = await text()
check(
  '33c. following it reaches the control without arming it',
  screen.includes(EN.storedTitle) && (await visible(EN.del)) && !screen.includes(EN.delWarn),
  screen.includes(EN.delWarn) ? 'the confirmation was already open' : 'control present, not armed',
)

// The foot of the delete section must not read as though deleting were the next step.
// Someone can arrive here by following "delete my data", and for a while the only
// control down here was the destructive one. Leaving is the emphasised action; deleting
// is the quiet one under it.
const deleteFoot = await evaluate(
  `(() => {
     const del = [...document.querySelectorAll('#delete button')]
       .find((b) => b.textContent.trim() === 'Delete everything');
     const back = [...document.querySelectorAll('#delete a[href]')]
       .find((a) => a.textContent.trim().includes('Back to data protection'));
     if (!del || !back) return { del: Boolean(del), back: Boolean(back) };
     return {
       del: true,
       back: true,
       backIsPrimary: back.classList.contains('btn-primary'),
       delIsQuiet: del.classList.contains('btn-quiet'),
       delIsPrimary: del.classList.contains('btn-primary'),
       // 4 === DOCUMENT_POSITION_FOLLOWING: delete comes after back.
       backFirst: Boolean(back.compareDocumentPosition(del) & 4),
       backHref: new URL(back.href).pathname,
     };
   })()`,
)
check(
  '33d2. the delete section leads with leaving, not with deleting',
  deleteFoot.backIsPrimary === true &&
    deleteFoot.delIsQuiet === true &&
    deleteFoot.delIsPrimary === false &&
    deleteFoot.backFirst === true &&
    deleteFoot.backHref === '/data/',
  JSON.stringify(deleteFoot),
)

// The back link moved to the top. On a page as long as someone's whole history, one
// at the foot is only reachable by scrolling past everything.
const backLink = await evaluate(
  `(() => {
     const link = [...document.querySelectorAll('main a[href]')]
       .find((a) => a.textContent.trim().includes('Back to data protection'));
     const h1 = document.querySelector('main h1');
     if (!link || !h1) return null;
     return {
       href: new URL(link.href).pathname,
       // 4 === DOCUMENT_POSITION_FOLLOWING: the heading comes after the link.
       beforeHeading: Boolean(link.compareDocumentPosition(h1) & 4),
       hasArrow: Boolean(link.querySelector('svg')),
     };
   })()`,
)
check(
  '33d. the back link sits before the heading, with an arrow, and is a real link',
  backLink?.beforeHeading === true && backLink.href === '/data/' && backLink.hasArrow === true,
  JSON.stringify(backLink),
)

// --- 37. an area opens from the start page, and back knows where it came from -
//
// The detail page has two ways in now. A single hard-coded parent would be wrong for
// one of them, so the origin travels in the URL — which survives a reload and cannot go
// stale, unlike remembered state.

await seedOnboarded()
const homeAreaLink = await evaluate(
  `(() => {
     // Contains, not equals: the label carries the area's emoji as well as its name.
     const link = [...document.querySelectorAll('main a[href]')]
       .find((a) => a.textContent.includes(${JSON.stringify(AREAS[0].label)}));
     if (!link) return null;
     const url = new URL(link.href);
     return {
       href: url.pathname + url.search,
       // The control must be a sibling of the row's buttons, never a wrapper around
       // them: a link containing "How is it going?" would navigate on every answer.
       wrapsControls: Boolean(link.querySelector('button')),
       // The entry's own words stay outside it, and stay inert.
       wrapsEntry: link.textContent.includes('Walk after dinner'),
     };
   })()`,
)
check(
  '37a. the area name on the start page links to that area, without wrapping its controls',
  homeAreaLink?.href === '/areas/body/?from=home' &&
    homeAreaLink.wrapsControls === false &&
    homeAreaLink.wrapsEntry === false,
  JSON.stringify(homeAreaLink),
)

// Following it must navigate and write nothing — the row holds real controls, and the
// name sitting beside them must not become a third way to change something.
const beforeAreaNav = await raw()
await clickText(AREAS[0].label)
await sleep(500)
screen = await text()
check(
  '37b. following it opens the area and changes nothing',
  screen.includes('Sleep better') && (await raw()) === beforeAreaNav,
  (await raw()) === beforeAreaNav ? 'store untouched' : 'STORE CHANGED',
)

// Arrived from the start page, so back says the start page — and goes there.
check(
  '37c. and back points at where it was opened from, not at a fixed parent',
  (await backLinkOn())?.href === '/' && screen.includes('Back to the start page'),
  JSON.stringify(await backLinkOn()),
)
await clickSelector('main a[href]')
await sleep(500)
check(
  '37d. following that back link lands on the start page',
  (await text()).includes(EN.home),
  (await text()).replace(/\n/g, ' / ').slice(0, 80),
)

// A deep link, a shared URL or a hand-typed address has no origin, and must fall back
// to the parent route rather than to a dead end or to leaving the app.
await goto('/areas/body/')
check(
  '37e. without an origin it falls back to the life-areas list',
  (await backLinkOn())?.href === '/areas/' && (await text()).includes('Back to your life areas'),
  JSON.stringify(await backLinkOn()),
)

// An unrecognised origin is the same case as none. It must not be trusted into a
// nonsense destination.
await goto('/areas/body/?from=nowhere')
check(
  '37f. and an unrecognised origin falls back the same way',
  (await backLinkOn())?.href === '/areas/',
  JSON.stringify(await backLinkOn()),
)

// --- 34. the areas list has a hierarchy rather than flat rows --------------
//
// The area name used to be `text-sm text-muted` while the goal was full-size ink, so
// the row's own subject was the quietest thing in it. Measured rather than eyeballed:
// the name has to be larger than the goal, and the goal must stay ink — muting the
// person's own words to make room for a label the app chose would be the wrong fix.

await goto('/areas/')
const rowType = await evaluate(
  `(() => {
     const row = [...document.querySelectorAll('main a.option')]
       .find((a) => a.textContent.includes(${JSON.stringify(AREAS[0].label)}));
     if (!row) return null;
     const name = [...row.querySelectorAll('p, span')]
       .find((e) => e.textContent.trim().endsWith(${JSON.stringify(AREAS[0].label)}));
     // The goal's own line now: named, numbered where it helps, and ending in what is
     // under it.
     const count = [...row.querySelectorAll('span')]
     // A character class, not an escape: this lives inside a template literal, which
     // eats the backslash before the regex is ever parsed.
       .find((e) => /next steps?[)]$/.test(e.textContent.trim()));
     if (!name || !count) return null;
     const px = (el) => parseFloat(getComputedStyle(el).fontSize);
     return {
       name: px(name),
       count: px(count),
       countText: count.textContent.trim(),
       nameWeight: getComputedStyle(name).fontWeight,
     };
   })()`,
)
check(
  '34a. the area name is larger than the line beneath it',
  rowType !== null && rowType.name > rowType.count,
  rowType
    ? `name ${rowType.name}px / count ${rowType.count}px "${rowType.countText}"`
    : 'row not found',
)
check(
  /**
   * **Replaced rather than deleted**, because the rule it asserted was reversed.
   *
   * It used to hold that the goal on this page stays the person's words in full ink —
   * muting them to make room for a label the app chose would have been the wrong trade.
   * That defended a goal this page no longer prints: a row now says which area and how
   * many goals, and the sentences someone wrote live behind it. Which also keeps six
   * areas of somebody's ambitions off one screen, where a glance reads all of them.
   *
   * So it inverts: the words must be **absent** here and the count present. Deleting it
   * would have left nothing saying this page is an index on purpose.
   */
  /**
   * **Inverted back**, and the reason is worth keeping.
   *
   * This page counted goals for a while — "2 Ziele angegeben" — which kept someone's
   * sentences off a screen showing six areas at once. It also meant the only way to learn
   * what you had written was to open every area in turn, so the page could not do the job
   * it exists for. Naming them costs the privacy of a glance and buys that back.
   */
  '34b. and it names each goal with what is under it, rather than counting them',
  rowType !== null &&
    rowType.countText.includes('Sleep better') &&
    /[(][0-9]+ next steps?[)]$/.test(rowType.countText),
  `"${rowType?.countText}"`,
)

// --- 35. every nested page has the same way back ----------------------------
//
// One pattern, not two. `BackLink` is shared, so the assertion worth making is that
// both nested routes actually use it and that they render identically — a second
// hand-rolled copy would look right and drift on the next change.
//
// It goes to an explicit parent route rather than to `history.back()`, which is a
// different question: arriving at an area from the start page and pressing this
// should still offer the life areas.

await seedOnboarded()
await goto('/areas/body/')
const areaBack = await backLinkOn()
check(
  '35a. an area page offers a way back to the areas list, above its own heading',
  areaBack?.tag === 'A' &&
    areaBack.href === '/areas/' &&
    areaBack.hasArrow === true &&
    areaBack.beforeHeading === true,
  JSON.stringify(areaBack),
)

// Reachable by Tab, and painting a real focus ring when it gets there. `tabTo` presses
// keys for real, because `:focus-visible` is a judgement about how focus arrived.
await tabTo('main a[href]')
const backFocus = await evaluate(
  `(() => {
     const el = document.activeElement;
     const style = getComputedStyle(el);
     return {
       text: el?.textContent?.trim() ?? null,
       matches: el?.matches(':focus-visible') ?? false,
       width: style.outlineWidth,
     };
   })()`,
)
check(
  '35b. and it is reachable by keyboard with a visible focus ring',
  backFocus.matches === true && backFocus.width !== '0px',
  JSON.stringify(backFocus),
)

// Following it writes nothing. It is navigation, and a nested page's way out must
// never be a control that also decides something.
const beforeBack = await raw()
await clickSelector('main a[href]')
await sleep(500)
check(
  '35c. following it reaches the parent and changes nothing',
  (await text()).includes(EN.picker) && (await raw()) === beforeBack,
  (await raw()) === beforeBack ? 'store untouched' : 'STORE CHANGED',
)

// The three question views that had no way out at all. Opening one by mistake used to
// leave only the browser's back button; the page-level link now covers all of them.
await goto(`/areas/${AREAS[0].id}/`)
await click(EN.goalAdd)
screen = await text()
check(
  '35d. even the question views have it — they had no way out before',
  screen.includes(EN.goalNewQuestion) &&
    (await visible('Back to your life areas')) &&
    (await raw()) === beforeBack,
  screen.includes(EN.goalNewQuestion) ? 'present on the goal question' : 'wrong view',
)

// Both nested pages, drawn the same. Consistency is the requirement, so it is measured
// rather than assumed from a shared import.
await goto('/data/stored/')
const dataBack = await backLinkOn()
check(
  '35e. the two nested pages render the same back link, not two lookalikes',
  dataBack?.fontSize === areaBack.fontSize &&
    dataBack.colour === areaBack.colour &&
    dataBack.hasArrow === areaBack.hasArrow &&
    dataBack.beforeHeading === areaBack.beforeHeading,
  `areas: ${areaBack.fontSize}/${areaBack.colour} — data: ${dataBack?.fontSize}/${dataBack?.colour}`,
)

// --- 36. the storage settings say what is stored, and offer only one thing -----
//
// This section has been rewritten twice, and both times the product got smaller.
//
// It first drove a "Change storage settings" button opening a panel with a single
// full-width `.option` in it — a control that read as an empty text field, because
// `.option` and `.field` are the same rule in every property that draws a box. That
// became two switches. Then the "Save on this device" switch went too: turning it off
// deleted what was stored, which is the same act as "Delete my data" further down the
// page, and the switch was the one that did it without saying so. §8 covers the path
// that spells out the consequence.
//
// **36c stays inverted** from the check that once asserted no switch could exist here.
// Removing a check that says "do not do this" is how a codebase forgets it ever decided.

/** A switch by its label: what it says, and whether it can be operated. */
const switchState = (label) =>
  evaluate(
    `(() => {
       const row = [...document.querySelectorAll('main [role="switch"]')]
         .find((el) => el.textContent.includes(${JSON.stringify(label)}));
       if (!row) return null;
       return {
         checked: row.getAttribute('aria-checked'),
         disabled: row.disabled === true,
         says: row.textContent.replace(/\s+/g, ' ').trim(),
       };
     })()`,
  )

await setViewport(1200, 800)
await seedOnboarded()
await goto('/data/')
const cloudOff = await switchState(EN.storageOptionCloud)
check(
  '36a. cloud sync is present, off, and says why it cannot be turned on',
  cloudOff?.checked === 'false' &&
    // Not operable yet, and the page says so rather than leaving a dead control.
    cloudOff.disabled === true &&
    cloudOff.says.includes('OFF') &&
    (await text()).includes(EN.cloudDevOnly),
  JSON.stringify(cloudOff),
)

check(
  '36b. and it is the only setting here — saving is not offered twice',
  // Someone already saving has nothing to switch: stopping happens through the control
  // that names the consequence, and there is no second path to the same outcome.
  (await count('main [role="switch"]')) === 1 &&
    !(await visible(EN.storageOptionLocal)) &&
    // The deletion path is on this page, one weight down, as a link onward.
    (await visible(EN.dataDelete)),
  `${await count('main [role="switch"]')} switch(es)`,
)

check(
  '36c. the setting is a switch — the reversal of the check that once forbade one',
  (await count('main [role="switch"]')) === 1 &&
    // Still not a checkbox: `role="switch"` says "on or off right now", a checkbox says
    // "included when you submit", and there is nothing here to submit.
    (await count('main input[type="checkbox"]')) === 0,
  `${await count('main [role="switch"]')} switches, ${await count('main input[type="checkbox"]')} checkboxes`,
)

// Nothing is written by looking at the page.
const beforeLook = await raw()
await goto('/data/')
check(
  '36d. reading the page changes nothing at all',
  (await raw()) === beforeLook,
  (await raw()) === beforeLook ? 'store untouched' : 'STORE CHANGED',
)

// The one thing offered in that direction, and only to someone who is not saving: a way
// to change your mind after declining. §39 walks it with a concern in the store.
await clearStorage()
await goto('/')
await click(EN.no)
await click(EN.cont)
await click(EN.contYes)
await goto('/data/')
check(
  '36e. after declining, opting in is offered — as a one-way action, not a switch',
  (await visible(EN.storageOptionLocal)) &&
    // A button, because it goes one way. A toggle that can only be flipped on is a
    // control lying about itself.
    (await count('main [role="switch"]')) === 1 &&
    (await keys()).length === 0,
  `${(await keys()).length} key(s) before opting in`,
)

await click(EN.storageOptionLocal)
check(
  '36f. taking it records consent, and says so',
  (await keys()).length === 1 &&
    JSON.parse(await raw()).consentAt !== null &&
    (await text()).includes(EN.storageOnDone),
  `${(await keys()).length} key(s)`,
)
check(
  '36g. and then it is gone — there is nothing left to offer',
  !(await visible(EN.storageOptionLocal)),
  'offer withdrawn',
)

// --- 30. no internal id reaches any screen, seen or spoken -----------------
//
// 7f does this for one page. The rework added four more surfaces where a step's own
// words sit next to its id, and moved those words into accessible names, which
// `innerText` cannot see at all.

for (const route of ['/', '/areas/', '/areas/body/', '/areas/mind/', '/data/', '/data/stored/']) {
  await goto(route)
  // Everything folded has to be unfolded first, or this sweep silently stops looking
  // at it: `innerText` cannot see inside a closed `<details>`, so the areas on
  // `/data/stored/` — the very surface where a step's id sits next to its words —
  // would pass by being invisible rather than by being clean.
  const unfolded = await evaluate(
    `(() => {
       const all = [...document.querySelectorAll('details:not([open])')];
       all.forEach((d) => { d.open = true; });
       return all.length;
     })()`,
  )
  await sleep(150)
  const spoken = await ariaLabels()
  const seen = await text()
  check(
    `30. no id reaches ${route} — not on screen, not in an accessible name`,
    !UUID.test([seen, ...spoken].join(' ')),
    UUID.exec([seen, ...spoken].join(' '))?.[0] ??
      `clean (${spoken.length} names, ${unfolded} section(s) unfolded first)`,
  )
}

// --- 11. the header at phone width — the wrap this change exists to fix ----
//
// Split in two, because the interesting case is the one with the nav present. With
// an empty store the header holds only the wordmark, the language switch and the
// theme toggle, so it **cannot** wrap — and a check that cannot fail is not a check.
// 11b is the one carrying the original guarantee.

await clearStorage()
await setViewport(390)
await goto('/')
check(
  '11a. the header stays on one row at 390px during the introduction',
  (await headerRows()) === 1,
  `${await headerRows()} row(s)`,
)

await seedOnboarded()
check(
  '11b. and with the nav present, which is the case that can actually wrap',
  (await headerRows()) === 1 && (await shown(MENU)),
  `${await headerRows()} row(s), menu trigger shown ${await shown(MENU)}`,
)

// Paired with a positive, because "not visible" and "does not exist" are the same
// thing to `__visible`, and the collapse is only being tested if the links are
// actually there to collapse. Without the count this passes just as happily when the
// header has been broken and renders no nav at all.
//
// Scoped to the header, which is the region the claim is about. Document-wide it also
// answered for the rest of the page, so the storage note on home linking to "Data
// protection" read as the header failing to collapse — a false failure about a link
// that is nowhere near the bar.
check(
  '12a. the nav links exist but are not in the bar at 390px',
  !(await visibleIn('header', EN.navData)) &&
    !(await visibleIn('header', EN.navAreas)) &&
    (await count('header nav a')) === 3,
  `${await count('header nav a')} link(s) in the DOM, none of them laid out in the header`,
)
await chooseIn('Menu', EN.navData)
await sleep(500)
check(
  '12b. the collapsed menu still navigates',
  (await text()).includes(EN.dataShow),
  (await text()).replace(/\n/g, ' / ').slice(0, 80),
)

// About left the header for the footer, where it is reachable at both widths and —
// unlike the nav — during the introduction too. Asserted from both sides, because
// the failure worth catching is it appearing in *both* places.
const footerLinks = await evaluate(
  `[...document.querySelectorAll('footer a[href]')].map((a) => a.textContent.trim())`,
)
check(
  '12c. About is in the footer, and only there',
  footerLinks.includes('About') && !(await navLinks()).some((link) => link.text === 'About'),
  `footer: [${footerLinks.join(', ')}], nav: [${(await navLinks()).map((l) => l.text).join(', ')}]`,
)

await setViewport(1200, 800)
await seedOnboarded()
check(
  '13. the links sit inline at desktop width, with the collapsed trigger hidden',
  (await visible(EN.navData)) &&
    (await visible(EN.navAreas)) &&
    // By selector, not by text. `!visible('Menu')` was true on every screen the app
    // has ever had, because the trigger is a hamburger with no text in it.
    !(await shown(MENU)),
  `menu trigger shown: ${await shown(MENU)}`,
)

// --- 20. the centred column does not move between routes ------------------

/**
 * The reported "slight layout shift when switching nav items". `/about` is tall
 * enough to scroll and `/` and `/you` (empty here) are not, so a classic
 * scrollbar used to appear on one page and not the others — and since every page
 * centres its column with `mx-auto`, the whole layout slid sideways. Measured
 * before `scrollbar-gutter: stable`: 264 on `/`, 256.5 on the other two.
 */
// Deliberately on an **empty** store, which is what makes 20b's premise hold: `/` is
// the consent screen and short enough not to scroll. Seeding it would fill the home
// screen with rows, and 20b would start failing for a reason that has nothing to do
// with the scrollbar gutter.
await clearStorage()
const columnX = {}
for (const route of ['/', '/areas/', '/areas/body/', '/areas/mind/', '/data/', '/data/stored/', '/about/']) {
  await goto(route)
  columnX[route] = await mainX()
}
const columnPositions = [...new Set(Object.values(columnX))]
check(
  '20a. the centred column starts at the same x on every route',
  columnPositions.length === 1,
  Object.entries(columnX)
    .map(([route, x]) => `${route}=${x}`)
    .join(' '),
)
// Guards the mechanism as well as the symptom: a future `overflow: hidden`
// somewhere would also equalise the numbers, and hide the bug rather than fix it.
const scrollHeights = {}
for (const route of ['/', '/about/']) {
  await goto(route)
  scrollHeights[route] = await evaluate(
    '[document.documentElement.scrollHeight > document.documentElement.clientHeight,' +
      ' getComputedStyle(document.documentElement).scrollbarGutter]',
  )
}
check(
  '20b. and they still differ in height — the gutter is reserved, not the overflow removed',
  scrollHeights['/'][0] === false &&
    scrollHeights['/about/'][0] === true &&
    scrollHeights['/'][1] === 'stable',
  JSON.stringify(scrollHeights),
)

// --- 21. marking the current page costs no layout -------------------------

// Needs the nav, so it needs a finished introduction.
await seedOnboarded()
await goto('/about/')
const inactiveData = await navBox(EN.navData)
await goto('/data/')
const activeData = await navBox(EN.navData)
check(
  '21a. the active nav link occupies exactly the same box as the inactive one',
  inactiveData.w === activeData.w &&
    inactiveData.h === activeData.h &&
    inactiveData.weight === activeData.weight &&
    inactiveData.borderBottom === activeData.borderBottom &&
    inactiveData.pad === activeData.pad,
  `${JSON.stringify(inactiveData)} vs ${JSON.stringify(activeData)}`,
)
check(
  '21b. and it is actually marked, for the accessibility tree too',
  activeData.current === 'page' && inactiveData.current === null,
  `on /you/: ${activeData.current}, on /about/: ${inactiveData.current}`,
)

// A section, not a page. `/areas` has children, and an exact match would drop its
// underline the moment an area is opened — the nav would claim you were nowhere.
// Three states, because two would leave the child case untested, which is exactly how
// a nav that never marks its deep routes ships unnoticed.
await goto('/areas/')
const onList = (await navLinks()).find((l) => l.text === 'Life areas')
await goto('/areas/body/')
const onArea = (await navLinks()).find((l) => l.text === 'Life areas')
await goto('/about/')
const offAreas = (await navLinks()).find((l) => l.text === 'Life areas')
check(
  '21c. Life areas stays marked inside an area, and only inside that section',
  onList.current === 'page' && onArea.current === 'page' && offAreas.current === null,
  `/areas/: ${onList.current}, /areas/body/: ${onArea.current}, /about/: ${offAreas.current}`,
)

// --- 22. a theme change is instant, never animated ------------------------

/**
 * The reported flash. Before the fix, `.btn-primary` interpolated across the
 * token inversion and spent a frame at rgb(141,139,135) on rgb(133,133,133) —
 * an unreadable label — while the focus ring on the just-pressed toggle swept
 * from near-ink to near-paper.
 */
await goto('/')
const switched = await watchThemeSwitch()
const whileSwitching = switched.seen.filter((s) => s.switching)
check(
  '22a. transitions are suppressed for the frame that carries the new palette',
  whileSwitching.length > 0 && whileSwitching.every((s) => s.duration === '0s'),
  JSON.stringify(switched.seen),
)
check(
  '22b. and the suppression is removed again, leaving transitions working',
  switched.stillSwitching === false &&
    switched.theme !== null &&
    switched.seen.some((s) => !s.switching && s.duration !== '0s'),
  `theme=${switched.theme} stillSwitching=${switched.stillSwitching}`,
)

// --- 23. the focus ring is still there -----------------------------------

// The guard against "fixing" the flash by deleting focus indication. §17
// requires visible focus states; nothing above may have weakened one.
await goto('/')
const TOGGLE = 'button[aria-label^="Switch to"]'
const presses = await tabTo(TOGGLE)
const ring = await activeRing()
check(
  '23a. the theme toggle is reachable by Tab alone',
  presses > 0,
  presses ? `${presses} press(es)` : 'never reached',
)
check(
  '23b. and keyboard focus still paints a visible ring on it',
  ring.focusVisible === true && parseFloat(ring.width) > 0 && ring.style !== 'none',
  JSON.stringify(ring),
)

// Back to where section 14 expects to be: `/` at 1200px, nothing stored, no
// explicit theme — 15a asserts exactly that.
await clearStorage()
await goto('/')

// --- 14. the language dropdown --------------------------------------------

const langTrigger = () =>
  evaluate(
    `(document.querySelector('button[aria-label="Language"], button[aria-label="Sprache"]') || {}).textContent`,
  )
check('14a. the trigger shows the current language as a code', (await langTrigger()).trim() === 'EN')
await chooseIn('Language', 'Deutsch')
check(
  '14b. choosing from the dropdown switches the language and the trigger',
  (await langTrigger()).trim() === 'DE' && (await text()).includes('Ist das okay für dich?'),
)
await chooseIn('Sprache', 'English')

// --- 15. the theme toggle -------------------------------------------------

await click(EN.yes) // consent, so a choice has somewhere to live
const lightBackground = await background()
check('15a. no data-theme while the OS decides', (await dataTheme()) === null)

await clickAria('Switch to Dark')
const darkBackground = await background()
check(
  '15b. toggling sets data-theme and actually repaints',
  (await dataTheme()) === 'dark' && darkBackground !== lightBackground,
  `${lightBackground} → ${darkBackground}`,
)
check('15c. the choice is in the store', JSON.parse(await raw()).theme === 'dark')

await clickAria('Switch to Light')
check(
  '15d. toggling back returns to light',
  (await dataTheme()) === 'light' && (await background()) === lightBackground,
)
await clickAria('Switch to Dark')

// --- 16. no flash of the wrong theme on reload ----------------------------

await goto('/')
const paintedBackgrounds = await evaluate('window.__bgFrames || []')
const lightFrames = paintedBackgrounds.filter((bg) => bg === lightBackground)
const darkFrames = paintedBackgrounds.filter((bg) => bg === darkBackground)
check(
  '16. a stored dark theme is applied before the first paint, on a light OS',
  // Three clauses, and the last two are what stop this passing vacuously. The
  // original had only the first: with no sampled frames at all, `lightFrames` is
  // empty and "no light frame was painted" is trivially true. Requiring frames,
  // and requiring that dark ones are among them, means the absence of light frames
  // is a fact about the paint rather than about the sampler.
  lightFrames.length === 0 &&
    paintedBackgrounds.length >= 10 &&
    darkFrames.length > 0 &&
    (await dataTheme()) === 'dark',
  lightFrames.length
    ? `${lightFrames.length} light frame(s) of ${paintedBackgrounds.length}`
    : `${paintedBackgrounds.length} frames sampled, ${darkFrames.length} dark, none light`,
)

// --- 17. the theme is consent-gated, like everything else -----------------

await clearStorage()
await goto('/')
await click(EN.no)
await click(EN.cont)
await click(EN.contYes)
await clickAria('Switch to Dark')
check('17a. the theme still applies in memory mode', (await dataTheme()) === 'dark')
check(
  '17b. but nothing was written — still no key at all',
  (await keys()).length === 0,
  JSON.stringify(await keys()),
)

// --- 18. a store written before the theme existed still loads -------------

await evaluate(`localStorage.setItem(${JSON.stringify(STORAGE_KEY)}, JSON.stringify({
  version: 1,
  consentAt: '2026-01-01T00:00:00.000Z',
  locale: 'en',
  facts: [{ id: 'a', key: 'preferred_name', value: 'Ada', source: 'onboarding', learnedAt: '2026-01-01T00:00:00.000Z' }],
}))`)
await goto('/')
screen = await text()
check(
  '18a. a v1 store with no theme field loads and follows the OS',
  // Past the consent question, so `parse()` accepted the store rather than
  // rejecting it and starting over — which is the whole point of `theme` being
  // optional instead of a version bump.
  !screen.includes(EN.consent) && screen.includes(EN.intro) && (await dataTheme()) === null,
  screen.replace(/\n/g, ' / ').slice(0, 100),
)
// The app no longer asks for a name, but a name someone already gave is still
// theirs and still shown. Parked, not discarded.
await goto('/data/stored/')
check('18b. and a parked answer inside it still shows on /you', (await text()).includes('Ada'))

// --- 40. a store that finished the introduction before we wrote it down ----
//
// The regression guard for adding a life area, and the reason `introduction_done`
// exists. `introductionFinished()` used to be "every area has a review answer",
// which is monotonic in the *answers* but not in the *question set* — so a sixth
// area made it false for every store that already existed.
//
// What that costs is not one extra screen. `app/page.tsx` stops rendering what
// someone is working on and shows a review question instead, and
// `components/page-shell.tsx` withdraws the navigation from every page — including
// `/data/`, which is where the app explains what it holds and offers to delete it.
// Then it self-heals after one answer, so it would have read as a cosmetic glitch.
//
// This is asserted on its own fixture rather than `seedOnboarded()`, which now
// writes the fact and so could only ever prove the easy half.

await seedLegacyOnboarded()
screen = await text()
check(
  '40a. a store from before the fact still counts as past the introduction',
  screen.includes(EN.home) &&
    screen.includes('Walk after dinner') &&
    !screen.includes(EN.review) &&
    !screen.includes(EN.intro),
  screen.replace(/\n/g, ' / ').slice(0, 140),
)
// By name, not by count: three links that all say the same thing would satisfy a
// count, and the one that has to be there is the route to the data itself.
const legacyNav = await navLinks()
check(
  '40b. and it keeps the whole navigation, including the way to its own data',
  legacyNav.length === 3 &&
    [EN.navHome, EN.navAreas, EN.navData].every((label) =>
      legacyNav.some((link) => link.text === label),
    ),
  legacyNav.map((link) => `${link.text} -> ${link.href}`).join(' / '),
)
// Nothing was written to reach that conclusion: the fallback is a read. A store that
// silently gained a fact on load would be a write outside the consent gate's intent,
// and it would also make this fixture untestable a second time.
check(
  '40c. reaching that conclusion wrote nothing — the fallback is a read',
  JSON.parse(await raw()).facts.every((f) => f.key !== 'introduction_done'),
  JSON.parse(await raw()).facts.map((f) => f.key).join(' '),
)

// --- 41. goals with ids, and entries that belong to one --------------------
//
// Nothing in the interface writes this shape yet — `setGoal` still writes the legacy
// key, deliberately, so the migration and the UI move one at a time. That makes these
// checks the *only* thing standing behind the new read path until the multi-goal
// screens land, so they are seeded rather than walked.
//
// The area holds both shapes at once on purpose: that is what a real store looks like
// the moment after someone who has used the app for months opens a newer build.

const G1 = 'cccccccc-3333-4333-8333-cccccccccccc'
const G2 = 'dddddddd-4444-4444-8444-dddddddddddd'
const S1 = 'eeeeeeee-5555-4555-8555-eeeeeeeeeeee'
const S2 = 'ffffffff-6666-4666-8666-ffffffffffff'
const S3 = 'aaaaaaaa-7777-4777-8777-aaaaaaaaaaaa'
const S4 = 'bbbbbbbb-8888-4888-8888-bbbbbbbbbbbb'

async function seedGoals({ legacyDone = false } = {}) {
  const at = '2026-02-01T00:00:00.000Z'
  const fact = (id, key, value) => ({ id, key, value, source: 'goals', learnedAt: at })
  const facts = [
    ...AREAS.map(({ id }, i) => fact(`g-review-${i}`, `area.${id}.review`, 'yes')),
    fact('g-intro', 'introduction_done', 'yes'),

    // The old shape: one goal at the bare key, and an entry with no link at all.
    fact('g-legacy-goal', `area.${AREAS[0].id}.goal`, 'Sleep better'),
    fact('g-legacy-text', `area.${AREAS[0].id}.step.${S1}.text`, 'Walk after dinner'),
    fact('g-legacy-active', `area.${AREAS[0].id}.step_active`, S1),
    ...(legacyDone ? [fact('g-legacy-state', `area.${AREAS[0].id}.goal.legacy.state`, 'done')] : []),

    // The new shape: two goals, one reached, one carrying a reason and put first.
    fact('g1-text', `area.${AREAS[3].id}.goal.${G1}.text`, 'Finish the portfolio'),
    fact('g1-why', `area.${AREAS[3].id}.goal.${G1}.why`, 'It has been open for years'),
    fact('g2-text', `area.${AREAS[3].id}.goal.${G2}.text`, 'Learn Rust'),
    fact('g2-state', `area.${AREAS[3].id}.goal.${G2}.state`, 'done'),
    fact('g-priority', `area.${AREAS[3].id}.goal_priority`, G1),
    fact('s1-text', `area.${AREAS[3].id}.step.${S2}.text`, 'Pick the three best pieces'),
    fact('s1-goal', `area.${AREAS[3].id}.step.${S2}.goal`, G1),
    fact('s1-active', `area.${AREAS[3].id}.step_active`, S2),
    // The controlled pair for 41b: both open, neither active, differing in exactly
    // one thing — whether the goal each serves has been reached.
    fact('s2-text', `area.${AREAS[3].id}.step.${S3}.text`, 'Write the case study'),
    fact('s2-goal', `area.${AREAS[3].id}.step.${S3}.goal`, G1),
    fact('s3-text', `area.${AREAS[3].id}.step.${S4}.text`, 'Read the Rust book'),
    fact('s3-goal', `area.${AREAS[3].id}.step.${S4}.goal`, G2),
  ]
  const store = { version: 1, consentAt: at, locale: 'en', facts }
  await goto('/')
  await evaluate(
    `localStorage.setItem(${JSON.stringify(STORAGE_KEY)}, ${JSON.stringify(JSON.stringify(store))})`,
  )
  await goto('/')
}

await seedGoals()
screen = await text()
check(
  '41a. an entry whose goal is still standing is on the start page',
  screen.includes('Pick the three best pieces') && screen.includes('Walk after dinner'),
  screen.replace(/\n/g, ' / ').slice(0, 160),
)

await goto(`/areas/${AREAS[3].id}/`)
const areaScreen = await text()
check(
  '41b. a prepared entry follows its goal out of the open set, with no fact of its own',
  // Home only ever shows the *active* entry per area, so a non-active one could not
  // appear there whatever its goal — asserting its absence on the start page would
  // have proved nothing. Both of these are open and neither is active; they differ
  // in exactly one thing, which is whether the goal each serves has been reached.
  areaScreen.includes('Write the case study') && !areaScreen.includes('Read the Rust book'),
  areaScreen.replace(/\n/g, ' / ').slice(0, 200),
)
/**
 * The pointer, not merely the newest goal: `Learn Rust` is newer and reached, and
 * surfacing it would mean the priority key was being ignored.
 *
 * Moved from `/areas/` to the area's own page, because the list stopped printing goals
 * (34b) and an assertion about *which* goal it shows had nothing left to read. This is
 * the surface where the pointer is now visible, and the case is unchanged: one active
 * goal reached, one still standing, and only one of them may appear.
 */
await goto(`/areas/${AREAS[3].id}/`)
screen = await text()
check(
  '41c. the area page shows the goal put first, and a reached one not at all',
  screen.includes('Finish the portfolio') &&
    !screen.includes('Learn Rust') &&
    // One active goal left, so the label carries no number.
    screen.includes(EN.goalOnly),
  screen.replace(NL, ' / ').slice(0, 200),
)

await goto('/data/stored/')
await expandAll()
screen = await text()
check(
  '41d. everything stored about a goal is shown: its reason, and where it stands',
  screen.includes('It has been open for years') &&
    screen.includes('first for now') &&
    screen.includes('reached') &&
    // The reached goal is kept and shown, not hidden along with its entry.
    screen.includes('Learn Rust'),
  screen.replace(/\n/g, ' / ').slice(0, 260),
)
check(
  '41e. and no goal id reaches the page, seen or spoken',
  !UUID.test(screen) && !(await ariaLabels()).some((label) => UUID.test(label)),
  (screen.match(UUID) ?? []).join(' '),
)

// The legacy attribution, proved by consequence rather than asserted directly: the
// entry has no `.goal` fact at all, so the only thing that can carry it out of the
// open set is being attributed to the legacy goal that was just reached.
await seedGoals({ legacyDone: true })
screen = await text()
check(
  '41f. an entry with no stored link belongs to the legacy goal, and follows it',
  !screen.includes('Walk after dinner') && screen.includes('Pick the three best pieces'),
  screen.replace(/\n/g, ' / ').slice(0, 160),
)

// Closing a goal that *does* have things being tried for it. On a seeded store
// rather than the walked one, because closing a goal takes its entries with it and
// the walked store has only one active entry left by this point.
await seedGoals()
await goto(`/areas/${AREAS[3].id}/`)
/**
 * Closing a goal that *does* have things being tried for it.
 *
 * The two ways of closing one now sit in different places, and this asserts the one that
 * looks destructive: **removing** asks first, in place, and writes nothing until answered.
 * The old flow put a sentence about what would go with it on a screen of its own; that
 * screen is gone, and what replaced the sentence is that nothing happens until you say so
 * — which 41h then measures for real.
 *
 * "I have reached this" stays immediate, inside inline editing. It is not the same act:
 * the record keeps `done` apart from `retired`, and nothing is destroyed either way —
 * entries leave the *open* set by derivation, not by a cascade.
 */
await clickAria('Remove goal: Finish the portfolio')
screen = await text()
const beforeClose = JSON.parse(await raw())
check(
  '41g. removing a goal with things being tried asks first, and writes nothing yet',
  screen.includes(EN.confirmDelete) &&
    (await visible(EN.confirmNo)) &&
    beforeClose.facts.length === JSON.parse(await raw()).facts.length,
  screen.replace(NL, ' / ').slice(0, 160),
)

await click(EN.confirmYes)
screen = await text()
const afterClose = JSON.parse(await raw())
const retiredEntries = (store) =>
  store.facts.filter((f) => /\.step\.[^.]+\.state$/.test(f.key) && f.value === 'retired').length
check(
  '41h. confirming takes them out of the list with one fact, and deletes nothing',
  !screen.includes('Pick the three best pieces') &&
    !screen.includes('Write the case study') &&
    // Exactly one: the goal's own state. The entries keep theirs — the cascade is a
    // derivation, which is why nothing had to be written on their behalf.
    afterClose.facts.length === beforeClose.facts.length + 1 &&
    retiredEntries(afterClose) === retiredEntries(beforeClose) &&
    // Still stored, still their own words, exactly as the copy promised.
    afterClose.facts.some((f) => f.value === 'Pick the three best pieces'),
  `${afterClose.facts.length} facts vs ${beforeClose.facts.length}, retired ${retiredEntries(beforeClose)} → ${retiredEntries(afterClose)}`,
)

const whyIn = (fact, area) => new RegExp(`^area\.${area}\.goal\.[^.]+\.why$`).test(fact.key)

/**
 * The optional reason is **parked**: there is no longer any way to write one, and every
 * reason already written still shows.
 *
 * Writing it was a fifth peer on the screen someone opens to rename a goal, which is
 * the weight it should never have had. Removing the flow is only safe if the read path
 * survives it, so that is what these assert — the same shape as the parked name
 * question, and the reason `setGoalWhy` went rather than sitting uncalled.
 *
 * `seedGoals()` writes a `why` on a goal in `AREAS[3]`, so the fixture is a store from
 * before the change: exactly the case that must not lose anything.
 */
await seedGoals()
await goto(`/areas/${AREAS[3].id}/`)
screen = await text()
check(
  '41i. a reason written before still shows under the goal it belongs to',
  screen.includes('It has been open for years') && screen.includes('Finish the portfolio'),
  screen.replace(NL, ' / ').slice(0, 160),
)

// And on the page whose whole job is to show everything the app holds.
await goto('/data/stored/')
await expandAll()
check(
  '41j. and on /you, so nothing anyone wrote became unreachable',
  (await text()).includes('It has been open for years'),
  'reason present',
)

// The other half: opening that goal offers no way to write one, so the flow really is
// gone rather than merely moved. Asserted against the goal that has a reason, because
// "no invitation" is easiest to get wrong where one already exists.
await goto(`/areas/${AREAS[3].id}/`)
await clickAria('Change this goal: Finish the portfolio')
screen = await text()
const whyFacts = JSON.parse(await raw()).facts.filter((f) => whyIn(f, AREAS[3].id)).length
// Inline editing puts the goal's words in a form control, and `innerText` cannot see a
// value — so the goal is read from the field rather than from the page.
const editingValue = await evaluate(
  `(() => { const f = document.querySelector('main input, main textarea'); return f ? f.value : null })()`,
)
check(
  '41k. and editing it offers no way to write one — the field is the screen now',
  !screen.includes('why this matters') &&
    !screen.includes('What would you like to change?') &&
    editingValue === 'Finish the portfolio' &&
    // Nothing was written by looking, which is the point of a read path.
    whyFacts === 1,
  `${screen.replace(NL, ' / ').slice(0, 110)} — ${whyFacts} why fact(s)`,
)

// --- 42. pinning, the skippable goal, and the pointer that became a pin ---------
//
// Pinning replaced a single "the one being worked on" pointer per area. Several
// entries can be pinned, it is never asked for, and it orders the start page without
// ranking anything. An existing pointer is read as a pin, which is what keeps a store
// written before any of this from losing what it said.

const PIN_STEP = 'cafe0001-1111-4111-8111-cafe00011111'
const PIN_OTHER = 'cafe0002-2222-4222-8222-cafe00022222'

/** A store with two open entries and, optionally, the retired pointer at one of them. */
async function seedPins({ legacyPointer = false } = {}) {
  const at = '2026-03-01T00:00:00.000Z'
  const fact = (id, key, value) => ({ id, key, value, source: 'goals', learnedAt: at })
  const facts = [
    ...AREAS.map(({ id }, i) => fact(`p-review-${i}`, `area.${id}.review`, 'yes')),
    fact('p-intro', 'introduction_done', 'yes'),
    fact('p-goal', `area.${AREAS[0].id}.goal`, 'Sleep better'),
    fact('p-t1', `area.${AREAS[0].id}.step.${PIN_STEP}.text`, 'Walk after dinner'),
    fact('p-t2', `area.${AREAS[0].id}.step.${PIN_OTHER}.text`, 'Read before bed'),
    ...(legacyPointer
      ? [fact('p-legacy', `area.${AREAS[0].id}.step_active`, PIN_STEP)]
      : []),
  ]
  const store = { version: 1, consentAt: at, locale: 'en', facts }
  await goto('/')
  await evaluate(
    `localStorage.setItem(${JSON.stringify(STORAGE_KEY)}, ${JSON.stringify(JSON.stringify(store))})`,
  )
  await goto('/')
}

await seedPins()
screen = await text()
check(
  '42a. with nothing pinned there is one plain list and no labels over it',
  screen.includes('Walk after dinner') &&
    screen.includes('Read before bed') &&
    !screen.includes(EN.pinnedLabel),
  screen.replace(NL, ' / ').slice(0, 160),
)

// Pinning is one fact, and it is the *entry* that carries it — not a pointer the area
// holds, which is what could only ever name one thing.
const beforePin = JSON.parse(await raw()).facts.length
await clickAria('Pin: Read before bed')
screen = await text()
const afterPin = JSON.parse(await raw())
const order = await evaluate(
  `[...document.querySelectorAll('main li')].map((li) => li.textContent.trim().slice(0, 30))`,
)
check(
  // The headings are gone: a filled star against an outlined one already says which
  // group a row is in, and "Everything else" labelled a group by what it is not. So the
  // claim is the *order*, which is what mattered all along.
  // Also that the rows keep their spacing: starring used to move a row across the seam
  // between two containers, where the gap was 24px instead of 20px, so the list shifted
  // under the control that acted on it.
  '42b. starring one moves it to the top of one list, without shifting the others',
  // A bullet leads each row now, so this asks which entry is first rather than what
  // the row's text begins with.
  order[0].includes('Read before bed') &&
    !screen.includes(EN.pinnedLabel) &&
    // One list: two would put a different gap on either side of the boundary.
    (await count('main ul')) === 1 &&
    afterPin.facts.length === beforePin + 1 &&
    afterPin.facts.some((f) => f.key.endsWith('.pinned') && f.value === 'yes'),
  `${JSON.stringify(order)} | ${afterPin.facts.length} vs ${beforePin}`,
)

// Several at once. This is the thing a pointer could not express, so it is the check
// that says pinning is not a rank in disguise.
await clickAria('Pin: Walk after dinner')
screen = await text()
check(
  '42c. more than one can be pinned, and then there is nothing left to label',
  JSON.parse(await raw()).facts.filter((f) => f.key.endsWith('.pinned')).length === 2 &&
    !screen.includes(EN.pinnedLabel) &&
    !screen.includes(EN.restLabel),
  screen.replace(NL, ' / ').slice(0, 160),
)

await clickAria('Unpin: Walk after dinner')
check(
  '42d. unpinning is one more fact, and never a deletion',
  JSON.parse(await raw()).facts.filter((f) => f.key.endsWith('.pinned')).length === 3 &&
    !(await text()).includes(EN.pinnedLabel),
  JSON.parse(await raw())
    .facts.filter((f) => f.key.endsWith('.pinned'))
    .map((f) => f.value)
    .join(', '),
)

// The opposite of the start page's rule, on purpose.
//
// Pinned-first is what makes a cross-area list of everything open useful. Inside one
// goal the order already carries meaning — the sequence they were written in — and
// sorting on pin made the control move the row it acts on, out from under the finger
// that tapped it. Asserted rather than left implicit, so a later reader finds a
// decision here instead of an oversight worth "fixing".
await goto(`/areas/${AREAS[0].id}/`)
const goalOrder = await evaluate(
  `(() => {
     const items = [...document.querySelectorAll('main ol li ul li')];
     return items.map((li) => li.textContent.trim().slice(0, 24));
   })()`,
)
check(
  '42d2. but inside a goal, pinning leaves the order alone',
  // Each entry carries a bullet in front of its words now, so the claim is which entry
  // sits first rather than what the row's text begins with.
  goalOrder?.length === 2 &&
    goalOrder[0].includes('Walk after dinner') &&
    goalOrder[1].includes('Read before bed'),
  JSON.stringify(goalOrder),
)

// Colour is the third cue, after the filled glyph and the flipped name — but a third
// cue that silently stopped applying is still a regression, and `.pin-toggle:hover`
// has the specificity to take it back.
const pinColours = await evaluate(`(() => {
  const buttons = [...document.querySelectorAll('main .pin-toggle')];
  const on = buttons.find((b) => b.classList.contains('pin-toggle-on'));
  const off = buttons.find((b) => !b.classList.contains('pin-toggle-on'));
  if (!on || !off) return null;
  return { on: getComputedStyle(on).color, off: getComputedStyle(off).color };
})()`)
check(
  '42d3. an active star is drawn in the hint colour and an inactive one is not',
  // The hint colour now, not a red of its own: red on a control meaning "keep this in
  // view" read as a warning about the thing it was marking.
  pinColours !== null && pinColours.on !== pinColours.off && pinColours.on === 'rgb(194, 65, 12)',
  JSON.stringify(pinColours),
)

// The migration read. A store from before pinning existed says what it meant through
// the old pointer, and taking that back needs no special case.
await seedPins({ legacyPointer: true })
const legacyOrder = await evaluate(
  `[...document.querySelectorAll('main li')].map((li) => li.textContent.trim().slice(0, 30))`,
)
check(
  '42e. a retired pointer reads as a pin, with nothing written to convert it',
  // Bullet-led rows: which entry is first is the claim, not the row's first character.
  legacyOrder[0].includes('Walk after dinner') &&
    !(await text()).includes(EN.pinnedLabel) &&
    JSON.parse(await raw()).facts.every((f) => !f.key.endsWith('.pinned')),
  JSON.stringify(legacyOrder),
)
await clickAria('Unpin: Walk after dinner')
check(
  '42f. and it can be unpinned — the explicit fact wins over the old pointer',
  !(await text()).includes(EN.pinnedLabel) &&
    JSON.parse(await raw()).facts.some(
      (f) => f.key.endsWith('.pinned') && f.value === 'no',
    ),
  (await text()).replace(NL, ' / ').slice(0, 140),
)

// The live region has to exist before it has anything to say: one inserted together
// with its text announces nothing. Nothing asserted this in any of the three places
// that depend on it, and a list of rows is what would break it silently.
const regionAtRest = await evaluate(
  `(() => {
     const region = document.querySelector('main [role="status"]');
     return region ? { there: true, quiet: region.textContent.trim() === '' } : null;
   })()`,
)
check(
  '42g. the announcement region is mounted and empty before anything happens',
  regionAtRest?.there === true && regionAtRest.quiet === true,
  JSON.stringify(regionAtRest),
)

// The goal is skippable, and skipping writes nothing at all.
await clearStorage()
await goto('/')
await click(EN.yes)
await click(EN.introOk)
await click(EN.reviewYes)
const beforeSkip = JSON.parse(await raw()).facts.length
await click(EN.goalSkip)
screen = await text()
const afterSkip = JSON.parse(await raw())
check(
  '42h. the goal can be skipped, and skipping writes nothing at all',
  // Moved on to the next area rather than staying put or dead-ending.
  screen.includes(AREAS[1].label) &&
    screen.includes(EN.review) &&
    afterSkip.facts.length === beforeSkip &&
    !afterSkip.facts.some((f) => /\.goal/.test(f.key)),
  `${afterSkip.facts.length} facts vs ${beforeSkip}`,
)

// And it is never nagged about: no goal means nothing for the start page to point at,
// and a reload resumes at the next unanswered area rather than back at the question.
await declineRest()
await click(EN.toHome)
screen = await text()
check(
  '42i. a skipped area is not reported as unfinished setup',
  !screen.includes(EN.unfinished) && screen.includes(EN.home),
  screen.replace(NL, ' / ').slice(0, 140),
)
await goto(`/areas/${AREAS[0].id}/`)
screen = await text()
check(
  /**
   * Still completable from its own page — and now in one step fewer.
   *
   * This asserted that opening a skipped area asks "Would you like to change or explore
   * something here now?" first. Tapping a row that says "No goals yet" *is* that answer,
   * so the question was asking someone to confirm their own tap. The page opens on the
   * field instead, and the assertion follows: the way in is still there, with the
   * intermediate question gone rather than merely quieter.
   */
  /**
   * Opening a skipped area shows **what state it is in**, and one way on.
   *
   * This asserted a text field, because the page used to answer a tap on a row with the
   * goal question. A tap is a request to see the area; the field skipped the only screen
   * that says what is there. Creation starts from the button instead — asserted below,
   * so "shows the empty state" cannot pass while the way on is broken.
   */
  '42j. and it opens on what is there, with one way to start something',
  screen.includes(EN.emptyNote) &&
    (await visible(EN.goalCreate)) &&
    !screen.includes(EN.goal),
  screen.replace(NL, ' / ').slice(0, 140),
)
await click(EN.goalCreate)
screen = await text()
check(
  '42j1. and that button is what opens the goal question',
  screen.includes(EN.goal) && (await count('main input')) === 1,
  screen.replace(NL, ' / ').slice(0, 120),
)
check(
  /**
   * The way out of the field says the right thing for how you got here.
   *
   * "Not sure yet" belongs to a question that walked up uninvited — the introduction asks
   * about six areas and being unsure about one is a real answer. Nobody is unsure on this
   * page: they opened this area to give it a goal, so the quiet control undoes the tap.
   *
   * Both halves asserted, because the one that will rot is the *negative*: 42h clicks
   * "Not sure yet" during the introduction and would abort if it ever went missing there,
   * but nothing else would notice it leaking back onto this page.
   */
  '42j2. and its way out says "Back" here, while the introduction still says "Not sure yet"',
  (await visible(EN.goalBack)) && !(await visible(EN.goalSkip)),
  `Back: ${await visible(EN.goalBack)}, Not sure yet: ${await visible(EN.goalSkip)}`,
)

// --- 43. the start page is a working list, and the action dominates it ---------
//
// Measured rather than eyeballed, like §34 and §44. This replaced a version asserting
// three regions spread across one row at width and stacked on a phone — that layout used
// the width but read as three disconnected columns, with the goal drifting away from the
// action it belongs to. What is claimed now is different, so what is measured is too:
// the action and its metadata are **one block**, the action is the larger of the two, the
// control is attached to the row rather than parked in a column of its own, and the whole
// row stays compact on a phone.

const rowShape = () =>
  evaluate(
    `(() => {
       const row = document.querySelector('main li')?.firstElementChild;
       if (!row) return null;
       const block = [...row.children].find((el) => el.tagName === 'DIV');
       const control = [...row.children].reverse().find((el) => el.tagName === 'BUTTON');
       if (!block || !control) return null;
       const action = block.children[0];
       const meta = block.children[1];
       const box = (el) => {
         const r = el.getBoundingClientRect();
         return { top: Math.round(r.top), left: Math.round(r.left), right: Math.round(r.right) };
       };
       const px = (el) => parseFloat(getComputedStyle(el).fontSize);
       return {
         rowRight: Math.round(row.getBoundingClientRect().right),
         rowHeight: Math.round(row.getBoundingClientRect().height),
         lineHeight: parseFloat(getComputedStyle(action).lineHeight),
         action: box(action),
         meta: box(meta),
         control: box(control),
         actionPx: px(action),
         metaPx: px(meta),
       };
     })()`,
  )

await setViewport(1200, 800)
await seedOnboarded()
const shape = await rowShape()
check(
  '43a. the action and what it is for are one block, with the action the larger of them',
  // Same left edge: one block, not two columns.
  shape?.action.left === shape.meta.left &&
    // And the metadata sits under it rather than beside it.
    shape.meta.top > shape.action.top &&
    // Dominance, stated as a number rather than trusted.
    shape.actionPx > shape.metaPx * 1.1,
  JSON.stringify(shape),
)
check(
  '43b. the control is attached to the row, not parked in a column of its own',
  // Against the right edge, which is where "last and shrink-0" puts it — and level
  // with the action's first line rather than floating between the two lines.
  shape.rowRight - shape.control.right < 4 &&
    Math.abs(shape.control.top - shape.action.top) < 12,
  JSON.stringify({ rowRight: shape.rowRight, control: shape.control, action: shape.action }),
)

await setViewport(390, 780)
await goto('/')
const narrow = await rowShape()
check(
  '43c. and on a phone it is two lines, not four',
  // The action, its metadata, and nothing stacked under them. Stated as a multiple of
  // the line height so it cannot be satisfied by shrinking the type.
  narrow !== null && narrow.rowHeight < narrow.lineHeight * 2.8,
  `${narrow?.rowHeight}px over a ${narrow?.lineHeight}px line`,
)
await setViewport(1200, 800)

// --- 44. during the introduction the life area is the heading ------------------
//
// The question is identical on every area screen; the area is the one part that
// changes, and it used to be the smallest thing on the page. Measured rather than
// eyeballed, like §34: the heading has to be genuinely larger, and it has to be the
// heading — a bigger line that is not the `h1` would leave the outline saying the
// question is the subject.

await clearStorage()
await goto('/')
await click(EN.yes)
await click(EN.introOk)
const weighting = await evaluate(
  `(() => {
     const h1 = document.querySelector('main h1');
     if (!h1) return null;
     const question = [...document.querySelectorAll('main p')]
       .find((p) => p.textContent.trim().startsWith('Would you like to change'));
     if (!question) return null;
     const px = (el) => parseFloat(getComputedStyle(el).fontSize);
     const face = (el) => getComputedStyle(el).fontFamily.split(',')[0].replace(/["']/g, '');
     return {
       heading: h1.textContent.trim(),
       headingPx: px(h1),
       headingFace: face(h1),
       questionPx: px(question),
       questionFace: face(question),
       headings: document.querySelectorAll('main h1').length,
     };
   })()`,
)
check(
  '44a. the area names the page, and the question reads beneath it',
  // The h1 is the area, not the question.
  weighting?.heading.includes('Physical Health') &&
    // Exactly one, so the outline cannot claim two subjects.
    weighting.headings === 1 &&
    // Genuinely larger, not a nudge.
    weighting.headingPx > weighting.questionPx * 1.4,
  JSON.stringify(weighting),
)
check(
  '44b. and the two use different faces, so neither competes with the other',
  // Display serif names the area; the question is sans. Both are asserted because
  // matching sizes with matching faces is how a hierarchy quietly flattens again.
  weighting.headingFace !== weighting.questionFace,
  `${weighting.headingFace} vs ${weighting.questionFace}`,
)

// --- 45. more than one goal per area during the introduction -------------------
//
// The first goal is optional and the way past it writes nothing (§42h). A second and
// third may be added, from the entries screen, and nothing says an area should have
// three — the offer disappears at the cap and says nothing about the ones already
// written. Nothing is ranked here either: prioritising goals lives on the area page.

await clearStorage()
await goto('/')
await click(EN.yes)
await click(EN.introOk)
await click(EN.reviewYes)
await type('Sleep better')
await click(EN.confirm)
screen = await text()
check(
  /**
   * **The introduction offers no second goal**, and that is the change.
   *
   * It used to, quietly, on the entries screen. The offer is gone from the walk entirely,
   * so the introduction now creates at most one goal per area — more are added from the
   * area's own page, where the whole hierarchy is on screen to add them against.
   *
   * What the deleted §45b–45g covered has not been lost, it moved: 7a0 asserts a later goal
   * is asked about its next steps on the area page, and 48g that it opens in place under the
   * goal it belongs to. Their point was per-goal linkage, and that is where linkage now
   * happens.
   */
  '45a. the introduction asks for one goal per area and offers no second',
  screen.includes(EN.steps) &&
    (await visible(EN.save)) &&
    !(await visible(EN.goalAnother)),
  screen.replace(NL, ' / ').slice(0, 160),
)

// One entry, and that *is* out — saving carries straight on to the next area. Nothing along
// the way ranks anything either: pinning and priority are both decisions for later, on a
// page that shows what there is to decide between.
await type('Walk after dinner')
await click(EN.save)
await sleep(300)
screen = await text()
/**
 * **Saving one action ends the area.**
 *
 * Six areas is enough of a walk without each one also being an invitation to fill it: one
 * goal and one action is enough to learn what the app is, and everything the ceiling holds
 * back is a tap away on the area's own page afterwards.
 *
 * Asserted from the other side as well — that nothing offers to keep going here. The list,
 * the cap notice, "Add something" and "That is enough" all still exist, and §29 exercises
 * every one of them on the flow the area page enters. If they ever reappeared *here*, this
 * is what would say so.
 */
check(
  '45i. saving one action carries straight on to the next area',
  screen.includes(AREAS[1].label) &&
    screen.includes(EN.review) &&
    !screen.includes(EN.steps) &&
    !(await visible(EN.addStep)) &&
    !(await visible(EN.enough)) &&
    !(await visible(EN.cont)),
  screen.replace(NL, ' / ').slice(0, 110),
)
await declineRest()
const noRank = JSON.parse(await raw()).facts
check(
  '45h. and the introduction ranked nothing: no pin, no priority',
  noRank.every((f) => !f.key.endsWith('.pinned') && !f.key.endsWith('.goal_priority')),
  noRank
    .map((f) => f.key.split('.').slice(-1)[0])
    .filter((k, i, all) => all.indexOf(k) === i)
    .join(' '),
)

// --- 46. after deleting everything, beginning again is the offer ---------------
//
// Guarded by exactly one assertion before this (§8d, that the confirmation sentence is
// on the page); nothing said what the person could do next. The emphasis rule that puts
// `.btn-primary` on the *safe* choice governs the steps leading to deletion — those are
// behind us here, and a page whose only offer is "back to the privacy page" leaves
// someone who just cleared everything with nowhere to begin.

await seedOnboarded()
await goto('/data/stored/')
const footBefore = await evaluate(
  `(() => {
     const primaries = [...document.querySelectorAll('#delete .btn-primary')];
     return { count: primaries.length, first: primaries[0]?.textContent.trim() ?? null };
   })()`,
)
check(
  '46a. before deleting, leaving is still the emphasised thing to do',
  footBefore.count === 1 && footBefore.first === EN.storedBack,
  JSON.stringify(footBefore),
)

await click(EN.del)
await click(EN.delConfirm)
const footAfter = await evaluate(
  `(() => {
     const primaries = [...document.querySelectorAll('#delete .btn-primary')];
     const quiet = [...document.querySelectorAll('#delete .btn-quiet')];
     return {
       primaries: primaries.map((el) => ({ text: el.textContent.trim(), href: el.getAttribute('href') })),
       quiet: quiet.map((el) => el.textContent.trim()),
     };
   })()`,
)
check(
  '46b. afterwards, starting again is the one emphasised thing, and it points at the start',
  // Exactly one — two primaries in a section is a weighting that says nothing.
  footAfter.primaries.length === 1 &&
    footAfter.primaries[0].text === EN.delRestart &&
    footAfter.primaries[0].href === '/' &&
    // **And nothing beside it.** A second "Back to data protection" here repeated the link
    // at the top of the page, so the end of the page was a choice between going on and
    // going back where you came from. The way back is the one at the top; §35 covers it.
    footAfter.quiet.length === 0,
  JSON.stringify(footAfter),
)
check(
  '46c. the confirmation is still on the page — nothing was navigated away for us',
  (await text()).includes(EN.delDone) && (await keys()).length === 0,
  `${(await keys()).length} key(s)`,
)

await clickText(EN.delRestart)
await sleep(400)
check(
  '46d. following it reaches the beginning, without needing a reload',
  (await text()).includes(EN.consent),
  (await text()).replace(NL, ' / ').slice(0, 120),
)

// --- 9. nothing leaves the browser ---------------------------------------

const requested = events
  .filter((e) => e.method === 'Network.requestWillBeSent')
  .map((e) => e.params.request.url)
const external = requested.filter((url) => !url.startsWith(BASE) && !url.startsWith('data:'))
// --- 47. browser and system defaults on a first visit ---------------------
//
// German needles have been inline literals everywhere else in this file, which is fine
// for one. This section leans on several, so they get a name.
const DE = {
  consent: 'Ist das okay für dich?',
  intro: 'Bereiche deines Lebens an, einen nach dem anderen',
}
//
// Both preferences follow the same rule, and it is worth naming because it is easy to
// get half right: an unset preference follows the environment, and only an explicit
// choice overrides it. What made this worth a section is that "unset" and "chose the
// default" used to be the same stored value for the language, so consenting froze
// whatever the browser happened to say into a choice nobody had made.
//
// Placed at the end deliberately. These are the only checks that override the browser
// language, and this file aborts rather than fails — an override that leaked into
// earlier sections would answer their German assertions for them.

await evaluate('localStorage.clear()')
await setBrowserLanguage('de-DE')
await goto('/')
let firstVisit = await text()
check(
  '47a. a German browser is greeted in German, with nothing stored to say so',
  firstVisit.includes(DE.consent) && !firstVisit.includes(EN.consent) && (await keys()).length === 0,
  `navigator: ${JSON.stringify(await evaluate('[navigator.language, navigator.languages]'))} — ${firstVisit.replace(NL, ' / ').slice(0, 60)}`,
)

await setBrowserLanguage('fr-FR')
await goto('/')
firstVisit = await text()
check(
  '47b. and a browser in neither language falls back to English, not to nothing',
  firstVisit.includes(EN.consent) && !firstVisit.includes(DE.consent),
  firstVisit.replace(NL, ' / ').slice(0, 90),
)

// Regional variants are the point of matching on the prefix rather than the tag: a
// person in Vienna or Zurich is reading German.
await setBrowserLanguage('de-AT')
await goto('/')
check('47c. a regional variant counts as German', (await text()).includes(DE.consent))

/**
 * The half that used to be missing.
 *
 * A store written by someone who never touched the language switch holds no `locale`
 * at all, so the browser still decides — which is what makes "never explicitly
 * selected" a real state rather than a state that ends at consent.
 */
await setBrowserLanguage('de-DE')
await evaluate(
  `localStorage.setItem(${JSON.stringify(STORAGE_KEY)}, ${JSON.stringify(
    JSON.stringify({ version: 1, consentAt: '2026-01-01T00:00:00.000Z', facts: [] }),
  )})`,
)
await goto('/')
let onLoad = await text()
check(
  '47d. a store holding no language choice still follows the browser',
  onLoad.includes(DE.intro) && !onLoad.includes(DE.consent),
  onLoad.replace(NL, ' / ').slice(0, 90),
)

// And the override, which is the whole reason a choice is stored: same German browser,
// an explicit English choice, English wins.
await evaluate(
  `localStorage.setItem(${JSON.stringify(STORAGE_KEY)}, ${JSON.stringify(
    JSON.stringify({ version: 1, consentAt: '2026-01-01T00:00:00.000Z', locale: 'en', facts: [] }),
  )})`,
)
await goto('/')
onLoad = await text()
check(
  '47e. an explicit English choice overrides a German browser',
  onLoad.includes(EN.intro) && !onLoad.includes(DE.intro),
  onLoad.replace(NL, ' / ').slice(0, 90),
)

// Choosing in the app has to produce exactly that store, or 47e is asserting a fixture
// nothing writes. One field, and only after the switch is used.
//
// Back to the launch language first: this check drives the interface, and the German
// one has German labels — so leaving the override on would abort here rather than
// measure anything.
await setBrowserLanguage(null)
await evaluate('localStorage.clear()')
await goto('/')
await click(EN.yes)
const beforeChoice = JSON.parse(await raw())
await chooseIn('Language', 'Deutsch')
const afterChoice = JSON.parse(await raw())
check(
  '47f. and using the switch is what writes it — nothing before that does',
  beforeChoice.locale === undefined && afterChoice.locale === 'de',
  `before: ${JSON.stringify(beforeChoice.locale)}, after: ${JSON.stringify(afterChoice.locale)}`,
)
// Left in German by the choice above, and the checks after this read English.
await chooseIn('Sprache', 'English')

/**
 * The theme half. Nothing was changed for it — an unset theme already follows the OS
 * through `prefers-color-scheme` in CSS, with no JavaScript involved — so these assert
 * a guarantee that was real but unmeasured in this direction.
 *
 * Deliberately without a reload between the two schemes: that is what proves it
 * *follows* the system rather than reading it once at startup, which is the live
 * behaviour asked for and which comes free from it being a media query.
 */
await evaluate('localStorage.clear()')
await setScheme('dark')
await goto('/')
const darkFirst = { theme: await dataTheme(), bg: await background() }
await setScheme('light')
const lightAfter = { theme: await dataTheme(), bg: await background() }
check(
  '47g. with no theme chosen, the system decides — and a change is followed live',
  darkFirst.theme === null &&
    lightAfter.theme === null &&
    darkFirst.bg !== lightAfter.bg &&
    darkFirst.bg === darkBackground &&
    lightAfter.bg === lightBackground,
  `${darkFirst.bg} then ${lightAfter.bg}, data-theme ${darkFirst.theme} / ${lightAfter.theme}`,
)

// The override direction, on a dark OS this time. Check 16 asserts stored dark on a
// light OS; this is the mirror, and it is the one that catches a system preference
// being allowed to win over a choice.
await setScheme('dark')
await evaluate(
  `localStorage.setItem(${JSON.stringify(STORAGE_KEY)}, ${JSON.stringify(
    JSON.stringify({
      version: 1,
      consentAt: '2026-01-01T00:00:00.000Z',
      locale: 'en',
      theme: 'light',
      facts: [],
    }),
  )})`,
)
await goto('/')
check(
  '47h. an explicit light choice overrides a dark system preference',
  (await dataTheme()) === 'light' && (await background()) === lightBackground,
  `data-theme ${await dataTheme()}, ${await background()}`,
)
await setScheme('light')
await evaluate('localStorage.clear()')

// --- 48. the refinement pass: recede, hierarchy, and editing that edits -----
//
// Three claims, all of them the kind that pass by eye and regress silently: a row
// recedes without becoming unreadable, the goal hierarchy reads in order, and opening a
// goal opens the field rather than a menu.

await seedGoals()
await goto('/areas/')

/**
 * Recede is a *comparison*, so it has to be measured as one.
 *
 * `seedGoals()` gives some areas a goal and leaves others untouched, so both kinds of
 * row are on this page at once. Asserting the quiet row's colour alone would pass just
 * as happily if every row were muted, which is the failure mode this is here to catch.
 */
const areaRows = await evaluate(`(() => {
  const all = [...document.querySelectorAll('main a.option')];
  const pick = (quiet) => {
    const el = all.find((a) => a.classList.contains('option-recede') === quiet);
    if (!el) return null;
    const label = el.querySelector('p');
    return {
      border: getComputedStyle(el).borderTopColor,
      text: getComputedStyle(label).color,
      opacity: getComputedStyle(el).opacity,
      pointer: getComputedStyle(el).pointerEvents,
      href: el.getAttribute('href'),
      disabled: el.getAttribute('aria-disabled'),
      padding: getComputedStyle(el).padding,
      borderWidth: getComputedStyle(el).borderTopWidth,
    };
  };
  return { quiet: pick(true), loud: pick(false), ink: getComputedStyle(document.body).color };
})()`)
check(
  '48a. an area with nothing being worked on recedes against one that has a goal',
  areaRows.quiet !== null &&
    areaRows.loud !== null &&
    areaRows.quiet.border !== areaRows.loud.border &&
    areaRows.quiet.text !== areaRows.loud.text &&
    areaRows.loud.text === areaRows.ink,
  areaRows.quiet && areaRows.loud
    ? `quiet ${areaRows.quiet.border}/${areaRows.quiet.text} vs loud ${areaRows.loud.border}/${areaRows.loud.text}`
    : JSON.stringify(areaRows),
)
check(
  // The whole risk of "de-emphasise" is shipping something that reads as switched off.
  // Full opacity, live pointer events, a real destination, no `aria-disabled`, and the
  // same box as its neighbour: quieter is a statement about attention, not about state.
  '48b. and it is quieter without being disabled — same box, real link, full opacity',
  areaRows.quiet.opacity === '1' &&
    areaRows.quiet.pointer !== 'none' &&
    areaRows.quiet.href &&
    areaRows.quiet.disabled === null &&
    // The frame, not the height: a row holding a goal has three lines and one without
    // has two, so equal heights was never the right thing to want. What must not differ
    // is the box — same padding, same border width — so nothing shifts as an area gains
    // a goal, and nothing reads as a smaller or thinner control.
    areaRows.quiet.padding === areaRows.loud.padding &&
    areaRows.quiet.borderWidth === areaRows.loud.borderWidth,
  JSON.stringify(areaRows.quiet),
)

// Restored on focus, and by a real Tab rather than a scripted `.focus()` — the same
// standard §23 holds itself to, because `:focus-visible` depends on how focus arrived.
const reached = await tabTo('a.option-recede')
// `.option` carries `transition-colors`, so reading straight after focus catches an
// interpolated colour matching neither end — 86,83,79 for a value that should be one of
// 107 or 31. Wait the transition out rather than asserting against a frame of it.
await sleep(400)
const focusRestored = await evaluate(
  `(() => {
     const el = document.activeElement;
     return { text: getComputedStyle(el.querySelector('p')).color, border: getComputedStyle(el).borderTopColor };
   })()`,
)
check(
  '48c. and a keyboard restores it in full, not only a pointer',
  // Text back to full ink, and the edge no longer the receded one. Compared against the
  // quiet border rather than pinned to a token value, so this survives a palette retune.
  reached > 0 &&
    focusRestored.text === areaRows.ink &&
    focusRestored.border !== areaRows.quiet.border,
  `${reached} tab(s), ${focusRestored.text} / ${focusRestored.border}`,
)

/**
 * The hierarchy, asserted as an *order* rather than as three separate presences.
 *
 * Label, then the person's words in quotes, then the question that turns one into the
 * other. Each of those could exist while sitting in the wrong place, and the wrong place
 * is precisely the complaint this pass answered — so position is the assertion.
 */
await goto(`/areas/${AREAS[3].id}/`)
const shape48 = await evaluate(`(() => {
  const li = document.querySelector('main ol li');
  if (!li) return null;
  // The goal mark lands on a line of its own here. It is decoration, so it is not
  // part of the order being asserted.
  const lines = li.innerText
    .split(String.fromCharCode(10))
    .map((l) => l.replace(/[^ -~‘-‟]/g, '').trim())
    .filter(Boolean);
  return {
    lines: lines.slice(0, 3),
    // Searched across every line rather than the first few: a goal carrying a reason
    // pushes the question further down, which is correct. What matters is that it is
    // under the goal, not that it sits at a fixed offset from it.
    // Either form: a question when the list is empty, a statement introducing it when
    // not. Both occupy the same slot, and which one shows is the assertion in 48d2.
    hasQuestion: lines.some(
      (l) => l.startsWith('How do you want to reach this goal?') || l.startsWith('How you want to reach it:'),
    ),
    quoted: /^[\u201e\u201c]/.test(lines[1] ?? ''),
    goalIsHeading: (li.querySelector('h2')?.innerText ?? '').includes('Finish the portfolio'),
  };
})()`)
check(
  '48d. a goal reads as label, then the person’s own words quoted, then the question',
  shape48 !== null &&
    shape48.lines[0] === EN.goalOnly &&
    shape48.quoted === true &&
    shape48.goalIsHeading === true &&
    shape48.hasQuestion === true,
  JSON.stringify(shape48),
)

// Editing sits with the goal, not among the entry controls: one level per group.
const editPlacement = await evaluate(`(() => {
  const li = document.querySelector('main ol li');
  const heading = li.querySelector('h2');
  // Icon-only now, so found by accessible name — which is also the only thing a screen
  // reader has to tell three "Edit" buttons apart.
  const edit = [...li.querySelectorAll('button')]
    .find((b) => (b.getAttribute('aria-label') || '').startsWith('Change this goal:'));
  const remove = [...li.querySelectorAll('button')]
    .find((b) => (b.getAttribute('aria-label') || '').startsWith('Remove goal:'));
  const add = [...li.querySelectorAll('button')].find((b) => b.innerText.trim() === '+ Add an entry');
  if (!heading || !edit || !remove || !add) return null;
  return {
    editBesideGoal: edit.parentElement === heading.parentElement,
    removeBesideGoal: remove.parentElement === heading.parentElement,
    editSharesRowWithAdd: edit.parentElement === add.parentElement,
    // Named after the goal, not just "Edit": three of these on one page otherwise say
    // the same word three times to anyone listening.
    named: (edit.getAttribute('aria-label') || '').includes('Finish the portfolio'),
  };
})()`)
check(
  '48e. and its edit and remove sit with the goal, not among the entry controls',
  editPlacement?.editBesideGoal === true &&
    editPlacement?.removeBesideGoal === true &&
    editPlacement?.editSharesRowWithAdd === false &&
    editPlacement?.named === true,
  JSON.stringify(editPlacement),
)

/**
 * One thing open at a time, and a goal's card holds its own entries.
 *
 * Editing an entry used to leave the goal's edit and remove controls up, plus
 * "+ Eintrag hinzufügen" — three more ways to start something else while something was
 * half-written, two of which discarded it. And the card is what makes a goal and its
 * entries read as one object; without it they were a run of indented lines.
 */
await clickAria('Edit: Write the case study')
const focused48 = await evaluate(`(() => {
  const li = document.querySelector('main ol li');
  const names = [...li.querySelectorAll('button')].map((b) => b.getAttribute('aria-label') || b.innerText.trim());
  return {
    field: Boolean(li.querySelector('input, textarea')),
    goalControls: names.filter((n) => n.startsWith('Change this goal:') || n.startsWith('Remove goal:')).length,
    addOffered: names.some((n) => n === '+ Add an entry'),
    carded: getComputedStyle(li).borderTopWidth !== '0px' && li.querySelector('ul') !== null,
  };
})()`)
check(
  '48i. editing an entry hides the goal’s controls, inside a card that holds both',
  focused48.field === true &&
    focused48.goalControls === 0 &&
    focused48.addOffered === false &&
    focused48.carded === true,
  JSON.stringify(focused48),
)
// Close it again: the next check needs the row's own controls back.
await click(EN.cancel)

/**
 * Asking for an action outside the introduction no longer needs to *say* which goal.
 *
 * It used to open a screen of its own, which had to repeat the goal — "Goal: …" — because
 * the goal was no longer on the page. The field opens inside the goal's own list item
 * now, so the heading two lines above it *is* the context, and repeating it would be the
 * third thing on screen saying the same thing.
 *
 * What still has to match the introduction is the word on the button: saving an action
 * says "Save" everywhere. So this asserts position and label, which is what survived the
 * screen going away.
 */
await click('+ Add an entry')
const askedHere = await evaluate(`(() => {
  const li = document.querySelector('main ol li');
  const field = li ? li.querySelector('input, textarea') : null;
  const heading = li ? li.querySelector('h2') : null;
  return {
    fieldInsideGoal: Boolean(field),
    goalStillOnScreen: (heading?.innerText ?? '').includes('Finish the portfolio'),
    // No repeated context line: the heading already is it.
    repeatsGoalLine: document.querySelector('main').innerText.includes('Goal: “Finish'),
  };
})()`)
check(
  '48g. and adding an action opens in place, under the goal it belongs to',
  askedHere.fieldInsideGoal === true &&
    askedHere.goalStillOnScreen === true &&
    askedHere.repeatsGoalLine === false &&
    (await visible(EN.save)),
  JSON.stringify(askedHere),
)
await goto(`/areas/${AREAS[3].id}/`)

// And opening it lands in a prefilled field. `innerText` cannot see a form value, so
// this reads the input directly — the one place where asserting the DOM is the only
// honest option.
await clickAria('Change this goal: Finish the portfolio')
const editing = await evaluate(`(() => {
  const field = document.querySelector('main input, main textarea');
  return {
    value: field ? field.value : null,
    options: document.querySelectorAll('main button.option').length,
    buttons: [...document.querySelectorAll('main button')].map((b) => b.innerText.trim()).filter(Boolean),
  };
})()`)
/**
 * **Closing a goal is not offered from the screen about its wording.**
 *
 * "I have reached this" used to sit here, and it was reasonable while nothing else made the
 * *reached* / *given up on* distinction. The goal scale's fifth point makes it now, with a
 * confirmation that states what closing takes with it — so this was a second door to one
 * outcome, opened from a screen about rewording, with no consequence stated.
 *
 * Asserted rather than left to the diff, because "add a quiet way to finish it here" is a
 * natural thing to reach for again. The distinction itself is untouched: `completeGoal` and
 * `retireGoal` both still exist and are both still reachable, from the scale and from the
 * remove control.
 */
check(
  '48f2. and it offers no way to close the goal — that lives with the scale now',
  !editing?.buttons.some((label) => /reached|erreicht/i.test(label)),
  (editing?.buttons ?? []).join(' / '),
)
check(
  '48f. opening a goal opens the field, prefilled, with no menu of peers in front of it',
  editing.value === 'Finish the portfolio' && editing.options === 0,
  JSON.stringify(editing),
)

// --- 49. the start page answers one of two questions ------------------------
//
// A toggle swaps the list of next steps for a list of goals. Both are the same page, so
// the heading has to change with it — a heading naming one of them would be wrong half
// the time.

await seedGoals()
await goto('/')
check(
  '49a. it opens on next steps, with the other view offered',
  (await text()).includes(EN.home) &&
    (await visible(EN.viewGoals)) &&
    // Above the heading, not beside it: side by side they competed for one line, and the
    // heading changes length when the toggle is used — so at some widths the control that
    // had just been pressed wrapped below the words it had changed.
    (await evaluate(
      `(() => {
         const group = document.querySelector('main [role="group"]');
         const h1 = document.querySelector('main h1');
         // 4 === DOCUMENT_POSITION_FOLLOWING: the heading comes after the toggle.
         return Boolean(group && h1 && group.compareDocumentPosition(h1) & 4) &&
           group.getBoundingClientRect().bottom <= h1.getBoundingClientRect().top;
       })()`,
    )) === true &&
    // Pressed rather than colour alone: the label is the state's name, and this is what
    // says which one is current out loud.
    (await evaluate(
      `[...document.querySelectorAll('main button')]
         .find((b) => b.textContent.trim() === ${JSON.stringify('My next steps')})
         ?.getAttribute('aria-pressed')`,
    )) === 'true',
  (await text()).replace(NL, ' / ').slice(0, 90),
)

await click(EN.viewGoals)
screen = await text()
check(
  '49b. switching shows the goals themselves, and renames the page with them',
  screen.includes(EN.goalsTitle) &&
    !screen.includes(EN.home) &&
    screen.includes('Sleep better') &&
    // The goals and nothing else: no area, no counts, no state. Anything more would make
    // this a second areas page.
    !screen.includes(EN.check),
  screen.replace(NL, ' / ').slice(0, 120),
)

/**
 * Starring a goal is its own fact, and it sorts this list.
 *
 * Deliberately not `goal_priority`: that orders goals *within* one area and there is one
 * of it, which says nothing about what to show first in a list that crosses areas. So the
 * write has to land on the goal's own key, and the order has to follow it.
 */
const beforeStar = JSON.parse(await raw()).facts.length
const secondGoal49 = await evaluate(
  `document.querySelectorAll('main ul li p')[1].textContent.trim()`,
)
await clickAria(`Pin: ${secondGoal49}`)
await sleep(250)
const starred = JSON.parse(await raw())
const goalOrderNow = await evaluate(
  `[...document.querySelectorAll('main ul li p')].map((p) => p.textContent.trim())`,
)
check(
  '49c. starring a goal moves it first and writes one fact on the goal itself',
  goalOrderNow[0] === secondGoal49 &&
    starred.facts.length === beforeStar + 1 &&
    starred.facts.some((f) => /\.goal\.[^.]+\.pinned$/.test(f.key) && f.value === 'yes'),
  `${JSON.stringify(goalOrderNow.slice(0, 2))} | ${starred.facts.length} vs ${beforeStar}`,
)

/**
 * The choice is remembered across a reload — and it is **not** a fact.
 *
 * This asserted that the toggle "stores nothing", which passed for the wrong reason the
 * moment it began being saved: it counted `facts`, and the view is a store field like
 * `theme`. It now asserts both halves of what is actually true — the preference survives a
 * reload, and it adds no entry to the append-only log, because a way of reading the page is
 * not something the person said.
 */
const beforeReload = JSON.parse(await raw())
await goto('/')
screen = await text()
check(
  '49d. the chosen view survives a reload, without becoming a fact',
  screen.includes(EN.goalsTitle) &&
    !screen.includes(EN.home) &&
    JSON.parse(await raw()).facts.length === beforeReload.facts.length &&
    JSON.parse(await raw()).homeView === 'goals',
  `${JSON.parse(await raw()).facts.length} facts, homeView ${JSON.parse(await raw()).homeView}`,
)

/**
 * A goal opens its area, and the way back follows where you came from.
 *
 * `?from=home` is the whole mechanism — `AreaScreen` reads it, and 37e/37f already cover
 * the fallbacks — so this asserts that the link carries it and that the back link answers
 * accordingly. A goal you can see but not act on is a dead end.
 */
const goalLink = await evaluate(
  `(() => {
     const link = document.querySelector('main ul li p a');
     return link ? { href: link.getAttribute('href'), text: link.textContent.trim() } : null;
   })()`,
)
await clickText(goalLink.text)
await sleep(500)
screen = await text()
const backFromGoal = await evaluate(
  `(() => {
     const a = document.querySelector('main a[href]');
     return a ? { href: new URL(a.href).pathname, text: a.textContent.trim() } : null;
   })()`,
)
check(
  '49d2. a goal on the start page opens its area, and the way back points at home',
  goalLink.href.includes('?from=home') &&
    screen.includes(goalLink.text) &&
    backFromGoal?.href === '/',
  `${goalLink.href} -> ${JSON.stringify(backFromGoal)}`,
)
await goto('/')

// Back to the default, which is the one value never written: choosing it drops the field
// rather than storing 'steps', so anyone who does not keep the goals view leaves no trace.
await click(EN.viewSteps)
await sleep(250)
check(
  '49e. and choosing the default again leaves nothing stored about it',
  (await text()).includes(EN.home) && JSON.parse(await raw()).homeView === undefined,
  `homeView ${JSON.stringify(JSON.parse(await raw()).homeView)}`,
)

// --- 50. how close a goal feels, and the fifth point that closes it ------

/**
 * An optional check-in on one goal, on both pages that show goals.
 *
 * The seeded fixture is doing real work here: `seedGoals()` predates this feature and writes
 * no progress fact, so every goal it produces is exactly the case that has to keep working
 * — one that existed before the question was ever asked. "Absent" is therefore observed
 * rather than arranged.
 *
 * Nothing here had a check to invert. Progress is new, so no existing assertion claimed
 * that reaching the top of the scale leaves a goal open; the closing behaviour is asserted
 * from scratch below rather than by flipping something.
 */

await seedGoals()
const AREA_G = AREAS[3].id
await goto(`/areas/${AREA_G}/`)
await waitForText('Finish the portfolio')

/** The dots, as painted: how many are filled, and whether every box is the same size. */
const dots = async () =>
  evaluate(`(() => {
    const host = document.querySelector('main .scale-toggle') || document.querySelector('main form');
    if (!host) return null;
    const marks = [...host.querySelectorAll('span[aria-hidden="true"]')];
    const seen = marks.map((el) => {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        background: s.backgroundColor,
        borderWidth: s.borderTopWidth,
        borderColor: s.borderTopColor,
        w: Math.round(r.width),
        h: Math.round(r.height),
      };
    });
    return {
      total: seen.length,
      filled: seen.filter((d) => d.background !== 'rgba(0, 0, 0, 0)').length,
      boxes: [...new Set(seen.map((d) => d.w + 'x' + d.h))],
      first: seen[0],
      last: seen[seen.length - 1],
    };
  })()`)

/** Picks the nth point without saving it — which is the distinction this whole section is about. */
async function pick(n) {
  await evaluate(`document.querySelectorAll('main form input[type="radio"]')[${n - 1}].click()`)
  await sleep(200)
}

const restingDots = await dots()
check(
  '50a. a goal written before this feature shows an empty scale, and holds no rating',
  restingDots?.total === 5 && restingDots.filled === 0 && !(await raw()).includes('.progress'),
  `${restingDots?.filled}/${restingDots?.total} filled`,
)

await clickSelector('main .scale-toggle')
await waitForText(EN.progressQuestion)
const beforePick = await raw()
await pick(3)
screen = await text()
/**
 * **The check this section exists for.**
 *
 * Picking is a thought and saving is an act. A radio that wrote on change would look
 * identical on screen and be a different product — one that records a passing impression of
 * your own life the moment you touch it. Byte-identical, not "no new fact": a rewrite that
 * happened to keep the count would pass the weaker form.
 */
check(
  '50b. choosing a point writes nothing at all until it is confirmed',
  (await raw()) === beforePick && screen.includes(EN.progress3),
  (await raw()) === beforePick ? `store untouched, and it says “${EN.progress3}”` : 'STORE CHANGED',
)

/**
 * Rating gives the goal the page, the way removing one already did.
 *
 * Asserted on **button text**, not on the page's words: `manageDone` is "Back", and the back
 * link at the top of every nested page reads "Back to your life areas" — so a `screen`
 * substring test passes whatever the footer does. The kind of needle that guards nothing
 * while looking like it guards something.
 */
const whileRating = await evaluate(`(() => {
  const main = document.querySelector('main');
  return {
    buttons: [...main.querySelectorAll('button')].map((b) => b.innerText.trim()).filter(Boolean),
    cards: main.querySelectorAll('ol > li').length,
  };
})()`)
check(
  '50c. and while it is open, the goal has the page — no siblings, no entry controls, no footer',
  whileRating?.cards === 1 &&
    ![EN.addEntry, EN.goalAdd, EN.manageDone].some((label) => whileRating.buttons.includes(label)) &&
    !(await ariaLabels()).some(
      (l) => l.startsWith('Change this goal:') || l.startsWith('Remove goal:'),
    ),
  `${whileRating?.cards} card(s): ${whileRating?.buttons.join(' / ')}`,
)

await click(EN.cancel)
await sleep(250)
check(
  '50d. cancelling leaves the store byte-identical',
  (await raw()) === beforePick,
  (await raw()) === beforePick ? 'untouched' : 'STORE CHANGED',
)

await clickSelector('main .scale-toggle')
await waitForText(EN.progressQuestion)
await pick(3)
await click(EN.progressSave)
await sleep(300)
const rated = JSON.parse(await raw()).facts.filter((f) => f.key.endsWith('.progress'))
check(
  '50e. confirming writes one fact, keyed on the goal, holding the number',
  rated.length === 1 && rated[0].key === `area.${AREA_G}.goal.${G1}.progress` && rated[0].value === '3',
  rated.map((f) => `${f.key}=${f.value}`).join(', ') || 'nothing written',
)

await goto(`/areas/${AREA_G}/`)
await waitForText('Finish the portfolio')
const afterReload = await dots()
check(
  '50f. it survives a reload and the scale shows it',
  afterReload?.filled === 3,
  `${afterReload?.filled}/5 filled`,
)

await clickSelector('main .scale-toggle')
await waitForText(EN.progressQuestion)
const reopened = await evaluate(`(() => {
  const inputs = [...document.querySelectorAll('main form input[type="radio"]')];
  const save = [...document.querySelectorAll('main form button')].find((b) => b.type === 'submit');
  return {
    checked: inputs.findIndex((i) => i.checked) + 1,
    named: inputs.every((i) => (i.closest('label')?.innerText || i.labels?.[0]?.textContent || '').trim().length > 0),
    saveDisabled: save?.disabled === true,
  };
})()`)
check(
  '50g. reopening starts from what is stored, with the save already available',
  reopened?.checked === 3 && reopened.saveDisabled === false,
  JSON.stringify(reopened),
)

await pick(2)
await click(EN.progressSave)
await sleep(300)
const two = JSON.parse(await raw()).facts.filter((f) => f.key.endsWith('.progress'))
/**
 * Appended, not replaced. This is the check that keeps "progress over time" possible without
 * anything today reading it: the log holds every rating with its own `learnedAt`, and only
 * the newest is shown.
 */
check(
  '50h. a later answer is appended, and the newest one wins',
  two.length === 2 && two.map((f) => f.value).join('') === '32' && (await dots())?.filled === 2,
  two.map((f) => f.value).join(' → '),
)

const beforeRepeat = await raw()
await clickSelector('main .scale-toggle')
await waitForText(EN.progressQuestion)
await pick(2)
await click(EN.progressSave)
await sleep(300)
/**
 * Saying the same thing twice writes nothing.
 *
 * The guard is in the writer rather than at the two call sites, so this holds from the start
 * page too. What it costs is recorded in `docs/goals-and-areas.md`: the log now holds
 * *changes*, not check-ins, and "when did they last confirm this was still a 2" has no
 * answer. A future periodic check-in wants its own key, not this one relaxed.
 */
check(
  '50i. confirming the value it already holds writes nothing',
  (await raw()) === beforeRepeat,
  (await raw()) === beforeRepeat ? 'no duplicate appended' : 'STORE CHANGED',
)

/**
 * The `GOAL_KEY` trap, asserted rather than trusted.
 *
 * That pattern is what discovers which goals exist, so a field added to it makes any fact
 * under a goal id conjure a goal with no words — from a hand-edited or partially-synced
 * store. `pinned` is excluded for this reason and `progress` follows it; this is what would
 * notice if either were ever folded back in.
 */
await goto('/')
const ghostAt = '2026-03-01T00:00:00.000Z'
await evaluate(
  `localStorage.setItem(${JSON.stringify(STORAGE_KEY)}, ${JSON.stringify(
    JSON.stringify({
      version: 1,
      consentAt: ghostAt,
      locale: 'en',
      facts: [
        { id: 'x1', key: 'introduction_done', value: 'yes', source: 'goals', learnedAt: ghostAt },
        { id: 'x2', key: `area.${AREA_G}.review`, value: 'yes', source: 'goals', learnedAt: ghostAt },
        { id: 'x3', key: `area.${AREA_G}.goal.real.text`, value: 'A real goal', source: 'goals', learnedAt: ghostAt },
        { id: 'x4', key: `area.${AREA_G}.goal.ghost.progress`, value: '4', source: 'goals', learnedAt: ghostAt },
      ],
    }),
  )})`,
)
await goto(`/areas/${AREA_G}/`)
await waitForText('A real goal')
check(
  '50j. a rating with no goal behind it does not conjure one',
  (await count('main ol > li')) === 1 && !(await text()).includes(EN.progress4),
  `${await count('main ol > li')} goal cards`,
)

// --- the fifth point ------------------------------------------------------

await seedGoals()
await goto(`/areas/${AREA_G}/`)
await waitForText('Finish the portfolio')
await clickSelector('main .scale-toggle')
await waitForText(EN.progressQuestion)
const beforeFive = await raw()
await pick(5)
screen = await text()
check(
  '50k. reaching the top of the scale asks rather than acts, and still writes nothing',
  (await raw()) === beforeFive &&
    screen.includes(EN.reachedQuestion) &&
    screen.includes(EN.progressQuestion) &&
    screen.includes(EN.goalCloseNote),
  (await raw()) === beforeFive ? 'asked, nothing written' : 'STORE CHANGED',
)

await pick(4)
screen = await text()
/**
 * The scale stays on screen while it asks, which is the whole reason the question is not a
 * screen of its own: changing your mind costs one tap on another dot rather than a trip out
 * through Cancel and back in.
 */
check(
  '50l. picking a lower point takes the question back',
  !screen.includes(EN.reachedQuestion) && screen.includes(EN.progress4),
  'back to an ordinary save',
)

await pick(5)
await click(EN.reachedNo)
await sleep(300)
check(
  '50m. declining the question leaves the goal exactly as it was',
  (await raw()) === beforeFive && (await text()).includes('Finish the portfolio'),
  (await raw()) === beforeFive ? 'untouched, goal still there' : 'STORE CHANGED',
)

await clickSelector('main .scale-toggle')
await waitForText(EN.progressQuestion)
await pick(5)
await click(EN.reachedYes)
await sleep(400)
screen = await text()
/**
 * Two facts, in causal order — "I got there", then "so this is done".
 *
 * The fixture already writes `text` and `why` under this goal, so the filter is on the two
 * fields the act produces rather than on the goal id; asserting a count over everything
 * under `goal.<gid>.` would have counted the seed and passed for the wrong reason.
 *
 * `state` is written by the same `completeGoal` the "I have reached this" control uses, so
 * the cascade, `activeGoals` and `/data/stored/` all behave as they already did.
 */
const closing = JSON.parse(await raw()).facts.filter(
  (f) => f.key.startsWith(`area.${AREA_G}.goal.${G1}.`) && /\.(progress|state)$/.test(f.key),
)
check(
  '50n. confirming records the five and closes the goal, in that order',
  closing.length === 2 &&
    closing[0].key.endsWith('.progress') &&
    closing[0].value === '5' &&
    closing[1].key.endsWith('.state') &&
    closing[1].value === 'done',
  closing.map((f) => `${f.key.split('.').pop()}=${f.value}`).join(' → '),
)
/**
 * The congratulation has the page, and does not quote the goal back.
 *
 * Both halves are deliberate. It stays generic because quoting a half-typed goal at someone
 * is slightly absurd and the moment does not need the app to prove it was listening — so the
 * check asserts the words are **gone**, which also proves the list stood down rather than
 * merely losing one row. Reaching the last goal in an area is what makes that matter: without
 * it, "there is nothing to see here yet" and an offer to create a goal land directly under a
 * celebration.
 *
 * The way on is primary, because with everything else hidden it is the only thing to do.
 */
const celebration = await evaluate(`(() => {
  const main = document.querySelector('main');
  const on = [...main.querySelectorAll('a, button')].find(
    (el) => el.innerText.trim() === ${JSON.stringify('Continue')},
  );
  return {
    buttons: [...main.querySelectorAll('button')].map((b) => b.innerText.trim()).filter(Boolean),
    primary: on?.classList.contains('btn-primary') ?? null,
  };
})()`)
check(
  '50o. it says so without quoting the goal, and takes the page while it does',
  screen.includes(EN.congrats) &&
    screen.includes(EN.congratsAny) &&
    !screen.includes('Finish the portfolio') &&
    !screen.includes(EN.emptyNote) &&
    celebration?.primary === true &&
    celebration.buttons.length === 1,
  `${celebration?.buttons.join(' / ')} — primary ${celebration?.primary}`,
)

await click(EN.congratsClose)
await sleep(300)
check(
  '50o2. and dismissing it gives the page back',
  (await text()).includes(EN.emptyNote),
  'the area is itself again',
)

/**
 * The cascade, observed rather than assumed: an entry leaves the open set when the goal it
 * serves closes, by derivation and with no second write. It is the reason the confirmation
 * states a consequence, so it had better be true.
 */
await goto('/')
await sleep(400)
check(
  '50p. what was being tried for it leaves the start page with it',
  !(await text()).includes('Pick the three best pieces'),
  'entries gone with the goal',
)

// --- the start page -------------------------------------------------------

await seedGoals()
await goto('/')
await click(EN.viewGoals)
await sleep(300)
const starsBefore = (await ariaLabels()).filter(
  (l) => l.startsWith('Pin:') || l.startsWith('Unpin:'),
).length
await clickSelector('main .scale-toggle')
await waitForText(EN.progressQuestion)
const beforeHome = await raw()
await pick(2)
const starsDuring = (await ariaLabels()).filter(
  (l) => l.startsWith('Pin:') || l.startsWith('Unpin:'),
).length
/**
 * **That** row's star comes down, not every row's.
 *
 * A count rather than an absence, because the other goals are still listed and still
 * starrable — they are different goals, not the surrounding detail of this one, so hiding
 * them would be a different and wrong idea of focus. Asserting "no stars at all" would have
 * demanded exactly that.
 */
check(
  '50q. the start page holds the choice unsaved, and takes down that row’s star only',
  (await raw()) === beforeHome && starsDuring === starsBefore - 1 && starsBefore > 1,
  (await raw()) === beforeHome
    ? `nothing written, stars ${starsBefore} → ${starsDuring}`
    : 'STORE CHANGED',
)

await click(EN.progressSave)
await sleep(300)
const fromHome = JSON.parse(await raw()).facts.filter((f) => f.key.endsWith('.progress'))
/**
 * The first goal on the start page is the **legacy** one, and that makes this the better
 * case rather than the wrong one.
 *
 * Its words live at the old bare `area.<a>.goal` key and always will — moving them would
 * split its wording history at the seam. Its newer fields live under the reserved gid like
 * any other goal's, which is the whole point of putting the id in the key: a goal can grow
 * a field without its text having to move. This is that claim, exercised on the one goal
 * where it is not obvious.
 */
check(
  '50r. and confirming from there writes the same key — including for the legacy goal',
  fromHome.length === 1 &&
    fromHome[0].key === `area.${AREAS[0].id}.goal.legacy.progress` &&
    fromHome[0].value === '2',
  fromHome.map((f) => `${f.key}=${f.value}`).join(', ') || 'nothing written',
)

/**
 * Two states, two differences, identical metrics — the rule `components/progress-marks.tsx`
 * follows and the reason this reuses its vocabulary rather than inventing a second one. §17
 * forbids carrying meaning by colour alone, so fill and border width both have to change;
 * the boxes have to stay one size, or every rating would reflow the row.
 */
await goto('/')
await sleep(300)
const painted50 = await dots()
check(
  '50s. filled and empty marks are one size and differ in more than colour',
  painted50?.boxes.length === 1 &&
    painted50.first.background !== painted50.last.background &&
    painted50.first.borderWidth !== painted50.last.borderWidth,
  `${painted50?.boxes.join(',')} — ${painted50?.first.borderWidth} vs ${painted50?.last.borderWidth}`,
)

/**
 * The radios are native on purpose: `components/menu.tsx` sets the rule that claiming a role
 * without implementing its keyboard behaviour is worse than not claiming it, and nothing in
 * this project implements roving focus. So the browser does it — which only holds while they
 * really are inputs in a named group.
 */
await goto('/')
await click(EN.viewGoals)
await sleep(300)
await clickSelector('main .scale-toggle')
await waitForText(EN.progressQuestion)
const keyboard = await evaluate(`(() => {
  const group = document.querySelector('main form fieldset');
  const inputs = [...(group?.querySelectorAll('input[type="radio"]') || [])];
  return {
    grouped: Boolean(group?.querySelector('legend')?.textContent?.trim()),
    sameName: new Set(inputs.map((i) => i.name)).size === 1,
    named: inputs.every((i) => (i.closest('label')?.innerText || '').trim().length > 0),
    count: inputs.length,
  };
})()`)
check(
  '50t. every point is a real radio in a named group, each with its own name',
  keyboard?.count === 5 && keyboard.grouped && keyboard.sameName && keyboard.named,
  JSON.stringify(keyboard),
)

/**
 * Memory mode. `setGoalProgress` goes through `remember()` like everything else, so the
 * consent gate applies — but "it goes through `remember()` so it must be gated" is an
 * argument, not a check, which is the same reasoning 5e already records one level up.
 */
await clearStorage()
await goto('/')
await click(EN.no)
await type('Not for me.')
await click(EN.cont)
await click(EN.contYes)
await click(EN.introOk)
await runArea('Sleep before midnight', 'Phone out of the bedroom')
await declineRest()
await click(EN.toHome)
await click(EN.viewGoals)
await sleep(300)
await clickSelector('main .scale-toggle')
await waitForText(EN.progressQuestion)
await pick(3)
await click(EN.progressSave)
await sleep(300)
check(
  '50u. rating works with nothing being saved, and saves nothing',
  (await dots())?.filled === 3 && (await keys()).length === 0,
  `${(await keys()).length} localStorage keys`,
)

// --- 51. structural edges are one weight, and it is not a hairline --------

/**
 * `--edge` reaches everything that draws a control or a card, and separators are left alone.
 *
 * This exists because of how the first attempt failed. `--edge: 1.5px` was correct in the
 * stylesheet, shipped in the built CSS, and rendered as **1px** — Chrome floors a border to
 * whole device pixels, so it only showed on a retina screen. Everything looked right on the
 * machine it was written on and nothing had changed anywhere else. Asserting a *number*
 * rather than "the declaration is present" is the whole point: the used value is the only
 * thing that says whether the change happened.
 *
 * The second half matters as much as the first. The reason a control edge is thicker is to
 * stop it reading as the same kind of line as a rule between paragraphs — so if separators
 * were ever swept along with it, the distinction this token exists to create would be gone
 * while every "is it thicker" check still passed.
 */
await seedGoals()
await goto(`/areas/${AREAS[3].id}/`)
await waitForText('Finish the portfolio')
// Rated first, so the marks have both states to compare. Unrated they are five identical
// empty circles, and 51c would have been measuring nothing.
await clickSelector('main .scale-toggle')
await waitForText(EN.progressQuestion)
await pick(3)
await click(EN.progressSave)
await sleep(300)
const edges = await evaluate(`(() => {
  const width = (sel) => {
    const el = document.querySelector(sel);
    return el ? getComputedStyle(el).borderTopWidth : null;
  };
  const dots = [...document.querySelectorAll('main .scale-toggle span')]
    .map((el) => getComputedStyle(el).borderTopWidth);
  return {
    card: width('main ol > li'),
    button: width('main .btn'),
    pin: width('main .pin-toggle'),
    scale: width('main .scale-toggle'),
    // A decorative rule, which must stay a hairline.
    rule: getComputedStyle(document.querySelector('footer')).borderTopWidth,
    dots: [...new Set(dots)].sort(),
  };
})()`)
const structural = [edges?.card, edges?.button, edges?.pin, edges?.scale]
check(
  '51a. every control and card edge is drawn at the same weight, thicker than a hairline',
  new Set(structural).size === 1 && parseFloat(structural[0]) >= 2,
  structural.join(' / '),
)
check(
  '51b. and a separator is still a hairline, which is the distinction the token buys',
  edges?.rule === '1px' && parseFloat(structural[0]) > parseFloat(edges.rule),
  `rule ${edges?.rule} vs edge ${structural[0]}`,
)
/**
 * The scale's marks are **not** on `--edge`, and must not be swept onto it: their 1px/2px
 * difference is the second, non-colour cue that says which are filled. §17 forbids carrying
 * meaning by colour alone, so equalising these would break an accessibility rule while
 * looking like tidying up.
 */
check(
  '51c. the scale marks keep their own two widths, which is how filled is readable',
  edges?.dots.length === 2,
  edges?.dots.join(' / '),
)

// --- 52. starring a life area moves it, and changes nothing else ---------

/**
 * The third thing that can be starred, and it means what the other two mean: *show me this
 * first*. Any number may be set, nothing behaves differently for it, and it orders exactly
 * one list.
 *
 * The order it overrides is presentation rather than data — `lib/areas.ts` drives the
 * introduction's sequence and nothing else — so this is safe in a way re-ordering stored
 * things would not be. §52c is the check on that: the *walk* order must not move.
 */
await seedGoals()
await goto('/areas/')
await waitForText(EN.picker)
const orderBefore = await evaluate(
  `[...document.querySelectorAll('main ul > li')].map((li) => li.innerText.replace(/[ ]+/g, ' ').trim())`,
)
await clickAria(`Pin: ${AREAS[3].label}`)
await sleep(350)
const orderAfter = await evaluate(
  `[...document.querySelectorAll('main ul > li')].map((li) => li.innerText.replace(/[ ]+/g, ' ').trim())`,
)
const starFacts = JSON.parse(await raw()).facts.filter((f) => /^area\.[^.]+\.pinned$/.test(f.key))
check(
  '52a. starring an area moves it to the top and writes one fact on the area itself',
  orderBefore?.[0] !== orderAfter?.[0] &&
    orderAfter?.[0]?.includes(AREAS[3].label) &&
    starFacts.length === 1 &&
    starFacts[0].key === `area.${AREAS[3].id}.pinned` &&
    starFacts[0].value === 'yes',
  `${orderBefore?.[0]} → ${orderAfter?.[0]}`,
)
check(
  '52a2. and the areas below it keep the order they had',
  JSON.stringify(orderAfter?.slice(1)) ===
    JSON.stringify(orderBefore?.filter((label) => !label.includes(AREAS[3].label))),
  (orderAfter ?? []).join(' / '),
)

await goto('/areas/')
await waitForText(EN.picker)
const persisted = await evaluate(
  `document.querySelector('main ul > li').innerText.replace(/[ ]+/g, ' ').trim()`,
)
await clickAria(`Unpin: ${AREAS[3].label}`)
await sleep(350)
const orderBack = await evaluate(
  `[...document.querySelectorAll('main ul > li')].map((li) => li.innerText.replace(/[ ]+/g, ' ').trim())`,
)
check(
  '52b. it survives a reload, and unstarring puts the list back as it was',
  persisted?.includes(AREAS[3].label) && JSON.stringify(orderBack) === JSON.stringify(orderBefore),
  `${persisted} → ${orderBack?.[0]}`,
)

/**
 * The introduction's sequence is **not** the list's order, and starring must not touch it.
 *
 * They come from the same array, which is exactly why this is worth asserting rather than
 * reasoning about: `/areas/` re-orders a copy, and a future refactor that sorted `areas`
 * itself would change which area someone is asked about first — silently, and only for
 * people who had starred something.
 */
await clearStorage()
await goto('/')
await evaluate(
  `localStorage.setItem(${JSON.stringify(STORAGE_KEY)}, ${JSON.stringify(
    JSON.stringify({
      version: 1,
      consentAt: '2026-04-01T00:00:00.000Z',
      locale: 'en',
      facts: [
        {
          id: 'star',
          key: `area.${AREAS[5].id}.pinned`,
          value: 'yes',
          source: 'goals',
          learnedAt: '2026-04-01T00:00:00.000Z',
        },
      ],
    }),
  )})`,
)
await goto('/')
await sleep(500)
// Past the "next we will look at six areas" screen, which is what a store holding nothing
// but a star opens on.
await click(EN.introOk)
await sleep(300)
screen = await text()
check(
  '52c. a starred area does not jump the queue in the introduction',
  screen.includes(AREAS[0].label) && !screen.includes(AREAS[5].label),
  screen.replace(NL, ' / ').slice(0, 90),
)

await goto('/data/stored/')
await expandAll()
check(
  '52d. and the star is shown on the page that promises to show everything',
  (await text()).includes('kept at the top'),
  'star rendered rather than silently held',
)

check(
  '9. no request went anywhere but the app’s own assets',
  external.length === 0,
  external.length ? [...new Set(external)].join(', ') : `${requested.length} requests, all local`,
)

// Check 9 proves nothing left the machine; it does not notice that something failed
// to arrive. Two lines, and the only thing standing between us and a dynamic route
// that was never statically generated — `<Link>` prefetches a path that does not
// exist, gets a 404, and every visible assertion still passes because a cold
// navigation to the same URL works fine.
/**
 * Two exemptions, both narrow and both explained, because an exemption nobody can
 * justify is how a check like this rots into decoration.
 *
 * - `favicon.ico` — the browser asks unprompted and the project ships none.
 * - The RSC segment-prefetch payloads. Next builds their filenames with
 *   `path.relative`, which yields `\` on Windows and `/` on Linux, so a
 *   Windows-built `out/` nests `__next.about/__PAGE__.txt` in a directory where the
 *   client requests the flat `__next.about.__PAGE__.txt`. **Pre-existing** — it
 *   already affects `/about` and `/you`, which are older than this branch — and it
 *   costs only `<Link>` prefetch warm-up: every cold navigation and reload still
 *   works, which §27d and §27e assert directly.
 *
 * What is left is the part that matters: a document, script or stylesheet the app
 * actually needs coming back 404. That is what a dynamic route missing
 * `generateStaticParams` looks like.
 */
const exempt = (url) => url.endsWith('/favicon.ico') || /\/__next\..*\.txt/.test(url)
const badResponses = events
  .filter((e) => e.method === 'Network.responseReceived' && e.params.response.status >= 400)
  .map((e) => `${e.params.response.status} ${e.params.response.url}`)
  .filter((entry) => !exempt(entry))
check(
  '9b. and nothing the app actually needs came back missing or broken',
  badResponses.length === 0,
  badResponses.length ? [...new Set(badResponses)].join(', ') : 'no unexpected response >= 400',
)

// --- 19. the browser console is quiet ------------------------------------

/**
 * Catches what DOM assertions cannot: React's hydration warnings, and anything
 * that threw where nobody was looking.
 *
 * Note that React only warns about hydration mismatches in development, so
 * running this against the production export is not enough on its own — point it
 * at `next dev` (`node scripts/verify.mjs http://localhost:3000`) to catch those.
 */
const consoleErrors = events
  .filter((event) => event.method === 'Runtime.consoleAPICalled' && event.params.type === 'error')
  .map((event) =>
    String(event.params.args?.[0]?.value ?? event.params.args?.[0]?.description ?? 'error')
      .replace(/\s+/g, ' ')
      .slice(0, 120),
  )
const thrown = events
  .filter((event) => event.method === 'Runtime.exceptionThrown')
  .map((event) =>
    String(event.params.exceptionDetails?.exception?.description ?? 'exception')
      .replace(/\s+/g, ' ')
      .slice(0, 120),
  )
const noisy = [...new Set([...consoleErrors, ...thrown])]
check(
  '19. no console errors and nothing thrown',
  noisy.length === 0,
  noisy.length ? noisy.join(' | ') : 'console clean',
)

// --- done ----------------------------------------------------------------

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
if (failed.length) console.log(`failed:\n${failed.map((f) => `  - ${f.name} (${f.detail})`).join('\n')}`)

ws.close()
chrome.kill()
process.exit(failed.length ? 1 : 0)
