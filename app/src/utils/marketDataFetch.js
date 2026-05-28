// Unified HTTP transport for market data providers.
//
// Providers that don't set Access-Control-Allow-Origin (Yahoo Finance, Stooq)
// can't be called via plain fetch() from a browser context. Three bypass paths:
//   • Vite dev server: /__yfproxy and /__stooq paths are rewritten to the real
//     host by vite.config.js server.proxy (no CORS restriction in Node proxy).
//   • Tauri production: @tauri-apps/plugin-http makes native HTTP requests that
//     bypass WebView CORS entirely; allowed by the http capability.
//   • Capacitor (Android): CapacitorHttp.enabled = true in capacitor.config.json
//     intercepts fetch() via the bridge, routing cross-origin requests through
//     Android's native HTTP stack. No proxy prefix needed — use the real URL.
//
// Providers with Access-Control-Allow-Origin: * (Polygon/Massive, Twelve Data,
// Alpha Vantage, Finnhub) use plain fetch() and don't need requiresProxy.

// Map of real hostname → Vite dev proxy prefix
const DEV_PROXY = {
  'query1.finance.yahoo.com': '/__yfproxy',
  'finance.yahoo.com':        '/__yfproxy',
  'stooq.com':                '/__stooq',
}

function isTauri() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

function isCapacitor() {
  return typeof window !== 'undefined' && !!window.Capacitor
}

function toDevProxyUrl(url) {
  try {
    const u = new URL(url)
    const prefix = DEV_PROXY[u.hostname]
    if (!prefix) return url
    return prefix + u.pathname + u.search
  } catch {
    return url
  }
}

export async function marketDataFetch(url, options = {}, { requiresProxy = false } = {}) {
  if (!requiresProxy) return fetch(url, options)

  if (isTauri()) {
    // Native HTTP request — bypasses WebView CORS; requires http capability.
    // Imported dynamically (no @vite-ignore) so Vite bundles the plugin into a
    // chunk the WebView can resolve at runtime.
    const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http')
    return tauriFetch(url, options)
  }

  if (isCapacitor()) {
    // CapacitorHttp.enabled intercepts fetch() natively — use the real URL directly.
    return fetch(url, options)
  }

  // Vite dev: rewrite URL through configured server proxy
  return fetch(toDevProxyUrl(url), options)
}
