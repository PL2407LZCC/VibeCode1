import nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { env } from '../lib/env';

let transporter: nodemailer.Transporter<SMTPTransport.SentMessageInfo> | null = null;

const isEmailConfigured = () => Boolean(env.SMTP_HOST && env.SMTP_PORT && env.SMTP_USER && env.SMTP_PASS && env.SMTP_FROM);

function getOrCreateTransporter() {
  if (!isEmailConfigured()) {
    return null;
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS
      }
    });
  }

  return transporter;
}

const buildResetLink = (token: string) => {
  try {
    const url = new URL(env.ADMIN_RESET_URL);
    url.searchParams.set('token', token);
    return url.toString();
  } catch {
    const separator = env.ADMIN_RESET_URL.includes('?') ? '&' : '?';
    return `${env.ADMIN_RESET_URL}${separator}token=${encodeURIComponent(token)}`;
  }
};

export type PasswordResetEmailPayload = {
  email: string;
  username: string;
  token: string;
  expiresAt: Date;
};

export async function sendPasswordResetEmail(payload: PasswordResetEmailPayload): Promise<boolean> {
  const mailer = getOrCreateTransporter();
  if (!mailer) {
    console.warn('SMTP settings missing; password reset email not sent.');
    return false;
  }

  const resetLink = buildResetLink(payload.token);
  const minutes = Math.round(env.PASSWORD_RESET_TOKEN_TTL_MS / (60 * 1000));

  const textBody = `Hello ${payload.username},\n\nA password reset was requested for your admin account. Use the link below to set a new password.\n\n${resetLink}\n\nThis link will expire in ${minutes} minute${minutes === 1 ? '' : 's'}. If you did not request this, you can ignore this email.\n`;

  const htmlBody = `<!doctype html>
<html>
  <body style="font-family: Arial, Helvetica, sans-serif; line-height: 1.4; color: #111;">
    <p>Hello ${payload.username},</p>
    <p>A password reset was requested for your admin account. Use the link below to set a new password:</p>
    <p><a href="${resetLink}" style="color: #2563eb;">Reset your password</a></p>
    <p>This link will expire in ${minutes} minute${minutes === 1 ? '' : 's'}. If you did not request this change, you can safely ignore this message.</p>
    <p>— VibeCode1 Admin</p>
  </body>
</html>`;

  try {
    await mailer.sendMail({
      to: payload.email,
      from: env.SMTP_FROM,
      subject: 'VibeCode1 Admin password reset',
      text: textBody,
      html: htmlBody
    });
    return true;
  } catch (error) {
    console.error('Failed to send password reset email', error);
    return false;
  }
}
