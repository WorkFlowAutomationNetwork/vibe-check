'use client'

import { useState } from 'react'
import Link from 'next/link'

export type ScanType = 'passive' | 'active' | 'deep'

interface ScanTypeDef {
  value: ScanType
  label: string
  summary: string
  checks: string[]
  requiresPlan: string | null // null = always available
  comingSoon: boolean
}

const SCAN_TYPES: ScanTypeDef[] = [
  {
    value: 'passive',
    label: 'Passive Scan',
    summary: 'Security configuration and SSL review.',
    checks: ['Security headers (CSP, HSTS, etc.)', 'TLS/SSL configuration', 'Technology disclosure'],
    requiresPlan: null,
    comingSoon: false,
  },
  {
    value: 'active',
    label: 'Active Scan',
    summary: 'Everything in Passive, plus exposure checks against your live backend.',
    checks: ['Public Supabase/storage data exposure', 'Leaked secrets in JS bundles', 'Login rate-limiting'],
    requiresPlan: 'Starter',
    comingSoon: false,
  },
  {
    value: 'deep',
    label: 'Deep Scan',
    summary: 'Everything in Active, plus a Nuclei vulnerability template sweep.',
    checks: ['Everything in Active scan', 'Nuclei template-based vulnerability scanning'],
    requiresPlan: 'Monitor',
    comingSoon: false,
  },
]

interface Props {
  allowedScanTypes: string[]
  isAdmin: boolean
  selected: ScanType
  onSelect: (type: ScanType) => void
  compact?: boolean
}

export default function ScanTypePicker({ allowedScanTypes, isAdmin, selected, onSelect, compact }: Props) {
  const [expanded, setExpanded] = useState<ScanType | null>(null)

  function isLocked(def: ScanTypeDef): boolean {
    if (isAdmin) return false
    if (!def.requiresPlan) return false
    return !allowedScanTypes.includes(def.value)
  }

  function handleCardClick(def: ScanTypeDef) {
    const locked = isLocked(def)
    if (locked) {
      setExpanded(prev => (prev === def.value ? null : def.value))
      return
    }
    onSelect(def.value)
    setExpanded(prev => (prev === def.value ? null : def.value))
  }

  return (
    <div className={`scan-type-grid${compact ? ' compact' : ''}`}>
      {SCAN_TYPES.map(def => {
        const locked = isLocked(def)
        const isSelected = selected === def.value && !locked
        const isExpanded = expanded === def.value

        return (
          <div
            key={def.value}
            className={`scan-type-card${locked ? ' locked' : ''}${isSelected ? ' selected' : ''}`}
            onClick={() => handleCardClick(def)}
          >
            <div className="stc-head">
              <span className="stc-icon">{locked ? '🔒' : isSelected ? '✓' : '○'}</span>
              <span className="stc-label">{def.label}</span>
              {def.comingSoon && <span className="stc-badge">Coming soon</span>}
            </div>
            <div className="stc-summary">{def.summary}</div>

            {isExpanded && (
              <div className="stc-detail">
                <div className="stc-detail-title">Checks for:</div>
                <ul>
                  {def.checks.map(c => <li key={c}>✓ {c}</li>)}
                </ul>
                {locked && def.requiresPlan && (
                  <div className="stc-upgrade">
                    <span>Requires {def.requiresPlan} plan</span>
                    <Link href="/billing" onClick={e => e.stopPropagation()}>Upgrade →</Link>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
