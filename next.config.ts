import type { NextConfig } from 'next'
import path from 'path'

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Production runs from .next/standalone/server.js via cPanel Passenger
  // (see docs/deploy/CUTOVER.md). The full-tree note in old docs is superseded.
  output: 'standalone',
  // Where the build output goes.
  //
  // A production build and a dev server cannot share one directory: the build
  // overwrites the dev server's compiled output, and the dev server then
  // serves a half-written tree. The symptom is a page of HTML where an API
  // response should be — the route is not found because the build removed it.
  //
  // So the dev server runs in its own directory. The default is unchanged, and
  // the deploy script still finds the build in .next/standalone.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // This worktree lives under D:\saas\desing\d 2 (which has its own lockfile);
  // pin tracing here or standalone output lands in the wrong tree.
  outputFileTracingRoot: path.join(__dirname),
  // Browser source maps are off in production by default; stated outright so
  // it is a decision rather than an inherited default. They are the map from
  // minified bundle back to the TypeScript that produced it.
  productionBrowserSourceMaps: false,
  experimental: {},
  async headers() {
    // Everything here is identical for every request, so it lives in config.
    // Content-Security-Policy is absent on purpose: its nonce is minted per
    // request in src/middleware.ts, where it can still mean something.
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            // DENY, not SAMEORIGIN, to match `frame-ancestors 'none'` in the
            // CSP. The two disagreeing is how a policy check passes while an
            // older browser, which reads only this header, still frames it.
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value:
              'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
          },
          {
            // Isolates this page's browsing context group, so a window we
            // open cannot reach back through window.opener.
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin',
          },
          {
            key: 'Cross-Origin-Resource-Policy',
            value: 'same-origin',
          },
        ],
      },
    ]
  },
}

export default nextConfig
