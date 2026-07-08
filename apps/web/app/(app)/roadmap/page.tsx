import AppShell from '@/components/shared/AppShell'
import { createServerClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import '../app.css'
import './roadmap.css'

export const metadata = { title: 'Roadmap — Vibe-Check' }

type Status = 'live' | 'next' | 'planned' | 'exploring'
type Category = 'Scanner' | 'AI' | 'Integrations' | 'Platform'

interface Item {
  title: string
  desc: string
  category: Category
}

const STATUS_GLYPH: Record<Status, string> = {
  live: '✓',
  next: '◗',
  planned: '◇',
  exploring: '✦',
}

const COLUMNS: { status: Status; label: string; blurb: string; items: Item[] }[] = [
  {
    status: 'live',
    label: 'Live now',
    blurb: 'Shipped and running in production today.',
    items: [
      { title: 'Live-app security scan', desc: 'Security headers, TLS/SSL, exposed Supabase tables & storage, secrets leaked in your JS bundle, and login rate-limiting.', category: 'Scanner' },
      { title: 'GitHub repo secret scanning', desc: 'Full git-history scan for API keys and credentials committed to your code, with provider-specific rotation steps.', category: 'Integrations' },
      { title: 'Graded reports + PDF', desc: 'An A–F grade and a plain-English report you can hand straight to your AI coding tool, downloadable as a PDF.', category: 'Platform' },
      { title: 'Embeddable trust badge', desc: 'Show visitors your app has been audited once it scans clean.', category: 'Platform' },
      { title: 'Continuous monitoring', desc: 'Re-scan on demand and keep your badge current on the Monitor plan.', category: 'Platform' },
      { title: 'Two-factor authentication', desc: 'Mandatory TOTP 2FA with backup codes protects your account and scan data.', category: 'Platform' },
    ],
  },
  {
    status: 'next',
    label: 'Building next',
    blurb: 'Designed and coming up soon.',
    items: [
      { title: 'Prompt-injection testing', desc: 'Opt-in probing of your app’s AI and LLM endpoints for jailbreak and prompt-injection weaknesses — built for AI-native apps.', category: 'AI' },
      { title: 'Auto re-scan on deploy', desc: 'Kick off a fresh scan automatically whenever you ship, via your CI or a deploy webhook.', category: 'Integrations' },
      { title: 'One-click GitHub sign-in', desc: 'Sign in with GitHub for faster onboarding, with repo scanning available in the same step.', category: 'Platform' },
    ],
  },
  {
    status: 'planned',
    label: 'Planned',
    blurb: 'On the near-term roadmap.',
    items: [
      { title: 'Deeper active testing', desc: 'SQL-injection and cross-site-scripting probing on eligible, owner-verified targets.', category: 'Scanner' },
      { title: 'Smarter remediation', desc: 'Provider-aware fix guidance for more key and service types, tuned to paste straight into your AI agent.', category: 'Scanner' },
      { title: 'Self-serve data controls', desc: 'Export your data and manage retention from Settings, without emailing us.', category: 'Platform' },
    ],
  },
  {
    status: 'exploring',
    label: 'Exploring',
    blurb: 'Ideas we’re weighing — tell us if you want them.',
    items: [
      { title: 'Catch secrets before they merge', desc: 'Scan the diff on every pull request and post a pass or fail check, so a leaked key never reaches main.', category: 'Integrations' },
      { title: 'Team workspaces', desc: 'Shared reports, roles, and multiple sites for teams.', category: 'Platform' },
      { title: 'Scheduled scans & digests', desc: 'Recurring scans on a schedule with an email summary of what changed.', category: 'Platform' },
    ],
  },
]

export default async function RoadmapPage() {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) notFound()

  return (
    <AppShell activeNav="roadmap">
      <main className="app-main">
        <header className="rm-hero">
          <div className="rm-eyebrow">Product roadmap</div>
          <h1 className="rm-title">Where Vibe-Check is headed</h1>
          <p className="rm-sub">
            What’s live today and what we’re building next. Shared with signed-in members —
            timelines are directional, not promises.
          </p>
          <div className="rm-legend">
            {COLUMNS.map(c => (
              <span key={c.status} className={`rm-chip rm-chip-${c.status}`}>
                <i className="rm-dot" /> {c.label}
              </span>
            ))}
          </div>
        </header>

        <div className="rm-board">
          {COLUMNS.map(col => (
            <section key={col.status} className={`rm-col rm-col-${col.status}`}>
              <div className="rm-col-head">
                <div className="rm-col-title">{col.label}</div>
                <span className="rm-count">{col.items.length}</span>
              </div>
              <p className="rm-col-blurb">{col.blurb}</p>
              <div className="rm-cards">
                {col.items.map(it => (
                  <article key={it.title} className="rm-card card-interactive">
                    <div className="rm-card-top">
                      <span className="rm-cat">{it.category}</span>
                      <span className="rm-status-glyph" aria-hidden="true">{STATUS_GLYPH[col.status]}</span>
                    </div>
                    <h3 className="rm-card-title">{it.title}</h3>
                    <p className="rm-card-desc">{it.desc}</p>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="rm-cta">
          <div>
            <h3 className="rm-cta-title">Missing something?</h3>
            <p className="rm-cta-desc">
              Tell us what would make Vibe-Check more useful for your stack — roadmap priorities
              are shaped by what members ask for.
            </p>
          </div>
          <a className="btn btn-primary" href="mailto:support@vibe-check-app.com?subject=Roadmap%20idea">
            Suggest a feature →
          </a>
        </div>
      </main>
    </AppShell>
  )
}
