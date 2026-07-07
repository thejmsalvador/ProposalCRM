import { createHmac, timingSafeEqual } from 'crypto'

// Short-lived: the token is minted by the generate route and consumed by
// Puppeteer within seconds, so a few minutes is more than enough.
const DEFAULT_TTL_MS = 5 * 60 * 1000

/**
 * Mint a signed, expiring token authorizing render of one proposal's PDF page.
 * Format: `<expiresAtMs>.<hmac>` where hmac = HMAC-SHA256(secret, `<id>.<exp>`).
 * Binding the expiry into the signed payload makes the token non-deterministic
 * and time-limited (vs. the old permanent HMAC(id) capability URL).
 */
export function signPdfToken(
  proposalId: string,
  secret: string,
  ttlMs: number = DEFAULT_TTL_MS,
): string {
  const exp = Date.now() + ttlMs
  const sig = createHmac('sha256', secret).update(`${proposalId}.${exp}`).digest('hex')
  return `${exp}.${sig}`
}

/** Constant-time verify of a token minted by signPdfToken, incl. expiry. */
export function verifyPdfToken(
  token: string | undefined,
  proposalId: string,
  secret: string,
): boolean {
  if (!token) return false
  const dot = token.indexOf('.')
  if (dot <= 0) return false
  const expStr = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  const exp = Number(expStr)
  if (!Number.isFinite(exp) || exp < Date.now()) return false
  const expected = createHmac('sha256', secret).update(`${proposalId}.${exp}`).digest('hex')
  const provided = Buffer.from(sig)
  const expectedBuf = Buffer.from(expected)
  if (provided.length !== expectedBuf.length) return false
  return timingSafeEqual(provided, expectedBuf)
}
