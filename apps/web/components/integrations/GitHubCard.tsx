interface Installation { installation_id: number; account_login: string; status: string }
interface Repo { id: string; full_name: string; status: string }

const DATA_HANDLING_COPY =
  'To find committed secrets we read all files across your selected repositories’ full git history. ' +
  'We never retain your code — the clone is deleted after every scan — and we never store the secrets ' +
  'themselves, only redacted findings (the rule that matched, the file, a masked preview, and the location). ' +
  'We request read-only access to the specific repos you choose, and you can revoke it any time from ' +
  'GitHub → Settings → Applications.'

export default function GitHubCard({
  installation,
  repos,
}: {
  installation: Installation | null
  repos: Repo[]
}) {
  const connected = installation?.status === 'active'
  return (
    <div className="int-card">
      <div className="int-head">
        <div className="int-mark gh">○</div>
        <div className="int-title-wrap">
          <div className="int-name">
            GitHub{' '}
            {connected
              ? <span className="chip ok"><span className="dot" /> Connected</span>
              : <span className="chip"><span className="dot" style={{ background: 'var(--ink-mute)' }} /> Not connected</span>}
          </div>
          <p className="int-desc">Scan your repositories&rsquo; git history for committed secrets (API keys, .env values, tokens).</p>
        </div>
      </div>

      {connected ? (
        <>
          <div className="int-body">
            <div className="int-detail">
              <div className="lbl">account</div>
              <div className="val"><code>github.com/{installation!.account_login}</code></div>
            </div>
            <div className="int-detail">
              <div className="lbl">repos</div>
              <div className="val">
                <div className="repo-list">
                  {repos.filter(r => r.status === 'active').map(r => <span key={r.id}>{r.full_name}</span>)}
                </div>
              </div>
            </div>
          </div>
          <div className="int-actions">
            <a className="btn btn-soft" href="/api/integrations/github/install" style={{ padding: '8px 12px', fontSize: 13 }}>Manage access</a>
            <form action="/api/integrations/github/disconnect" method="post">
              <input type="hidden" name="installation_id" value={installation!.installation_id} />
              <button className="btn btn-soft" style={{ padding: '8px 12px', fontSize: 13, color: 'var(--ink-soft)' }}>Disconnect</button>
            </form>
          </div>
        </>
      ) : (
        <div className="int-actions">
          <a className="btn btn-primary" href="/api/integrations/github/install" style={{ padding: '8px 12px', fontSize: 13 }}>Connect GitHub</a>
        </div>
      )}

      <div className="int-note">{DATA_HANDLING_COPY}</div>
    </div>
  )
}
