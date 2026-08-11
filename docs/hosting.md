# Hosting

A GitHub Pages project site, built by Actions from a static export. No server,
ever.

## The config

```ts
// next.config.ts
output: 'export',                 // emits out/, plus a 404.html Pages picks up
basePath: process.env.PAGES_BASE_PATH,
images: { unoptimized: true },     // required for next/image under static export
trailingSlash: true,               // /data resolves as /data/index.html
```

`basePath` comes from the environment rather than being hardcoded, so renaming the
repository costs nothing. `actions/configure-pages@v5` emits `base_path`, and the
workflow passes it to the build as `PAGES_BASE_PATH`.

## The workflow

`.github/workflows/deploy.yml`, following `nextjs/deploy-github-pages`, with two
deliberate departures:

- **`pnpm/action-setup@v4` is unpinned**, so it reads `packageManager` from
  `package.json` and cannot drift from the local pnpm version.
- **Node is pinned to 22**, matching the machine this was built on.

Then `upload-pages-artifact@v3` and `deploy-pages@v4`.

## Enabling it (one-time, in the GitHub UI)

Settings → Pages → Source: **GitHub Actions**. Not "Deploy from a branch" — the
artifact flow does not use a `gh-pages` branch at all.

## Things verified rather than assumed

- `output: 'export'` produces `out/` containing `404.html`, and `you/index.html`
  and `about/index.html` thanks to `trailingSlash`.
- **No `.nojekyll` file is needed.** The artifact-based Pages flow does not run
  Jekyll. (It *is* required for the older gh-pages-branch approach — this is the
  classic trap, and it does not apply here.)
- Building with `PAGES_BASE_PATH=/thrive-prototype` puts every asset under
  `/thrive-prototype/_next/…`, which is the failure a wrong `basePath` produces.
- The prerendered HTML contains **no copy at all** — confirmed by grepping
  `out/index.html`. That is the client-only shell working as intended, not a
  build problem.

## What static export forbids

Middleware, proxy, server actions, route handlers that read the request, cookies,
rewrites, redirects, headers, ISR, image optimization with the default loader,
draft mode, intercepting routes. **The design uses none of them** — reaching for a
server action later would break the deploy rather than fail loudly at the time.

## Checking a build the way Pages will see it

```bash
pnpm build && pnpm dlx serve out --listen 4321
pnpm verify                     # walks the whole flow in real Chrome
```

`pnpm dev` is not a substitute: it tolerates type errors the build rejects, and
static export is where client-only assumptions surface.

## If Pages ever stops fitting

The entire build is `out/`. Cloudflare Pages, Netlify or Vercel would serve it
unchanged; only the `basePath` would need to become empty, which is one
environment variable.
