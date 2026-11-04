/**
 * The studio's own icon in the HTML the browser first receives.
 *
 * The app swaps the tab icon with JavaScript after it loads (src/components/StudioFavicon.tsx).
 * Safari and iOS (and bookmark / home-screen icons) read the static <link rel="icon"> and
 * /favicon.ico instead, so on a studio's own address they showed the OpalSwift icon.
 * The Worker (worker/index.ts) uses these helpers to put the studio's logo into the page
 * itself and to answer /favicon.ico and /apple-touch-icon.png with it.
 *
 * Pure functions, no Cloudflare APIs, so they are unit-tested: src/__tests__/studio-icon-worker.test.ts.
 */
import { studioFaviconUrl, studioTabTitle } from '../src/lib/studioFavicon';
import { parseLogoTone } from '../src/lib/theme/logoTone';

export interface IconEnv {
  /** Public project URL (the same value the browser bundle uses). */
  SUPABASE_URL?: string;
  /** Public publishable key (the same value the browser bundle uses). */
  SUPABASE_PUBLISHABLE_KEY?: string;
  /** e.g. opalswift.com: hosts under it are studio subdomains. */
  APP_ROOT_DOMAIN?: string;
}

export type HostLookup = { kind: 'subdomain'; subdomain: string } | { kind: 'host'; host: string };

/** Same list as the app (src/lib/resolveTenantSubdomain.ts): these names never identify a studio. */
const RESERVED = new Set(['www', 'app', 'api', 'admin', 'auth', 'mail', 'static', 'assets', 'cdn', 'localhost']);

/** How to find the studio for this host, or null when the host is not a studio's (OpalSwift's own). */
export function lookupForHost(hostname: string, rootDomain: string | undefined): HostLookup | null {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  const root = (rootDomain ?? '').toLowerCase().replace(/^\./, '');
  if (!host || !root || host === root) return null;
  if (host.endsWith(`.${root}`)) {
    const sub = host.slice(0, -(root.length + 1));
    if (!sub || sub.includes('.') || RESERVED.has(sub)) return null;
    return { kind: 'subdomain', subdomain: sub };
  }
  if (host === 'localhost' || host.endsWith('.localhost') || /^[\d.:]+$/.test(host)) return null;
  return { kind: 'host', host };
}

export interface StudioIcon {
  iconUrl: string | null;
  name: string | null;
}

/** The studio's icon for this host from the public tenant-config lookup; null when none. */
export async function fetchStudioIcon(
  lookup: HostLookup,
  env: IconEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<StudioIcon | null> {
  const base = env.SUPABASE_URL?.replace(/\/+$/, '');
  const key = env.SUPABASE_PUBLISHABLE_KEY;
  if (!base || !key) return null;
  const rpc = lookup.kind === 'host' ? 'get_tenant_config_by_host' : 'get_tenant_config_by_subdomain';
  const body = lookup.kind === 'host' ? { p_host: lookup.host } : { p_subdomain: lookup.subdomain };
  const res = await fetchImpl(`${base}/rest/v1/rpc/${rpc}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(1500),
  });
  if (!res.ok) throw new Error(`tenant lookup ${res.status}`);
  const rows = (await res.json()) as Array<Record<string, unknown>> | null;
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) return null;
  const url = studioFaviconUrl({
    logo_url: typeof row.logo_url === 'string' ? row.logo_url : null,
    logo_dark_url: typeof row.logo_dark_url === 'string' ? row.logo_dark_url : null,
    logo_tone: parseLogoTone(row.logo_tone),
    logo_dark_tone: parseLogoTone(row.logo_dark_tone),
  });
  return { iconUrl: safeHttpsUrl(url), name: typeof row.name === 'string' ? row.name : null };
}

/** Only an https address may go into the page. */
export function safeHttpsUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' ? u.toString() : null;
  } catch {
    return null;
  }
}

const escapeAttr = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const escapeText = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function attrValue(tag: string, name: string): string | null {
  const m = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, 'i').exec(tag);
  return m ? (m[1] ?? m[2] ?? '') : null;
}

const dropAttr = (tag: string, name: string) =>
  tag.replace(new RegExp(`\\s${name}\\s*=\\s*(?:"[^"]*"|'[^']*')`, 'i'), '');

/**
 * Points the page's icon links (favicon and apple-touch-icon) at `iconUrl` and, when given, sets the
 * tab title to the studio's name. Other markup is left exactly as it was.
 */
export function rewriteIconLinks(html: string, iconUrl: string, studioName?: string | null): string {
  const out = html.replace(/<link\b[^>]*>/gi, (tag) => {
    const rel = (attrValue(tag, 'rel') ?? '').toLowerCase().split(/\s+/);
    if (!rel.includes('icon') && !rel.includes('apple-touch-icon')) return tag;
    let next = dropAttr(dropAttr(tag, 'type'), 'sizes');
    next = next.replace(/(\shref\s*=\s*)(?:"[^"]*"|'[^']*')/i, (_m, pre: string) => `${pre}"${escapeAttr(iconUrl)}"`);
    return next;
  });
  const title = studioTabTitle({ name: studioName });
  return studioName?.trim()
    ? out.replace(/<title>[\s\S]*?<\/title>/i, () => `<title>${escapeText(title)}</title>`)
    : out;
}
