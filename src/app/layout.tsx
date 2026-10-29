import type { Metadata } from 'next'
import { Inter, Space_Grotesk } from 'next/font/google'
import './globals.css'
import { Providers } from '@/components/providers'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], variable: '--font-space-grotesk' })

export const metadata: Metadata = {
  title: 'Safro - سافر أبعد معًا',
  description: 'رحلات باص مريحة داخل مصر — لك أو لمجموعتك أو لشركتك.',
  icons: {
    icon: '/favicon.ico',
  },
}

/**
 * Every page is rendered per request, on purpose.
 *
 * src/middleware.ts mints a fresh CSP nonce for each request and hands it to
 * the renderer through the request headers; Next stamps it onto the <script>
 * tags it emits. A statically prerendered page is rendered once at *build*
 * time — there is no request and no nonce — so its HTML ships without one,
 * while the per-request CSP header still arrives at the browser. The browser
 * then blocks every chunk ('strict-dynamic' never gets an initiator), React
 * never hydrates, and the user sees a black page with a permanent spinner.
 *
 * So no page under this layout may be prerendered. `dynamic` set in a layout
 * is collected for every route beneath it (see Next's reduceAppConfig), and
 * nothing below re-declares it. The cost is one render per request; the
 * alternative is a site that loads once and never runs.
 */
export const dynamic = 'force-dynamic'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ar" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&family=IBM+Plex+Sans+Arabic:wght@400;500;600;70&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className={`${inter.variable} ${spaceGrotesk.variable} font-sans antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
