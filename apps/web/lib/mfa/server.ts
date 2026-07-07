import 'server-only'
import { createServiceClient } from '@/lib/supabase/server'
import {
  generateRecoveryCodes,
  hashRecoveryCode,
  verifyRecoveryCode,
} from './recovery-codes'

/**
 * Server-side MFA helpers. All use the service-role client because
 * `mfa_recovery_codes` is service-role-only (RLS on, no policy) and factor
 * deletion / the `mfa_enrolled_at` write require privileged access.
 */

/**
 * Issue a fresh batch of backup codes: invalidate the user's existing codes,
 * store the new hashes, and return the plaintext codes to show once. Used by
 * both enrollment completion and explicit regeneration.
 */
export async function issueRecoveryCodes(userId: string): Promise<string[]> {
  const svc = createServiceClient()
  await svc.from('mfa_recovery_codes').delete().eq('user_id', userId)

  const codes = generateRecoveryCodes()
  const rows = codes.map(code => ({ user_id: userId, code_hash: hashRecoveryCode(code) }))
  const { error } = await svc.from('mfa_recovery_codes').insert(rows)
  if (error) throw new Error(`failed to store recovery codes: ${error.message}`)

  return codes
}

/**
 * Verify a backup code against the user's unused codes. On a match, mark that
 * code used and return true. Iterates all unused codes (constant work w.r.t.
 * which code matched) and never reveals how many exist.
 */
export async function consumeRecoveryCode(userId: string, candidate: string): Promise<boolean> {
  const svc = createServiceClient()
  const { data: rows } = await svc
    .from('mfa_recovery_codes')
    .select('id, code_hash')
    .eq('user_id', userId)
    .is('used_at', null)

  let matchedId: string | null = null
  for (const row of rows ?? []) {
    if (verifyRecoveryCode(candidate, row.code_hash)) matchedId = row.id
  }
  if (!matchedId) return false

  await svc
    .from('mfa_recovery_codes')
    .update({ used_at: new Date().toISOString() })
    .eq('id', matchedId)
  return true
}

/**
 * Reset a user's MFA: delete all their TOTP factors (admin API) and clear the
 * enrollment marker so the middleware enroll gate forces re-enrollment. Used by
 * recovery and by admin break-glass.
 */
export async function resetUserMfa(userId: string): Promise<void> {
  const svc = createServiceClient()
  const { data } = await svc.auth.admin.mfa.listFactors({ userId })
  for (const factor of data?.factors ?? []) {
    if (factor.factor_type === 'totp') {
      await svc.auth.admin.mfa.deleteFactor({ id: factor.id, userId })
    }
  }
  await svc.from('profiles').update({ mfa_enrolled_at: null }).eq('id', userId)
}

/** Mark enrollment complete (queryable by the middleware enroll gate). */
export async function markEnrolled(userId: string): Promise<void> {
  const svc = createServiceClient()
  const { error } = await svc
    .from('profiles')
    .update({ mfa_enrolled_at: new Date().toISOString() })
    .eq('id', userId)
  if (error) throw new Error(`failed to mark enrolled: ${error.message}`)
}
