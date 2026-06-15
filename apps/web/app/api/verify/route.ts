import { NextResponse } from 'next/server'
import { z } from 'zod'
import { promises as dns } from 'dns'
import { createServerClient, createServiceClient } from '@/lib/supabase/server'

const VerifySchema = z.object({
  url_id: z.string().uuid(),
  method: z.enum(['dns', 'file', 'meta']),
})

async function checkDns(domain: string, token: string): Promise<boolean> {
  try {
    const records = await dns.resolveTxt(`_vibecheck.${domain}`)
    return records.flat().some(r => r === token)
  } catch {
    return false
  }
}

async function checkFile(domain: string, token: string): Promise<boolean> {
  try {
    const res = await fetch(
      `https://${domain}/.well-known/vibe-check-verify.txt`,
      { signal: AbortSignal.timeout(5000) },
    )
    if (!res.ok) return false
    const body = (await res.text()).trim()
    return body === token
  } catch {
    return false
  }
}

async function checkMeta(domain: string, token: string): Promise<boolean> {
  try {
    const res = await fetch(`https://${domain}/`, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return false
    const html = await res.text()
    const match = html.match(/<meta\s+name=["']vibe-check["']\s+content=["']([^"']+)["']/i)
    return match?.[1] === token
  } catch {
    return false
  }
}

export async function POST(request: Request) {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const parsed = VerifySchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }

  const { url_id, method } = parsed.data

  const { data: urlRow } = await supabase
    .from('urls')
    .select('id, url, verification_token, verified')
    .eq('id', url_id)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .single()

  if (!urlRow) {
    return NextResponse.json({ error: 'URL not found' }, { status: 404 })
  }

  if (urlRow.verified) {
    return NextResponse.json({ verified: true })
  }

  const domain = new URL(urlRow.url).hostname
  const token: string = urlRow.verification_token

  let verified = false
  if (method === 'dns') verified = await checkDns(domain, token)
  else if (method === 'file') verified = await checkFile(domain, token)
  else if (method === 'meta') verified = await checkMeta(domain, token)

  if (verified) {
    const serviceClient = createServiceClient()
    await serviceClient
      .from('urls')
      .update({
        verified: true,
        verification_method: method,
        verified_at: new Date().toISOString(),
      })
      .eq('id', urlRow.id)
  }

  return NextResponse.json({ verified })
}
