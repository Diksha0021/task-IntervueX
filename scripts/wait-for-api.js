/**
 * Waits until the IntervueX API responds on /health (used before starting Vite).
 */
const HEALTH_URL = process.env.API_HEALTH_URL ?? 'http://127.0.0.1:5000/health'
const MAX_ATTEMPTS = 60
const DELAY_MS = 500

async function ping() {
  const res = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(2000) })
  return res.ok
}

export async function waitForApiReady() {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      if (await ping()) {
        console.log(`API ready at ${HEALTH_URL}`)
        return true
      }
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, DELAY_MS))
  }
  console.error(`API did not become ready at ${HEALTH_URL}`)
  console.error('Start it with: npm run dev:server')
  return false
}

async function main() {
  const ok = await waitForApiReady()
  process.exit(ok ? 0 : 1)
}

import { fileURLToPath } from 'url'

const isDirectRun =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === process.argv[1]

if (isDirectRun) {
  main()
}