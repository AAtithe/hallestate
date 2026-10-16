// Outbound email via Resend's REST API. Server-side only, the key never
// reaches the browser. Same provider as williamsstanley.co.

const FROM = process.env.RESEND_FROM_EMAIL || "Halecat House <onboarding@resend.dev>";

function isEmailConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

async function sendEmail({ to, replyTo, subject, text }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM, to, reply_to: replyTo, subject, text }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Resend HTTP ${res.status}: ${detail.slice(0, 200)}`);
  }
}

// Catches the mistakes people actually make in a form field without trying to
// be a full RFC 5322 parser.
function isValidEmail(value) {
  return typeof value === "string" && value.length <= 254 && /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(value);
}

module.exports = { sendEmail, isEmailConfigured, isValidEmail };
