interface ScanLite {
  status: 'pending' | 'running' | 'completed' | 'failed'
  secrets_found: number | null
}

const PILL_BASE: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 12,
  fontWeight: 600,
  padding: '2px 8px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--line)',
  whiteSpace: 'nowrap',
}

export default function RepoStatusPill({ scan }: { scan: ScanLite | null }) {
  if (!scan) {
    return <span style={{ ...PILL_BASE, color: 'var(--ink-mute)' }}>Never scanned</span>
  }
  if (scan.status === 'pending' || scan.status === 'running') {
    return <span style={{ ...PILL_BASE, color: 'var(--violet)', borderColor: 'var(--violet)' }}>Scanning…</span>
  }
  if (scan.status === 'failed') {
    return <span style={{ ...PILL_BASE, color: 'var(--danger)', borderColor: 'var(--danger)' }}>Failed</span>
  }
  const n = scan.secrets_found ?? 0
  if (n === 0) {
    return <span style={{ ...PILL_BASE, color: 'var(--lime-deep)', borderColor: 'var(--lime-deep)' }}>Clean</span>
  }
  return (
    <span style={{ ...PILL_BASE, color: 'var(--danger)', borderColor: 'var(--danger)' }}>
      {n} secret{n === 1 ? '' : 's'}
    </span>
  )
}
