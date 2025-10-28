import type { NextApiRequest, NextApiResponse } from 'next'

// WARNING: This endpoint intentionally does NOT return secret values.
// It only returns whether the server process has the variables configured.
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end()
  const hasOpenAI = Boolean(process.env.OPENAI_API_KEY)
  const hasSupabase = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_URL)
  const hasQianwen = Boolean(process.env.QIANWEN_API_URL && process.env.QIANWEN_API_KEY)
  return res.status(200).json({ hasOpenAI, hasSupabase, hasQianwen })
}
