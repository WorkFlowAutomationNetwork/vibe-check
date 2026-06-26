import { randomBytes, createHash } from 'crypto'

export function generateWebhookToken(): string {
  return randomBytes(32).toString('hex')
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}
