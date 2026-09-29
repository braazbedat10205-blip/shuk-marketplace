import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { Transporter } from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter?: Transporter;
  constructor() {
    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD } = process.env;
    if (SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASSWORD) this.transporter = nodemailer.createTransport({ host: SMTP_HOST, port: Number(SMTP_PORT), secure: Number(SMTP_PORT) === 465, auth: { user: SMTP_USER, pass: SMTP_PASSWORD } });
  }
  async sendPasswordReset(email: string, resetUrl: string) {
    if (!this.transporter || !process.env.MAIL_FROM) { this.logger.error('Password reset email was not sent: SMTP settings or MAIL_FROM are missing.'); return false; }
    try {
      await this.transporter.sendMail({ from: process.env.MAIL_FROM, to: email, subject: 'איפוס סיסמה ב-Shuk', text: `קיבלנו בקשה לאיפוס הסיסמה שלך. הקישור תקף ל-45 דקות: ${resetUrl}`, html: `<div dir="rtl"><h2>איפוס סיסמה</h2><p>קיבלנו בקשה לאיפוס הסיסמה שלך.</p><p><a href="${resetUrl}">לחצו כאן לבחירת סיסמה חדשה</a></p><p>הקישור תקף ל-45 דקות וניתן לשימוש פעם אחת בלבד.</p></div>` });
      return true;
    } catch (error) { this.logger.error('Password reset email could not be sent.', error instanceof Error ? error.stack : undefined); return false; }
  }
}
