/**
 * The `opalswift-app` Worker: serves the built app (static assets) and, for a studio's own host,
 * puts the studio's icon into the first HTML the browser gets and answers /favicon.ico and
 * /apple-touch-icon.png with it (see worker/studioIcon.ts for why).
 *
 * Everything else passes straight through to the assets. If anything about the studio lookup fails
 * (missing settings, timeout, no logo) the visitor gets exactly what they got before: the
 * OpalSwift icons, with the app's own script still swapping the icon after load.
 */
import { fetchStudioIcon, iconProxyResponse, lookupForHost, rewriteIconLinks, type IconEnv, type StudioIcon } from './studioIcon';

interface Env extends IconEnv {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

interface Ctx {
  waitUntil(promise: Promise<unknown>): void;
}

/** A changed logo shows within this many seconds (the app also swaps it by script). */
const CACHE_SECONDS = 300;

async function studioForHost(hostname: string, env: Env, ctx: Ctx): Promise<StudioIcon | null> {
  const lookup = lookupForHost(hostname, env.APP_ROOT_DOMAIN);
  if (!lookup) return null;

  const cache = (caches as unknown as { default: Cache }).default;
  const key = new Request(`https://studio-icon-cache.invalid/${encodeURIComponent(hostname)}`);
  const hit = await cache.match(key);
  if (hit) return (await hit.json()) as StudioIcon | null;

  const found = await fetchStudioIcon(lookup, env);
  ctx.waitUntil(
    cache.put(
      key,
      new Response(JSON.stringify(found), { headers: { 'Cache-Control': `max-age=${CACHE_SECONDS}` } }),
    ),
  );
  return found;
}

export default {
  async fetch(request: Request, env: Env, ctx: Ctx): Promise<Response> {
    const pass = () => env.ASSETS.fetch(request);
    if (request.method !== 'GET' && request.method !== 'HEAD') return pass();

    const url = new URL(request.url);
    const isIconPath = url.pathname === '/favicon.ico' || url.pathname === '/apple-touch-icon.png';
    const wantsHtml = (request.headers.get('accept') ?? '').includes('text/html');
    // Scripts, styles, images and API calls are never touched.
    if (!isIconPath && !wantsHtml) return pass();

    try {
      const studio = await studioForHost(url.hostname, env, ctx);
      if (!studio?.iconUrl) return pass();

      if (isIconPath) {
        // No redirects: a logo that moves elsewhere is not served from the studio's address.
        const image = await fetch(studio.iconUrl, { redirect: 'manual' });
        return iconProxyResponse(image, CACHE_SECONDS) ?? pass();
      }

      const res = await pass();
      if (!(res.headers.get('Content-Type') ?? '').includes('text/html')) return res;
      const html = rewriteIconLinks(await res.text(), studio.iconUrl, studio.name);
      const headers = new Headers(res.headers);
      headers.delete('Content-Length');
      headers.delete('ETag');
      headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
      return new Response(html, { status: res.status, headers });
    } catch (err) {
      console.warn('studio icon: falling back to the default icons:', err instanceof Error ? err.message : err);
      return pass();
    }
  },
};
