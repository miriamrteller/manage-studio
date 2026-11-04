/**
 * The private email to the platform owner when a studio admin sends "Report a problem".
 * Pure (no Deno or network): the function does the sending, this builds the message.
 *
 * It goes to the owner only, never to GitHub (the repository is public) and never to the
 * studio. The message text was already scrubbed in the app before it left the browser.
 */

export const DEFAULT_PROBLEM_REPORT_TO = "admin@opalswift.com";
export const DEFAULT_SENTRY_EVENT_BASE = "https://opalswift.sentry.io/organizations/opalswift/eventids/";
export const MAX_REPORT_CHARS = 2000;

export interface ProblemReportInput {
  studioName: string;
  subdomain: string;
  message: string;
  /** Route template of the page (ids and tokens already removed in the app). */
  route?: string | null;
  /** Sentry event id of the report, when Sentry accepted it. */
  eventId?: string | null;
  /** ISO time the report was sent. */
  sentAt: string;
  sentryEventBase?: string;
}

export interface ProblemReportEmail {
  subject: string;
  html: string;
  text: string;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** One line, no control characters: safe for a subject line and a table cell. */
function oneLine(value: string, max: number): string {
  // deno-lint-ignore no-control-regex
  return value.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

/** Only a 32-character hex Sentry event id becomes a link; anything else is dropped. */
export function sentryEventUrl(eventId: string | null | undefined, base = DEFAULT_SENTRY_EVENT_BASE): string | null {
  const id = (eventId ?? "").trim().toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(id)) return null;
  return `${base.replace(/\/*$/, "/")}${id}/`;
}

export function buildProblemReportEmail(input: ProblemReportInput): ProblemReportEmail {
  const studio = oneLine(input.studioName, 80) || oneLine(input.subdomain, 60) || "a studio";
  const subdomain = oneLine(input.subdomain, 60);
  const route = oneLine(input.route ?? "", 200);
  const message = input.message.replace(/\r\n/g, "\n").trim().slice(0, MAX_REPORT_CHARS);
  const link = sentryEventUrl(input.eventId, input.sentryEventBase);

  const facts: Array<[string, string]> = [
    ["Studio", subdomain ? `${studio} (${subdomain})` : studio],
    ["Page", route],
    ["Sent", input.sentAt],
    ["Sentry", link ?? ""],
  ];

  const rows = facts
    .filter(([, v]) => v)
    .map(([k, v]) => {
      const cell = k === "Sentry" ? `<a href="${escapeHtml(v)}">Open the report in Sentry</a>` : escapeHtml(v);
      return `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;white-space:nowrap;vertical-align:top;">${k}</td><td style="padding:4px 0;">${cell}</td></tr>`;
    })
    .join("");

  const html =
    `<div style="font-family:system-ui,sans-serif;font-size:15px;color:#1f2937;line-height:1.5;">` +
    `<p style="margin:0 0 12px;"><strong>Problem report from ${escapeHtml(studio)}</strong></p>` +
    `<table style="border-collapse:collapse;margin:0 0 16px;">${rows}</table>` +
    `<p style="margin:0 0 4px;color:#6b7280;">Message</p>` +
    `<div style="white-space:pre-wrap;border-left:3px solid #d1d5db;padding:4px 12px;">${escapeHtml(message)}</div>` +
    `<p style="margin:16px 0 0;color:#6b7280;font-size:13px;">Private: sent only to you. Any screenshot stays in Sentry.</p>` +
    `</div>`;

  const text = [
    `Problem report from ${studio}`,
    "",
    ...facts.filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`),
    "",
    "Message:",
    message,
    "",
    "Private: sent only to you. Any screenshot stays in Sentry.",
  ].join("\n");

  return { subject: `Problem report: ${studio}`, html, text };
}
