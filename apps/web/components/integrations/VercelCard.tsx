export default function VercelCard() {
  return (
    <div className="int-card" style={{ opacity: 0.55, pointerEvents: 'none', userSelect: 'none' }}>
      <div className="int-head">
        <div className="int-mark vercel">▲</div>
        <div className="int-title-wrap">
          <div className="int-name">
            Vercel{' '}
            <span className="chip" style={{ background: 'var(--bg-sub)', color: 'var(--ink-mute)', border: '1px solid var(--line)' }}>
              Coming soon
            </span>
          </div>
          <p className="int-desc">Deploy-triggered re-scans when you ship to production. Webhook-based — no account access required.</p>
        </div>
      </div>
      <div className="int-actions">
        <button className="btn btn-soft" disabled style={{ padding: '8px 12px', fontSize: 13, cursor: 'not-allowed' }}>
          Coming soon
        </button>
      </div>
    </div>
  )
}
