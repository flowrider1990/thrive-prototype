import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Static export: the whole app is `out/`, servable by any static host.
  // Nothing here may rely on a server — see CLAUDE.md.
  output: 'export',
  // Set by the Pages workflow from actions/configure-pages, so the repo name
  // is never hardcoded and renaming the repository stays free.
  basePath: process.env.PAGES_BASE_PATH,
  // Required for next/image under static export. Set defensively: the shell
  // has no images yet, but adding one should not break the deploy.
  images: { unoptimized: true },
  // `/you` resolves as `/you/index.html`, which static hosts serve reliably.
  trailingSlash: true,
}

export default nextConfig
