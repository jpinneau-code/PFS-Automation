import nodemailer from 'nodemailer'
import type { Transporter } from 'nodemailer'

// Email service configuration
const EMAIL_HOST = process.env.SMTP_HOST || 'localhost'
const EMAIL_PORT = parseInt(process.env.SMTP_PORT || '1025')
const EMAIL_USER = process.env.SMTP_USER || ''
const EMAIL_PASSWORD = process.env.SMTP_PASSWORD || ''
const EMAIL_FROM = process.env.EMAIL_FROM || 'noreply@pfs-automation.local'
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000'

// Create transporter
let transporter: Transporter | null = null

function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: EMAIL_HOST,
      port: EMAIL_PORT,
      secure: false, // true for 465, false for other ports
      auth: EMAIL_USER && EMAIL_PASSWORD ? {
        user: EMAIL_USER,
        pass: EMAIL_PASSWORD,
      } : undefined,
      // For Mailhog, we don't need authentication
      ignoreTLS: EMAIL_HOST === 'localhost',
    })
  }
  return transporter
}

// Email templates
function getPasswordResetEmailHTML(username: string, resetUrl: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {
          font-family: Arial, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
        }
        .header {
          background-color: #4F46E5;
          color: white;
          padding: 20px;
          text-align: center;
          border-radius: 5px 5px 0 0;
        }
        .content {
          background-color: #f9fafb;
          padding: 30px;
          border: 1px solid #e5e7eb;
          border-top: none;
        }
        .button {
          display: inline-block;
          padding: 12px 24px;
          background-color: #4F46E5;
          color: white;
          text-decoration: none;
          border-radius: 5px;
          margin: 20px 0;
        }
        .footer {
          margin-top: 30px;
          padding-top: 20px;
          border-top: 1px solid #e5e7eb;
          font-size: 12px;
          color: #6b7280;
        }
        .warning {
          background-color: #fef3c7;
          border-left: 4px solid #f59e0b;
          padding: 15px;
          margin: 20px 0;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Password Reset Request</h1>
      </div>
      <div class="content">
        <p>Hello <strong>${username}</strong>,</p>

        <p>We received a request to reset your password for your PFS Automation account.</p>

        <p>Click the button below to reset your password:</p>

        <a href="${resetUrl}" class="button">Reset Password</a>

        <p>Or copy and paste this link into your browser:</p>
        <p style="word-break: break-all; color: #4F46E5;">${resetUrl}</p>

        <div class="warning">
          <strong>⚠️ Security Notice:</strong>
          <ul style="margin: 10px 0;">
            <li>This link will expire in <strong>1 hour</strong></li>
            <li>The link can only be used once</li>
            <li>If you didn't request this reset, you can safely ignore this email</li>
          </ul>
        </div>

        <div class="footer">
          <p>This is an automated email from PFS Automation. Please do not reply to this email.</p>
          <p>If you have any questions, please contact your system administrator.</p>
        </div>
      </div>
    </body>
    </html>
  `
}

function getPasswordResetEmailText(username: string, resetUrl: string): string {
  return `
Hello ${username},

We received a request to reset your password for your PFS Automation account.

Click the link below to reset your password:
${resetUrl}

⚠️ Security Notice:
- This link will expire in 1 hour
- The link can only be used once
- If you didn't request this reset, you can safely ignore this email

---
This is an automated email from PFS Automation.
If you have any questions, please contact your system administrator.
  `.trim()
}

// Email service functions
export const emailService = {
  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(
    email: string,
    username: string,
    token: string
  ): Promise<void> {
    const resetUrl = `${FRONTEND_URL}/reset-password?token=${token}`

    const mailOptions = {
      from: EMAIL_FROM,
      to: email,
      subject: 'Password Reset Request - PFS Automation',
      text: getPasswordResetEmailText(username, resetUrl),
      html: getPasswordResetEmailHTML(username, resetUrl),
    }

    try {
      const transport = getTransporter()
      const info = await transport.sendMail(mailOptions)
      console.log('✉️  Password reset email sent:', {
        to: email,
        messageId: info.messageId,
      })
    } catch (error) {
      console.error('Failed to send password reset email:', error)
      throw new Error('Failed to send password reset email')
    }
  },

  /**
   * Test email configuration
   */
  async testConnection(): Promise<boolean> {
    try {
      const transport = getTransporter()
      await transport.verify()
      console.log('✅ Email service is ready')
      return true
    } catch (error) {
      console.error('❌ Email service connection failed:', error)
      return false
    }
  },
}
