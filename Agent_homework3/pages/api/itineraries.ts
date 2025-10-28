import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '../../lib/supabase'
import { getUserIdFromRequest } from '../../lib/auth'
import { isTableMissingError, tableMissingHint } from '../../lib/supabaseErrors'

type RawItineraryRecord = {
  id: string
  title: string | null
  summary: string | null
  created_at: string
  itinerary: any
}

const safeParseJson = (value: any) => {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch (err) {
      console.warn('itineraries: JSON parse failed, returning raw string snippet=', value.slice?.(0, 120))
      return value
    }
  }
  return value
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method Not Allowed' })
  }

  if (!supabaseAdmin) {
    return res.status(200).json({ ok: true, data: [] })
  }

  const userId = await getUserIdFromRequest(req)
  if (!userId) {
    return res.status(401).json({ error: '未登录或 token 无效' })
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('itineraries')
      .select('id, title, summary, itinerary, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      console.error('itineraries: supabase query error', error)
      if (isTableMissingError(error)) {
        return res.status(503).json({ error: tableMissingHint('public.itineraries'), code: 'PGRST205' })
      }
      return res.status(500).json({ error: error.message })
    }

  const normalized = ((data || []) as RawItineraryRecord[]).map(item => ({
      ...item,
      itinerary: safeParseJson(item.itinerary)
    }))

    return res.status(200).json({ ok: true, data: normalized })
  } catch (err: any) {
    console.error('itineraries: unexpected error', err)
    if (isTableMissingError(err)) {
      return res.status(503).json({ error: tableMissingHint('public.itineraries'), code: 'PGRST205' })
    }
    return res.status(500).json({ error: err?.message || String(err) })
  }
}
