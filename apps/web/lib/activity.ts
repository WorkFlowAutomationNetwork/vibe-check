import { createServiceClient } from '@/lib/supabase/server'

interface LogActivityParams {
  userId: string
  eventType: string
  urlId?: string
  scanId?: string
  payload?: Record<string, unknown>
}

/**
 * Append one row to `activity_log`. Uses the service-role client because the
 * table has no client INSERT policy (RLS). Best-effort: a logging failure must
 * never change the API response that triggered it.
 */
export async function logActivity(params: LogActivityParams): Promise<void> {
  try {
    const supabase = createServiceClient()
    await supabase.from('activity_log').insert({
      user_id: params.userId,
      event_type: params.eventType,
      url_id: params.urlId ?? null,
      scan_id: params.scanId ?? null,
      payload: params.payload ?? {},
    })
  } catch {
    // best-effort — swallow
  }
}
