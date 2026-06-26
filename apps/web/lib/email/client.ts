import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function sendEmail(params: {
  to: string
  subject: string
  html: string
}): Promise<void> {
  try {
    await resend.emails.send({
      from: process.env.EMAIL_FROM ?? 'noreply@vibe-check-app.com',
      ...params,
    })
  } catch (err) {
    console.error('[email]', err)
  }
}
