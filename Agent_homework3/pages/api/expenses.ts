import type { NextApiRequest, NextApiResponse } from 'next'
import { supabaseAdmin } from '../../lib/supabase'
import { getUserIdFromRequest } from '../../lib/auth'
import { isTableMissingError, tableMissingHint } from '../../lib/supabaseErrors'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    if (!supabaseAdmin) {
      return res.status(200).json({ ok: true, data: [] })
    }

    const userId = await getUserIdFromRequest(req)
    if (!userId) {
      return res.status(401).json({ error: '未登录或 token 无效' })
    }

    try {
      const { data, error } = await supabaseAdmin
        .from('expenses')
        .select('id, amount, category, note, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) {
        console.error('expenses: query error', error)
        if (isTableMissingError(error)) {
          return res.status(503).json({ error: tableMissingHint('public.expenses'), code: 'PGRST205' })
        }
        return res.status(500).json({ error: error.message })
      }
      return res.status(200).json({ ok: true, data })
    } catch (err: any) {
      console.error('expenses: unexpected error', err)
      if (isTableMissingError(err)) {
        return res.status(503).json({ error: tableMissingHint('public.expenses'), code: 'PGRST205' })
      }
      return res.status(500).json({ error: err?.message || String(err) })
    }
  }

  if (req.method === 'POST') {
    const { amount, category, note, date } = req.body || {}
    if (!amount || !category) return res.status(400).json({ error: '缺少 amount 或 category' })

    if (supabaseAdmin) {
      try {
        const userId = await getUserIdFromRequest(req)

        const payload: any = { amount, category, note: note || null, created_at: date || new Date().toISOString() }
        if (userId) payload.user_id = userId
        const { data, error } = await supabaseAdmin.from('expenses').insert(payload).select()
        if (error) {
          console.error('expenses: insert error', error)
          if (isTableMissingError(error)) {
            return res.status(503).json({ error: tableMissingHint('public.expenses'), code: 'PGRST205' })
          }
          return res.status(500).json({ error: error.message })
        }
        return res.status(200).json({ ok: true, data })
      } catch (err: any) {
        console.error('expenses: insert unexpected error', err)
        if (isTableMissingError(err)) {
          return res.status(503).json({ error: tableMissingHint('public.expenses'), code: 'PGRST205' })
        }
        return res.status(500).json({ error: err.message || String(err) })
      }
    }

    console.log('记录费用（mock）', { amount, category, note, date })
    return res.status(200).json({ ok: true })
  }

  res.setHeader('Allow', 'GET, POST')
  return res.status(405).end()
}
