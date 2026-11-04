import { describe, expect, it, vi } from 'vitest';
import {
  fetchStudioIcon,
  lookupForHost,
  rewriteIconLinks,
  iconProxyResponse,
  isIconContentType,
  tenantAssetUrl,
} from '../../worker/studioIcon';

const INDEX = `<!doctype html>
<html lang="en" dir="ltr">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" href="/favicon.ico" sizes="48x48 32x32 16x16" />
    <link rel="icon" type="image/png" sizes="64x64" href="/favicon-64.png" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <link rel="stylesheet" href="/assets/app.css" />
    <title>OpalSwift</title>
  </head>
  <body><div id="root"></div></body>
</html>`;

const SB = 'https://p.supabase.co';
const LOGO = `${SB}/storage/v1/object/public/tenant-assets/t1/logo.png`;

describe('lookupForHost', () => {
  it('a studio subdomain and a custom host are studios; OpalSwift own hosts are not', () => {
    expect(lookupForHost('creativeballet.opalswift.com', 'opalswift.com')).toEqual({ kind: 'subdomain', subdomain: 'creativeballet' });
    expect(lookupForHost('app.creativeballetacademy.com', 'opalswift.com')).toEqual({ kind: 'host', host: 'app.creativeballetacademy.com' });
    expect(lookupForHost('app.opalswift.com', 'opalswift.com')).toBeNull();
    expect(lookupForHost('opalswift.com', 'opalswift.com')).toBeNull();
    expect(lookupForHost('www.opalswift.com', 'opalswift.com')).toBeNull();
    expect(lookupForHost('a.b.opalswift.com', 'opalswift.com')).toBeNull();
    expect(lookupForHost('localhost', 'opalswift.com')).toBeNull();
    expect(lookupForHost('127.0.0.1', 'opalswift.com')).toBeNull();
    expect(lookupForHost('anything.test', undefined)).toBeNull();
  });
});

describe('rewriteIconLinks', () => {
  it('puts the studio logo into every icon link and the studio name into the title, nothing else', () => {
    const out = rewriteIconLinks(INDEX, LOGO, 'Creative Ballet');
    const icons = out.match(/<link\b[^>]*>/g)!.filter((t) => /icon/.test(t));
    expect(icons).toHaveLength(3);
    for (const tag of icons) {
      expect(tag).toContain(`href="${LOGO}"`);
      expect(tag).not.toMatch(/\ssizes=|\stype=/);
    }
    expect(out).toContain('<link rel="stylesheet" href="/assets/app.css" />');
    expect(out).toContain('<title>Creative Ballet</title>');
    expect(out).not.toContain('/favicon.ico');
  });

  it('keeps the title when the studio has no name, and escapes what it inserts', () => {
    expect(rewriteIconLinks(INDEX, LOGO, null)).toContain('<title>OpalSwift</title>');
    const out = rewriteIconLinks(INDEX, 'https://x.test/a"b<c.png', 'A & <B>');
    expect(out).toContain('<title>A &amp; &lt;B&gt;</title>');
    expect(out).not.toContain('a"b<c');
  });

  it('copes with single quotes and attributes in any order', () => {
    const out = rewriteIconLinks(`<link href='/x.ico' rel='shortcut icon' type='image/x-icon'>`, LOGO, null);
    expect(out).toBe(`<link href="${LOGO}" rel='shortcut icon'>`);
  });
});

describe('tenantAssetUrl', () => {
  it('accepts only a logo in our own tenant-assets bucket', () => {
    expect(tenantAssetUrl(LOGO, SB)).toBe(LOGO);
    expect(tenantAssetUrl(LOGO, `${SB}/`)).toBe(LOGO);
  });

  it('refuses anything else: other origins, other buckets or paths, http, odd values', () => {
    expect(tenantAssetUrl('https://evil.example.com/storage/v1/object/public/tenant-assets/a.png', SB)).toBeNull();
    expect(tenantAssetUrl(`${SB}/storage/v1/object/public/other-bucket/a.png`, SB)).toBeNull();
    expect(tenantAssetUrl(`${SB}/storage/v1/object/public/tenant-assets/../../x`, SB)).toBeNull();
    expect(tenantAssetUrl(`${SB}/rest/v1/rpc/anything`, SB)).toBeNull();
    expect(tenantAssetUrl(`http://p.supabase.co/storage/v1/object/public/tenant-assets/a.png`, 'http://p.supabase.co')).toBeNull();
    expect(tenantAssetUrl('https://p.supabase.co.evil.test/storage/v1/object/public/tenant-assets/a.png', SB)).toBeNull();
    expect(tenantAssetUrl('javascript:alert(1)', SB)).toBeNull();
    expect(tenantAssetUrl('not a url', SB)).toBeNull();
    expect(tenantAssetUrl(null, SB)).toBeNull();
    expect(tenantAssetUrl(LOGO, undefined)).toBeNull();
  });
});

describe('icon proxy', () => {
  const image = (type: string | null, init: { status?: number } = {}) =>
    new Response('bytes', { ...init, headers: type ? { 'Content-Type': type } : {} });

  it('passes a plain image through, locked down', () => {
    for (const type of ['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/x-icon', 'image/vnd.microsoft.icon', 'image/png; charset=binary']) {
      const out = iconProxyResponse(image(type), 300);
      expect(out, type).not.toBeNull();
      expect(out!.headers.get('Content-Type')).toBe(type);
      expect(out!.headers.get('Content-Security-Policy')).toBe("default-src 'none'");
      expect(out!.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(out!.headers.get('Cache-Control')).toBe('public, max-age=300');
    }
  });

  it('falls back (null) for anything that is not a plain image', () => {
    for (const type of ['text/html', 'text/html; charset=utf-8', 'image/svg+xml', 'application/javascript', 'application/octet-stream', 'text/plain', 'image/pngx', null]) {
      expect(iconProxyResponse(image(type), 300), String(type)).toBeNull();
    }
    expect(isIconContentType('IMAGE/PNG')).toBe(true);
  });

  it('falls back for a failed or redirected response', () => {
    expect(iconProxyResponse(image('image/png', { status: 404 }), 300)).toBeNull();
    expect(iconProxyResponse(image('image/png', { status: 302 }), 300)).toBeNull();
  });
});

describe('fetchStudioIcon', () => {
  const env = { SUPABASE_URL: `${SB}/`, SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x' };
  const reply = (rows: unknown, ok = true) => vi.fn().mockResolvedValue({ ok, status: ok ? 200 : 500, json: async () => rows });

  it('asks the public lookup for the host and returns the logo and name', async () => {
    const f = reply([{ name: 'Creative Ballet', logo_url: LOGO, logo_dark_url: null }]);
    const out = await fetchStudioIcon({ kind: 'host', host: 'app.creativeballetacademy.com' }, env, f as unknown as typeof fetch);
    expect(out).toEqual({ iconUrl: LOGO, name: 'Creative Ballet' });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('https://p.supabase.co/rest/v1/rpc/get_tenant_config_by_host');
    expect(JSON.parse(init.body)).toEqual({ p_host: 'app.creativeballetacademy.com' });
  });

  it('uses the subdomain lookup for a subdomain host', async () => {
    const f = reply([{ name: 'X', logo_url: LOGO }]);
    await fetchStudioIcon({ kind: 'subdomain', subdomain: 'creativeballet' }, env, f as unknown as typeof fetch);
    expect(f.mock.calls[0][0]).toContain('get_tenant_config_by_subdomain');
  });

  it('ignores a logo address outside our own tenant-assets bucket', async () => {
    const f = reply([{ name: 'X', logo_url: 'https://evil.example.com/storage/v1/object/public/tenant-assets/a.png' }]);
    const out = await fetchStudioIcon({ kind: 'host', host: 'h.test' }, env, f as unknown as typeof fetch);
    expect(out).toEqual({ iconUrl: null, name: 'X' });
  });

  it('has no icon when there is no studio, no logo, or no settings; a failed lookup throws (so the page falls back)', async () => {
    const host = { kind: 'host', host: 'h.test' } as const;
    expect(await fetchStudioIcon(host, env, reply([]) as unknown as typeof fetch)).toBeNull();
    expect((await fetchStudioIcon(host, env, reply([{ name: 'X' }]) as unknown as typeof fetch))?.iconUrl).toBeNull();
    expect(await fetchStudioIcon(host, {}, reply([]) as unknown as typeof fetch)).toBeNull();
    await expect(fetchStudioIcon(host, env, reply(null, false) as unknown as typeof fetch)).rejects.toThrow();
  });
});
