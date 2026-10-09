import type { NextConfig } from 'next'
import path from 'path'

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Production runs from .next/standalone/server.js via cPanel Passenger
  // (see docs/deploy/CUTOVER.md). The full-tree note in old docs is superseded.
  output: 'standalone',
  // This worktree lives under D:\saas\desing\d 2 (which has its own lockfile);
  // pin tracing here or standalone output lands in the wrong tree.
  outputFileTracingRoot: path.join(__dirname),
  experimental: {},
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'Content-Security-Policy-Report-Only',
            value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self'; frame-ancestors 'self';",
          },
        ],
      },
    ];
  },
}

export default nextConfig
