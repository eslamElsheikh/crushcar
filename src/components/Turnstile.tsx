'use client'

import { useEffect, useRef } from 'react'
import { loadTurnstileScript, turnstileSiteKey } from '@/lib/turnstileClient'

/**
 * The Cloudflare Turnstile widget, rendered only when the site key exists.
 *
 * Without NEXT_PUBLIC_TURNSTILE_SITE_KEY this renders nothing at all — no
 * script is fetched, no box takes up space, no test can be affected by it.
 * That is the contract: the feature is wired everywhere and enabled nowhere
 * until someone configures it.
 */

export interface TurnstileProps {
  /** Action name Cloudflare records, so a login token is not a checkout token. */
  action: string
  /** Called with the token, or with '' when the widget resets. */
  onVerify: (token: string) => void
}

export function Turnstile({ action, onVerify }: TurnstileProps) {
  const siteKey = turnstileSiteKey()
  const containerRef = useRef<HTMLDivElement>(null)
  // React StrictMode mounts effects twice; without this the second mount
  // orphans the first widget and the challenge can never be answered.
  const widgetIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!siteKey || !containerRef.current) return
    let cancelled = false

    loadTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          action,
          callback: (token: string) => onVerify(token),
          'expired-callback': () => onVerify(''),
          'error-callback': () => onVerify(''),
        })
      })
      .catch(() => {
        // A blocked script is the operator's problem, not the page's. The
        // server decides what an absent token means.
        onVerify('')
      })

    return () => {
      cancelled = true
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current)
        widgetIdRef.current = null
      }
    }
    // onVerify is deliberately not a dependency: callers pass inline arrows,
    // and re-running on every keystroke would reset a challenge mid-solve.
  }, [siteKey, action])

  if (!siteKey) return null

  return <div ref={containerRef} aria-label="Captcha" />
}
