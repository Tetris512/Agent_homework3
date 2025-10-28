import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '../../lib/supabase'
import { getUserIdFromRequest } from '../../lib/auth'
import { isTableMissingError, tableMissingHint } from '../../lib/supabaseErrors'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()
  const { itinerary, summary, title } = req.body || {}
  if (!itinerary) return res.status(400).json({ error: '缺少 itinerary 数据' })

  // If Supabase admin client configured, persist the itinerary
  if (supabaseAdmin) {
    try {
      // If client provided a bearer token, validate and associate user_id
      const userId = await getUserIdFromRequest(req)
      if (!userId) return res.status(401).json({ error: '未登录或 token 无效' })

      const payload: any = {
        itinerary: JSON.stringify(itinerary),
        summary: summary || null,
        title: typeof title === 'string' ? title : null,
        user_id: userId,
        created_at: new Date().toISOString()
      }
      const { data, error } = await supabaseAdmin.from('itineraries').insert(payload).select()
      if (error) {
        console.error('Supabase insert error:', error)
        if (isTableMissingError(error)) {
          return res.status(503).json({ error: tableMissingHint('public.itineraries'), code: 'PGRST205' })
        }
        return res.status(500).json({ error: error.message })
      }
      return res.status(200).json({ ok: true, data })
    } catch (err: any) {
      console.error('Save error', err)
      if (isTableMissingError(err)) {
        return res.status(503).json({ error: tableMissingHint('public.itineraries'), code: 'PGRST205' })
      }
      return res.status(500).json({ error: err.message || String(err) })
    }
  }

  // Fallback/mock behavior when Supabase not configured
  console.log('保存行程（mock）', { itinerary, summary })
  return res.status(200).json({ ok: true })
}
