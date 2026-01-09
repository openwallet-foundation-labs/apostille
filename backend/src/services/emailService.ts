import Mailgun from 'mailgun.js'
import formData from 'form-data'

const mailgun = new Mailgun(formData)

function getMailgunClient() {
  const apiKey = process.env.MAILGUN_API_KEY
  if (!apiKey) {
    throw new Error('MAILGUN_API_KEY environment variable is required')
  }
  return mailgun.client({
    username: 'api',
    key: apiKey,
  })
}

export interface BadgeNotificationOptions {
  to: string
  recipientName: string
  achievementName: string
  issuerName: string
  credentialId: string
  verifyUrl?: string
  imageUrl?: string
}

export async function sendBadgeNotification(options: BadgeNotificationOptions): Promise<void> {
  const mg = getMailgunClient()
  const domain = process.env.MAILGUN_DOMAIN
  if (!domain) {
    throw new Error('MAILGUN_DOMAIN environment variable is required')
  }
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000'
  const verifyUrl = options.verifyUrl || `${frontendUrl}/badges?verify=${encodeURIComponent(options.credentialId)}`

  await mg.messages.create(domain, {
    from: `${options.issuerName} <noreply@${domain}>`,
    to: options.to,
    subject: `You've earned: ${options.achievementName}`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Badge Awarded</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
    <tr>
      <td style="padding: 40px 30px; text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);">
        <h1 style="color: #ffffff; margin: 0; font-size: 28px;">Congratulations!</h1>
      </td>
    </tr>
    <tr>
      <td style="padding: 40px 30px;">
        <p style="font-size: 18px; color: #333; margin: 0 0 20px;">
          Hi <strong>${options.recipientName}</strong>,
        </p>
        <p style="font-size: 16px; color: #555; margin: 0 0 30px; line-height: 1.6;">
          You have been awarded the <strong>${options.achievementName}</strong> badge.
        </p>
        ${options.imageUrl ? `
        <div style="text-align: center; margin: 20px 0;">
          <img src="${options.imageUrl}" alt="${options.achievementName}" style="max-width: 200px; border-radius: 8px;">
        </div>
        ` : ''}
        <p style="font-size: 14px; color: #777; margin: 0 0 30px;">
          Issued by: <strong>${options.issuerName}</strong>
        </p>
        <div style="text-align: center;">
          <a href="${verifyUrl}" style="display: inline-block; padding: 14px 28px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600;">
            View Your Badge
          </a>
        </div>
      </td>
    </tr>
    <tr>
      <td style="padding: 20px 30px; text-align: center; background-color: #f9f9f9; border-top: 1px solid #eee;">
        <p style="font-size: 12px; color: #999; margin: 0;">
          This credential is verifiable and complies with the Open Badges 3.0 standard.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim(),
    text: `Congratulations, ${options.recipientName}!\n\nYou have been awarded the "${options.achievementName}" badge.\n\nIssued by: ${options.issuerName}\n\nView and verify your badge: ${verifyUrl}`,
  })
}
