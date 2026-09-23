import nodemailer from 'nodemailer';

// Built lazily (not at import time) so tests can set env vars first, and
// cached as a Promise so concurrent calls before it resolves all share the
// same in-flight setup instead of racing to build two transporters.
let transporterPromise = null;

async function buildTransporter() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;

  if (SMTP_HOST) {
    return {
      isEthereal: false,
      transporter: nodemailer.createTransport({
        host: SMTP_HOST,
        port: Number(SMTP_PORT) || 587,
        secure: Number(SMTP_PORT) === 465,
        auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined,
      }),
    };
  }

  // No SMTP configured (e.g. local dev, or this portfolio demo without real
  // credentials): fall back to a disposable Ethereal inbox so alert emails
  // are still visible via a preview link instead of silently going nowhere.
  try {
    const testAccount = await nodemailer.createTestAccount();
    console.warn('[email] SMTP_HOST not set — using a temporary Ethereal inbox for alert emails');
    return {
      isEthereal: true,
      transporter: nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: { user: testAccount.user, pass: testAccount.pass },
      }),
    };
  } catch (err) {
    console.warn('[email] could not set up an Ethereal test inbox — alerts will be logged only:', err.message);
    return null;
  }
}

function getTransporter() {
  if (!transporterPromise) transporterPromise = buildTransporter();
  return transporterPromise;
}

/**
 * Sends one alert email. Never throws — every failure mode (no recipient,
 * no SMTP configured, a network/auth error) is caught and turned into a
 * `{ sent: false, reason }` result instead, so a broken mail server can
 * never take down a check or its CheckLog write.
 *
 * @param {Object} params
 * @param {string|null|undefined} params.to
 * @param {string} params.subject
 * @param {string} params.html
 * @param {string} params.text
 * @returns {Promise<{ sent: true } | { sent: false, reason: 'NO_RECIPIENT'|'NOT_CONFIGURED'|'SEND_FAILED', error?: string }>}
 */
export async function sendAlertEmail({ to, subject, html, text }) {
  if (!to) {
    console.warn('[email] no recipient configured on this monitor (monitor.alerts.email) — skipping alert');
    return { sent: false, reason: 'NO_RECIPIENT' };
  }

  const setup = await getTransporter();
  if (!setup) return { sent: false, reason: 'NOT_CONFIGURED' };

  try {
    const info = await setup.transporter.sendMail({
      from: process.env.EMAIL_FROM || 'ChronoGit Alerts <alerts@chronogit.local>',
      to,
      subject,
      html,
      text,
    });
    if (setup.isEthereal) {
      console.log('[email] preview:', nodemailer.getTestMessageUrl(info));
    }
    return { sent: true };
  } catch (err) {
    console.error('[email] failed to send alert email:', err.message);
    return { sent: false, reason: 'SEND_FAILED', error: err.message };
  }
}

/** Test-only: forces the next sendAlertEmail call to rebuild the transporter. */
export function _resetTransporterCacheForTests() {
  transporterPromise = null;
}