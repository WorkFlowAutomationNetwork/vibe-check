import { NextResponse } from 'next/server'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'

const FLY_APPS = ['vibe-check-scanner']
const SECONDS_PER_MONTH = 30 * 24 * 3600

const CPU_RATE: Record<string, number> = {
  shared: 0.0000016,
  performance: 0.000008,
}
const RAM_RATE_PER_GB = 0.0000025

interface FlyMachine {
  id: string
  state: string
  config?: {
    guest?: {
      cpu_kind?: string
      cpus?: number
      memory_mb?: number
    }
  }
}

function machineMonthlyEstimate(m: FlyMachine): number {
  if (m.state !== 'started') return 0
  const cpuKind = m.config?.guest?.cpu_kind ?? 'shared'
  const cpus = m.config?.guest?.cpus ?? 1
  const memGb = (m.config?.guest?.memory_mb ?? 256) / 1024
  const cpuCost = cpus * (CPU_RATE[cpuKind] ?? CPU_RATE.shared) * SECONDS_PER_MONTH
  const ramCost = memGb * RAM_RATE_PER_GB * SECONDS_PER_MONTH
  return Math.round((cpuCost + ramCost) * 100) / 100
}

interface FlyBilling {
  orgName: string
  orgSlug: string
  currentPeriodAmountCents: number | null
  creditBalanceCents: number | null
  billingStatus: string | null
}

async function fetchFlyBilling(token: string): Promise<FlyBilling | null> {
  const query = `{
    viewer {
      organizations {
        nodes {
          id
          name
          slug
          creditBalance
          billingStatus
          billable
        }
      }
    }
  }`
  try {
    const res = await fetch('https://api.fly.io/graphql', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
      cache: 'no-store',
    })
    if (!res.ok) return null
    const json = await res.json()
    const orgs: Array<{
      name: string
      slug: string
      creditBalance: number | null
      billingStatus: string | null
      billable: boolean | null
    }> = json.data?.viewer?.organizations?.nodes ?? []
    const org = orgs[0]
    if (!org) return null
    return {
      orgName: org.name,
      orgSlug: org.slug,
      currentPeriodAmountCents: null,
      creditBalanceCents: org.creditBalance ?? null,
      billingStatus: org.billingStatus ?? null,
    }
  } catch {
    return null
  }
}

async function fetchFlyApp(appName: string, token: string) {
  try {
    const res = await fetch(`https://api.machines.dev/v1/apps/${appName}/machines`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
    if (!res.ok) return { name: appName, machines: [], estMonthly: 0, error: `HTTP ${res.status}` }
    const machines: FlyMachine[] = await res.json()
    const machineData = machines.map(m => ({
      id: m.id,
      state: m.state,
      cpuKind: m.config?.guest?.cpu_kind ?? 'shared',
      cpus: m.config?.guest?.cpus ?? 1,
      memoryMb: m.config?.guest?.memory_mb ?? 256,
      estMonthly: machineMonthlyEstimate(m),
    }))
    const estMonthly = Math.round(machineData.reduce((s, m) => s + m.estMonthly, 0) * 100) / 100
    return { name: appName, machines: machineData, estMonthly }
  } catch {
    return { name: appName, machines: [], estMonthly: 0, error: 'Fetch failed' }
  }
}

async function assertAdmin() {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const service = createServiceClient()
  const { data: profile } = await service
    .from('profiles')
    .select('is_admin')
    .eq('id', user.id)
    .single()
  return profile?.is_admin ? user.id : null
}

export async function GET() {
  const adminId = await assertAdmin()
  if (!adminId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const token = process.env.FLY_API_TOKEN

  if (!token) {
    return NextResponse.json({
      live: false,
      reason: 'FLY_API_TOKEN not set — add it to Vercel env vars',
      flyApps: [],
      flyTotal: 0,
      staticServices: buildStaticServices(),
      total: 0,
      scaleTotal: buildStaticServices().reduce((s, x) => s + x.scaleMonthly, 0),
      fetchedAt: new Date().toISOString(),
    })
  }

  const [flyApps, billing] = await Promise.all([
    Promise.all(FLY_APPS.map(name => fetchFlyApp(name, token))),
    fetchFlyBilling(token),
  ])
  const flyTotal = Math.round(flyApps.reduce((s, a) => s + a.estMonthly, 0) * 100) / 100

  const staticServices = buildStaticServices()
  const staticCurrent = staticServices.reduce((s, x) => s + x.currentMonthly, 0)
  const staticScale = staticServices.reduce((s, x) => s + x.scaleMonthly, 0)

  return NextResponse.json({
    live: true,
    flyApps,
    flyTotal,
    billing,
    staticServices,
    total: Math.round((flyTotal + staticCurrent) * 100) / 100,
    scaleTotal: Math.round((flyTotal + staticScale) * 100) / 100,
    fetchedAt: new Date().toISOString(),
  })
}

function buildStaticServices() {
  return [
    {
      label: 'Fly.io Redis (Upstash)',
      currentMonthly: 0,
      scaleMonthly: 5,
      currentNote: 'Managed Upstash — free at low command volume',
      scaleNote: '$0.2/100k commands + storage; ~$5/mo at moderate load',
      scaleThreshold: '>10k commands/day or >256MB data',
    },
    {
      label: 'Supabase',
      currentMonthly: 0,
      scaleMonthly: 25,
      currentNote: 'Free tier (500MB DB, 1GB storage)',
      scaleNote: 'Pro $25/mo — 8GB DB, 100GB storage, 50k MAU',
      scaleThreshold: '~500 MAU or >500MB DB',
    },
    {
      label: 'Vercel',
      currentMonthly: 0,
      scaleMonthly: 20,
      currentNote: 'Hobby (free)',
      scaleNote: 'Pro $20/mo — team features, higher limits, Vercel webhook support',
      scaleThreshold: 'When team features or Vercel deploy webhooks needed',
    },
    {
      label: 'Resend',
      currentMonthly: 0,
      scaleMonthly: 20,
      currentNote: 'Free tier (3k emails/mo)',
      scaleNote: 'Starter $20/mo — 50k emails/mo',
      scaleThreshold: '>3,000 emails/month',
    },
  ]
}
