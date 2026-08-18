/**
 * Audits **every** table and view in the exposed schemas, not just the one we happen to
 * remember writing.
 *
 * `pnpm check:rls` proves that the policies on `person_facts` behave — it signs two real
 * users in and tries to cross the line between them. This script asks the different
 * question: *is there anything here without policies at all?* A table added later, by a
 * migration or by hand in the dashboard, is the failure mode that a behavioural test
 * cannot see, because a test only tests what it knows the name of.
 *
 * What it asserts, and why each one:
 *
 * | # | Assertion | The failure it catches |
 * | --- | --- | --- |
 * | S1 | every table has RLS **enabled** | a new table is world-readable from the moment it exists |
 * | S2 | every table has at least one policy | RLS on with no policies denies everyone, which reads as "broken" and gets fixed by disabling RLS |
 * | S3 | no policy applies to `anon` or `public` | a policy written `to public` covers signed-out visitors too |
 * | S4 | no policy has a `true` predicate | `using (true)` is RLS that permits everything while looking enabled |
 * | S5 | every policy names `auth.uid()` | ownership decided by anything else is ownership the client can influence |
 * | S6 | `anon` holds no privilege in `public` | Supabase's default privileges grant six of them to `anon` on every new table — measured on this project, not assumed |
 * | S7 | every view is `security_invoker` | a view over an RLS table without it returns **everyone's** rows |
 *
 * It runs against the **linked hosted project** through the CLI, read-only, against
 * `pg_catalog`. It asserts nothing through an admin data client, because there is nothing
 * here to assert about rows — this is about the shape of the schema, which is exactly
 * what a privileged connection is the right way to read.
 *
 * Usage: pnpm check:schema
 */
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

/**
 * Schemas a browser can actually reach. `auth`, `storage`, `realtime` and the rest are
 * Supabase's own, managed by Supabase and not ours to police — auditing them would
 * produce findings nobody in this repository can act on, which is the fastest way to
 * teach people to ignore a check.
 */
const EXPOSED = ["'public'", "'graphql_public'"].join(', ')

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}

/**
 * The CLI's own entry point, run with this Node rather than through `npx`.
 *
 * Not a style preference: Node refuses to `spawnSync` a `.cmd` shim without a shell
 * (EINVAL, since the 2024 argument-injection fix), and turning the shell on would mean
 * quoting multi-line SQL through `cmd.exe`. Resolving the package and running its JS
 * directly sidesteps both, and works the same on every platform.
 */
const cli = join(dirname(createRequire(import.meta.url).resolve('supabase/package.json')), 'dist/supabase.js')

/**
 * One query, through the CLI.
 *
 * The CLI prints a line of progress before the JSON and wraps the rows in a boundary
 * envelope, so the parse starts at the first brace rather than at the first byte.
 */
function query(sql) {
  let raw
  try {
    raw = execFileSync(process.execPath, [cli, 'db', 'query', '--linked', '--yes', sql], {
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
    })
  } catch (error) {
    // The CLI's own message is the useful half; the spawn wrapper's is the SQL echoed
    // back at you. A malformed `config.toml` surfaces here and looks nothing like a
    // schema problem unless the real message survives — which cost a confusing minute
    // when `auth.email.template.magic_link.content_path` was written relative to the
    // wrong directory.
    const said = `${error.stdout ?? ''}${error.stderr ?? ''}`.trim()
    throw new Error(said || error.message)
  }
  const start = raw.indexOf('{')
  if (start === -1) throw new Error(`no JSON in CLI output:\n${raw}`)
  const parsed = JSON.parse(raw.slice(start))
  if (parsed.error) throw new Error(`${parsed.error.code}: ${parsed.error.message}`)
  return parsed.rows ?? []
}

const list = (rows, describe) => rows.map(describe).join('; ')

console.log(`auditing schemas: ${EXPOSED}\n`)

const relations = query(`
  select n.nspname as schema, c.relname as name,
         case c.relkind when 'r' then 'table' when 'p' then 'table' when 'v' then 'view'
                        when 'm' then 'matview' else c.relkind::text end as kind,
         c.relrowsecurity as rls,
         (select count(*) from pg_policy p where p.polrelid = c.oid)::int as policies,
         coalesce(
           (select option_value = 'true' from pg_options_to_table(c.reloptions)
             where option_name = 'security_invoker'), false) as security_invoker
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in (${EXPOSED}) and c.relkind in ('r','p','v','m')
  order by 1, 2
`)

const tables = relations.filter((r) => r.kind === 'table')
const views = relations.filter((r) => r.kind === 'view' || r.kind === 'matview')

console.log(
  `${tables.length} table(s), ${views.length} view(s): ` +
    `${relations.map((r) => `${r.schema}.${r.name}`).join(', ') || 'none'}\n`,
)

const withoutRls = tables.filter((t) => !t.rls)
check(
  'S1. every table has row level security enabled',
  withoutRls.length === 0,
  withoutRls.length ? list(withoutRls, (t) => `${t.schema}.${t.name} is UNPROTECTED`) : `${tables.length} table(s)`,
)

// RLS enabled with no policies denies everyone, which looks like a bug and gets "fixed"
// by turning RLS off. An empty policy set is therefore a finding, not a safe default.
const withoutPolicies = tables.filter((t) => t.rls && t.policies === 0)
check(
  'S2. every protected table has at least one policy',
  withoutPolicies.length === 0,
  withoutPolicies.length
    ? list(withoutPolicies, (t) => `${t.schema}.${t.name} has none`)
    : list(tables, (t) => `${t.name}: ${t.policies}`) || 'no tables',
)

const policies = query(`
  select schemaname as schema, tablename as name, policyname as policy, permissive,
         roles::text as roles, cmd,
         coalesce(qual, '') as using_expr, coalesce(with_check, '') as check_expr
  from pg_policies where schemaname in (${EXPOSED})
  order by 1, 2, 3
`)

const openToStrangers = policies.filter((p) => /\b(anon|public)\b/.test(p.roles))
check(
  'S3. no policy applies to anon or to public',
  openToStrangers.length === 0,
  openToStrangers.length
    ? list(openToStrangers, (p) => `${p.name}."${p.policy}" → ${p.roles}`)
    : `${policies.length} policy/policies, all role-scoped`,
)

// `using (true)` is the shape that passes every behavioural test written by somebody who
// only ever queries as one user, and permits everything.
const permitsEverything = policies.filter((p) => {
  const predicate = `${p.using_expr} ${p.check_expr}`.trim()
  return p.permissive === 'PERMISSIVE' && /^(true)?\s*(true)?$/i.test(predicate)
})
check(
  'S4. no policy permits every row unconditionally',
  permitsEverything.length === 0,
  permitsEverything.length
    ? list(permitsEverything, (p) => `${p.name}."${p.policy}"`)
    : 'every policy has a real predicate',
)

const notOwnershipScoped = policies.filter(
  (p) => !/auth\.uid\(\)/.test(`${p.using_expr} ${p.check_expr}`),
)
check(
  'S5. every policy decides ownership from auth.uid()',
  notOwnershipScoped.length === 0,
  notOwnershipScoped.length
    ? list(notOwnershipScoped, (p) => `${p.name}."${p.policy}" (${p.cmd})`)
    : 'ownership always taken from the verified token',
)

const grants = query(`
  select table_name as name, grantee,
         string_agg(privilege_type, ', ' order by privilege_type) as privs
  from information_schema.role_table_grants
  where table_schema in (${EXPOSED}) and grantee in ('anon', 'PUBLIC')
  group by 1, 2 order by 1, 2
`)
check(
  'S6. anon holds no privilege on anything in these schemas',
  grants.length === 0,
  grants.length
    ? list(grants, (g) => `${g.grantee} has ${g.privs} on ${g.name}`)
    : 'no grants to anon at all',
)

const leakyViews = views.filter((v) => !v.security_invoker)
check(
  'S7. every view runs as its caller, not as its owner',
  leakyViews.length === 0,
  leakyViews.length
    ? list(leakyViews, (v) => `${v.schema}.${v.name} is missing security_invoker`)
    : views.length
      ? `${views.length} view(s), all security_invoker`
      : 'no views',
)

// Reported rather than asserted. This project's one table is deliberately append-only
// (decision D6): a correction is a newer fact, never an edited row, so there is no UPDATE
// grant and no UPDATE policy — and that absence is a feature that a generic "every table
// should allow all four verbs" rule would flag as a defect. Printing it keeps the choice
// visible without pretending it is a failure.
const updatable = policies.filter((p) => p.cmd === 'UPDATE' || p.cmd === 'ALL')
console.log(
  `\nnote: ${updatable.length} UPDATE policy/policies. person_facts is append-only by ` +
    `design, so zero is the expected number here — see docs/supabase-migration.md D6.`,
)

const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
if (failed.length) console.log(`failed:\n${failed.map((f) => `  - ${f.name} (${f.detail})`).join('\n')}`)
process.exit(failed.length ? 1 : 0)
