import { createHmac, timingSafeEqual } from 'crypto'
import { createAppAuth } from '@octokit/auth-app'
import { request } from '@octokit/request'
import { verify as verifyWebhookSig } from '@octokit/webhooks-methods'

const STATE_TTL_MS = 10 * 60 * 1000 // 10 minutes

// GitHub only returns `installation_id` on the post-install Setup URL redirect —
// it does NOT echo back the `state` query param. So we round-trip the signed
// state ourselves via an httpOnly cookie set at install time and read at callback
// time. This preserves CSRF protection without depending on GitHub's redirect.
export const STATE_COOKIE_NAME = 'vibe_gh_state'
export const STATE_COOKIE_MAX_AGE = 600 // seconds; matches STATE_TTL_MS

function stateSecret(): string {
  const s = process.env.GITHUB_APP_CLIENT_SECRET
  if (!s) throw new Error('GITHUB_APP_CLIENT_SECRET is not set')
  return s
}

function b64url(input: string): string {
  return Buffer.from(input).toString('base64url')
}

export function signState(payload: { userId: string }): string {
  const body = b64url(JSON.stringify(payload))
  const expiry = String(Date.now() + STATE_TTL_MS)
  const mac = createHmac('sha256', stateSecret()).update(`${body}.${expiry}`).digest('base64url')
  return `${body}.${expiry}.${mac}`
}

export function verifyState(state: string): { userId: string } | null {
  const parts = state.split('.')
  if (parts.length !== 3) return null
  const [body, expiry, mac] = parts
  const expected = createHmac('sha256', stateSecret()).update(`${body}.${expiry}`).digest('base64url')
  const macBuf = Buffer.from(mac)
  const expBuf = Buffer.from(expected)
  if (macBuf.length !== expBuf.length || !timingSafeEqual(macBuf, expBuf)) return null
  if (Number(expiry) < Date.now()) return null
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString())
  } catch {
    return null
  }
}

export function buildInstallUrl(state: string): string {
  const slug = process.env.GITHUB_APP_SLUG
  if (!slug) throw new Error('GITHUB_APP_SLUG is not set')
  return `https://github.com/apps/${slug}/installations/new?state=${state}`
}

export async function verifyWebhook(rawBody: string, signature: string | null): Promise<boolean> {
  if (!signature) return false
  const secret = process.env.GITHUB_WEBHOOK_SECRET
  if (!secret) throw new Error('GITHUB_WEBHOOK_SECRET is not set')
  try {
    return await verifyWebhookSig(secret, rawBody, signature)
  } catch {
    return false
  }
}

async function installationToken(installationId: number): Promise<string> {
  const appId = process.env.GITHUB_APP_ID
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY
  if (!appId || !privateKey) throw new Error('GITHUB_APP_ID / GITHUB_APP_PRIVATE_KEY not set')
  const auth = createAppAuth({ appId, privateKey: privateKey.replace(/\\n/g, '\n') })
  const { token } = await auth({ type: 'installation', installationId })
  return token
}

export async function listInstallationRepos(
  installationId: number,
): Promise<Array<{ github_repo_id: number; full_name: string; default_branch: string }>> {
  const token = await installationToken(installationId)
  const repos: Array<{ github_repo_id: number; full_name: string; default_branch: string }> = []
  let page = 1
  for (;;) {
    const res = await request('GET /installation/repositories', {
      headers: { authorization: `token ${token}` },
      per_page: 100,
      page,
    })
    for (const r of res.data.repositories) {
      repos.push({ github_repo_id: r.id, full_name: r.full_name, default_branch: r.default_branch })
    }
    if (res.data.repositories.length < 100) break
    page += 1
  }
  return repos
}
