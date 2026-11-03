/**
 * Validates the address a studio types for its own domain (Settings → Custom
 * domain). The server is the authority; the UI shows the `code` in plain words.
 *
 * Accepted: a SUBDOMAIN of a real registrable domain, such as
 * app.creativeballetacademy.com or app.studio.co.il. Normalised to lower-case
 * ASCII (international names become punycode).
 *
 * Refused: the bare domain (apex), www, wildcards, IP addresses, ports and
 * paths, names over the DNS limits, reserved first labels (mail, api, …), and
 * any domain OpalSwift or its providers use.
 */
import { parse } from "npm:tldts@7.4.18";

export type HostnameErrorCode =
  | "empty"
  | "invalid"
  | "too_long"
  | "path_or_port"
  | "ip_address"
  | "wildcard"
  | "unknown_suffix"
  | "apex"
  | "www"
  | "reserved"
  | "blocked_domain";

export type HostnameCheck =
  | { ok: true; hostname: string; registrableDomain: string }
  | { ok: false; code: HostnameErrorCode };

/** First labels that belong to mail, DNS or admin services, never to the app. */
export const RESERVED_LABELS = new Set([
  "www", "mail", "email", "smtp", "imap", "pop", "pop3", "mx", "webmail",
  "autodiscover", "autoconfig", "ftp", "sftp", "ns", "ns1", "ns2", "dns",
  "api", "admin", "cpanel", "whm", "localhost", "proxy-fallback",
]);

/** Registrable domains we or our providers use: never a studio's custom domain. */
export const BLOCKED_DOMAINS = new Set([
  "opalswift.com", "supabase.co", "supabase.com", "supabase.in",
  "workers.dev", "pages.dev", "r2.dev", "cloudflare.com", "cloudflare.net",
  "cloudflareaccess.com", "cloudflare-dns.com", "github.io", "github.com",
]);

const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function checkHostname(input: unknown): HostnameCheck {
  if (typeof input !== "string") return { ok: false, code: "empty" };
  let raw = input.trim().toLowerCase();
  if (!raw) return { ok: false, code: "empty" };

  // People paste whole addresses: drop the scheme and one trailing slash.
  raw = raw.replace(/^[a-z][a-z0-9+.-]*:\/\//, "").replace(/\/$/, "");
  if (/[/?#@:\\]/.test(raw)) return { ok: false, code: "path_or_port" };
  if (raw.includes("*")) return { ok: false, code: "wildcard" };
  raw = raw.replace(/\.$/, "");

  // IDNA to ASCII (punycode) the way browsers do.
  let ascii: string;
  try {
    ascii = new URL(`http://${raw}`).hostname;
  } catch {
    return { ok: false, code: "invalid" };
  }
  if (ascii.startsWith("[") || /^\d+(\.\d+){3}$/.test(ascii)) return { ok: false, code: "ip_address" };
  if (ascii.length > 253) return { ok: false, code: "too_long" };
  const labels = ascii.split(".");
  if (labels.length < 2 || !labels.every((l) => LABEL.test(l))) return { ok: false, code: "invalid" };

  const p = parse(ascii, { allowPrivateDomains: false });
  if (p.isIp) return { ok: false, code: "ip_address" };
  if (!p.domain || !p.publicSuffix || p.isIcann !== true) return { ok: false, code: "unknown_suffix" };
  if (BLOCKED_DOMAINS.has(p.domain)) return { ok: false, code: "blocked_domain" };
  if (!p.subdomain) return { ok: false, code: "apex" };

  const first = labels[0];
  if (first === "www") return { ok: false, code: "www" };
  if (RESERVED_LABELS.has(first)) return { ok: false, code: "reserved" };

  return { ok: true, hostname: ascii, registrableDomain: p.domain };
}
