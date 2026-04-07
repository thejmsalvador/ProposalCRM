import { createBrowserClient } from '@supabase/auth-helpers-nextjs'

/**
 * Client-side Supabase client (use inside Client Components).
 * Call this inside the component body, not at module level,
 * so it picks up cookies on every render.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
