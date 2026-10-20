/**
 * URL normalisation used to match connection endpoints and annotation
 * targets to cards. Deliberately conservative: it only removes differences
 * that never change which page is meant.
 */
export function normaliseUrl(raw: string): string {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return raw.trim()
  }
  url.hash = ''
  url.hostname = url.hostname.toLowerCase()
  if ((url.protocol === 'https:' && url.port === '443') || (url.protocol === 'http:' && url.port === '80')) {
    url.port = ''
  }
  let out = url.toString()
  if (url.pathname !== '/' && out.endsWith('/') && !url.search) out = out.slice(0, -1)
  if (url.pathname === '/' && !url.search) out = out.replace(/\/$/, '')
  return out
}

export function domainOf(raw: string | undefined): string | undefined {
  if (!raw) return undefined
  try {
    return new URL(raw).hostname.replace(/^www\./, '')
  } catch {
    return undefined
  }
}

/** A readable fallback title: host + path without protocol or query noise. */
export function cleanUrl(raw: string): string {
  try {
    const u = new URL(raw)
    const path = u.pathname === '/' ? '' : decodeURIComponent(u.pathname).replace(/\/$/, '')
    return `${u.hostname.replace(/^www\./, '')}${path}`
  } catch {
    return raw
  }
}

export function isHttpUrl(raw: string | undefined): raw is string {
  if (!raw) return false
  try {
    const { protocol } = new URL(raw)
    return protocol === 'https:' || protocol === 'http:'
  } catch {
    return false
  }
}
