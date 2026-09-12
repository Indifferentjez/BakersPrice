// Password reset email via Resend's REST API (plain fetch — no SDK dependency,
// consistent with how the rest of the server avoids heavy deps).
export async function sendPasswordResetEmail({ to, resetUrl }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;
  if (!apiKey || !from) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[password reset] ${to}: ${resetUrl}`);
    }
    return { sent: false };
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to,
        subject: 'Reset your Bakers Price password',
        html: `<p>Someone asked to reset the password on this account.</p>
<p><a href="${resetUrl}">Reset your password</a></p>
<p>This link expires in 1 hour. If you didn't request this, you can ignore this email.</p>`,
      }),
    });
    if (!res.ok) {
      console.error('Resend send failed:', res.status, await res.text().catch(() => ''));
    }
    return { sent: res.ok };
  } catch (e) {
    console.error('Resend send error:', e.message);
    return { sent: false };
  }
}
