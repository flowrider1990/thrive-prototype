/**
 * Installs the `@/` resolver in `alias-hook.mjs`.
 *
 * Two files rather than one because Node keeps the two roles apart: hooks run in their
 * own context and cannot register themselves, so something on the main thread has to ask
 * for them. `--import ./scripts/alias-register.mjs` is that ask.
 */
import { register } from 'node:module'

register('./alias-hook.mjs', import.meta.url)
