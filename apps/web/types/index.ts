export * from '@vibe-check/shared'

// Stub until `supabase gen types typescript` is run against the real project.
// Using `any` rows lets the rest of the app compile without type errors.
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
