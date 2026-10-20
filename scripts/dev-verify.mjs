/**
 * Starts the dev server in its own output directory.
 *
 * A production build and a dev server cannot share `.next/`: the build
 * overwrites the dev server's compiled output, and the dev server then serves
 * a half-written tree. The symptom is an HTML error page where an API
 * response should be, on every route the build happened to rewrite.
 *
 * This wrapper points the dev server at `.next-dev/` so the two never touch
 * each other. The production build is untouched — it still lands in `.next/`,
 * which is where the deploy script looks.
 *
 *   npm run dev:verify            # port 3000
 *   npm run dev:verify -- -p 3005 # another port
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

process.env.NEXT_DIST_DIR = process.env.NEXT_DIST_DIR || '.next-dev'

const args = ['next', 'dev', ...process.argv.slice(2)]
const child = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', args, {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env },
  shell: process.platform === 'win32',
})

child.on('exit', (code) => process.exit(code ?? 0))
