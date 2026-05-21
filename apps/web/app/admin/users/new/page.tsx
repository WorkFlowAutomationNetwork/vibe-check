import AdminShell from '@/components/admin/AdminShell'

export default function AdminNewUserPage() {
  return (
    <AdminShell activeNav="users">
      <main className="admin-main">
        <div className="admin-topline">
          <div>
            <div style={{ fontSize: 13, color: 'var(--ink-mute)', marginBottom: 4 }}>
              <a href="/admin/users" style={{ color: 'var(--violet)' }}>Users</a> / New
            </div>
            <h1 className="admin-title">Create Account</h1>
            <div className="admin-subtitle">
              Manually create a user account and set their plan
            </div>
          </div>
        </div>

        <div style={{ maxWidth: 520 }}>
          <div className="admin-panel">
            <div className="admin-panel-title">Account Details</div>
            <form
              method="POST"
              action="/api/admin/users"
              style={{ display: 'grid', gap: 14 }}
            >
              <div className="admin-grid-2">
                <div className="admin-field">
                  <label>Email address *</label>
                  <input
                    name="email"
                    type="email"
                    required
                    placeholder="user@example.com"
                    autoComplete="off"
                  />
                </div>
                <div className="admin-field">
                  <label>Display name</label>
                  <input
                    name="name"
                    type="text"
                    placeholder="Full name"
                    autoComplete="off"
                  />
                </div>
              </div>

              <div className="admin-field">
                <label>Password *</label>
                <input
                  name="password"
                  type="password"
                  required
                  minLength={12}
                  placeholder="At least 12 characters"
                  autoComplete="new-password"
                />
              </div>

              <div className="admin-grid-2">
                <div className="admin-field">
                  <label>Plan</label>
                  <select name="plan" defaultValue="free">
                    <option value="free">Free</option>
                    <option value="starter">Starter ($9 one-off)</option>
                    <option value="monitor">Monitor ($19/mo)</option>
                  </select>
                </div>
                <div className="admin-field">
                  <label>Admin access</label>
                  <select name="is_admin" defaultValue="false">
                    <option value="false">No</option>
                    <option value="true">Yes — grant admin</option>
                  </select>
                </div>
              </div>

              <div
                style={{
                  padding: '10px 14px',
                  background: 'var(--warn-soft)',
                  border: '1px solid var(--warn)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 12,
                  color: 'var(--ink-soft)',
                  lineHeight: 1.6,
                }}
              >
                The user&apos;s email will be automatically confirmed. They can reset their password via
                the login page. No welcome email is sent automatically.
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <a href="/admin/users" className="btn-admin">Cancel</a>
                <button type="submit" className="btn-admin primary">Create account</button>
              </div>
            </form>
          </div>
        </div>
      </main>
    </AdminShell>
  )
}
