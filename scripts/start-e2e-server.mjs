import { spawn } from 'child_process'
import path from 'path'

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
  NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --max-old-space-size=4096`.trim(),
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
