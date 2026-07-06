import { timingSafeEqual } from 'crypto'

/**
 * Constant-time check of the cron Authorization header against CRON_SECRET.
 * Fails closed when CRON_SECRET is unset or the header is missing, and uses
 * crypto.timingSafeEqual so a wrong token can't be recovered via response
 * timing. (Length is compared first — timingSafeEqual throws on unequal-length
 * buffers — which only reveals the fixed secret length, not its contents.)
 */
export function isAuthorizedCron(authHeader: string | null): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret || !authHeader) return false
  const provided = Buffer.from(authHeader)
  const expected = Buffer.from(`Bearer ${secret}`)
  if (provided.length !== expected.length) return false
  return timingSafeEqual(provided, expected)
}
