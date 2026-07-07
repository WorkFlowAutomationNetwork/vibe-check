export function waitlistEmail(email: string): { subject: string; html: string } {
  return {
    subject: "You're on the list — Vibe-Check",
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@700&display=swap">
</head>
<body style="margin:0;padding:40px 20px;background:#FAFAF7;font-family:system-ui,-apple-system,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#FFFFFF;border:1px solid #E6E6DE;border-radius:4px;padding:40px;">
    <div style="margin-bottom:32px;display:flex;align-items:center;gap:10px;">
      <img src="https://vibe-check-app.com/android-chrome-512x512.png" alt="" width="32" height="32" style="display:block;border:0;">
      <span style="font-size:18px;font-weight:700;color:#0F0F0E;font-family:'Space Grotesk',system-ui,sans-serif;">Vibe-Check</span>
    </div>
    <h1 style="font-size:24px;font-weight:700;color:#0F0F0E;margin:0 0 16px;">You're on the list.</h1>
    <p style="font-size:15px;color:#54544F;line-height:1.6;margin:0 0 32px;">
      We'll email you at ${email} as soon as Vibe-Check opens. We're putting the finishing touches on the scanner — won't be long.
    </p>
    <hr style="border:none;border-top:1px solid #E6E6DE;margin:0 0 24px;">
    <p style="font-size:13px;color:#8A8A82;margin:0;">
      You signed up for early access at vibe-check-app.com. If this was a mistake, you can ignore this email.
    </p>
  </div>
</body>
</html>`,
  }
}
