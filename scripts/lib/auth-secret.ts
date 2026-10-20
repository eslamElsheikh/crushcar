import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * The session secret, read the way the app reads it.
 *
 * Next.js loads .env itself, so a script that only looks at process.env can
 * end up with a different secret from the one the server is using, and the
 * failure looks like a corrupt session token rather than a wrong key.
 */
export function authSecret(): string {
  const fromEnv = process.env.AUTH_SECRET
  if (fromEnv) return fromEnv
  try {
    const raw = readFileSync(resolve(process.cwd(), '.env'), 'utf8')
    const line = raw.split(/\r?\n/).find((l) => l.startsWith('AUTH_SECRET='))
    if (line) {
      const value = line.slice('AUTH_SECRET='.length).trim()
      if (value.startsWith('"') && value.endsWith('"')) return value.slice(1, -1)
      if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1)
      return value
    }
  } catch {
    // fall through
  }
  throw new Error('AUTH_SECRET is not set in the environment or in .env')
}
