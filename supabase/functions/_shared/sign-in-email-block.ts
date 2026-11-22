/**
 * The "Go to my page" sign-in button that booking confirmation emails carry (every booked
 * client has a login, client-login.ts). Plain HTML, so it works in the pre-rendered shells.
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function signInBlockHtml(params: { body: string; cta: string; url: string; color: string }): string {
  const color = escapeHtml(params.color);
  return `<p style="font-size:14px;line-height:1.6;color:#374151;margin:24px 0 12px">${escapeHtml(params.body).split("\n").join("<br>")}</p>`
    + `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;margin:0 0 16px"><tr>`
    + `<td bgcolor="${color}" style="background-color:${color};border-radius:6px;">`
    + `<a href="${escapeHtml(params.url)}" style="display:inline-block;padding:12px 28px;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:700;font-size:15px;">${escapeHtml(params.cta)}</a>`
    + `</td></tr></table>`;
}

/** Inserts the block just before the paragraph that holds `text`. Not found: unchanged. */
export function insertBeforeParagraph(html: string, text: string, block: string): string {
  const at = html.indexOf(`>${escapeHtml(text)}</p>`);
  if (at < 0) return html;
  const start = html.lastIndexOf("<p", at);
  if (start < 0) return html;
  return html.slice(0, start) + block + html.slice(start);
}

/** Only http(s) links go in a button. */
export function isHttpLink(value: unknown): value is string {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

/**
 * Replaces the words of the paragraph that holds exactly `text` with `replacement`
 * (plain text: escaped, line breaks kept). Not found: unchanged.
 */
export function replaceParagraphText(html: string, text: string, replacement: string): string {
  const needle = `>${escapeHtml(text)}</p>`;
  const at = html.indexOf(needle);
  if (at < 0) return html;
  const words = escapeHtml(replacement).split("\n").join("<br>");
  return html.slice(0, at + 1) + words + html.slice(at + needle.length - "</p>".length);
}

/** One photo across the email's width (hosted image, never an attachment). */
export function photoBlockHtml(params: { url: string; alt: string }): string {
  return `<p style="margin:0 0 16px 0"><img src="${escapeHtml(params.url)}" alt="${escapeHtml(params.alt)}" width="560"`
    + ` style="display:block;width:100%;max-width:560px;height:auto;border:0;border-radius:6px"></p>`;
}

/** Inserts the block just after the paragraph that holds exactly `text`. Not found: unchanged. */
export function insertAfterParagraph(html: string, text: string, block: string): string {
  const needle = `>${escapeHtml(text)}</p>`;
  const at = html.indexOf(needle);
  if (at < 0) return html;
  const end = at + needle.length;
  return html.slice(0, end) + block + html.slice(end);
}

/** "Sincerely,<br>Name" under the closing line. Plain text, escaped. */
export function signatureHtml(params: { signOff: string; name: string }): string {
  return `<p style="font-size:16px;line-height:1.6;color:#1f2937;margin:16px 0 0 0">${escapeHtml(params.signOff)}<br>${escapeHtml(params.name)}</p>`;
}
