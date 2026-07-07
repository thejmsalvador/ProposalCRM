// Lightweight in-process fixed-window rate limiter.
//
// NOTE: state lives in module memory, so on a multi-instance/serverless
// deployment (Vercel) each instance keeps its own counters — this throttles a
// burst hitting one warm instance but is not a global limit. For strict global
// limits, back this with a shared store (e.g. Upstash Redis) behind the same
// interface. It still meaningfully blunts brute-force login and PDF-render
// abuse against a single instance with zero added infrastructure.

type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()

export type RateLimitResult = { ok: boolean; retryAfterSeconds: number }

/**
 * Allow up to `limit` events per `windowMs` for a given `key`.
 * Returns ok:false with retryAfterSeconds once the window's budget is spent.
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now()

  // Opportunistic prune so the map can't grow unbounded over time.
  if (buckets.size > 5000) {
    buckets.forEach((b, k) => {
      if (b.resetAt <= now) buckets.delete(k)
    })
  }

  const existing = buckets.get(key)
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true, retryAfterSeconds: 0 }
  }
  if (existing.count >= limit) {
    return { ok: false, retryAfterSeconds: Math.ceil((existing.resetAt - now) / 1000) }
  }
  existing.count += 1
  return { ok: true, retryAfterSeconds: 0 }
}
