export type Plan = 'free' | 'starter' | 'monitor'
export type ScanType = 'passive' | 'active' | 'deep'
export type ScanStatus = 'pending' | 'running' | 'completed' | 'failed'
export type ScanGrade = 'A+' | 'A' | 'B+' | 'B' | 'C+' | 'C' | 'D' | 'F'
export type FindingSeverity = 'critical' | 'medium' | 'low' | 'info' | 'pass'
export type FindingResult = 'pass' | 'fail' | 'warn'
export type FindingCategory =
  | 'headers'
  | 'transport'
  | 'ai'
  | 'auth'
  | 'cors'
  | 'deps'
  | 'endpoints'
  | 'secrets'
export type BadgeStatus = 'active' | 'lapsed' | 'revoked'
export type IntegrationType = 'github' | 'vercel' | 'netlify' | 'slack'
export type IntegrationStatus = 'active' | 'disconnected' | 'pending'
export type MonitoringMode = 'one_off' | 'continuous'
export type VerificationMethod = 'dns' | 'file' | 'meta'
export type RateLimitMode = 'polite' | 'fast'
export type TriggeredBy = 'manual' | 'webhook' | 'api'

export type ActivityEventType =
  | 'url_added'
  | 'url_verified'
  | 'scan_started'
  | 'scan_completed'
  | 'scan_failed'
  | 'cve_matched'
  | 'badge_renewed'
  | 'badge_lapsed'
  | 'fix_applied'

export const GRADE_ORDER: ScanGrade[] = ['A+', 'A', 'B+', 'B', 'C+', 'C', 'D', 'F']

export const SEVERITY_ORDER: FindingSeverity[] = [
  'critical',
  'medium',
  'low',
  'info',
  'pass',
]
