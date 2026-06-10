// Stooq anti-bot proof-of-work gate.
//
// Stooq's CSV download endpoint (/q/d/l/) now answers the first request with a
// JavaScript proof-of-work challenge instead of data: the page hands you a
// signed token `c` and a difficulty `d`, and expects you to find a nonce `n`
// such that SHA-256(c + n) (hex) starts with `d` zeros, then POST `c`+`n` to
// /__verify. The server replies with an `auth` cookie that unlocks subsequent
// CSV downloads. This module reproduces that handshake so the Stooq adapter can
// keep serving historical (EOD) series. The light-quote endpoint (/q/l/) was
// removed upstream (hard 404) and is NOT recoverable — getLatestPrice still
// throws and the chain falls through to another provider.
//
// The `auth` cookie is an anti-bot session token for PUBLIC end-of-day data, not
// a credential, so it is cached IN-MEMORY only (re-solved once per app session).
// Nothing is persisted to localStorage and nothing is logged (SPEC-031).
//
// Platform notes:
//   • Tauri production: @tauri-apps/plugin-http exposes `set-cookie` on the
//     response (forbidden in browsers), so we read the `auth` cookie and attach
//     it manually to the follow-up request. This is the path that matters.
//   • Browser/Vite dev: `set-cookie` is unreadable and the Cookie request header
//     is forbidden, so the handshake can't complete — stooqFetch degrades to
//     returning the challenge body, which the adapter parses as "no data" and
//     the chain falls through. Acceptable: dev is not a real-data environment.

import { marketDataFetch } from '../../utils/marketDataFetch'

const PROXY = { requiresProxy: true }
const VERIFY_URL = 'https://stooq.com/__verify'
const CHALLENGE_MARKER = 'crypto.subtle.digest'
// Hard ceiling so a hostile difficulty bump can never spin forever. Difficulty 4
// averages ~65k iterations; 2^22 (~4M) bails out long before the UI would hang.
const MAX_POW_ITERS = 1 << 22

// In-memory only — see module header. Reset on every app launch.
let authCookie = null

function parseChallenge(html) {
  const c = html.match(/c="([^"]+)"/)
  const d = html.match(/,\s*d\s*=\s*(\d+)/)
  if (!c || !d) return null
  return { c: c[1], difficulty: Number(d[1]) }
}

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

// Brute-force the nonce. crypto.subtle.digest is async, so we fire a batch of
// digests in parallel and scan the batch — this amortises per-call promise
// overhead and keeps a difficulty-4 solve well under a second.
async function solvePow({ c, difficulty }) {
  const enc = new TextEncoder()
  const target = '0'.repeat(difficulty)
  const BATCH = 1024
  for (let base = 0; base < MAX_POW_ITERS; base += BATCH) {
    const digests = await Promise.all(
      Array.from({ length: BATCH }, (_, i) =>
        crypto.subtle.digest('SHA-256', enc.encode(c + (base + i))))
    )
    for (let i = 0; i < BATCH; i++) {
      if (toHex(digests[i]).startsWith(target)) return base + i
    }
  }
  throw new Error('pow exceeded')
}

// Read the `auth=...` pair from a Set-Cookie response (Tauri exposes it).
function readAuthCookie(response) {
  let setCookie = null
  if (typeof response.headers.getSetCookie === 'function') {
    const all = response.headers.getSetCookie()
    if (all.length) setCookie = all.join('; ')
  }
  if (!setCookie) setCookie = response.headers.get('set-cookie')
  if (!setCookie) return null
  const m = setCookie.match(/auth=[^;]+/)
  return m ? m[0] : null
}

// Solve the challenge in `html` and POST the proof; returns the `auth` cookie or null.
async function clearChallenge(html) {
  const challenge = parseChallenge(html)
  if (!challenge) return null
  const n = await solvePow(challenge)
  const resp = await marketDataFetch(VERIFY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `c=${encodeURIComponent(challenge.c)}&n=${n}`,
  }, PROXY)
  return readAuthCookie(resp)
}

// Fetch a Stooq URL, transparently passing the proof-of-work gate.
// Returns the response body text (real CSV when authorised; '' when the gate
// could not be cleared, so the caller treats it as "no data").
export async function stooqFetch(url) {
  const headers = authCookie ? { Cookie: authCookie } : {}
  let resp = await marketDataFetch(url, { headers }, PROXY)
  let text = await resp.text()

  // Cached cookie still valid and the server returned data — done.
  if (!text.includes(CHALLENGE_MARKER)) return text

  // Gate is up: solve it, cache the fresh cookie, retry once.
  authCookie = null
  const cookie = await clearChallenge(text)
  if (!cookie) return ''
  authCookie = cookie
  resp = await marketDataFetch(url, { headers: { Cookie: cookie } }, PROXY)
  text = await resp.text()
  // Still gated (or empty) → let the caller fall through the provider chain.
  return text.includes(CHALLENGE_MARKER) ? '' : text
}
