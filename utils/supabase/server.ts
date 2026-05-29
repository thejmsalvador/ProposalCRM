import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { supabaseKey, supabaseUrl } from './env'

export const createClient = (cookieStore: ReturnType<typeof cookies>) => {
  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          )
        } catch {
          // Called from a Server Component; middleware refreshes sessions.
        }
      },
    },
  })
}
