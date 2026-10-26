'use client'

/**
 * Client half of the Turnstile check: fetch a token on demand.
 *
 * `getTurnstileToken` exists for the call sites a React widget does not fit —
 * a checkout that posts once per seat needs a *fresh* token each time, and the
 * two anonymous counters are plain `fetch`es with nowhere to hang a form
 * field. It renders the challenge into a small overlay, resolves with the
 * token, and tears the overlay down.
 *
 * Every one of these paths short-circuits to `''` when the site key is absent,
 * which is the only state this repository is ever in: no script is fetched, no
 * box is drawn, nothing a test can see changes.
 */

const API_SCRIPT =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, options: Record<string, unknown>) => string
      remove: (id: string) => void
      reset: (id: string) => void
    }
  }
}

export function turnstileSiteKey(): string {
  return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ''
}

export function loadTurnstileScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  if (window.turnstile) return Promise.resolve()

  const existing = document.querySelector<HTMLScriptElement>(
    `script[src="${API_SCRIPT}"]`
  )
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener(
        'error',
        () => reject(new Error('turnstile script failed')),
        { once: true }
      )
    })
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = API_SCRIPT
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('turnstile script failed'))
    document.head.appendChild(script)
  })
}

let overlayCounter = 0

/**
 * Resolves with a single-use Turnstile token for `action`, or `''` when the
 * feature is not configured.
 *
 * Sequential by design: each call owns its own overlay, so two concurrent
 * callers would fight over the same corner of the screen. Callers that need
 * several tokens (a multi-seat checkout) await them in a loop, which is what
 * they are doing anyway.
 */
export async function getTurnstileToken(action: string): Promise<string> {
  const siteKey = turnstileSiteKey()
  if (!siteKey || typeof window === 'undefined') return ''

  try {
    await loadTurnstileScript()
  } catch {
    // The server decides what an absent token means; the page does not guess.
    return ''
  }

  if (!window.turnstile) return ''

  const id = ++overlayCounter
  const container = document.createElement('div')
  container.setAttribute('data-turnstile-overlay', String(id))
  container.setAttribute('aria-label', 'Captcha')
  container.style.cssText = [
    'position:fixed',
    'inset-block-end:12px',
    'inset-inline-end:12px',
    'z-index:2147483000',
    'background:#fff',
    'border:1px solid #d7deea',
    'border-radius:12px',
    'padding:8px',
    'box-shadow:0 8px 24px rgba(11,27,51,.12)',
  ].join(';')
  document.body.appendChild(container)

  try {
    const token = await new Promise<string>((resolve) => {
      const widgetId = window.turnstile!.render(container, {
        sitekey: siteKey,
        action,
        // Draws nothing unless the challenge actually needs a person, so the
        // common case is a token that appears without any visible widget.
        appearance: 'interaction-only',
        callback: (value: string) => resolve(value),
        'expired-callback': () => resolve(''),
        'error-callback': () => resolve(''),
      })
      // Cloudflare gives a solver 300s; do not hold a checkout open longer.
      setTimeout(() => resolve(''), 30_000)
      void widgetId
    })
    return token
  } finally {
    container.remove()
  }
}
