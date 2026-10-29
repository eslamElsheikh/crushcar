import { spawn } from 'child_process'

const dbUrl = process.env.DATABASE_URL || 'file:../.scratch/e2e.db'
if (dbUrl.includes('dev.db')) {
  console.error('SAFETY ERROR: Attempted to run E2E server on dev.db!')
  process.exit(1)
}

console.log(`DATABASE_URL: ${dbUrl}`)
console.log(`Starting E2E server on port 3002...`)

const env = {
  ...process.env,
  DATABASE_URL: dbUrl,
  PORT: '3002',
  NEXTAUTH_URL: 'http://127.0.0.1:3002',
  NODE_ENV: 'development',
  // Next dev checks used_heap > 0.8 × heap_size_limit after EVERY request and
  // self-restarts when it crosses (hardcoded, no config knob). At the default
  // 4096MB the limit is ~4.4GB, so the threshold (~3.5GB) is hit ~15 min into
  // a full e2e run — the 8-20s outage + wiped compile cache then fails
  // otherwise-green tests (ERR_CONNECTION_REFUSED, ClientFetchError, empty
  // lists). 8192 puts the threshold (~6.8GB) above anything a run produces:
  // observed peaks are ~3.5GB, and raising the limit allocates nothing.
  NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --max-old-space-size=8192`.trim(),
}

const child = spawn('npx', ['next', 'dev', '-p', '3002'], {
  stdio: 'inherit',
  shell: true,
  env,
})

child.on('exit', (code) => {
  console.log(`E2E server exited with code ${code}`)
  process.exit(code || 0)
})

process.on('SIGINT', () => {
  child.kill()
  process.exit(0)
})
process.on('SIGTERM', () => {
  child.kill()
  process.exit(0)
})
