// Transactional email via Resend's HTTP API. Without RESEND_API_KEY (local dev), messages are
// logged to the server console instead of sent.
//   RESEND_API_KEY   re_...
//   EMAIL_FROM       e.g. "It Got Sued <hello@itgotsued.com>" (domain must be verified in Resend)

export async function sendEmail(to: string, subject: string, text: string): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.log(`[email] RESEND_API_KEY not set; would send to ${to}:\n${subject}\n\n${text}`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM ?? "It Got Sued <hello@itgotsued.com>",
      to,
      subject,
      text,
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}
