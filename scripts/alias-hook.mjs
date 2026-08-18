/**
 * Teaches Node the `@/` path alias that `tsconfig.json` defines.
 *
 * It exists so a check script can import the **real** module rather than a copy of it.
 * `scripts/check-sync.mjs` asserts how local and cloud datasets are compared, and a test
 * that reimplemented that comparison would pass forever while the app drifted away from
 * it — which is the specific failure this avoids.
 *
 * A few lines rather than a bundler: the alias is one prefix, and the resolution rule is
 * "the repository root". Combined with Node's own `--experimental-strip-types`, that is
 * the whole of what is needed to run this project's TypeScript unbundled.
 */
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * TypeScript source omits the extension; Node insists on one. Both are right in their own
 * world, so the bridge tries the two this project writes.
 */
function withExtension(path) {
  if (existsSync(path)) return path
  for (const extension of ['.ts', '.tsx']) {
    if (existsSync(path + extension)) return path + extension
    if (existsSync(join(path, `index${extension}`))) return join(path, `index${extension}`)
  }
  return path
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const target = withExtension(join(root, specifier.slice(2)))
    return nextResolve(pathToFileURL(target).href, context)
  }
  return nextResolve(specifier, context)
}
