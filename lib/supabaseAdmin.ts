import { createClient } from '@supabase/supabase-js'

let _admin: ReturnType<typeof createClient> | null = null

/**
 * Returns a Supabase client authenticated with the service role key.
 * Server-side only — never expose this client to the browser.
 */
export function getSupabaseAdmin() {
  if (!_admin) {
    _admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )
  }
  return _admin
}
