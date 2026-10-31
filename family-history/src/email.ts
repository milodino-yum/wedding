import type { Env } from "./types";

export type Email = { to: string; subject: string; text: string; html: string };

/**
 * Sends through Resend (https://resend.com, free for 3,000 emails/month).
 * Without RESEND_API_KEY the email is only logged, which is what you want
 * in local development.
 */
export async function sendEmail(env: Env, msg: Email): Promise<void> {
  if (!env.RESEND_API_KEY) {
    console.log(`[email not sent: no RESEND_API_KEY]\nTo: ${msg.to}\nSubject: ${msg.subject}\n\n${msg.text}`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [msg.to],
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
    }),
  });
  if (!res.ok) {
    throw new Error(`Resend returned ${res.status}: ${await res.text()}`);
  }
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function signInEmail(opts: {
  siteName: string;
  to: string;
  link: string;
  name: string | null;
  isNew: boolean;
}): Email {
  const greeting = opts.name ? `Hi ${opts.name},` : "Hi,";
  const lead = opts.isNew
    ? `Welcome to ${opts.siteName}! Click the button below to finish joining.`
    : `Here is your link to sign in to ${opts.siteName}.`;
  const button = opts.isNew ? "Finish joining" : "Sign in";
  const text = `${greeting}

${lead}

${opts.link}

The link works once and expires in one hour. If you didn't ask for this, you can ignore this email.`;

  const html = `<!doctype html><html><body style="margin:0;background:#f6f1e7;font-family:Georgia,'Times New Roman',serif;color:#2c2418">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:520px;background:#fffdf8;border:1px solid #e3d8c3;border-radius:10px">
<tr><td style="padding:28px 28px 8px;font-size:22px">${esc(opts.siteName)}</td></tr>
<tr><td style="padding:8px 28px;font-size:17px;line-height:1.5">${esc(greeting)}<br><br>${esc(lead)}</td></tr>
<tr><td style="padding:16px 28px"><a href="${esc(opts.link)}" style="display:inline-block;background:#3d5a40;color:#fff;text-decoration:none;font-size:18px;padding:12px 22px;border-radius:8px">${button}</a></td></tr>
<tr><td style="padding:8px 28px 28px;font-size:14px;line-height:1.5;color:#6b5f4d">The link works once and expires in one hour. If you didn't ask for this, you can ignore this email.</td></tr>
</table></td></tr></table></body></html>`;

  return { to: opts.to, subject: opts.isNew ? `Welcome to ${opts.siteName}` : `Your sign-in link for ${opts.siteName}`, text, html };
}
