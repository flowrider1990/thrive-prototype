/**
 * Proves the app can reach the intended Supabase project, and nothing more.
 *
 * This is connectivity only: no schema, no Auth, no sync. It is deliberately
 * **not** part of `pnpm verify`, because that suite asserts that nothing leaves
 * the browser (G6 in `docs/supabase-migration.md`). Keeping the two commands
 * separate is what leaves that guarantee untouched.
 *
 * It imports `lib/supabase/client.ts` rather than building its own client, so
 * what it exercises is the boundary the app will actually use. That needs
 * `--experimental-strip-types`, which is why `pnpm check:supabase` passes flags.
 *
 * What it must keep proving after the first table exists:
 *
 *   1. the configured URL belongs to the intended linked project,
 *   2. Supabase Auth is reachable,
 *   3. `@supabase/supabase-js` reaches the Data API and the key is accepted,
 *   4. no secret or service-role key is used or exposed.
 *
 * (3) is the subtle one. "The table is missing" is true today and false as soon
 * as we add `person_facts`, so it is reported but never asserted. The lasting
 * contract is that PostgREST *answered us and accepted our credential* — which
 * holds whether the table is absent, present, or empty under RLS.
 *
 * Usage: pnpm check:supabase
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { getSupabase } from '../lib/supabase/client.ts'

// Committed on purpose. The ref is public — it is the project URL's subdomain —
// and the CLI's own copy lives in the git-ignored `supabase/.temp/`, so without
// this constant the check could not tell "intended project" from "some project"
// on a fresh clone.
const EXPECTED_REF = 'oejjomqrugsgpunzmhnd'

// The first table we plan to add. Nothing here requires it to exist.
const PROBE_TABLE = 'person_facts'

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

// --- 1. configuration -------------------------------------------------------

check(
  '1a. both public env vars are set',
  Boolean(url && key),
  url ? `url set, key ${key ? 'set' : 'MISSING'}` : 'NEXT_PUBLIC_SUPABASE_URL missing',
)
if (!url || !key) {
  console.log('\nCannot continue without configuration. Expected them in .env.local.')
  process.exit(2)
}

let host = ''
try {
  const parsed = new URL(url)
  host = parsed.host
  check('1b. url is https with no path', parsed.protocol === 'https:' && parsed.pathname === '/', url)
} catch {
  check('1b. url is https with no path', false, `unparseable: ${url}`)
}

// --- 2. it is the intended project ------------------------------------------

const refFromUrl = host.endsWith('.supabase.co') ? host.slice(0, -'.supabase.co'.length) : ''
check(
  '2a. url points at the intended project ref',
  refFromUrl === EXPECTED_REF,
  refFromUrl ? `${refFromUrl} (expected ${EXPECTED_REF})` : `cannot read a ref from host ${host}`,
)

// Cross-check against the CLI's link when this machine has one. Absent on a
// fresh clone, which is not a failure — `supabase link` is per-machine setup.
const refFile = 'supabase/.temp/project-ref'
if (existsSync(refFile)) {
  const linked = readFileSync(refFile, 'utf8').trim()
  check('2b. the CLI-linked project agrees', linked === EXPECTED_REF, `linked to ${linked}`)
} else {
  check('2b. the CLI-linked project agrees', true, 'skipped: no local CLI link on this machine')
}

// --- 3. no secret material is in play ---------------------------------------

check(
  '3a. the key in use is a publishable key',
  key.startsWith('sb_publishable_'),
  key.startsWith('sb_secret_')
    ? 'SECRET KEY IN A NEXT_PUBLIC_ VAR — the static export would inline it into the bundle'
    : key.startsWith('eyJ')
      ? 'this is a legacy anon JWT; the publishable key is the current form'
      : `${key.slice(0, 15)}… (${key.length} chars)`,
)

// A service_role JWT decodes to a payload containing "service_role". Scanning
// values rather than names is the point: the dangerous case is a secret sitting
// in a variable whose name looks harmless.
const looksSecret = (value) =>
  value.startsWith('sb_secret_') ||
  (value.startsWith('eyJ') &&
    value.split('.').length === 3 &&
    (() => {
      try {
        return JSON.parse(Buffer.from(value.split('.')[1], 'base64url').toString()).role === 'service_role'
      } catch {
        return false
      }
    })())

const leaked = Object.entries(process.env)
  .filter(([, value]) => typeof value === 'string' && looksSecret(value))
  .map(([name]) => name)
check(
  '3b. no secret or service-role key is in the environment',
  leaked.length === 0,
  leaked.length ? `found in: ${leaked.join(', ')}` : 'none present',
)

// `.env*` is ignored, so the file holding the key can never be committed.
let ignored = false
try {
  execFileSync('git', ['check-ignore', '-q', '.env.local'], { stdio: 'ignore' })
  ignored = true
} catch {
  ignored = false
}
check(
  '3c. .env.local is git-ignored',
  ignored || !existsSync('.env.local'),
  existsSync('.env.local') ? (ignored ? 'ignored by .gitignore' : 'NOT IGNORED') : 'no .env.local here',
)

// The privileged key lives in `supabase/.env.rls-test`, outside the project root,
// because Next loads env files from the root only. That separation is the whole
// protection, so it is asserted rather than trusted: every file Next would read
// must be free of privileged material. Checking the contents rather than the
// location is what catches someone later pasting a secret into `.env.local`.
const nextReadsAtRoot = [
  '.env',
  '.env.local',
  '.env.development',
  '.env.development.local',
  '.env.production',
  '.env.production.local',
  '.env.test',
  '.env.test.local',
]
const present = nextReadsAtRoot.filter((file) => existsSync(file))
const contaminated = present.filter((file) => {
  const body = readFileSync(file, 'utf8')
  return body
    .split(/\r?\n/)
    .filter((line) => line.trim() && !line.trim().startsWith('#'))
    .some((line) => looksSecret(line.slice(line.indexOf('=') + 1).trim()))
})
check(
  '3d. no env file Next reads holds privileged material',
  contaminated.length === 0,
  contaminated.length
    ? `PRIVILEGED KEY IN: ${contaminated.join(', ')}`
    : `${present.length} root env file(s) checked: ${present.join(', ') || 'none'}`,
)

// --- 4. Auth is reachable ---------------------------------------------------

let authDetail = ''
let authOk = false
try {
  const res = await fetch(`${url}/auth/v1/health`, { headers: { apikey: key } })
  const body = await res.json().catch(() => ({}))
  authOk = res.ok
  authDetail = `${res.status} ${body.name ?? ''} ${body.version ?? ''}`.trim()
} catch (error) {
  authDetail = `unreachable: ${error.message}`
}
check('4. Supabase Auth health is reachable', authOk, authDetail)

// --- 5. the Data API answers supabase-js, and accepts the key ---------------

let dataOk = false
let dataDetail = ''
try {
  const { data, error, status } = await getSupabase().from(PROBE_TABLE).select('*').limit(1)

  // Order matters, and getting it wrong cost a false failure. HTTP 401 does not
  // mean "bad key" here: PostgREST also answers 401 for `permission denied`, so
  // once `anon` lost its privileges this probe started returning 401 for exactly
  // the reason the schema is correct. The reliable signal is the presence of a
  // Postgres/PostgREST error `code`. A rejected key never carries one — it is the
  // gateway talking, not the database.
  if (!error) {
    dataOk = true
    dataDetail = `200; '${PROBE_TABLE}' readable, ${data?.length ?? 0} visible row(s)`
  } else if (error.code) {
    // The database answered us, so the key was accepted. Which answer it gave is
    // information, not a pass condition: 42501 is the expected reply for an
    // unauthenticated client against a table `anon` may not touch, and PGRST205
    // was the expected reply before the table existed.
    dataOk = true
    dataDetail = `${status} ${error.code}: ${error.message}`
  } else if (status === 401) {
    dataOk = false
    dataDetail = `key rejected (401): ${error.message}`
  } else {
    dataOk = false
    dataDetail = `unrecognised response (${status}): ${error.message}`
  }
} catch (error) {
  dataDetail = `unreachable: ${error.message}`
}
check('5. supabase-js reached the Data API and the key was accepted', dataOk, dataDetail)

// --- 6. the key really is not a secret key ----------------------------------

// Evidence rather than a prefix promise: `/rest/v1/` is secret-key-only since
// 2026-04-08. Only acceptance is a failure — a refusal for any reason is fine,
// so this cannot turn into a false alarm if that endpoint changes again.
let secretEndpointAccepted = false
let controlDetail = ''
try {
  const res = await fetch(`${url}/rest/v1/`, { headers: { apikey: key } })
  secretEndpointAccepted = res.ok
  controlDetail = res.ok
    ? `${res.status} — this key has secret-level access`
    : `${res.status}: ${((await res.json().catch(() => ({}))).message ?? '').slice(0, 60)}`
} catch (error) {
  controlDetail = `no answer: ${error.message}`
}
check(
  '6. the key is refused by the secret-key-only endpoint',
  !secretEndpointAccepted,
  controlDetail,
)

// --- done -------------------------------------------------------------------

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
if (failed.length) console.log(`failed:\n${failed.map((f) => `  - ${f.name} (${f.detail})`).join('\n')}`)
process.exit(failed.length ? 1 : 0)
