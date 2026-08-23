/**
 * Pure extraction of lead fields from an inbound inquiry email.
 * Consumed by the crm-lead-ingest edge function (Deno) and by the vitest
 * suite in apps/web (Node) — keep this file dependency-free.
 *
 * Heuristics only, null-honest: a field we cannot source from the email is
 * null, never guessed. The From header gives name+email reliably; the phone
 * is regex-extracted (Israeli formats); the subject becomes the interest; a
 * cleaned snippet of the body becomes the last-communication note. The
 * admin-facing pinned `note` is deliberately NOT auto-filled — that field
 * belongs to a human.
 */

export interface InboundLeadEmail {
  fromName: string | null;
  fromEmail: string | null;
  subject: string | null;
  /** Plain-text body (worker converts/strips HTML before calling). */
  text: string | null;
}

export interface ParsedLeadFields {
  name: string;
  email: string | null;
  phone: string | null;
  interest: string | null;
  lastCommunicationNote: string | null;
}

const SNIPPET_MAX = 300;

/** +972-5X…, 05X-…, 0[23489]-…, 07X-… with optional spaces/dashes/dots. */
const IL_PHONE_RE =
  /(?:\+972[-\s.]?|0)(?:5\d|7[2-9]|[23489])[-\s.]?\d{3}[-\s.]?\d{2}[-\s.]?\d{2}/;

function collapse(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** Strip Re:/Fw:/Fwd: prefixes (also Hebrew השב/הועבר) — repeatedly. */
export function cleanSubject(subject: string | null): string | null {
  if (!subject) return null;
  let s = collapse(subject);
  const prefix = /^(?:re|fw|fwd|השב|הועבר)\s*:\s*/i;
  while (prefix.test(s)) s = s.replace(prefix, "");
  return s.length > 0 ? s : null;
}

/** Drop quoted history and signatures, collapse whitespace, cap length. */
export function bodySnippet(text: string | null): string | null {
  if (!text) return null;
  const lines = text
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith(">"));
  // Cut at the first quoted-reply marker or signature delimiter.
  const cutAt = lines.findIndex((line) =>
    /^--\s*$/.test(line.trim()) ||
    /^On .+ wrote:$/.test(line.trim()) ||
    /^בתאריך .+ כתב/.test(line.trim())
  );
  const kept = cutAt === -1 ? lines : lines.slice(0, cutAt);
  const joined = collapse(kept.join(" "));
  if (joined.length === 0) return null;
  return joined.length > SNIPPET_MAX ? `${joined.slice(0, SNIPPET_MAX - 1)}…` : joined;
}

export function extractPhone(text: string | null): string | null {
  if (!text) return null;
  const match = text.match(IL_PHONE_RE);
  if (!match) return null;
  // Normalise separators so the CRM shows one canonical shape.
  return match[0].replace(/[-\s.]/g, "");
}

export function parseLeadEmail(email: InboundLeadEmail): ParsedLeadFields {
  const fromEmail = email.fromEmail ? collapse(email.fromEmail).toLowerCase() : null;
  const fromName = email.fromName ? collapse(email.fromName) : null;
  // The sender's local part is genuine data — better than a fabricated name.
  const localPart = fromEmail ? fromEmail.split("@")[0] : null;
  const name = fromName ?? localPart ?? "Unknown enquirer";

  return {
    name,
    email: fromEmail,
    phone: extractPhone(email.text),
    interest: cleanSubject(email.subject),
    lastCommunicationNote: bodySnippet(email.text),
  };
}
