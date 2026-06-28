const { Resend } = require('resend');
const logger = require('../utils/logger');

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = `${process.env.EMAIL_FROM_NAME || 'Identity Platform'} <${process.env.EMAIL_FROM || 'noreply@example.com'}>`;

/**
 * Send OTP email.
 * @param {string} to    - recipient email
 * @param {string} name  - recipient name
 * @param {string} otp   - 6-digit OTP
 */
async function sendOtpEmail(to, name, otp) {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
      <h2 style="color: #1F4E79; margin-bottom: 8px;">Your login code</h2>
      <p style="color: #404040; font-size: 16px;">Hi ${name || 'there'},</p>
      <p style="color: #404040; font-size: 16px;">Use the code below to sign in. It expires in <strong>10 minutes</strong>.</p>
      <div style="background: #F5F5F5; border-radius: 8px; padding: 24px; text-align: center; margin: 24px 0;">
        <span style="font-size: 40px; font-weight: bold; letter-spacing: 12px; color: #1F4E79;">${otp}</span>
      </div>
      <p style="color: #888; font-size: 13px;">If you didn't request this, you can safely ignore this email.</p>
    </div>
  `;

  try {
    await resend.emails.send({ from: FROM, to, subject: `Your sign-in code: ${otp}`, html });
    logger.info({ to }, 'OTP email sent');
  } catch (err) {
    logger.error({ err, to }, 'Failed to send OTP email');
    throw err;
  }
}

module.exports = { sendOtpEmail };
