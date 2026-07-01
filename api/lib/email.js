const { Resend } = require('resend');

let resend;

function getResend() {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not set');
  }
  if (!resend) {
    resend = new Resend(process.env.RESEND_API_KEY);
  }
  return resend;
}

function isEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && !process.env.RESEND_API_KEY.startsWith('re_xxx'));
}

async function sendEmail({ to, subject, html }) {
  if (!isEmailConfigured()) {
    console.warn('Resend not configured — skipping email to', to);
    return { skipped: true };
  }

  const from = process.env.RESEND_FROM_EMAIL || 'KibbiSave <contact@kibbisave.com>';
  const client = getResend();
  const { data, error } = await client.emails.send({ from, to, subject, html });

  if (error) {
    throw new Error(error.message || 'Failed to send email');
  }
  return data;
}

async function sendWelcomeEmail({ to, name }) {
  const displayName = name || 'there';
  return sendEmail({
    to,
    subject: 'Welcome to KibbiSave',
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#111;">
        <div style="background:#00008b;padding:24px;border-radius:12px 12px 0 0;">
          <h1 style="margin:0;color:#fff;font-size:22px;">kibbi<span style="color:#ffd700;">save</span></h1>
        </div>
        <div style="border:1px solid #dde3f0;border-top:none;padding:24px;border-radius:0 0 12px 12px;">
          <p style="font-size:16px;">Hi ${displayName},</p>
          <p>Your account is ready. Start saving with your group toward land, business, travel, and more.</p>
          <a href="${process.env.APP_URL || (process.env.VERCEL === '1' ? 'https://kibbisave.com' : 'http://localhost:3000')}"
             style="display:inline-block;margin-top:16px;background:#00008b;color:#fff;padding:12px 24px;border-radius:24px;text-decoration:none;font-weight:600;">
            Go to KibbiSave
          </a>
        </div>
      </div>
    `,
  });
}

module.exports = { sendEmail, sendWelcomeEmail, isEmailConfigured };
