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
  steps: 'What could help you move toward this goal?',
  entries: 'What you want to try',
  entriesNote: 'One is enough. You can add up to three.',
  add: 'Add',
  addMore: 'Add another',
  full: 'Three is plenty to start with.',
  edit: 'Edit',
  editSubmit: 'Save',
  enough: 'That is enough',
  stepsUnknown: 'I do not know yet',
  focus: 'Which one would you like to focus on first?',
  complete: 'That is it for now.',
  toHome: 'Go to the start page',
  home: 'What you are working on',
  check: 'How is it going?',
  outcomeDone: 'I have done this',
  outcomeOngoing: 'Still on it',
  outcomeAside: 'This does not fit me anymore',
  cancel: 'Cancel',
  noted: 'Noted.',
  chooseNext: 'Choose something',
  later: 'Later',
  save: 'Save',
  navHome: 'Start',
  navAreas: 'Life areas',
  picker: 'Your life areas',
  changeGoal: 'Change goal',
  addStep: 'Add something to try',
  manageDone: 'Done',
  goalChanged: 'Your goal changed. Is this still useful?',
  keep: 'Keep',
  removeStep: 'Remove from current steps',
  contYes: 'Yes, let us go on',
  navData: 'Data protection',
  dataShow: 'Show what is stored',
  storedTitle: 'What is stored',
  del: 'Delete everything',
  delWarn: 'Delete all data?',
  delKeep: 'Keep it',
  delConfirm: 'Yes, delete everything',
  delDone: 'Deleted. Nothing is left.',
  storageChange: 'Change storage settings',
  storageLocal: 'Currently: saved on this device',
  storageMemory: 'Currently: this tab only',
  storageOptionLocal: 'Save on this device',
  storageOptionMemory: 'This tab only',
  storageOffTitle: 'Turn saving off?',
  storageOffConfirm: 'Turn saving off and delete',
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
  { id: 'work', label: 'Work & Career', de: 'Arbeit & Beruf' },
  { id: 'finances', label: 'Finances', de: 'Finanzen' },
  { id: 'creativity', label: 'Hobbies & Creativity', de: 'Hobbys & Kreativität' },
]

/** The one the introduction ends on, which is the area §25 interrupts. */
const LAST_AREA = AREAS[AREAS.length - 1]

/** The collapsed-nav trigger, which is icon-only and so has to be found by name. */
const MENU = 'button[aria-label="Menu"], button[aria-label="Menü"]'

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
 * Walks one life area: yes, a goal, some next steps, and the one to start with.
 *
 * The last click differs by count on purpose, and that difference is itself part
 * of the design: one step is made active without asking, and at three the field
 * gives way to a plain Continue.
 */
async function runArea(goal, steps, focusOn) {
  await click(EN.reviewYes)
  await type(goal)
  await click(EN.cont)
  await enterEntries(steps)
  await click(steps.length >= 3 ? EN.cont : EN.enough)
  if (steps.length > 1) await click(focusOn ?? steps[0])
}

/**
 * Types the entries in, one at a time. Extracted from `runArea` so §29 can stop
 * part-way through the list and exercise editing.
 *
 * The button label differs for the first entry, and that is deliberate rather than
 * incidental: the change from "Add" to "Add another" is what tells someone more
 * than one is allowed. §29 asserts the two really are different.
 */
async function enterEntries(steps) {
  for (const [index, step] of steps.entries()) {
    await type(step)
    await click(index === 0 ? EN.add : EN.addMore)
  }
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

await runArea('Sleep better', ['Walk for 20 minutes', 'Read before bed'], 'Walk for 20 minutes')
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

await runArea('Get the portfolio finished', ['Finish the case study'])
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

await click(EN.toHome)
screen = await text()
check(
  '4i. home surfaces one active step per area that has one, and nothing else',
  screen.includes(EN.home) &&
    screen.includes('Walk for 20 minutes') &&
    screen.includes('Finish the case study') &&
    // prepared but not the one being worked on
    !screen.includes('Read before bed') &&
    // reviewed with "not right now" — present, but not shown as a gap
    !screen.includes(AREAS[3].label),
  screen.replace(/\n/g, ' / ').slice(0, 120),
)

const stored = JSON.parse(await raw())
const factsFor = (store, suffix) => store.facts.filter((f) => f.key.endsWith(suffix))
check(
  '4j. the store holds the answers verbatim, one goal and one pointer per area',
  stored.version === 1 &&
    typeof stored.consentAt === 'string' &&
    factsFor(stored, '.review').length === AREAS.length &&
    stored.facts.some(
      (f) => f.key === `area.${AREAS[0].id}.goal` && f.value === 'Sleep better',
    ) &&
    stored.facts.some(
      (f) => f.key === `area.${AREAS[3].id}.review` && f.value === 'not_now',
    ) &&
    factsFor(stored, '.text').length === 3 &&
    factsFor(stored, '.step_active').length === 2,
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
  '4k. step ids live in keys; the only fact whose value is an id is the pointer',
  stored.facts.some((f) => /^area\.body\.step\.[^.]+\.text$/.test(f.key)) &&
    stored.facts
      .filter((f) => UUID.test(f.value))
      .every((f) => f.key.endsWith('.step_active')),
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

await clickAria(`How is it going with: Walk for 20 minutes`)
await clickOption(EN.outcomeDone)
screen = await text()
check(
  '24d. "I have done this" offers something next rather than creating one',
  screen.includes(EN.noted) && screen.includes(EN.chooseNext) && screen.includes(EN.later),
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

// "Later" is a real answer and costs nothing: the area already has nothing active,
// so there is nothing left to record.
const beforeLater = JSON.parse(await raw()).facts.length
await click(EN.later)
screen = await text()
store = JSON.parse(await raw())
check(
  '24f. "Later" writes nothing and leaves the area with nothing active',
  store.facts.length === beforeLater && !screen.includes('Walk for 20 minutes'),
  `${store.facts.length} facts vs ${beforeLater}`,
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

await click(EN.chooseNext)
screen = await text()
check(
  '24h. with nothing else prepared, a new one is asked for instead of invented',
  screen.includes(EN.steps),
)
await type('Write the intro')
await click(EN.save)
check('24i. and the new one becomes what is being worked on', (await text()).includes('Write the intro'))

// The same words at two points in time are two different things. Doing something
// useful again later is a new thing to do, not a repeat of the old one.
await clickAria(`How is it going with: Write the intro`)
await clickOption(EN.outcomeDone)
await click(EN.chooseNext)
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
await waitForText(EN.addStep)
await click(EN.addStep)
await type('Ask Sam for feedback')
await click(EN.save)
await click(EN.addStep)
await type('Pick the three best pieces')
await click(EN.save)
check(
  '24n. at three open entries there is no way to add a fourth',
  !(await visible(EN.addStep)),
  (await text()).replace(/\n/g, ' / ').slice(0, 140),
)

// --- 7. changing a goal: append-only, and open steps are reviewed ----------

await click(EN.changeGoal)
await type('Get hired somewhere I like')
await click(EN.cont)
screen = await text()
check(
  '7a. a changed goal asks about each still-open step rather than assuming',
  screen.includes(EN.goalChanged) && screen.includes('Write the intro'),
)

await click(EN.keep)
screen = await text()
check('7b. Keep moves to the next open step without writing anything', screen.includes(EN.goalChanged))

const retiredCount = (s) =>
  s.facts.filter((f) => f.key.endsWith('.state') && f.value === 'retired').length
const beforeRemoveStore = JSON.parse(await raw())
const beforeRemove = beforeRemoveStore.facts.length
await click(EN.removeStep)
await click(EN.keep)
store = JSON.parse(await raw())
check(
  '7c. Remove retires the step — one fact added, nothing deleted',
  // A delta, not a total: setting something aside from the home screen also
  // retires, so a global count of 1 would only hold while that path went untested.
  store.facts.length === beforeRemove + 1 &&
    retiredCount(store) === retiredCount(beforeRemoveStore) + 1,
  `${store.facts.length} facts vs ${beforeRemove}, retired ${retiredCount(beforeRemoveStore)} → ${retiredCount(store)}`,
)
check(
  '7d. both goals are kept, and the newer one is the current one',
  store.facts.filter((f) => f.key === `area.${AREAS[2].id}.goal`).length === 2,
  `${store.facts.filter((f) => f.key === 'area.work.goal').length} goal facts`,
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
  screen.includes('working on this') &&
    screen.includes('done') &&
    screen.includes('set aside') &&
    !/removed from/.test(screen),
  /removed from/.test(screen) ? 'still claims removal' : 'working on this / done / set aside',
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

await clearStorage()
await goto('/')
await click(EN.yes)
await click(EN.introOk)
await click(EN.reviewYes)
await type('Sleep better')
await click(EN.cont)

screen = await text()
check(
  '29a. the cap is stated before the first entry, not discovered at the third',
  screen.includes(EN.entriesNote) && (await count('ol li')) === 0,
  `${await count('ol li')} entries listed`,
)

// The label really has to differ, or the change from "Add" to "Add another" — the
// thing that says more is allowed — could be absent while every click still lands.
const addFirst = (await visible(EN.add)) && !(await visible(EN.addMore))
await type('Walk after dinner')
await click(EN.add)
const addNext = (await visible(EN.addMore)) && !(await visible(EN.add))
check(
  '29b. the add control says "Add" for the first entry and "Add another" after it',
  addFirst && addNext,
  `first: ${addFirst}, after one: ${addNext}`,
)

check(
  '29c. entries are a numbered list under a heading, and offer their own Edit',
  (await count('ol li')) === 1 &&
    (await text()).includes(EN.entries) &&
    (await ariaLabels()).includes('Edit: Walk after dinner'),
  (await ariaLabels()).join(' / '),
)

await type('Read before bed')
await click(EN.addMore)
await type('Stretch in the morning')
await click(EN.addMore)
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
await runArea('Move more', ['Walk after lunch'])
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
await click(EN.chooseNext)
await type('Ring Ada')
await click(EN.save)
await clickAria(`How is it going with: Ring Ada`)
await clickOption(EN.outcomeAside)
await click(EN.later)
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
await runArea('Move more', ['Walk after lunch'])
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
await click(EN.storageChange)
await clickOption(EN.storageOptionLocal)
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
await click('Weiter')
await type('20 Minuten spazieren gehen')
await click('Hinzufügen')
await click('Das reicht')
await declineRest({ no: 'Gerade nicht', done: 'Das war’s für den Anfang.' })
await click('Zur Startseite')
screen = await text()
check(
  '6d. the whole flow reads in German and what was typed comes back verbatim',
  screen.includes('Woran du gerade dran bist') &&
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
await click(EN.cont)
await goto('/')
screen = await text()
check(
  '25a. a review answer for every area ends the introduction, even with one left unfinished',
  screen.includes(EN.home) && !screen.includes(EN.review) && !screen.includes(EN.steps),
  screen.replace(/\n/g, ' / ').slice(0, 100),
)
check(
  '25b. and home says so, rather than reporting that everything is settled',
  screen.includes('has a goal, but you have not decided yet'),
)

// The sentence names the area and links to it. Both halves matter: a link whose text
// is "life area" would be useless out of context, and a link that navigates nowhere
// useful is worse than the prose it replaced.
const unfinishedLink = await evaluate(
  `(() => {
     const link = [...document.querySelectorAll('main a[href]')]
       .find((a) => a.textContent.trim() === ${JSON.stringify(LAST_AREA.label)});
     return link ? { text: link.textContent.trim(), href: new URL(link.href).pathname } : null;
   })()`,
)
check(
  '25b2. the unfinished area is named as a real link to that area',
  unfinishedLink?.href === `/areas/${LAST_AREA.id}/`,
  unfinishedLink ? `${unfinishedLink.text} → ${unfinishedLink.href}` : 'no link on the area name',
)

// The trap this page has already fallen into once: something that looks like
// navigation but writes. Following it must leave the store byte-identical.
const beforeUnfinished = await raw()
await clickText(LAST_AREA.label)
await sleep(400)
check(
  '25b3. and following it navigates without changing anything',
  (await text()).includes('Draw something every week') && (await raw()) === beforeUnfinished,
  (await raw()) === beforeUnfinished ? 'store untouched' : 'STORE CHANGED',
)
await goto('/')
screen = await text()

await clickNav(EN.navAreas)
screen = await text()
check(
  '25c. the unfinished area is reachable and says what is missing',
  screen.includes(LAST_AREA.label) && screen.includes('not decided yet what could help'),
)
await clickOption(LAST_AREA.label)
await waitForText('Draw something every week')
screen = await text()
check(
  '25d. its goal survived, and finishing the setup is one action away',
  screen.includes('Draw something every week') && (await visible(EN.addStep)),
)
await click(EN.addStep)
await type('Sketch on Sunday morning')
await click(EN.save)
// "Done" now returns to the areas list rather than to home, because the area is its
// own route. The list is where it shows up first.
await click(EN.manageDone)
await sleep(400)
screen = await text()
check(
  '25e. adding the missing entry makes it the active one, with nothing else asked',
  screen.includes('Sketch on Sunday morning') && screen.includes(EN.picker),
  screen.replace(/\n/g, ' / ').slice(0, 120),
)

await clickNav(EN.navHome)
screen = await text()
check(
  '25e2. and home stops reporting it as unfinished setup',
  screen.includes('Sketch on Sunday morning') && !screen.includes('has a goal, but you have not'),
  screen.replace(/\n/g, ' / ').slice(0, 120),
)

// The guard: an area with nothing active must never be read as "not onboarded".
await clickAria(`How is it going with: Sketch on Sunday morning`)
await clickOption(EN.outcomeDone)
await click(EN.later)
await goto('/')
screen = await text()
check(
  '25f. after finishing something and choosing "Later", a reload still lands on home',
  screen.includes(EN.home) && !screen.includes(EN.review) && !screen.includes(EN.intro),
  screen.replace(/\n/g, ' / ').slice(0, 100),
)
check(
  '25g. and "Later" is not reported as unfinished setup — it is a real answer',
  !screen.includes('has a goal, but you have not'),
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
await click(EN.cont)
screen = await text()
check(
  '38a. the steps screen offers a way on without inventing something',
  screen.includes(EN.steps) && (await visible(EN.stepsUnknown)) && !(await visible(EN.enough)),
  `"${EN.stepsUnknown}" offered: ${await visible(EN.stepsUnknown)}`,
)

// Secondary, and it must not compete with entering something concrete. `.btn-primary`
// on the way out would invite skipping.
const stepsButtons = await evaluate(
  `(() => {
     const b = [...document.querySelectorAll('main form button')];
     return b.map((x) => ({ label: x.textContent.trim(), primary: x.classList.contains('btn-primary'), quiet: x.classList.contains('btn-quiet') }));
   })()`,
)
check(
  '38b. adding stays the primary action and the way out is quiet',
  stepsButtons.find((b) => b.label === EN.add)?.primary === true &&
    stepsButtons.find((b) => b.label === EN.stepsUnknown)?.quiet === true &&
    stepsButtons.find((b) => b.label === EN.stepsUnknown)?.primary === false,
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
    (fact) => fact.key === `area.${AREAS[0].id}.goal` && fact.value === 'Sleep better',
  ),
  afterUnknown.filter((f) => f.key.endsWith('.goal')).map((f) => f.value).join(' | '),
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
  screen.includes('has a goal, but you have not decided yet') && screen.includes(EN.home),
  screen.replace(/\n/g, ' / ').slice(0, 140),
)

await clickNav(EN.navAreas)
screen = await text()
check(
  '38g. and the areas list says the same thing in the same words',
  screen.includes('Sleep better') && screen.includes('not decided yet what could help'),
  screen.replace(/\n/g, ' / ').slice(0, 160),
)

// Opening it must offer adding something without re-asking for the goal.
await clickOption(AREAS[0].label)
await waitForText(EN.addStep)
screen = await text()
check(
  '38h. opening the area offers adding something, with the goal intact',
  screen.includes('Sleep better') && (await visible(EN.addStep)),
  screen.replace(/\n/g, ' / ').slice(0, 140),
)

// And the state is reachable in German too, where the copy is a full sentence.
await goto('/')
await chooseIn('Language', 'Deutsch')
await sleep(400)
check(
  '38i. the same state reads correctly in German',
  (await text()).includes('noch nicht festgelegt'),
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
    return { border: style.borderTopColor, background: style.backgroundColor };
  })()`)
  const edgeRatio = await contrast(edge.border, edge.background)
  check(
    `31d. and a control's edge is visible against the surface it sits on (${scheme})`,
    edgeRatio >= 3,
    `${edgeRatio}:1 (${edge.border} on ${edge.background})`,
  )
}
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

// Rows navigate rather than select, so they are `<a>`. Nothing on this page changes
// anything, which is the whole difference from the `.option` buttons elsewhere.
check(
  '27c. and the rows are links, not buttons — this page changes nothing',
  (await count('main a[href]')) === AREAS.length && (await count('main button')) === 0,
  `${await count('main a[href]')} link(s), ${await count('main button')} button(s)`,
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
     const goal = [...row.querySelectorAll('span')]
       .find((e) => e.textContent.trim() === 'Sleep better');
     if (!name || !goal) return null;
     const px = (el) => parseFloat(getComputedStyle(el).fontSize);
     const ink = getComputedStyle(document.body).color;
     return {
       name: px(name),
       goal: px(goal),
       nameWeight: getComputedStyle(name).fontWeight,
       goalIsInk: getComputedStyle(goal).color === ink,
     };
   })()`,
)
check(
  '34a. the area name is larger than the goal beneath it',
  rowType !== null && rowType.name > rowType.goal,
  rowType ? `name ${rowType.name}px / goal ${rowType.goal}px, weight ${rowType.nameWeight}` : 'row not found',
)
check(
  '34b. and the goal is still the person’s words in full ink, only smaller',
  rowType?.goalIsInk === true,
  `goal is ink: ${rowType?.goalIsInk}`,
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
await goto('/areas/body/')
await click(EN.changeGoal)
screen = await text()
check(
  '35d. even the question views have it — they had no way out before',
  screen.includes('What is your goal now?') &&
    (await visible('Back to your life areas')) &&
    (await raw()) === beforeBack,
  screen.includes('What is your goal now?') ? 'present on the goal question' : 'wrong view',
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

// --- 36. the storage choice can be reopened, and off really means off --------
//
// §36d is the one that matters, and it is the §8 guarantee applied to a path that did
// not exist before: **turning saving off must leave `localStorage` completely empty.**
// Not "no facts" — no key.
//
// `declineConsent()` alone does not do that. `commit()` writes only when the mode is
// `local` and nothing in it removes anything, so switching with that call alone would
// leave the stored key on disk while the page said nothing was being saved. Which is
// why turning off goes through `forgetEverything()` first, and why the cost is stated
// before it is paid.

await seedOnboarded()
await goto('/data/')
screen = await text()
check(
  '36a. the page states the current mode as a label, right under the title',
  screen.includes(EN.storageLocal) && (await visible(EN.storageChange)),
  screen.replace(/\n/g, ' / ').slice(0, 120),
)

// Reopening a setting is not the same act as deciding it for the first time. There are
// two modes and the label above says which is in force, so the panel offers **only the
// other one** — no question, no restatement of the current mode, no second copy of what
// the four paragraphs on this page already explain.
await click(EN.storageChange)
screen = await text()
const modes = await evaluate(
  `(() => {
     const items = [...document.querySelectorAll('main li button.option')];
     return items.map((b) => b.innerText.trim().split('\\n')[0].trim());
   })()`,
)
check(
  '36b. the panel offers only the mode you are not on',
  modes.length === 1 && modes[0] === EN.storageOptionMemory,
  JSON.stringify(modes),
)
check(
  '36b2. and does not reprint the current setting or a question over it',
  !modes.includes(EN.storageOptionLocal) &&
    !screen.includes('How should what you write') &&
    // The current mode is still stated — outside the panel, where it belongs.
    screen.includes(EN.storageLocal),
  screen.includes(EN.storageLocal) ? 'stated once, above' : 'the current mode went missing',
)
check(
  '36c. and no toggle was introduced beside it',
  (await count('main input[type="checkbox"]')) === 0 &&
    (await count('main [role="switch"]')) === 0,
  `${await count('main input[type="checkbox"]')} checkbox(es), ${await count('main [role="switch"]')} switch(es)`,
)

// Backing out of the panel writes nothing, which is the "no change" path now that the
// current mode is not offered as something to re-pick.
const beforeNoop = await raw()
await click(EN.cancel)
check(
  '36c2. backing out of the panel changes nothing at all',
  (await raw()) === beforeNoop && (await visible(EN.storageChange)),
  (await raw()) === beforeNoop ? 'store untouched' : 'STORE CHANGED ON A NON-CHANGE',
)

// Switching away from a saving store explains the cost first, and changes nothing yet.
await click(EN.storageChange)
const beforeOff = await raw()
await clickOption(EN.storageOptionMemory)
screen = await text()
check(
  '36d. saying no explains that the stored data goes, and has not touched it yet',
  screen.includes(EN.storageOffTitle) && (await raw()) === beforeOff,
  (await raw()) === beforeOff ? 'store untouched' : 'STORE CHANGED BEFORE CONFIRMING',
)

// Backing out has to leave everything exactly as it was.
await click(EN.delKeep)
check(
  '36e. and backing out leaves the store byte-identical',
  (await raw()) === beforeOff && (await visible(EN.storageChange)),
  (await raw()) === beforeOff ? 'store untouched' : 'STORE CHANGED',
)

// The guarantee. Confirming must leave no key at all, and the page must then say so.
await click(EN.storageChange)
await clickOption(EN.storageOptionMemory)
await click(EN.storageOffConfirm)
await sleep(300)
screen = await text()
check(
  '36f. confirming leaves localStorage completely empty — no key, not just no facts',
  (await keys()).length === 0,
  JSON.stringify(await keys()),
)
check(
  '36g. and the page now states the new mode, without still claiming the old one',
  screen.includes(EN.storageMemory) && !screen.includes(EN.storageLocal),
  screen.replace(/\n/g, ' / ').slice(0, 120),
)

// Back on again, from memory mode, and this direction writes rather than deletes.
await click(EN.storageChange)
await clickOption(EN.storageOptionLocal)
await sleep(300)
check(
  '36h. turning it back on starts saving again, through the store’s own consent path',
  (await keys()).length === 1 && JSON.parse(await raw()).consentAt !== null,
  JSON.stringify(await keys()),
)

// One source of truth: a reload has to agree with what the page just said, because the
// mode was never held anywhere but the store.
await goto('/data/')
check(
  '36i. and the mode survives a reload, so nothing here is a second copy of it',
  (await text()).includes(EN.storageLocal),
  (await text()).replace(/\n/g, ' / ').slice(0, 120),
)

// A confirmation for a change with no consequence is the ceremony that teaches people
// to click through the ones that matter. With nothing stored there is nothing to lose,
// so switching off happens directly — and still has to clear the key, because a
// consented store with no facts is still a key on the device.
await clearStorage()
await goto('/')
await click(EN.yes)
await goto('/data/')
check(
  '36j. a consented store with no answers yet still reports saving as on',
  (await text()).includes(EN.storageLocal) && (await keys()).length === 1,
  JSON.stringify(await keys()),
)
await click(EN.storageChange)
await clickOption(EN.storageOptionMemory)
await sleep(300)
screen = await text()
check(
  '36k. with nothing stored, switching off asks for no confirmation',
  !screen.includes(EN.storageOffTitle) && screen.includes(EN.storageMemory),
  screen.includes(EN.storageOffTitle) ? 'confirmed a change with no consequence' : 'switched directly',
)
check(
  '36l. and it still removed the key, and did not claim to have deleted anything',
  (await keys()).length === 0 && !screen.includes('has been deleted'),
  `${JSON.stringify(await keys())}, ${screen.includes('has been deleted') ? 'CLAIMED A DELETION' : 'no false claim'}`,
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

// --- 9. nothing leaves the browser ---------------------------------------

const requested = events
  .filter((e) => e.method === 'Network.requestWillBeSent')
  .map((e) => e.params.request.url)
const external = requested.filter((url) => !url.startsWith(BASE) && !url.startsWith('data:'))
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
