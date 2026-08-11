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
  window.__click = (text) => {
    const el = [...document.querySelectorAll('button, a')]
      .find((e) => e.textContent.trim() === text);
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
    const el = [...document.querySelectorAll('button.option')]
      .find((e) => e.textContent.includes(text));
    if (!el) throw new Error('no option containing: ' + text + ' | seen: ' +
      [...document.querySelectorAll('button.option')].map(e => e.textContent.trim()).join(' / '));
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
const focused = async (selector) => {
  await evaluate(HELPERS)
  return evaluate(`__focus(${JSON.stringify(selector)})`)
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
  intro: 'Next we will look at five areas of your life',
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
  focus: 'Which one would you like to focus on first?',
  complete: 'That is it for now.',
  toHome: 'Go to the start page',
  home: 'What you are working on',
  check: 'How is it going?',
  outcomeDone: 'I have done this',
  outcomeOngoing: 'Still on it',
  outcomeSwap: 'I would rather do something else',
  outcomeAside: 'This does not fit anymore',
  cancel: 'Cancel',
  noted: 'Noted.',
  chooseNext: 'Choose something',
  later: 'Later',
  save: 'Save',
  toAreas: 'Review your life areas',
  picker: 'Your life areas',
  changeGoal: 'Change goal',
  addStep: 'Add something to try',
  manageDone: 'Done',
  goalChanged: 'Your goal changed. Is this still useful?',
  keep: 'Keep',
  removeStep: 'Remove from current steps',
  contYes: 'Yes, let us go on',
  forget: 'Forget everything',
  forgetConfirm: 'Yes, forget everything',
}

/** Any internal id leaking into rendered copy would look like this. */
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

async function clearStorage() {
  await goto('/')
  await evaluate('localStorage.clear()')
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
  screen.includes('Body & Health') && screen.includes(EN.review),
)

let marks = await progress()
check(
  '4d. progress starts at none reviewed, and says which area this is',
  marks.now === 0 && marks.max === 5 && marks.text === 'Area 1 of 5',
  JSON.stringify(marks && { now: marks.now, max: marks.max, text: marks.text }),
)
check(
  '4e. the area being asked about is distinguished but NOT painted as completed',
  marks.marks[0].paint !== marks.marks[1].paint && marks.marks[1].paint === marks.marks[4].paint,
  `current=${marks.marks[0].paint} upcoming=${marks.marks[1].paint}`,
)

await runArea('Sleep better', ['Walk for 20 minutes', 'Read before bed'], 'Walk for 20 minutes')
marks = await progress()
check(
  '4f. answering an area fills its mark and moves to the next',
  marks.now === 1 && marks.text === 'Area 2 of 5' && marks.marks[0].paint !== marks.marks[1].paint,
  JSON.stringify({ now: marks.now, text: marks.text }),
)

// "Not right now" advances exactly as much as a goal does — reviewing is the
// progress, and nothing about declining an area is a skipped state.
await click(EN.reviewNo)
screen = await text()
marks = await progress()
check(
  '4g. "Not right now" moves straight on without asking for a goal',
  !screen.includes(EN.goal) && screen.includes('Work & Career') && marks.now === 2,
  `${marks.now} reviewed`,
)

await runArea('Get the portfolio finished', ['Finish the case study'])
await click(EN.reviewNo)
await click(EN.reviewNo)
screen = await text()
check('4h. after the fifth area the introduction closes', screen.includes(EN.complete))

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
    !screen.includes('Finances'),
  screen.replace(/\n/g, ' / ').slice(0, 120),
)

const stored = JSON.parse(await raw())
const factsFor = (store, suffix) => store.facts.filter((f) => f.key.endsWith(suffix))
check(
  '4j. the store holds the answers verbatim, one goal and one pointer per area',
  stored.version === 1 &&
    typeof stored.consentAt === 'string' &&
    factsFor(stored, '.review').length === 5 &&
    stored.facts.some((f) => f.key === 'area.body.goal' && f.value === 'Sleep better') &&
    stored.facts.some((f) => f.key === 'area.finances.review' && f.value === 'not_now') &&
    factsFor(stored, '.text').length === 3 &&
    factsFor(stored, '.step_active').length === 2,
  `${stored.facts.length} facts`,
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
    screen.includes(EN.outcomeSwap) &&
    screen.includes(EN.outcomeAside) &&
    JSON.parse(await raw()).facts.length === beforeIdle,
  `${JSON.parse(await raw()).facts.length} facts vs ${beforeIdle} before opening`,
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
    doneFacts[0].key.startsWith('area.body.step.'),
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
await click(EN.toAreas)
check('24m. the picker lists all five areas with their state', (await text()).includes(EN.picker))
await clickOption('Work & Career')
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
  store.facts.filter((f) => f.key === 'area.work.goal').length === 2,
  `${store.facts.filter((f) => f.key === 'area.work.goal').length} goal facts`,
)

await click(EN.manageDone)
await goto('/you/')
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
check(
  '7g. and it says what became of each step',
  screen.includes('focusing on') && screen.includes('done') && screen.includes('removed'),
)

// --- 8. forget everything --------------------------------------------------

await click(EN.forget)
await click(EN.forgetConfirm)
check('8a. forgetting removes the key entirely', (await keys()).length === 0, JSON.stringify(await keys()))
await goto('/')
check('8b. after a reload it starts over', (await text()).includes(EN.consent))

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
await click(EN.reviewNo)
await click(EN.reviewNo)
await click(EN.reviewNo)
await click(EN.reviewNo)
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
await clickNav('You')
screen = await text()
check(
  '5f. /you says this list lives in the tab only, and still shows their words',
  screen.includes('lives in this tab only') && screen.includes('Walk after lunch'),
)

await goto('/')
check('5g. reloading starts over, since the decision itself was not stored', (await text()).includes(EN.consent))

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
  marks.text === 'Bereich 1 von 5',
  marks.text,
)
check(
  '6c. the life areas and their question are German, with no English leaking',
  screen.includes('Körper & Gesundheit') &&
    screen.includes('Möchtest du hier gerade etwas verändern') &&
    !screen.includes('Body & Health'),
)

await click('Ja')
await type('Besser schlafen')
await click('Weiter')
await type('20 Minuten spazieren gehen')
await click('Hinzufügen')
await click('Das reicht')
for (let area = 0; area < 4; area++) await click('Gerade nicht')
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

await goto('/you/')
screen = await text()
check(
  '6e. /you is German too, including the life-area labels',
  screen.includes('Was ich über dich weiß') &&
    !screen.includes('What I know about you') &&
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
 * edge: by then all five areas have a review answer, so the introduction is over
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
for (let area = 0; area < 4; area++) await click(EN.reviewNo)
// The fifth area: answered, a goal given, then interrupted before any next step.
await click(EN.reviewYes)
await type('Draw something every week')
await click(EN.cont)
await goto('/')
screen = await text()
check(
  '25a. five review answers end the introduction, even with one area left unfinished',
  screen.includes(EN.home) && !screen.includes(EN.review) && !screen.includes(EN.steps),
  screen.replace(/\n/g, ' / ').slice(0, 100),
)
check(
  '25b. and home says so, rather than reporting that everything is settled',
  screen.includes('has a goal but nothing to try yet'),
)

await click(EN.toAreas)
screen = await text()
check(
  '25c. the unfinished area is reachable and says what is missing',
  screen.includes('Hobbies & Creativity') && screen.includes('Nothing to try yet'),
)
await clickOption('Hobbies & Creativity')
screen = await text()
check(
  '25d. its goal survived, and finishing the setup is one action away',
  screen.includes('Draw something every week') && (await visible(EN.addStep)),
)
await click(EN.addStep)
await type('Sketch on Sunday morning')
await click(EN.save)
await click(EN.manageDone)
screen = await text()
check(
  '25e. adding the missing entry makes it the active one, with nothing else asked',
  screen.includes('Sketch on Sunday morning') && !screen.includes('has a goal but nothing to try'),
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
  !screen.includes('has a goal but nothing to try'),
)

// --- 31. the progress marks are painted distinguishably, in both themes -----
//
// Three marks states have to be told apart by someone who cannot compare their
// colours, and advancing must not move the question underneath. Both properties
// are cheap to state and easy to lose: the previous version differed *only* by
// colour between current and upcoming, and nothing asserted otherwise.
//
// Three clicks reach a frame holding all three states at once: consent, the
// introduction, then "Not right now" for the first area leaves
// [done, current, upcoming, upcoming, upcoming].

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

// --- 11. the header at phone width — the wrap this change exists to fix ----

await setScheme('light')
await clearStorage()
await setViewport(390)
await goto('/')
check('11. the header stays on one row at 390px', (await headerRows()) === 1, `${await headerRows()} row(s)`)

// Paired with a positive, because "not visible" and "does not exist" are the same
// thing to `__visible`, and the collapse is only being tested if the links are
// actually there to collapse. Without the count this passes just as happily when the
// header has been broken and renders no nav at all.
check(
  '12a. the nav links exist but are not in the bar at 390px',
  !(await visible('You')) && !(await visible('About')) && (await count('header nav a')) > 0,
  `${await count('header nav a')} link(s) in the DOM, none of them laid out`,
)
await chooseIn('Menu', 'About')
await sleep(500)
check('12b. the collapsed menu still navigates', (await text()).includes('About thrive'))

await setViewport(1200, 800)
await goto('/')
check(
  '13. the links sit inline at desktop width, with no menu trigger',
  (await visible('You')) && (await visible('About')) && !(await visible('Menu')),
)

// --- 20. the centred column does not move between routes ------------------

/**
 * The reported "slight layout shift when switching nav items". `/about` is tall
 * enough to scroll and `/` and `/you` (empty here) are not, so a classic
 * scrollbar used to appear on one page and not the others — and since every page
 * centres its column with `mx-auto`, the whole layout slid sideways. Measured
 * before `scrollbar-gutter: stable`: 264 on `/`, 256.5 on the other two.
 */
const columnX = {}
for (const route of ['/', '/you/', '/about/']) {
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

await goto('/about/')
const inactiveYou = await navBox('You')
await goto('/you/')
const activeYou = await navBox('You')
check(
  '21a. the active nav link occupies exactly the same box as the inactive one',
  inactiveYou.w === activeYou.w &&
    inactiveYou.h === activeYou.h &&
    inactiveYou.weight === activeYou.weight &&
    inactiveYou.borderBottom === activeYou.borderBottom &&
    inactiveYou.pad === activeYou.pad,
  `${JSON.stringify(inactiveYou)} vs ${JSON.stringify(activeYou)}`,
)
check(
  '21b. and it is actually marked, for the accessibility tree too',
  activeYou.current === 'page' && inactiveYou.current === null,
  `on /you/: ${activeYou.current}, on /about/: ${inactiveYou.current}`,
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
await goto('/you/')
check('18b. and a parked answer inside it still shows on /you', (await text()).includes('Ada'))

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
