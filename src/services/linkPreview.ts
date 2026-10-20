import { config } from '../config'

export type LinkPreview = { title?: string; description?: string; imageUrl?: string }

type CardybResponse = { error?: string; title?: string; description?: string; image?: string }

const clean = (v?: string) => v?.trim() || undefined

/**
 * Best-effort page metadata for a URL, used only to prefill the new-card form.
 * Returns null when previews are disabled, the service fails, or it times out.
 */
export async function fetchLinkPreview(
  url: string,
  opts: { fetch?: typeof globalThis.fetch; signal?: AbortSignal; service?: string } = {},
): Promise<LinkPreview | null> {
  const service = opts.service ?? config.linkPreviewService
  if (!service) return null
  const fetchFn = opts.fetch ?? globalThis.fetch
  try {
    const res = await fetchFn(`${service}?url=${encodeURIComponent(url)}`, {
      signal: opts.signal ?? AbortSignal.timeout(8000),
      referrerPolicy: 'no-referrer',
    })
    if (!res.ok) return null
    const body = (await res.json()) as CardybResponse
    if (body.error) return null
    const preview = { title: clean(body.title), description: clean(body.description), imageUrl: clean(body.image) }
    return preview.title || preview.description ? preview : null
  } catch {
    return null
  }
}
