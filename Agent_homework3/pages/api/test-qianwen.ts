import type { NextApiRequest, NextApiResponse } from 'next'

// This endpoint attempts a controlled request to the configured Qianwen endpoint
// and returns diagnostic information (does NOT return keys). Useful for debugging
// network/DNS/TLS/auth problems from the server process.

async function fetchWithTimeout(url: string, opts: any = {}, timeoutMs = 10000) {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal, ...opts })
    clearTimeout(id)
    return res
  } catch (err) {
    clearTimeout(id)
    throw err
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end()

  const url = process.env.QIANWEN_API_URL
  const key = process.env.QIANWEN_API_KEY
  const keyHeader = process.env.QIANWEN_API_KEY_HEADER || 'Authorization'

  if (!url || !key) return res.status(400).json({ ok: false, reason: 'QIANWEN_API_URL 或 QIANWEN_API_KEY 未配置' })

  try {
  const model = process.env.QIANWEN_MODEL || 'gpt-3.5-turbo'
  const body = { model, messages: [{ role: 'user', content: 'ping' }], max_tokens: 10 }
    const headers: any = { 'Content-Type': 'application/json' }
    if (keyHeader === 'Authorization') headers['Authorization'] = `Bearer ${key}`
    else headers[keyHeader] = key

    const r = await fetchWithTimeout(url, { method: 'POST', headers, body: JSON.stringify(body) }, 10000)

    const info: any = { url, status: r.status, statusText: r.statusText, contentType: r.headers.get('content-type') }

    // Try to parse JSON safely, else return truncated text
    const ct = r.headers.get('content-type') || ''
    if (ct.includes('application/json')) {
      const j = await r.json()
      info.bodyPreview = JSON.stringify(j).slice(0, 2000)
    } else {
      const txt = await r.text()
      info.bodyPreview = txt.slice(0, 2000)
    }

    return res.status(200).json({ ok: true, info })
  } catch (err: any) {
    // Return error kind and message to help diagnose (stack may contain internals; we provide message)
    const info: any = { ok: false, error: String(err?.message || err) }
    if (err && typeof err === 'object') {
      if ('code' in err) info.code = (err as any).code
      if ('name' in err) info.name = (err as any).name
    }
    return res.status(500).json(info)
  }
}
