import { createClient } from '@/utils/supabase/client'

/**
 * Client-side Supabase client (use inside Client Components).
 * Call this inside the component body, not at module level,
 * so it picks up cookies on every render.
 */
export function createSupabaseBrowserClient() {
  return createClient()
}
