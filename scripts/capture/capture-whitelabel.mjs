#!/usr/bin/env node
/**
 * WHITE-LABEL CAPTURES — the same product screen under four fictional tenant
 * identities (different brand colors AND different font pairs), plus a
 * font-pair strip on one fixed identity.
 *
 * Deliberately avoids the Studio Aviv look: none of these use its plum/pink
 * (#76335a / #e99ac4) or its "elegant" font pair. The Studio Aviv fixture is
 * RESTORED at the end by re-running the capture seed.
 *
 * Outputs to captures/whitelabel/:
 *   tenant-1-harbor-pilates.png   … tenant-4-blackbox-drama.png  (hero grid)
 *   fonts-reliable.png / fonts-dynamic.png / fonts-bold.png     (font strip)
 *   whitelabel-morph.mp4 / .gif   (one screen cycling through identities)
 */
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { BASE_URL, STILL_DEVICE_SCALE, VIEWPORT } from './config.mjs';
import { chromium, ensureDevServer, gotoWarm, pinLanguage } from './lib/browser.mjs';
import { devDb } from './lib/db.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const OUT = join(repoRoot, 'captures', 'whitelabel');
const HEADED = process.env.HEADED === '1';
const TENANT_ID = '00000000-0000-0000-00c0-000000000001'; // Studio Aviv capture tenant — restyled per identity, never creativeballet

/**
 * Four fictional identities — varied hue families, warm and cool, 4 of the 5
 * font pairs. Each carries a Hebrew brand name used for the Hebrew captures,
 * the way a real Hebrew-market studio would brand itself.
 */
export const IDENTITIES = [
  { slug: 'harbor-pilates', name: 'Harbor Pilates', nameHe: 'סטודיו גל', primary: '#0e7490', accent: '#67e8f9', fontPair: 'reliable' },
  { slug: 'sunset-ceramics', name: 'Sunset Ceramics', nameHe: 'חומר ואש', primary: '#c2410c', accent: '#fdba74', fontPair: 'warm' },
  { slug: 'metro-music', name: 'Metro Music School', nameHe: 'צליל העיר', primary: '#4338ca', accent: '#a5b4fc', fontPair: 'dynamic' },
  { slug: 'blackbox-drama', name: 'Blackbox Drama', nameHe: 'במה שחורה', primary: '#1f2937', accent: '#f59e0b', fontPair: 'bold' },
];

/** Font strip: one fixed identity, three pairs (none of them Studio Aviv's "elegant"). */
const FONT_STRIP = ['reliable', 'dynamic', 'bold'];
const FONT_STRIP_IDENTITY = IDENTITIES[0];

async function setTenantIdentity(db, { name, primary, accent, fontPair }) {
  await db.runSql(
    `UPDATE tenants SET name = '${name.replace(/'/g, "''")}', primary_color = '${primary}', ` +
      `accent_color = '${accent}', font_pair = '${fontPair}' WHERE id = '${TENANT_ID}'`,
  );
}

async function shootClassesPage(browser, path, lang = 'en') {
  const context = await browser.newContext({
    baseURL: BASE_URL,
    viewport: VIEWPORT.mobile,
    deviceScaleFactor: STILL_DEVICE_SCALE,
    locale: lang === 'he' ? 'he-IL' : 'en-US',
    timezoneId: 'Asia/Jerusalem',
  });
  await pinLanguage(context, lang);
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(30_000);
    await gotoWarm(page, '/classes');
    // Button labels are localized — match both languages.
    const listToggle = page.getByRole('button', { name: /^(List|רשימה)$/ });
    const enrolBtn = page.getByRole('button', { name: /^(Enrol|הירשם) - / }).first();
    await Promise.race([listToggle.waitFor(), enrolBtn.waitFor()]);
    if (!(await enrolBtn.isVisible().catch(() => false))) {
      await listToggle.click();
    }
    await enrolBtn.waitFor();
    // Let the tenant fonts finish swapping in before shooting.
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path, fullPage: false });
    console.log(`Captured ${path.split(/[\\/]/).pop()}`);
  } finally {
    await context.close();
  }
}

export async function captureWhitelabel() {
  mkdirSync(OUT, { recursive: true });
  const db = await devDb();
  const stopServer = await ensureDevServer();
  const browser = await chromium.launch({ headless: !HEADED });

  try {
    // Hero set — four identities, same screen, both languages (each font pair
    // carries a matched Hebrew face; the Hebrew shots prove RTL parity).
    // Hebrew captures use the identity's Hebrew brand name.
    for (const identity of IDENTITIES) {
      await setTenantIdentity(db, identity);
      await shootClassesPage(browser, join(OUT, `tenant-${identity.slug}.png`), 'en');
      await setTenantIdentity(db, { ...identity, name: identity.nameHe });
      await shootClassesPage(browser, join(OUT, `tenant-${identity.slug}-he.png`), 'he');
    }

    // Font strip — fixed colors, three pairs, both languages.
    for (const pair of FONT_STRIP) {
      await setTenantIdentity(db, { ...FONT_STRIP_IDENTITY, fontPair: pair });
      await shootClassesPage(browser, join(OUT, `fonts-${pair}.png`), 'en');
      await setTenantIdentity(db, { ...FONT_STRIP_IDENTITY, name: FONT_STRIP_IDENTITY.nameHe, fontPair: pair });
      await shootClassesPage(browser, join(OUT, `fonts-${pair}-he.png`), 'he');
    }
  } finally {
    await browser.close();
    await stopServer();
  }

  // Morph loop from the four hero frames: 1.6s hold + 0.4s crossfade each.
  const req = (await import('node:module')).createRequire(join(repoRoot, 'package.json'));
  const ff = req('ffmpeg-static');
  const inputs = IDENTITIES.flatMap((i) => ['-loop', '1', '-t', '2', '-i', join(OUT, `tenant-${i.slug}.png`)]);
  const filter =
    '[0][1]xfade=transition=fade:duration=0.4:offset=1.6[a];' +
    '[a][2]xfade=transition=fade:duration=0.4:offset=3.2[b];' +
    '[b][3]xfade=transition=fade:duration=0.4:offset=4.8[v]';
  const mp4 = join(OUT, 'whitelabel-morph.mp4');
  let r = spawnSync(ff, [
    '-y', ...inputs,
    '-filter_complex', `${filter};[v]scale=390:-2,format=yuv420p[out]`,
    '-map', '[out]', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-movflags', '+faststart', '-an', mp4,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  if (r.status !== 0) throw new Error(`morph mp4 failed: ${r.stderr?.toString().slice(-400)}`);

  const gif = join(OUT, 'whitelabel-morph.gif');
  r = spawnSync(ff, [
    '-y', '-i', mp4,
    '-vf', 'fps=12,scale=320:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse',
    gif,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  if (r.status !== 0) throw new Error(`morph gif failed: ${r.stderr?.toString().slice(-400)}`);
  console.log('Morph loop rendered (mp4 + gif).');

  // Restore the Studio Aviv fixture so OpalSwift captures stay reproducible.
  console.log('Restoring Studio Aviv fixture...');
  const seed = spawnSync(process.execPath, [join(here, 'seed-capture.mjs')], { stdio: 'inherit' });
  if (seed.status !== 0) {
    console.warn('WARNING: fixture restore failed — run `node scripts/capture/seed-capture.mjs` manually.');
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  captureWhitelabel().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
