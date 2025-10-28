import type { NextApiRequest } from 'next'
import { supabaseAdmin } from './supabase'

export async function getUserIdFromRequest(req: NextApiRequest): Promise<string | null> {
  if (!supabaseAdmin) return null
  try {
    const authHeader = String(req.headers.authorization || '')
    if (!authHeader.startsWith('Bearer ')) return null
    const token = authHeader.split(' ')[1]
    if (!token) return null
    const { data, error } = await supabaseAdmin.auth.getUser(token)
    if (error) {
      console.error('getUserIdFromRequest error:', error)
      return null
    }
    return data?.user?.id || null
  } catch (err) {
    console.error('getUserIdFromRequest exception:', err)
    return null
  }
}
