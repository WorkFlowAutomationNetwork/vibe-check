'use client'

import { useState } from 'react'
import type { FindingRow } from '@/types'

const SEVERITY_ORDER = ['critical', 'medium', 'low', 'info', 'pass'] as const

const SEV_CLASS: Record<string, string> = {
  critical: 'crit',
  medium: 'med',
  low: 'low',
  info: 'info',
  pass: 'pass',
}

const SEV_LABEL: Record<string, string> = {
  critical: 'Critical',
  medium: 'Medium',
  low: 'Low',
  info: 'Info',
  pass: 'Passed',
}

interface Props {
  findings: FindingRow[]
}

export default function FindingsList({ findings }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(
    findings.filter(f => f.severity === 'critical').map(f => f.id)
  ))

  function toggle(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function expandAll() {
    setExpanded(new Set(findings.map(f => f.id)))
  }

  const bySeverity = (a: FindingRow, b: FindingRow) =>
    SEVERITY_ORDER.indexOf(a.severity as typeof SEVERITY_ORDER[number]) -
    SEVERITY_ORDER.indexOf(b.severity as typeof SEVERITY_ORDER[number])

  const issues = findings.filter(f => f.severity !== 'pass').sort(bySeverity)
  const working = findings.filter(f => f.severity === 'pass')

  const counts = SEVERITY_ORDER.reduce((acc, sev) => {
    acc[sev] = findings.filter(f => f.severity === sev).length
    return acc
  }, {} as Record<string, number>)

  function renderFinding(finding: FindingRow) {
    const isExpanded = expanded.has(finding.id)
    const sevClass = SEV_CLASS[finding.severity] ?? ''
    const hasBody = finding.description || finding.what_we_did || finding.remediation

    return (
      <div
        key={finding.id}
        className={`finding ${sevClass}${isExpanded ? ' expanded' : ''}`}
        onClick={() => hasBody && toggle(finding.id)}
        style={{ cursor: hasBody ? 'pointer' : 'default' }}
      >
        <div className="finding-head">
          <div className="left-strip" />
          <span className={`severity-tag ${sevClass}`}>{SEV_LABEL[finding.severity]}</span>
          <div className="ftitle">{finding.title}</div>
          <div className="frt">
            {finding.category}
            {hasBody && !isExpanded && ' · expand'}
          </div>
        </div>

        {isExpanded && hasBody && (
          <div className="finding-body">
            {finding.description && (
              <div className="fb-block">
                <div className="fb-label">What it is</div>
                <div className="fb-text">{finding.description}</div>
              </div>
            )}
            {finding.what_we_did && (
              <div className="fb-block">
                <div className="fb-label">What we did</div>
                <div className="fb-text">{finding.what_we_did}</div>
              </div>
            )}
            {finding.remediation && (
              <div className="fb-block">
                <div className="fb-label">Recommended fix</div>
                <div className="fb-text">{finding.remediation}</div>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      <h2 className="section-label">
        Issues ({issues.length})
        {issues.length > 0 && (
          <button
            onClick={expandAll}
            className="see-all"
            style={{ background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', color: 'var(--violet)' }}
          >
            expand all →
          </button>
        )}
      </h2>

      <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
        {counts.critical > 0 && <span style={{ color: 'var(--danger)' }}><b>{counts.critical}</b> critical</span>}
        {counts.medium > 0 && <span style={{ color: 'var(--warn)' }}><b>{counts.medium}</b> medium</span>}
        {counts.low > 0 && <span style={{ color: 'var(--ink-mute)' }}><b>{counts.low}</b> low</span>}
        {counts.info > 0 && <span style={{ color: 'var(--ink-mute)' }}><b>{counts.info}</b> info</span>}
        {counts.pass > 0 && <span style={{ color: '#16a34a' }}><b>{counts.pass}</b> passed</span>}
      </div>

      {issues.length > 0
        ? issues.map(renderFinding)
        : findings.length > 0 && (
            <div style={{ background: 'var(--bg-card)', border: '1.5px solid #16a34a', borderRadius: 'var(--radius)', padding: '20px 24px', marginBottom: 8, fontSize: 14, color: 'var(--ink-soft)' }}>
              <b style={{ color: '#16a34a' }}>No issues found.</b> Every check we ran passed — see what&apos;s working below.
            </div>
          )}

      {working.length > 0 && (
        <>
          <h2 className="section-label" style={{ marginTop: 36 }}>What&apos;s working ({working.length})</h2>
          <p style={{ fontSize: 13, color: 'var(--ink-soft)', margin: '0 0 16px', lineHeight: 1.6 }}>
            The checks below already pass — this is what your app is doing right.
          </p>
          {working.map(renderFinding)}
        </>
      )}

      {findings.length === 0 && (
        <div style={{ padding: '32px 24px', textAlign: 'center', color: 'var(--ink-mute)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
          No findings recorded for this scan.
        </div>
      )}
    </>
  )
}
