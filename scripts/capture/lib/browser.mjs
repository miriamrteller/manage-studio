/**
 * Shared Playwright plumbing for the capture scripts.
 *
 * Playwright is resolved through apps/web's node_modules (pnpm keeps deps
 * non-hoisted, so a plain import from scripts/ would not find it).
 */
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE_URL, TYPE_DELAY_MS } from '../config.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');
const webRequire = createRequire(join(repoRoot, 'apps', 'web', 'package.json'));

/** @type {import('@playwright/test')} */
const pw = webRequire('@playwright/test');
export const { chromium, expect } = pw;

// ---------------------------------------------------------------------------
// Visible cursor overlay — standard injected-div snippet. Playwright's mouse
// events drive it; without this the recording shows no pointer at all.
// ---------------------------------------------------------------------------
const CURSOR_INIT_SCRIPT = `
(() => {
  if (window !== window.top) return;
  const ensureCursor = () => {
    if (document.getElementById('__capture-cursor') || !document.body) return;
    const cursor = document.createElement('div');
    cursor.id = '__capture-cursor';
    cursor.innerHTML = \`<svg width="26" height="26" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M5 3l14 8.5-6.1 1.4L9.5 19 5 3z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/>
    </svg>\`;
    Object.assign(cursor.style, {
      position: 'fixed', left: '0px', top: '0px', zIndex: '2147483647',
      pointerEvents: 'none', transform: 'translate(-3px, -2px)',
      transition: 'opacity 120ms ease', opacity: '0',
      filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.35))',
    });
    document.body.appendChild(cursor);
    document.addEventListener('mousemove', (e) => {
      cursor.style.opacity = '1';
      cursor.style.left = e.clientX + 'px';
      cursor.style.top = e.clientY + 'px';
    }, true);
    document.addEventListener('mousedown', () => {
      cursor.firstElementChild.style.transform = 'scale(0.82)';
    }, true);
    document.addEventListener('mouseup', () => {
      cursor.firstElementChild.style.transform = 'scale(1)';
    }, true);
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureCursor);
  } else {
    ensureCursor();
  }
})();
`;

export async function installCursor(context) {
  await context.addInitScript(CURSOR_INIT_SCRIPT);
}

/**
 * Pin the UI to English before the app boots. Guests race tenant loading and
 * can lock to the Hebrew fallback; seeding the same localStorage key the app's
 * language picker writes makes every capture deterministic.
 */
export async function pinEnglish(context) {
  await pinLanguage(context, 'en');
}

/** Pin the app UI to a specific language ('en' | 'he') before boot. */
export async function pinLanguage(context, lang) {
  await context.addInitScript((value) => {
    try {
      localStorage.setItem('language', value);
    } catch {
      /* storage unavailable — app falls back to its own resolution */
    }
  }, lang);
}

// ---------------------------------------------------------------------------
// Human-ish interaction helpers
// ---------------------------------------------------------------------------

/** Deliberate on-camera pause. The only sanctioned sleep in the flows. */
export const hold = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Glide the mouse to a locator's centre (so the cursor overlay reads well on
 * video), then delegate the actual click to Playwright — its actionability
 * waits handle disabled-until-async-check buttons and late layout shifts.
 */
export async function humanClick(page, locator, { moveSteps = 22 } = {}) {
  await locator.waitFor({ state: 'visible' });
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: moveSteps });
  }
  await locator.click();
}

/** Click into a field and type at human speed (pressSequentially, not fill). */
export async function humanType(page, locator, text, { delay = TYPE_DELAY_MS } = {}) {
  await humanClick(page, locator);
  await locator.pressSequentially(text, { delay });
}

/** Clear a field with select-all + delete, visibly. */
export async function humanClear(page, locator) {
  await humanClick(page, locator);
  await locator.press('ControlOrMeta+a');
  await locator.press('Delete');
}

// ---------------------------------------------------------------------------
// App-level helpers
// ---------------------------------------------------------------------------

/**
 * First navigation against a cold Vite server can exceed default timeouts
 * while the dep-optimizer compiles. Use DOMContentLoaded + a generous cap;
 * subsequent assertions are locator-driven anyway.
 */
export async function gotoWarm(page, path) {
  await page.goto(path, { waitUntil: 'domcontentloaded', timeout: 120_000 });
}

export async function login(page, email, password) {
  await gotoWarm(page, '/login');
  await page.locator('input[type="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.locator('form').getByRole('button', { name: /sign in|התחבר/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 30_000 });
}

/** Locator for the guardian/student fieldsets on the enrolment person step. */
export function fieldset(page, legendText) {
  return page.locator('fieldset', { has: page.locator('legend', { hasText: legendText }) });
}

/**
 * Complete the waiver step: scroll the document region to the bottom (unlocks
 * the signing form), tick the checkboxes, type the signer's name, submit.
 */
export async function signWaiver(page, ui, signerName) {
  const region = page.getByRole('region', { name: ui.waiverRegion });
  await region.waitFor({ timeout: 30_000 });
  await region.evaluate((el) => el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }));
  const acceptBox = page.getByRole('checkbox', { name: ui.waiverAccept });
  await acceptBox.waitFor({ timeout: 20_000 });
  await acceptBox.check();
  const guardianConfirm = page.getByRole('checkbox', { name: ui.waiverGuardianConfirm });
  if (await guardianConfirm.isVisible().catch(() => false)) {
    await guardianConfirm.check();
  }
  await page.getByPlaceholder(ui.waiverNamePlaceholder).fill(signerName);
  await page.getByRole('button', { name: ui.waiverSubmit }).click();
}

// ---------------------------------------------------------------------------
// Fixture pre-flight — the dev DB is routinely rebuilt by other workflows
// (squash + reset). Verify the capture fixture is actually live through the
// same REST API the app uses before spending minutes on a doomed recording.
// ---------------------------------------------------------------------------
export async function verifyFixture() {
  const { readFileSync } = await import('node:fs');
  const envFile = join(repoRoot, 'apps', 'web', '.env.local');
  const env = Object.fromEntries(
    readFileSync(envFile, 'utf8')
      .split('\n')
      .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
  );
  const supaUrl = env.VITE_SUPABASE_URL;
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const headers = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

  const rpc = async (fn, body) => {
    const res = await fetch(`${supaUrl}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`${fn} → HTTP ${res.status}`);
    return res.json();
  };

  const deadline = Date.now() + 90_000;
  let lastProblem = '';
  while (Date.now() < deadline) {
    try {
      const [tenant] = await rpc('get_tenant_config_by_subdomain', { p_subdomain: 'studioaviv' });
      const offerings = await rpc('get_public_offerings_by_subdomain', { p_subdomain: 'studioaviv' });
      const ballet = offerings.find((o) => o.name === 'Ballet — Ages 6-9');
      if (
        tenant?.name === 'Studio Aviv' &&
        tenant?.payment_provider === 'mock' &&
        tenant?.invoicing_provider === 'mock' &&
        ballet
      ) {
        console.log('Fixture verified: Studio Aviv / mock provider / Ballet — Ages 6-9 live.');
        return;
      }
      lastProblem = !tenant
        ? 'tenant RPC returned no row (project may still be waking)'
        : tenant.name !== 'Studio Aviv'
          ? `tenant is "${tenant.name}" — the dev DB was reseeded by something else; re-run the capture seed`
          : tenant.payment_provider !== 'mock'
            ? `payment_provider is "${tenant.payment_provider}", expected "mock"`
            : 'Ballet — Ages 6-9 offering missing';
    } catch (e) {
      lastProblem = e.message;
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error(
    `Capture fixture is not live: ${lastProblem}.\n` +
      'Run: node scripts/capture/seed-capture.mjs and try again.',
  );
}

// ---------------------------------------------------------------------------
// Dev server lifecycle — reuse if already running, else start and wait.
// ---------------------------------------------------------------------------

async function isServerUp() {
  try {
    const res = await fetch(BASE_URL, { signal: AbortSignal.timeout(2000) });
    return res.ok || res.status < 500;
  } catch {
    return false;
  }
}

/**
 * Ensure the Vite dev server is reachable. Returns a disposer that stops the
 * server only if this call started it.
 */
export async function ensureDevServer() {
  if (await isServerUp()) {
    console.log(`Dev server already running at ${BASE_URL}`);
    return async () => {};
  }

  console.log('Starting dev server (pnpm -C apps/web dev) ...');
  const child = spawn('pnpm', ['-C', 'apps/web', 'dev'], {
    cwd: repoRoot,
    shell: true,
    stdio: 'ignore',
    detached: false,
  });

  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (await isServerUp()) {
      console.log(`Dev server ready at ${BASE_URL}`);
      return async () => {
        // Kill the whole process tree on Windows; plain kill() only hits the shell.
        if (process.platform === 'win32' && child.pid) {
          spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { shell: true });
        } else {
          child.kill('SIGTERM');
        }
      };
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Dev server did not become ready at ${BASE_URL} within 120s`);
}
