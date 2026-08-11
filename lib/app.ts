/**
 * The product's name, in one place.
 *
 * The domain is not available, so a rename is likely. Changing this constant is
 * the whole rename: nothing else in the app spells the name out, and copy that
 * needs it interpolates `{app}` from here. It is deliberately not in the message
 * catalogs — a product name is not translated, and having it in two catalogs
 * would mean two edits and a chance to miss one.
 *
 * Three things it is explicitly **not** tied to, so that a rename cannot break
 * the application:
 *
 * - **`STORAGE_KEY` in `lib/person/store.ts`.** It stays `thrive.person.v1`
 *   whatever the product is called. Renaming it would orphan every person's
 *   saved answers, invisibly, until someone complained their data had vanished.
 *   If it ever genuinely has to change, that is a migration, not a rename.
 * - **The package name and the folder.** See `docs/renaming.md`.
 * - **The repository name.** `basePath` comes from `PAGES_BASE_PATH`, set during
 *   the Pages build, so renaming the repo costs nothing.
 */
export const APP_NAME = 'thrive'
