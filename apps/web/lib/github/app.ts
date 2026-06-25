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

// The OAuth user-authorization URL. Unlike installations/new, this ALWAYS
// redirects back to our callback with `code` + `state`, whether or not the app
// is already installed — so it works for both new and returning users.
export function buildAuthorizeUrl(state: string): string {
  const clientId = process.env.GITHUB_APP_CLIENT_ID
  if (!clientId) throw new Error('GITHUB_APP_CLIENT_ID is not set')
  return `https://github.com/login/oauth/authorize?client_id=${clientId}&state=${state}`
}

// Exchanges the OAuth `code` for a user-to-server access token. The token is
// scoped to this app, so /user/installations returns only this app's
// installations the user can access.
export async function exchangeCodeForUserToken(code: string): Promise<string> {
  const clientId = process.env.GITHUB_APP_CLIENT_ID
  const clientSecret = process.env.GITHUB_APP_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw new Error('GITHUB_APP_CLIENT_ID / GITHUB_APP_CLIENT_SECRET not set')
  }
  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
  })
  const data = (await res.json()) as {
    access_token?: string
    error?: string
    error_description?: string
  }
  if (!data.access_token) {
    const detail = data.error_description ?? data.error ?? `http ${res.status}`
    throw new Error(`GitHub OAuth token exchange failed: ${detail}`)
  }
  return data.access_token
}

// Lists the installations of THIS app that the authorized user can access.
export async function listUserInstallations(
  userToken: string,
): Promise<Array<{ installation_id: number; account_login: string; account_type: string }>> {
  const out: Array<{ installation_id: number; account_login: string; account_type: string }> = []
  let page = 1
  for (;;) {
    const res = await request('GET /user/installations', {
      headers: { authorization: `token ${userToken}` },
      per_page: 100,
      page,
    })
    for (const inst of res.data.installations) {
      out.push({
        installation_id: inst.id,
        account_login: inst.account && 'login' in inst.account ? inst.account.login : 'unknown',
        account_type:
          inst.account && 'type' in inst.account && inst.account.type === 'Organization'
            ? 'org'
            : 'user',
      })
    }
    if (res.data.installations.length < 100) break
    page += 1
  }
  return out
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

function appAuth() {
  const appId = process.env.GITHUB_APP_ID
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY
  if (!appId || !privateKey) throw new Error('GITHUB_APP_ID / GITHUB_APP_PRIVATE_KEY not set')
  return createAppAuth({ appId, privateKey: privateKey.replace(/\\n/g, '\n') })
}

async function installationToken(installationId: number): Promise<string> {
  const { token } = await appAuth()({ type: 'installation', installationId })
  return token
}

// Uninstalls the GitHub App from the account, fully revoking its access.
// Authenticated with the app JWT (authority over all of this app's
// installations), so callers MUST verify the installation belongs to the
// requesting user before invoking this.
export async function deleteInstallation(installationId: number): Promise<void> {
  const { token } = await appAuth()({ type: 'app' })
  await request('DELETE /app/installations/{installation_id}', {
    installation_id: installationId,
    headers: { authorization: `Bearer ${token}` },
  })
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
