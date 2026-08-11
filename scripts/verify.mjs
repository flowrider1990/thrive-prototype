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
    const toggle = document.querySelector('button[aria-label^="Switch to"], button[aria-label^="Wechsle"]');
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
  consent: 'Is this okay for you?',
  yes: 'Yes, that is okay',
  no: 'No',
  name: 'How should I call you?',
  cont: 'Continue',
  skip: 'Nothing right now',
  contYes: 'Yes, let us go on',
  contNo: 'No, that is it for now',
  rename: 'Call me something else',
  forget: 'Forget everything',
  forgetConfirm: 'Yes, forget everything',
}

async function clearStorage() {
  await goto('/')
  await evaluate('localStorage.clear()')
}

// --- 4. consent yes: full flow, then reload with no flash -------------------

await clearStorage()
await goto('/')
check('4a. consent question is shown on a fresh visit', (await text()).includes(EN.consent))

await click(EN.yes)
check('4b. saying yes leads to the name question', (await text()).includes(EN.name))

await type('Florian')
await click(EN.cont)
let screen = await text()
check('4c. the open question greets by name', screen.includes('Hello Florian, how can I help you today?'))

await type('I want to sleep better and worry less.')
await click(EN.cont)
screen = await text()
check('4d. the flow ends on the greeting', screen.includes('Hello Florian.'))

const stored = JSON.parse(await raw())
check(
  '4e. the store holds consent, locale and both answers verbatim',
  stored.version === 1 &&
    typeof stored.consentAt === 'string' &&
    stored.facts.length === 2 &&
    stored.facts.some((f) => f.key === 'preferred_name' && f.value === 'Florian') &&
    stored.facts.some((f) => f.key === 'opening_intent' && f.value === 'I want to sleep better and worry less.'),
  `${stored.facts.length} facts`,
)

await goto('/')
const painted = await frames()
const flashed = painted.filter((f) => f.includes(EN.consent) || f.includes(EN.name))
check(
  '4f. reload shows the greeting with NO flash of consent or naming',
  flashed.length === 0 && (await text()).includes('Hello Florian.'),
  flashed.length ? `flashed ${flashed.length} frame(s)` : `${painted.length} frames sampled`,
)

// --- 7. append-only ---------------------------------------------------------

await click(EN.rename)
await type('Flo')
await click(EN.cont)
screen = await text()
check('7a. renaming returns to the greeting, using the newer name', screen.includes('Hello Flo.'))

await goto('/you/')
screen = await text()
check(
  '7b. /you shows both names with timestamps',
  screen.includes('Florian') && screen.includes('Flo') && /noted /.test(screen),
)
const after = JSON.parse(await raw())
check(
  '7c. nothing was overwritten: three facts, two of them names',
  after.facts.length === 3 && after.facts.filter((f) => f.key === 'preferred_name').length === 2,
  `${after.facts.length} facts`,
)

// --- 8. forget everything --------------------------------------------------

await click(EN.forget)
await click(EN.forgetConfirm)
check('8a. forgetting removes the key entirely', (await keys()).length === 0, JSON.stringify(await keys()))
await goto('/')
check('8b. after a reload it starts over', (await text()).includes(EN.consent))

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
await type('Anon')
await click(EN.cont)
await type('Just looking around.')
await click(EN.cont)
screen = await text()
check('5c. the whole flow works in memory-only mode', screen.includes('Hello Anon.'))
check('5d. and it says nothing is being saved', screen.includes('Nothing is being saved'))

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
  screen.includes('lives in this tab only') && screen.includes('Anon'),
)

await goto('/')
check('5g. reloading starts over, since the decision itself was not stored', (await text()).includes(EN.consent))

// --- 6. language ----------------------------------------------------------

// The language switch is a dropdown now, so the option has to be opened first.
await chooseIn('Language', 'Deutsch')
screen = await text()
check('6a. German works on the consent screen itself', screen.includes('Ist das okay für dich?'))
await click('Ja, das ist okay')
await type('Florian')
await click('Weiter')
screen = await text()
check(
  '6b. interpolation reads correctly in German',
  screen.includes('Hallo Florian, wie kann ich dir heute helfen?'),
)
await click('Gerade nichts')
await goto('/you/')
screen = await text()
check(
  '6c. /you is German too, with no English leaking',
  screen.includes('Was ich über dich weiß') && !screen.includes('What I know about you'),
)
await goto('/about/')
// innerText reflects text-transform, and the section headings are uppercased in
// CSS — so compare case-insensitively rather than chasing a styling artefact.
screen = (await text()).toLowerCase()
check(
  '6d. /about is German too',
  screen.includes('was das hier ist') && !screen.includes('what this is'),
)
check('6e. the locale was persisted with consent', JSON.parse(await raw()).locale === 'de')

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

check(
  '12a. the nav links are not in the bar at 390px',
  !(await visible('You')) && !(await visible('About')),
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
check(
  '16. a stored dark theme is applied before the first paint, on a light OS',
  lightFrames.length === 0 && (await dataTheme()) === 'dark',
  lightFrames.length
    ? `${lightFrames.length} light frame(s) of ${paintedBackgrounds.length}`
    : `${paintedBackgrounds.length} frames sampled, none light`,
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
check(
  '18. a v1 store with no theme field loads and follows the OS',
  (await text()).includes('Hello Ada.') && (await dataTheme()) === null,
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
