/**
 * Environment variable audit.
 *
 * Cross-references what the code actually READS against what is DECLARED, in
 * both directions. Both directions matter:
 *
 *   read but undocumented → prod is configured from .env.example, so the var
 *                           silently ends up unset and the failure surfaces at
 *                           runtime, in an Edge Function, under load
 *   documented but unread → stale config that misleads whoever configures prod
 *
 * Also fails hard on a secret-looking VITE_ var. Those are inlined into the
 * browser bundle at build time; a service-role key there is unrecoverable
 * without rotating it, and the mistake is invisible in review.
 *
 * Reads are found via three paths, because this codebase uses all three:
 *   Deno.env.get("X")   direct, in Edge Functions
 *   getEnv("X")         the Deno/Node shim in _shared/edge-runtime/env.ts
 *   import.meta.env.X   Vite, in the browser
 *
 *   pnpm verify:env
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const root = process.cwd();

/** Names that must never appear as a VITE_ var — they'd ship to every browser. */
const SECRET_MARKERS = [
  'SERVICE_ROLE', 'SECRET', 'PRIVATE', 'PASSWORD', 'API_KEY',
  'AUTH_TOKEN', 'CLIENT_SECRET', 'HMAC', 'CRON',
];
/** Allowed despite matching: genuinely public by design. */
const PUBLIC_ALLOWLIST = ['VITE_SUPABASE_ANON_KEY', 'VITE_STRIPE_PUBLISHABLE_KEY'];

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'email-dist' || name === 'dist') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (['.ts', '.tsx', '.mjs', '.js'].includes(extname(p))) out.push(p);
  }
  return out;
}

function scan(dirs, patterns) {
  const found = new Set();
  for (const dir of dirs) {
    for (const file of walk(join(root, dir))) {
      const src = readFileSync(file, 'utf8');
      for (const re of patterns) {
        for (const m of src.matchAll(re)) found.add(m[1]);
      }
    }
  }
  return found;
}

function declaredIn(file) {
  const out = new Set();
  if (!existsSync(join(root, file))) return out;
  for (const line of readFileSync(join(root, file), 'utf8').split('\n')) {
    // Count commented-out declarations too — they document an optional var.
    const m = line.match(/^\s*#?\s*([A-Z_][A-Z0-9_]*)=/);
    if (m) out.add(m[1]);
  }
  return out;
}

// Optional chaining is used in places (`globalThis.Deno?.env.get(...)`), so the
// dots must be optional too — an over-strict pattern here produces false
// "documented but unread" findings, which is worse than no check at all.
const edgeReads = scan(
  ['supabase/functions'],
  [
    /Deno\s*\??\.\s*env\s*\??\.\s*get\(\s*["'`]([A-Z_][A-Z0-9_]*)["'`]/g,
    /getEnv\(\s*["'`]([A-Z_][A-Z0-9_]*)["'`]/g,
    /process\s*\??\.\s*env\s*\??\.\s*\[?["'`]?([A-Z_][A-Z0-9_]{2,})["'`]?\]?/g,
  ],
);
const viteReads = scan(['apps/web/src'], [/import\.meta\.env\.(VITE_[A-Z0-9_]*)/g]);
const viteConfigReads = scan(['apps/web'], [/env\.(VITE_[A-Z0-9_]*)/g, /loadEnv[\s\S]{0,80}?(VITE_[A-Z0-9_]*)/g]);

const example = declaredIn('.env.example');
const prod = declaredIn('.env.prod');

/** Supabase injects these into every Edge Function; they are never in .env. */
const PLATFORM_PROVIDED = new Set([
  'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_DB_URL',
]);

let required = new Set();
{
  const s = readFileSync(join(root, 'scripts/sync-edge-secrets.mjs'), 'utf8');
  const m = s.match(/const REQUIRED\s*=\s*\[([\s\S]*?)\]/);
  if (m) for (const x of m[1].matchAll(/'([A-Z_][A-Z0-9_]*)'/g)) required.add(x[1]);
}

const problems = [];
const notes = [];

// --- CRITICAL: secrets that would ship to the browser ------------------------
for (const v of [...viteReads, ...example].filter((v) => v.startsWith('VITE_'))) {
  if (PUBLIC_ALLOWLIST.includes(v)) continue;
  const hit = SECRET_MARKERS.find((m) => v.includes(m));
  if (hit) problems.push(`CRITICAL  ${v} looks secret (matches "${hit}") but VITE_ vars are inlined into the browser bundle`);
}

// --- dynamically-named vars, which no static scan can see --------------------
// `getHmacKey()` builds `WAIVER_HMAC_KEY_V${version}`. A template-literal name
// is invisible to the patterns above, which is exactly how a secret that
// accept-waiver throws without stayed undeclared everywhere. Any new one needs
// adding here by hand — that is the cost of a computed env name.
{
  const dynamic = scan(['supabase/functions'], [/env\s*\??\.\s*get\(\s*`([A-Z_][A-Z0-9_]*)\$\{/g]);
  for (const prefix of dynamic) {
    const declared = [...example].some((k) => k.startsWith(prefix));
    if (!declared) {
      problems.push(
        `UNDOCUMENTED-DYNAMIC  ${prefix}<n> is built dynamically and read by an Edge Function, ` +
          `but no ${prefix}* key is declared in .env.example`,
      );
    }
  }
}

// --- read but never documented ----------------------------------------------
for (const v of [...edgeReads].sort()) {
  if (PLATFORM_PROVIDED.has(v)) continue;
  if (!example.has(v)) problems.push(`UNDOCUMENTED  ${v} is read by an Edge Function but absent from .env.example`);
}
for (const v of [...viteReads].sort()) {
  if (!example.has(v)) problems.push(`UNDOCUMENTED  ${v} is read by the browser but absent from .env.example`);
}

// --- REQUIRED but nothing reads it -------------------------------------------
for (const v of [...required].sort()) {
  if (!edgeReads.has(v)) problems.push(`UNUSED-REQUIRED  ${v} is REQUIRED by sync-edge-secrets but no Edge Function reads it`);
}

// --- documented but never read (informational) -------------------------------
const allReads = new Set([...edgeReads, ...viteReads, ...viteConfigReads, ...PLATFORM_PROVIDED]);
const SCRIPT_ONLY = new Set([
  'SUPABASE_PROJECT_REF', 'SUPABASE_DB_PASSWORD', 'SUPABASE_DB_POOLER_HOST',
  'DEV_PROJECT_REF', 'ALLOW_NON_DEV_PROJECT', 'CLOUDFLARE_API_TOKEN', 'RESEND_ADMIN_API_KEY',
  'PLAYWRIGHT_SEEDED_E2E', 'PLAYWRIGHT_PARENT_E2E', 'PLAYWRIGHT_ADMIN_E2E',
  'PLAYWRIGHT_FINANCE_DEV', 'E2E_PARENT_PASSWORD', 'E2E_ADMIN_PASSWORD',
  'VITE_BUILD_SOURCE_MAP', 'SENTRY_DSN', 'ANTHROPIC_API_KEY',
]);
/** Names assembled at runtime, so no literal read ever appears in source. */
const DYNAMIC_NAME_PATTERNS = [/^WAIVER_HMAC_KEY_V\d+$/];

for (const v of [...example].sort()) {
  if (allReads.has(v) || SCRIPT_ONLY.has(v)) continue;
  if (DYNAMIC_NAME_PATTERNS.some((re) => re.test(v))) continue;
  notes.push(`unread  ${v} is documented in .env.example but nothing reads it`);
}

// --- .env.prod still holding placeholders ------------------------------------
if (existsSync(join(root, '.env.prod'))) {
  const raw = readFileSync(join(root, '.env.prod'), 'utf8');
  const unfilled = [...raw.matchAll(/^([A-Z_][A-Z0-9_]*)=(<[^>]*>)/gm)].map((m) => m[1]);
  if (unfilled.length) notes.push(`.env.prod still has ${unfilled.length} placeholder(s): ${unfilled.join(', ')}`);
}

console.log(`\nEdge vars read : ${edgeReads.size}`);
console.log(`VITE vars read : ${viteReads.size}`);
console.log(`Declared       : ${example.size} in .env.example, ${prod.size} in .env.prod\n`);

for (const p of problems) console.log(`  \x1b[31m${p}\x1b[0m`);
for (const n of notes) console.log(`  \x1b[33m${n}\x1b[0m`);

console.log(
  problems.length === 0
    ? `\n\x1b[32mNo blocking env problems.\x1b[0m${notes.length ? ` (${notes.length} note(s) above)` : ''}\n`
    : `\n\x1b[31m${problems.length} env problem(s).\x1b[0m\n`,
);
process.exit(problems.length === 0 ? 0 : 1);
