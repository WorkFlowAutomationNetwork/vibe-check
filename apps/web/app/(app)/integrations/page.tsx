import AppShell from '@/components/shared/AppShell'
import GitHubCard from '@/components/integrations/GitHubCard'
import VercelCard from '@/components/integrations/VercelCard'
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
          <VercelCard />
        </div>
      </main>
    </AppShell>
  )
}
