import type { NextApiRequest, NextApiResponse } from 'next'

// Duplicate small helpers for local debugging to avoid refactoring large modules.
function extractJson(text: string): string | null {
  if (!text) return null
  const first = text.indexOf('{')
  if (first === -1) return null
  let depth = 0
  for (let i = first; i < text.length; i++) {
    const ch = text[i]
    if (ch === '{') depth++
    else if (ch === '}') depth--
    if (depth === 0) return text.slice(first, i + 1)
  }
  return null
}

function sanitizeJsonString(s: string) {
  let t = s.trim()
  t = t.replace(/```\s*json|```/gi, '')
  t = t.replace(/[“”]/g, '"').replace(/[‘’]/g, "'")
  t = t.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]+/g, '')
  t = t.replace(/,\s*(?=[}\]])/g, '')
  try {
    t = t.replace(/"([^"\\]*(\\.[^"\\]*)*)"/g, (m) => m.replace(/\r?\n/g, '\\n'))
  } catch (e) {
    // ignore
  }
  return t
}

function tryParseJsonTolerant(raw: string): { ok: boolean; parsed?: any; error?: string } {
  if (!raw) return { ok: false, error: 'empty input' }
  try {
    return { ok: true, parsed: JSON.parse(raw) }
  } catch (e: any) {
    // continue
  }
  const cleaned = sanitizeJsonString(raw)
  try {
    return { ok: true, parsed: JSON.parse(cleaned) }
  } catch (e: any) {
    const sub = extractJson(cleaned)
    if (sub) {
      try {
        return { ok: true, parsed: JSON.parse(sub) }
      } catch (ee: any) {
        return { ok: false, error: String(ee?.message || ee) }
      }
    }
    return { ok: false, error: String(e?.message || 'parse failed') }
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'only POST' })

  const rawText = String(req.body?.rawText || '')
  if (!rawText) return res.status(400).json({ error: 'rawText is required in body' })

  const sanitized = sanitizeJsonString(rawText)
  const extractedFromRaw = extractJson(rawText)
  const extractedFromSanitized = extractJson(sanitized)
  const parsedRaw = tryParseJsonTolerant(rawText)
  const parsedSanitized = tryParseJsonTolerant(sanitized)

  // Return compact previews to avoid extremely large responses
  const preview = (s: string) => (s ? (s.length > 20000 ? s.slice(0, 20000) + '...<truncated>' : s) : '')

  return res.status(200).json({
    rawPreview: preview(rawText),
    sanitizedPreview: preview(sanitized),
    extractedFromRaw: extractedFromRaw || null,
    extractedFromSanitized: extractedFromSanitized || null,
    parsedRaw: parsedRaw.ok ? { ok: true, preview: parsedRaw.parsed } : { ok: false, error: parsedRaw.error },
    parsedSanitized: parsedSanitized.ok ? { ok: true, preview: parsedSanitized.parsed } : { ok: false, error: parsedSanitized.error }
  })
}
