/**
 * Waits for API health, then starts Vite (cross-platform — no shell &&).
 */
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { waitForApiReady } from './wait-for-api.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function startVite() {
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const child = spawn(npmCmd, ['exec', 'vite', '--', '--host'], {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  child.on('exit', (code) => process.exit(code ?? 0))
}

const ok = await waitForApiReady()
if (!ok) process.exit(1)
startVite()
