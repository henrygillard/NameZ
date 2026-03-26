/**
 * Sends a single notification email to INSTALL_NOTIFY_EMAIL when a store installs the app.
 * Uses Gmail SMTP (GMAIL_USER + GMAIL_APP_PASSWORD). No-op if env is not set.
 */
import nodemailer from "nodemailer";

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return null;
  transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 587,
    secure: false,
    auth: { user, pass },
  });
  return transporter;
}

/**
 * Sends "New app install: {shop}" to INSTALL_NOTIFY_EMAIL. Fire-and-forget; never throws.
 * @param {string} shop - e.g. "store-name.myshopify.com"
 */
export async function notifyInstall(shop) {
  const to = process.env.INSTALL_NOTIFY_EMAIL;
  if (!to) return;

  const transport = getTransporter();
  if (!transport) {
    console.warn(
      "[notifyInstall] GMAIL_USER / GMAIL_APP_PASSWORD not set; skipping install email"
    );
    return;
  }

  try {
    await transport.sendMail({
      from: process.env.GMAIL_USER,
      to,
      subject: `[Name-Z] New install: ${shop}`,
      text: `A store just installed your app.\n\nShop: ${shop}\nTime: ${new Date().toISOString()}`,
    });
    console.log("[notifyInstall] Sent install notification for", shop);
  } catch (err) {
    console.error("[notifyInstall] Failed to send email:", err.message);
  }
}
