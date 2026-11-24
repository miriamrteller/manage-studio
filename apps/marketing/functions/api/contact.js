// Cloudflare Pages Function: POST /api/contact
// The beta/contact form on the home page (#contact-form) posts FormData here
// with fields name, email, message. We email it to hello@opalswift.com via
// Resend and file it as a lead in OpalSwift HQ's Leads (the
// "hq" studio, channel website) through crm-lead-ingest. We answer {ok:true}
// or {ok:false,error}; the page only checks res.ok. The email decides the
// answer: if it went out, the visitor sees success even when filing the lead
// failed (that is logged). Until the lead settings are set, or before the hq
// studio exists, only the email is sent.
//
// Spam: hidden honeypot fields and the page timer (shown_at: missing or too fast) here (pretend success, send
// nothing); then crm-lead-ingest runs the shared spam check on the name and
// message. When it answers { outcome: "spam" } no email goes out and the
// visitor is asked to check what they typed (422). When it answers
// { outcome: "own_email" } (the OpalSwift team's own address: someone
// trying the form) no email goes out either and the page says why (422).
//
// Settings (Cloudflare → Workers & Pages → opalswift-il → Settings → Variables and Secrets):
//   RESEND_API_KEY      secret, required
//   CONTACT_TO          optional, default hello@opalswift.com
//   HQ_LEAD_INGEST_URL  optional, https://<project-ref>.supabase.co/functions/v1/crm-lead-ingest
//   CRM_INGEST_SECRET   secret, optional: the same value as the Supabase Edge Function secret
//   HQ_SUBDOMAIN        optional, default hq
// Docs: docs/deployment/MARKETING-SITE.md#the-contact-form

export const LIMITS = { body: 16 * 1024, name: 100, email: 254, message: 4000 };
const DEFAULT_TO = "hello@opalswift.com";
const DEFAULT_HQ = "hq";
const LEAD_TIMEOUT_MS = 5000;
const FROM = "OpalSwift <no-reply@opalswift.com>";
// Hidden fields a person never fills in; if a bot does, pretend it worked.
const HONEYPOTS = ["website", "company", "url"];
// Hidden field the page fills with the time the form was shown (ms since
// 1970). Sent sooner than this after that: a script, not a person.
const SHOWN_AT_FIELD = "shown_at";
const MIN_FILL_MS = 3000;
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

/**
 * File the enquiry in HQ's Leads. Never throws and never logs the submission
 * or the secret: only whether it worked, or the status it got.
 */
/**
 * True when the form was not filled in on our page by a person: the page's
 * timer is missing or unreadable (a script posting straight to /api/contact;
 * our page always sets it), or it says the form was sent within seconds of
 * opening.
 */
export function notSentFromPage(shownAt, now = Date.now()) {
  const t = Number(shownAt);
  if (!shownAt || !Number.isFinite(t)) return true;
  const elapsed = now - t;
  return elapsed >= 0 && elapsed < MIN_FILL_MS;
}

export async function fileHqLead(env, { name, email, message }) {
  const url = oneLine(env.HQ_LEAD_INGEST_URL || "");
  const secret = env.CRM_INGEST_SECRET || "";
  if (!url || !secret) return "skipped";
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
      body: JSON.stringify({
        tenantSubdomain: oneLine(env.HQ_SUBDOMAIN || "") || DEFAULT_HQ,
        contact: { submissionId: crypto.randomUUID(), name, email, message },
      }),
      signal: AbortSignal.timeout(LEAD_TIMEOUT_MS),
    });
    if (res.ok) {
      const body = await res.json().catch(() => null);
      if (body && body.outcome === "spam") return "spam";
      if (body && body.outcome === "own_email") return "own_email";
      return "filed";
    }
    // 404 = the hq studio doesn't exist yet; 401/503 = the secret doesn't match or isn't set.
    console.error(`contact: HQ lead not filed, crm-lead-ingest answered ${res.status}`);
    return "failed";
  } catch {
    console.error("contact: HQ lead not filed, could not reach crm-lead-ingest");
    return "failed";
  }
}

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

  // After the field checks, so an empty POST (the deploy smoke check) still gets its 400.
  if (notSentFromPage(field(SHOWN_AT_FIELD))) return json(200, { ok: true });

  if (!env.RESEND_API_KEY) {
    console.error("contact: RESEND_API_KEY is not set");
    return fail(500, "Email is not configured");
  }
  const to = oneLine(env.CONTACT_TO || "") || DEFAULT_TO;

  const text = `Name: ${name}\nEmail: ${email}\n\n${message}\n`;
  const html =
    `<p><b>Name:</b> ${escapeHtml(name)}<br><b>Email:</b> ${escapeHtml(email)}</p>` +
    `<p style="white-space:pre-wrap">${escapeHtml(message)}</p>`;

  // File the lead first: its spam check decides whether the email goes out.
  const lead = await fileHqLead(env, { name, email, message });
  if (lead === "spam") return fail(422, "looks_like_spam");
  if (lead === "own_email") return fail(422, "own_email");

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
