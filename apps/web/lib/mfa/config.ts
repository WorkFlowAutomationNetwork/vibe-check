/**
 * Whether mandatory TOTP MFA is enforced. When false the entire MFA feature is
 * inert: the middleware gates don't fire and existing sign-in behaviour is
 * unchanged. Flip to true (env `MFA_REQUIRED=true`) only after the enroll /
 * challenge / recover flows are verified on a preview deploy — enabling it
 * force-enrolls every existing account on next sign-in.
 */
export const mfaRequired = process.env.MFA_REQUIRED === 'true'
