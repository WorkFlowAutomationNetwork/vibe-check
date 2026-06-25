import { createServiceClient } from '@/lib/supabase/server'

export interface LandingStats {
  scansRun: number
  sitesChecked: number
  avgVulns: number
  repoScansRun: number
  secretsFound: number
}

/**
 * All-time aggregate stats for the public landing page.
 *
 * Uses the service-role client because the marketing page is unauthenticated
 * and RLS would hide other users' scans from the anon key. The underlying RPC
 * returns aggregate counts only — no row data.
 *
 * Returns `null` on any error so callers can fall back gracefully rather than
 * breaking the page.
 */
export async function getLandingStats(): Promise<LandingStats | null> {
  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase.rpc('get_landing_stats').single<{
      scans_run: number
      sites_checked: number
      avg_vulns: number
      repo_scans_run: number
      secrets_found: number
    }>()
    if (error || !data) return null
    return {
      scansRun: Number(data.scans_run),
      sitesChecked: Number(data.sites_checked),
      avgVulns: Number(data.avg_vulns),
      repoScansRun: Number(data.repo_scans_run),
      secretsFound: Number(data.secrets_found),
    }
  } catch {
    return null
  }
}
