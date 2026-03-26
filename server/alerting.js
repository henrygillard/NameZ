// server/alerting.js
import nodemailer from "nodemailer";

// In-memory cooldown: map of alertType -> last sent timestamp (ms)
const cooldowns = new Map();
const COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Send an alert email via Gmail SMTP.
 * Throttled: same `type` fires at most once per 15 minutes.
 * Silent no-op if env vars are not configured.
 *
 * @param {string} type   - Alert category key (e.g. 'search-api-failure', 'app-crash')
 * @param {string} message - Human-readable description of the error
 */
export async function sendAlert(type, message) {
  const from = process.env.ALERT_EMAIL_FROM;
  const to = process.env.ALERT_EMAIL_TO;
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (!from || !to || !pass) {
    // Not configured — skip silently
    return;
  }

  const now = Date.now();
  const lastSent = cooldowns.get(type) || 0;
  if (now - lastSent < COOLDOWN_MS) {
    console.log(`[alerting] cooldown active for type=${type}, skipping`);
    return;
  }

  cooldowns.set(type, now);

  const transport = nodemailer.createTransport({
    service: "gmail",
    auth: { user: from, pass },
  });

  try {
    await transport.sendMail({
      from,
      to,
      subject: `[Name-Z Alert] ${type}`,
      text: `Alert type: ${type}\n\n${message}\n\nTimestamp: ${new Date().toISOString()}`,
    });
    console.log(`[alerting] alert sent for type=${type}`);
  } catch (e) {
    console.error(
      `[alerting] failed to send alert for type=${type}:`,
      e.message
    );
    // Reset cooldown so next occurrence can retry
    cooldowns.set(type, 0);
  }
}
