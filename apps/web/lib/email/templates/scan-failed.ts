export function scanFailedEmail(url: string): { subject: string; html: string } {
  return {
    subject: `Scan failed — ${url}`,
    html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:40px 20px;background:#FAFAF7;font-family:system-ui,-apple-system,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#FFFFFF;border:1px solid #E6E6DE;border-radius:4px;padding:40px;">
    <div style="margin-bottom:32px;">
      <img src="https://www.vibe-check-app.com/android-chrome-512x512.png" alt="Vibe-Check" width="40" height="40" style="display:block;border:0;">
    </div>
    <h1 style="font-size:24px;font-weight:700;color:#0F0F0E;margin:0 0 8px;">Scan failed</h1>
    <p style="font-size:14px;color:#54544F;margin:0 0 24px;">${url}</p>
    <p style="font-size:15px;color:#54544F;line-height:1.6;margin:0 0 32px;">
      We weren't able to complete your security scan. This is usually a temporary issue — head to your dashboard to run it again.
    </p>
    <a href="https://www.vibe-check-app.com/dashboard"
       style="display:inline-block;background:#7C3AED;color:#FFFFFF;text-decoration:none;padding:12px 24px;border-radius:4px;font-weight:600;font-size:15px;">
      Go to dashboard →
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
