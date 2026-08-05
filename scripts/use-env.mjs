/**
 * Switch the active environment: `pnpm env:use dev` / `pnpm env:use prod`.
 *
 * scripts/load-env.mjs only ever reads the repo-root `.env`, so there is no
 * NODE_ENV-style selector — `.env` IS the active environment. This copies
 * `.env.<name>` over it and says out loud what is now live, because "which
 * project am I pointed at" is otherwise invisible and is the single most
 * dangerous unknown once a production project exists.
 *
 * `.env.dev` / `.env.prod` are the stored originals. Edit those, not `.env`.
 */
import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = (process.argv[2] ?? '').trim().toLowerCase();
const VALID = ['dev', 'prod'];

if (!VALID.includes(target)) {
  console.error(`\nUsage: pnpm env:use <${VALID.join('|')}>\n`);
  process.exit(1);
}

const source = join(root, `.env.${target}`);
const active = join(root, '.env');

if (!existsSync(source)) {
  console.error(
    `\n.env.${target} does not exist.\n` +
      `Create it first — it is the stored copy for that environment.\n`,
  );
  process.exit(1);
}

/** Pull a key's value without printing any secret. */
function readKey(file, key) {
  if (!existsSync(file)) return null;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i === -1) continue;
    if (t.slice(0, i).trim() === key) return t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  }
  return null;
}

const wasRef = readKey(active, 'SUPABASE_PROJECT_REF');
copyFileSync(source, active);
const nowRef = readKey(active, 'SUPABASE_PROJECT_REF');
const appUrl = readKey(active, 'APP_URL');

const banner = target === 'prod' ? '!!!  PRODUCTION  !!!' : 'dev';
console.log(
  `\n${'='.repeat(60)}\n` +
    `  Active environment: ${banner}\n` +
    `${'='.repeat(60)}\n` +
    `  project ref : ${nowRef ?? '(unset)'}${wasRef && wasRef !== nowRef ? `   (was ${wasRef})` : ''}\n` +
    `  APP_URL     : ${appUrl ?? '(unset)'}\n` +
    `${'='.repeat(60)}\n`,
);

if (target === 'prod') {
  console.log(
    '  Reminder: `supabase link` is separate — run it too, or the CLI\n' +
      '  will still target whatever it was last linked to.\n',
  );
}
