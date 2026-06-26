const GRADE_COLOUR: Record<string, string> = {
  A: '#16a34a',
  B: '#65a30d',
  C: '#d97706',
  D: '#ea580c',
  F: '#E25C3A',
}

export function scanCompleteEmail(params: {
  url: string
  grade: string
  scanId: string
  hasCritical: boolean
}): { subject: string; html: string } {
  const { url, grade, scanId, hasCritical } = params
  const gradeColour = GRADE_COLOUR[grade] ?? '#54544F'
  const reportUrl = `https://www.vibe-check-app.com/report/${scanId}`
  const subject = hasCritical
    ? `⚠️ Critical issues found — ${url}`
    : `Your scan is ready — Grade ${grade}`

  const criticalBanner = hasCritical
    ? `<div style="background:#FEE2E2;border-left:4px solid #E25C3A;padding:16px;border-radius:0 4px 4px 0;margin-bottom:24px;">
        <strong style="color:#E25C3A;">Critical issues found</strong>
        <p style="margin:4px 0 0;font-size:14px;color:#54544F;">
          Your scan detected critical security issues that need immediate attention. View the full report for details and remediation steps.
        </p>
      </div>`
    : ''

  return {
    subject,
    html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:40px 20px;background:#FAFAF7;font-family:system-ui,-apple-system,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#FFFFFF;border:1px solid #E6E6DE;border-radius:4px;padding:40px;">
    <div style="margin-bottom:32px;">
      <img src="https://www.vibe-check-app.com/android-chrome-512x512.png" alt="Vibe-Check" width="40" height="40" style="display:block;border:0;">
    </div>
    ${criticalBanner}
    <h1 style="font-size:24px;font-weight:700;color:#0F0F0E;margin:0 0 8px;">Scan complete</h1>
    <p style="font-size:14px;color:#54544F;margin:0 0 24px;">${url}</p>
    <div style="display:inline-block;background:#F2F2EC;border-radius:4px;padding:16px 24px;margin-bottom:32px;">
      <span style="font-size:13px;color:#54544F;display:block;margin-bottom:4px;">Security grade</span>
      <span style="font-size:48px;font-weight:700;color:${gradeColour};line-height:1;">${grade}</span>
    </div>
    <br>
    <a href="${reportUrl}"
       style="display:inline-block;background:#7C3AED;color:#FFFFFF;text-decoration:none;padding:12px 24px;border-radius:4px;font-weight:600;font-size:15px;">
      View full report →
    </a>
    <hr style="border:none;border-top:1px solid #E6E6DE;margin:40px 0 24px;">
    <p style="font-size:13px;color:#8A8A82;margin:0;">
      You're receiving this because you have scan notifications enabled on vibe-check-app.com.
    </p>
  </div>
</body>
</html>`,
  }
}
