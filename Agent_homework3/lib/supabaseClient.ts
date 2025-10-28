import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
const SUPABASE_ANON_KEY = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim()

// If both env vars are present, create a real Supabase client. Otherwise export a safe noop mock
let _supabaseClient: any
if (SUPABASE_URL && SUPABASE_ANON_KEY) {
	_supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
} else {
	// Minimal mock implementation covering the methods we use in the app
	console.warn('Supabase client not configured (NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_ANON_KEY). Using noop mock client.')
	_supabaseClient = {
		auth: {
			getSession: async () => ({ data: { session: null } }),
			signUp: async (opts: any) => ({ data: null, error: new Error('Supabase not configured') }),
			signInWithPassword: async (opts: any) => ({ data: null, error: new Error('Supabase not configured') }),
			signOut: async () => ({ error: null }),
			onAuthStateChange: (_cb: any) => ({ subscription: { unsubscribe: () => {} } })
		},
		// minimal from/select/insert stubs in case other code tries to use them
		from: () => ({ insert: async () => ({ data: null, error: new Error('Supabase not configured') }) }),
		// allow requests like supabase.storage or others to fail gracefully
		storage: {
			from: () => ({ upload: async () => ({ data: null, error: new Error('Supabase not configured') }) })
		}
	}
}

export const supabaseClient = _supabaseClient
export const supabase = _supabaseClient
export default _supabaseClient
