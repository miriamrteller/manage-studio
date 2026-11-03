/**
 * Settings → Custom domain helpers.
 *
 * suggestCustomDomain: owner rule "prefill everything we can". We have no
 * website field, but a studio's own legal-page links or contact email usually
 * carry its domain: info@creativeballetacademy.com → app.creativeballetacademy.com.
 * Free-mail and OpalSwift domains are skipped. The studio can edit the guess.
 */
const FREE_MAIL = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
  'yahoo.com', 'icloud.com', 'me.com', 'mac.com', 'aol.com', 'proton.me', 'protonmail.com',
  'walla.co.il', 'walla.com', 'netvision.net.il', 'bezeqint.net', '012.net.il', 'zahav.net.il',
  'gmx.com', 'gmx.net', 'mail.com', 'yandex.com',
]);
const OURS = /(^|\.)(opalswift\.com|supabase\.co|pages\.dev|workers\.dev)$/;

function baseDomain(host: string): string | null {
  const h = host.trim().toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
  if (!h.includes('.') || OURS.test(h) || FREE_MAIL.has(h)) return null;
  return h;
}

export interface DomainHints {
  contact_email?: string | null;
  privacy_policy_url?: string | null;
  terms_url?: string | null;
  accessibility_statement_url?: string | null;
}

export function suggestCustomDomain(t: DomainHints | null | undefined): string {
  if (!t) return '';
  for (const url of [t.privacy_policy_url, t.terms_url, t.accessibility_statement_url]) {
    if (!url) continue;
    try {
      const d = baseDomain(new URL(url).hostname);
      if (d) return `app.${d}`;
    } catch {
      // not a URL
    }
  }
  const at = t.contact_email?.split('@')[1];
  const d = at ? baseDomain(at) : null;
  return d ? `app.${d}` : '';
}

const KNOWN_CODES = new Set([
  'dns_not_ready', 'dns_not_pointing', 'ownership_txt_missing', 'caa_blocked', 'hostname_blocked',
  'hostname_missing', 'expired_unactivated', 'opalswift_connects',
  'empty', 'invalid', 'too_long', 'path_or_port', 'ip_address', 'wildcard', 'unknown_suffix', 'apex',
  'www', 'reserved', 'blocked_domain', 'hostname_taken', 'already_has_domain', 'no_domain',
  'confirm_mismatch', 'managed_by_opalswift', 'cloudflare_unavailable', 'not_configured', 'not_enabled',
]);

/** Error and problem codes from the custom-domain function, as i18n keys in plain words. */
export function problemKey(code: string | null | undefined): string | null {
  if (!code) return null;
  return `settings.custom_domain.codes.${KNOWN_CODES.has(code) ? code : 'unknown'}`;
}

export const DNS_PROVIDERS = ['cloudflare', 'godaddy', 'namecheap', 'wix', 'squarespace', 'israeli', 'other'] as const;
export type DnsProvider = (typeof DNS_PROVIDERS)[number];
