export * from '@vibe-check/shared'

// Stub until `supabase gen types typescript` is run against the real project.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRow = Record<string, any>
type AnyTable = { Row: AnyRow; Insert: AnyRow; Update: AnyRow }

export type Database = {
  public: {
    Tables: {
      profiles: AnyTable
      urls: AnyTable
      scans: AnyTable
      findings: AnyTable
      badges: AnyTable
      activity_log: AnyTable
      integrations: AnyTable
      webhook_log: AnyTable
      api_keys: AnyTable
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}

export interface UrlRow {
  id: string
  user_id: string
  url: string
  verified: boolean
  verification_token: string
  verification_method: 'dns' | 'file' | 'meta' | null
  verified_at: string | null
  monitoring_mode: 'one_off' | 'continuous'
  label: string | null
  deleted_at: string | null
  created_at: string
}

export interface ScanRow {
  id: string
  url_id: string
  user_id: string
  scan_type: 'passive' | 'active' | 'deep'
  status: 'pending' | 'running' | 'completed' | 'failed'
  grade: string | null
  score: number | null
  is_public: boolean
  checks_total: number | null
  completed_at: string | null
  created_at: string
}

export interface FindingRow {
  id: string
  scan_id: string
  severity: 'critical' | 'medium' | 'low' | 'info' | 'pass'
  category: string
  result: 'pass' | 'fail' | 'warn'
  title: string
  description: string | null
  what_we_did: string | null
  remediation: string | null
  first_seen_at: string
  metadata: Record<string, unknown> | null
}

export interface BadgeRow {
  id: string
  url_id: string
  scan_id: string
  status: 'active' | 'lapsed' | 'revoked'
  public_token: string
  expires_at: string
  created_at: string
}

export interface ActivityLogRow {
  id: string
  user_id: string
  url_id: string | null
  scan_id: string | null
  event_type: string
  payload: Record<string, unknown>
  created_at: string
}

export interface ProfileRow {
  id: string
  plan: 'free' | 'starter' | 'monitor'
  stripe_customer_id: string | null
  stripe_subscription_status: string | null
  is_admin: boolean
  name: string | null
}

export interface DashboardUrlCard {
  url: UrlRow
  latestScan: ScanRow | null
  badge: BadgeRow | null
  severityCounts: { critical: number; medium: number; low: number; info: number; pass: number }
}
