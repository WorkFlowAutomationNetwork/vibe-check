import { createServiceClient } from '@/lib/supabase/server'

export type RateLimitResult = {
  /** true = request is allowed to proceed */
  ok: boolean
  /** requests left in the current window (0 when blocked) */
  remaining: number
  /** seconds until the window resets — use for the Retry-After header */
  retryAfterSeconds: number
}

/**
 * Fixed-window rate limit backed by Postgres (the `check_rate_limit` function +
 * `rate_limits` table, migration 20260702000033). One atomic upsert per call via
 * the service-role client.
 *
 * Fails OPEN: if the limiter itself errors (DB down, RPC missing), the request is
 * allowed through and the error is logged. Availability of the protected endpoint
 * matters more than strict enforcement for the endpoints we guard here.
 *
 * The store is deliberately behind this single function so it can be swapped for
 * Redis/Upstash later without touching call sites.
 */
export async function checkRateLimit(opts: {
  key: string
  max: number
  windowSeconds: number
}): Promise<RateLimitResult> {
  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .rpc('check_rate_limit', {
        p_key: opts.key,
        p_max: opts.max,
        p_window_seconds: opts.windowSeconds,
      })
      .single<{ allowed: boolean; remaining: number; reset_at: string }>()

    if (error || !data) {
      console.error('[rate-limit] check failed, failing open:', error?.message ?? 'no data')
      return { ok: true, remaining: opts.max, retryAfterSeconds: 0 }
    }

    const retryAfterSeconds = Math.max(0, Math.ceil((new Date(data.reset_at).getTime() - Date.now()) / 1000))
    return { ok: data.allowed, remaining: data.remaining, retryAfterSeconds }
  } catch (e) {
    console.error('[rate-limit] unexpected error, failing open:', e)
    return { ok: true, remaining: opts.max, retryAfterSeconds: 0 }
  }
}

/** Best-effort client IP for IP-keyed limits. Vercel sets x-forwarded-for. */
export function clientIp(request: Request): string {
  const xff = request.headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  return request.headers.get('x-real-ip') ?? 'unknown'
}
