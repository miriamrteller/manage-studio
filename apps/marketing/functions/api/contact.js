// Cloudflare Pages Function: POST /api/contact
// The beta/contact form on the home page (#contact-form) posts FormData here
// with fields name, email, message. We email it to hello@opalswift.com via
// Resend and answer {ok:true} or {ok:false,error}. The page only checks
// res.ok. Nothing is stored.
//
// Settings (Cloudflare → Workers & Pages → opalswift → Settings → Variables and Secrets):
//   RESEND_API_KEY  secret, required
//   CONTACT_TO      optional, default hello@opalswift.com
// Docs: docs/deployment/MARKETING-SITE.md#the-contact-form

export const LIMITS = { body: 16 * 1024, name: 100, email: 254, message: 4000 };
const DEFAULT_TO = "hello@opalswift.com";
const FROM = "OpalSwift <no-reply@opalswift.com>";
// Hidden fields a person never fills in; if a bot does, pretend it worked.
const HONEYPOTS = ["website", "company", "url"];
const EMAIL_RE = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]{2,}$/;

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
const fail = (status, error) => json(status, { ok: false, error });

// Drop control characters (incl. CR/LF), collapse whitespace for one-liners.
const oneLine = (s) => s.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
const multiLine = (s) =>
  s.replace(/\r\n?/g, "\n").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, "").trim();
const escapeHtml = (s) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export async function handleContact({ request, env }) {
  // Same-site form only: browsers always send Origin on a fetch POST.
  const origin = request.headers.get("origin");
  if (origin) {
    let sameHost = false;
    try {
      sameHost = new URL(origin).host === new URL(request.url).host;
    } catch {}
    if (!sameHost) return fail(403, "Forbidden");
  }

  const type = (request.headers.get("content-type") || "").toLowerCase();
  if (!type.startsWith("multipart/form-data") && !type.startsWith("application/x-www-form-urlencoded")) {
    return fail(415, "Send the form as FormData");
  }
  const declared = Number(request.headers.get("content-length") || 0);
  if (declared > LIMITS.body) return fail(413, "Too large");

  let form;
  try {
    const raw = await request.arrayBuffer();
    if (raw.byteLength > LIMITS.body) return fail(413, "Too large");
    form = await new Request(request.url, {
      method: "POST",
      headers: { "content-type": request.headers.get("content-type") },
      body: raw,
    }).formData();
  } catch {
    return fail(400, "Could not read the form");
  }

  const field = (k) => {
    const v = form.get(k);
    return typeof v === "string" ? v : "";
  };

  if (HONEYPOTS.some((k) => field(k).trim() !== "")) return json(200, { ok: true });

  const name = oneLine(field("name"));
  const email = oneLine(field("email"));
  const message = multiLine(field("message"));

  if (!name || !email || !message) return fail(400, "Name, email and message are required");
  if (name.length > LIMITS.name || email.length > LIMITS.email || message.length > LIMITS.message) {
    return fail(400, "A field is too long");
  }
  if (!EMAIL_RE.test(email)) return fail(400, "Invalid email address");

  if (!env.RESEND_API_KEY) {
    console.error("contact: RESEND_API_KEY is not set");
    return fail(500, "Email is not configured");
  }
  const to = oneLine(env.CONTACT_TO || "") || DEFAULT_TO;

  const text = `Name: ${name}\nEmail: ${email}\n\n${message}\n`;
  const html =
    `<p><b>Name:</b> ${escapeHtml(name)}<br><b>Email:</b> ${escapeHtml(email)}</p>` +
    `<p style="white-space:pre-wrap">${escapeHtml(message)}</p>`;

  let res;
  try {
    res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        from: FROM,
        to: [to],
        reply_to: email,
        subject: `OpalSwift beta: ${name}`,
        text,
        html,
      }),
    });
  } catch {
    console.error("contact: could not reach Resend");
    return fail(502, "Could not send");
  }
  if (!res.ok) {
    // Status only: never the submission or the key.
    console.error(`contact: Resend answered ${res.status}`);
    return fail(502, "Could not send");
  }
  return json(200, { ok: true });
}

// One entry point, so the method check doesn't depend on route ordering.
export function onRequest(context) {
  if (context.request.method !== "POST") {
    const res = fail(405, "Method not allowed");
    res.headers.set("allow", "POST");
    return res;
  }
  return handleContact(context);
}
