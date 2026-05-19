import type { ScanGrade, ScanType, FindingSeverity, FindingResult, FindingCategory } from './scan'

export interface Finding {
  id: string
  scan_id: string
  check_name: string
  category: FindingCategory
  severity: FindingSeverity
  result: FindingResult
  title: string
  description: string | null
  what_we_did: string | null
  remediation: string | null
  first_seen_at: string
  metadata: Record<string, unknown>
  created_at: string
}

export interface Scan {
  id: string
  url_id: string
  user_id: string
  scan_type: ScanType
  status: 'pending' | 'running' | 'completed' | 'failed'
  grade: ScanGrade | null
  score: number | null
  triggered_by: 'manual' | 'webhook' | 'api'
  is_public: boolean
  pdf_storage_path: string | null
  scanner_version: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
}

export interface Report {
  scan: Scan
  findings: Finding[]
  url: string
  grade: ScanGrade
  score: number
  summary: {
    critical: number
    medium: number
    low: number
    info: number
    pass: number
  }
}

export function buildSummary(findings: Finding[]): Report['summary'] {
  return {
    critical: findings.filter(f => f.severity === 'critical').length,
    medium: findings.filter(f => f.severity === 'medium').length,
    low: findings.filter(f => f.severity === 'low').length,
    info: findings.filter(f => f.severity === 'info').length,
    pass: findings.filter(f => f.severity === 'pass').length,
  }
}
