import AppShell from '@/components/shared/AppShell'
import GitHubCard from '@/components/integrations/GitHubCard'
import { createServerClient } from '@/lib/supabase/server'
import '../app.css'

export default async function IntegrationsPage() {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: installation } = user
    ? await supabase
        .from('github_installations')
        .select('installation_id, account_login, status')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .maybeSingle()
    : { data: null }

  const { data: repos } = installation
    ? await supabase
        .from('repos')
        .select('id, full_name, status')
        .eq('user_id', user!.id)
        .eq('status', 'active')
    : { data: [] }

  return (
    <AppShell activeNav="integrations">
      <main className="app-main">
        <div className="topline">
          <div>
            <h1 className="greeting">Integrations</h1>
            <div className="greeting-sub">connect your stack · deploy hooks · alert routing</div>
          </div>
        </div>

        <h2 className="section-label">Connected services</h2>
        <div className="int-grid">
          <GitHubCard installation={installation ?? null} repos={repos ?? []} />

          <div className="int-card disconnected">
            <div className="int-head">
              <div className="int-mark vercel">▲</div>
              <div className="int-title-wrap">
                <div className="int-name">Vercel <span className="chip"><span className="dot" style={{ background: 'var(--ink-mute)' }} /> Coming soon</span></div>
                <p className="int-desc">Deploy-triggered re-scans when you ship to production. Webhook-based — no account access.</p>
              </div>
            </div>
            <div className="int-note">Not available yet — this lands in an upcoming release.</div>
          </div>
        </div>
      </main>
    </AppShell>
  )
}
