/**
 * Reads the built export and refuses to let a privileged credential ship in it.
 *
 * `docs/supabase-migration.md` §18 asks for this as a guard rather than a rule, and the
 * distinction is the point: "never put the service role key in a `NEXT_PUBLIC_*`
 * variable" is a thing to remember, and the static export inlines every one of those
 * straight into JavaScript. This makes the boundary enforced instead.
 *
 * **It matches on values, not on names.** A key hidden in a variable called something
 * innocent is exactly the case that matters, and a check that greps for suspicious
 * variable names would miss it while looking thorough.
 *
 * One thing it deliberately does *not* flag: the literal string `sb_secret_` on its own.
 * `@supabase/supabase-js` ships a prefix test containing it, so the bare prefix appears
 * in every bundle that includes the library, and a guard that fired on it would be
 * turned off within a week. What is looked for is a prefix followed by enough characters
 * to be a key.
 *
 * Usage: pnpm check:bundle   (after pnpm build)
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const OUT = 'out'

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

function* files(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) yield* files(path)
    else yield path
  }
}

let all
try {
  all = [...files(OUT)]
} catch {
  console.error(`No ${OUT}/ directory. Run pnpm build first.`)
  process.exit(2)
}

const TEXT = /\.(js|css|html|txt|json|map)$/i
const contents = all
  .filter((path) => TEXT.test(path))
  .map((path) => ({ path, body: readFileSync(path, 'utf8') }))

console.log(`scanning ${contents.length} text file(s) of ${all.length} in ${OUT}/\n`)

/** A JWT whose payload names a privileged role. Decoded, not pattern-matched. */
function privilegedJwt(body) {
  const found = []
  for (const token of body.match(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g) ??
    []) {
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'))
      if (payload.role && payload.role !== 'anon') found.push(`${payload.role} JWT`)
    } catch {
      // Not a JWT after all. Three base64-ish segments joined by dots is a shape that
      // minified output produces by accident.
    }
  }
  return found
}

const jwtHits = contents.flatMap(({ path, body }) =>
  privilegedJwt(body).map((what) => `${path}: ${what}`),
)
check(
  'B1. no privileged JWT anywhere in the export',
  jwtHits.length === 0,
  jwtHits.length ? jwtHits.join('; ') : 'no service_role or other privileged token',
)

// The prefix plus enough characters to be a real key. The bare prefix is in the Supabase
// client's own code — see the note at the top.
const secretHits = contents
  .filter(({ body }) => /sb_secret_[A-Za-z0-9_-]{10,}/.test(body))
  .map(({ path }) => path)
check(
  'B2. no secret key value in the export',
  secretHits.length === 0,
  secretHits.length ? secretHits.join('; ') : 'none',
)

// Belt and braces: whatever secret this machine happens to hold must not be in there,
// whatever it is called and whatever shape it has.
const knownSecrets = [process.env.SUPABASE_SECRET_KEY, process.env.SUPABASE_SERVICE_ROLE_KEY]
  .filter((value) => value && value.length > 20)
const literalHits = contents
  .filter(({ body }) => knownSecrets.some((secret) => body.includes(secret)))
  .map(({ path }) => path)
check(
  'B3. no credential this machine holds appears in the export',
  literalHits.length === 0,
  knownSecrets.length
    ? literalHits.join('; ') || `${knownSecrets.length} known secret(s), none present`
    : 'no secret in this environment to compare against (run with supabase/.env.rls-test to strengthen)',
)

/**
 * The positive control, and it is not decoration.
 *
 * A scanner that finds nothing proves nothing unless it can also find something. If the
 * build was configured, the *publishable* key must be in the bundle — it is meant to be,
 * it is a browser key — and its presence is what shows the scan is reading the files the
 * app actually ships rather than an empty or stale directory.
 */
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
if (publishable) {
  const present = contents.some(({ body }) => body.includes(publishable))
  check(
    'B4. the publishable key is present, which proves the scan reads the real bundle',
    present,
    present ? 'found where it belongs' : 'NOT found — is this export stale?',
  )
} else {
  console.log(
    'note: no NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in this environment, so the positive\n' +
      '      control is skipped. A clean result here is weaker than it looks.',
  )
}

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
if (failed.length) console.log(`failed:\n${failed.map((f) => `  - ${f.name} (${f.detail})`).join('\n')}`)
process.exit(failed.length ? 1 : 0)
